# L27 - Server tournament scheduler (from scratch)

Focus file: `client/src/bin/tournament_scheduler.rs`

Goal: explain how the server-side scheduler starts and ends freeroll tournaments on a timed loop. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Why a scheduler exists
Freeroll tournaments must start and end on time even if no UI is open. This binary runs on the server and ensures that lifecycle.

### 2) Slot-based scheduling
The day is split into `TOURNAMENTS_PER_DAY` slots. Each slot has:
- a registration window,
- an active window (the tournament itself).

### 3) Admin transactions
Starting and ending a tournament requires admin instructions signed with the admin private key. The scheduler automates this.

---

## Limits & management callouts (important)

1) **Poll interval**
- Default `--poll-secs` is 5 seconds. Too slow can miss boundaries; too fast increases load.

2) **DAY_MS = 86,400,000**
- Schedule boundaries are fixed in UTC ms. Any clock skew affects accuracy.

3) **TOURNAMENT_DURATION_SECS / TOURNAMENTS_PER_DAY**
- These constants define registration length and active length.
- Changing them affects schedule math and UI expectations.

---

## Walkthrough with code excerpts

### 1) Schedule calculation
```rust
fn schedule_for_time(now_ms: u64) -> ScheduleSlot {
    let cycle_ms = DAY_MS / TOURNAMENTS_PER_DAY.max(1);
    let tournament_ms = TOURNAMENT_DURATION_SECS.saturating_mul(1000);
    let registration_ms = cycle_ms.saturating_sub(tournament_ms);

    let slot = now_ms / cycle_ms.max(1);
    let slot_start_ms = slot * cycle_ms;
    let start_time_ms = slot_start_ms.saturating_add(registration_ms);
    let end_time_ms = start_time_ms.saturating_add(tournament_ms);

    ScheduleSlot {
        slot,
        start_time_ms,
        end_time_ms,
    }
}
```

Why this matters:
- All tournament start/end decisions come from this slot math.

What this code does:
- Calculates the length of each daily slot.
- Computes registration vs active windows.
- Returns a `ScheduleSlot` with start/end timestamps.

---

### 2) Nonce tracker for admin key
```rust
struct NonceTracker {
    next_nonce: Option<u64>,
}

impl NonceTracker {
    async fn sync(&mut self, client: &Client, public: &PublicKey) -> Result<u64> {
        let lookup = client.query_state(&Key::Account(public.clone())).await?;
        let nonce = match lookup.and_then(|lookup| lookup.operation.value().cloned()) {
            Some(Value::Account(account)) => account.nonce,
            _ => 0,
        };
        self.next_nonce = Some(nonce);
        Ok(nonce)
    }

    async fn next(&mut self, client: &Client, public: &PublicKey) -> Result<u64> {
        if let Some(nonce) = self.next_nonce {
            self.next_nonce = Some(nonce.saturating_add(1));
            Ok(nonce)
        } else {
            let nonce = self.sync(client, public).await?;
            self.next_nonce = Some(nonce.saturating_add(1));
            Ok(nonce)
        }
    }
}
```

Why this matters:
- Admin transactions must use correct nonces or they will be rejected.

What this code does:
- Keeps a cached nonce for the admin key.
- Syncs from chain if it hasn’t seen a nonce yet.
- Increments the nonce after each use.

---

### 3) Submitting admin instructions
```rust
async fn submit_instruction(
    client: &Client,
    admin_private: &PrivateKey,
    admin_public: &PublicKey,
    nonce_tracker: &mut NonceTracker,
    instruction: Instruction,
) -> Result<()> {
    let nonce = nonce_tracker.next(client, admin_public).await?;
    let tx = Transaction::sign(admin_private, nonce, instruction);
    if let Err(err) = client.submit_transactions(vec![tx]).await {
        nonce_tracker.sync(client, admin_public).await?;
        return Err(anyhow!("Submit failed: {err}"));
    }
    Ok(())
}
```

Why this matters:
- Start/end instructions must be signed and submitted reliably.

What this code does:
- Fetches the next admin nonce.
- Signs the instruction and submits it.
- On failure, resyncs the nonce to recover.

---

### 4) Main loop: start/end tournaments
```rust
let mut ticker = interval(Duration::from_secs(args.poll_secs.max(1)));
loop {
    ticker.tick().await;
    let now_ms = now_ms()?;
    let slot = schedule_for_time(now_ms);
    let prev_slot = slot.slot.saturating_sub(1);
    let slots = if prev_slot == slot.slot {
        vec![slot.slot]
    } else {
        vec![prev_slot, slot.slot]
    };

    for tournament_id in slots {
        let schedule = if tournament_id == slot.slot {
            slot
        } else {
            let slot_start = schedule_for_time(slot.start_time_ms.saturating_sub(1));
            ScheduleSlot {
                slot: prev_slot,
                start_time_ms: slot_start.start_time_ms,
                end_time_ms: slot_start.end_time_ms,
            }
        };

        let tournament = fetch_tournament(&client, tournament_id).await?;
        let phase = tournament
            .as_ref()
            .map(|t| t.phase)
            .unwrap_or(TournamentPhase::Registration);

        if now_ms >= schedule.end_time_ms {
            // end
        }

        if now_ms >= schedule.start_time_ms
            && now_ms < schedule.end_time_ms
            && phase != TournamentPhase::Active
            && phase != TournamentPhase::Complete
        {
            // start
        }
    }
}
```

Why this matters:
- This loop is the automation that keeps tournaments on schedule.

What this code does:
- Polls every few seconds.
- Calculates the current and previous slot.
- Starts tournaments when inside the active window.
- Ends tournaments when the end time passes.

---

## Extended deep dive: the tournament scheduler as a production control loop

The tournament scheduler is a compact program, but it hides a lot of operational and protocol logic. Think of it as a distributed systems control loop whose job is to **move the chain’s tournament state forward** on a wall‑clock schedule. This section walks through the underlying mechanics in a more formal, textbook‑style way.

---

### 4) CLI configuration is a reliability contract

The scheduler is a standalone binary. Its `Args` struct exposes a few parameters, but each one has operational meaning:

- `--url`: which node it targets for state queries and submissions.
- `--identity`: the network identity used by the client library.
- `--admin-key` or `--admin-key-file`: the private key used to sign admin transactions.
- `--poll-secs`: the cadence at which the loop runs.

These are not just flags; they define the scheduler’s **trust boundary**. For example, if the URL points at the wrong node, the scheduler may see stale state or submit to the wrong network. If the identity is wrong, signatures may be rejected. This is why the program fails fast on missing identity and key inputs.

---

### 5) Identity decoding and network binding

`decode_identity` parses the `--identity` hex string into an `Identity` object. This is how the client ties itself to a specific network configuration. If you run the scheduler with the wrong identity, it might appear to “work” but actually submit to a network with a different genesis. The result would be confusing: the scheduler would be sending admin transactions that have no effect on the intended chain.

This is the same principle as “chain ID” in Ethereum. You want transactions to be bound to the correct chain. Identity in this system serves that role.

---

### 6) Secret management: env vs file vs URL

The scheduler allows admin key input via CLI, environment variables, or a file. This is not a convenience; it is a security posture:

- CLI arguments are visible in process listings (bad for secrets).
- Environment variables are visible in some monitoring and crash logs (also risky).
- Files are generally safer if filesystem permissions are locked down.

The helper `require_arg_or_env_or_file` resolves in a specific order and enforces “required” semantics. This reduces the chance of accidentally running a scheduler without a real admin key.

Feynman analogy: think of this like a vault. It checks the front door (CLI), then the side door (file), then the mailbox (env). If all are empty, it refuses to operate.

---

### 7) NonceTracker as a local nonce cache

The scheduler uses a small `NonceTracker` to keep track of the admin key’s next nonce. This avoids re-querying the chain on every instruction. The algorithm is simple:

- If we have a cached nonce, return it and increment locally.
- If not, query state (`Key::Account`) and set the cache.

This is equivalent to a write‑through cache: it treats on‑chain nonce as the source of truth, but optimizes for repeated submissions.

Important nuance: `NonceTracker` only works correctly if there is a single scheduler submitting transactions for that admin key. If multiple schedulers run concurrently, they will race and produce nonce collisions. This is why admin transaction flows usually require **one authoritative scheduler** or a shared nonce coordination service.

---

### 8) Error recovery in `submit_instruction`

The scheduler wraps submission in a simple recovery pattern:

1) Sign and submit transaction.
2) If submission fails, resync the nonce.
3) Return an error.

This is deliberately conservative. If submission fails, the scheduler assumes its local nonce cache might be out of sync. It immediately re-queries chain state. This prevents a cascade of failures caused by a single mismatch.

However, this also means a transient submission failure (e.g., network issue) triggers a nonce resync, which may be unnecessary. The tradeoff is acceptable because nonce resync is cheap and correctness is more important than minimizing queries.

---

### 9) The time model: wall‑clock time vs chain time

The scheduler uses wall‑clock time (`SystemTime::now`) to determine schedule boundaries. This is different from the chain’s internal time model (which uses consensus views). Why?

- A scheduler needs to run even when the chain is idle.
- It needs a predictable calendar schedule (e.g., “every 6 minutes”).
- There is no on‑chain clock available without querying recent blocks, which could be stale.

The downside is that clock skew can cause early or late starts. If the server clock drifts, tournaments could be started a few seconds off schedule. This is acceptable because the chain enforces its own invariants. The scheduler only acts as a liveness engine, not as a source of truth.

---

### 10) Slot math: how schedule_for_time works

The schedule is defined as **TOURNAMENTS_PER_DAY** slots. The day is divided evenly, and each slot is split into:

- Registration window: `cycle_ms - tournament_ms`
- Active window: `tournament_ms`

The scheduler computes:

- `slot` = `now_ms / cycle_ms`
- `slot_start_ms` = `slot * cycle_ms`
- `start_time_ms` = `slot_start_ms + registration_ms`
- `end_time_ms` = `start_time_ms + tournament_ms`

This yields deterministic start/end times for each slot. It is a classic periodic scheduling algorithm.

The important detail is the `max(1)` guard on `TOURNAMENTS_PER_DAY`. This prevents division by zero in misconfiguration scenarios. The scheduler will still run, albeit with a degenerate schedule (one slot per day).

---

### 11) Why the scheduler checks the previous slot

The loop includes both the current slot and the previous slot. This is a practical hedge against drift:

- If the scheduler is slow or the process was paused, it might have missed the boundary between slots.
- Checking the previous slot ensures we still end a tournament that should have ended, even if we are “late.”

This is a common pattern in schedulers: always reconcile not only the current window but also the immediately previous window.

---

### 12) Tournament phase as a state machine

The scheduler inspects the tournament phase from chain state. The phase enum includes at least:

- `Registration`
- `Active`
- `Complete`

The logic is:

- If now >= end_time and phase is Active, submit end transaction.
- If start_time <= now < end_time and phase is neither Active nor Complete, submit start transaction.

This enforces a simple state machine:

```
Registration -> Active -> Complete
```

The scheduler’s role is to **push transitions** when time conditions are met. It does not invent phase values; it only observes and nudges.

---

### 13) Idempotency via last_started_slot and last_ended_slot

Even without explicit locking, the scheduler uses two local guards:

- `last_started_slot`
- `last_ended_slot`

These prevent repeated submissions in the same process. Once a tournament slot is started or ended, the scheduler remembers it and does not submit again.

This is local idempotency. It does not protect against other schedulers, but it does protect against its own polling loop repeatedly submitting the same instruction every few seconds.

---

### 14) Why start and end are admin-only

`Instruction::CasinoStartTournament` and `Instruction::CasinoEndTournament` are admin instructions. That means they require the admin private key. The scheduler is therefore a privileged process. It is effectively a “server authority.”

This is a classic tradeoff:

- You want decentralized liveness (anyone can start/end), but
- You also want control and abuse prevention.

The design chooses admin control. The UI can also attempt starts/ends in some flows, but the on‑chain handlers enforce admin checks. The scheduler is the authoritative liveness mechanism.

---

### 15) Failure modes and their effects

Let’s enumerate common failure modes:

1) **Clock drift**: tournaments may start/end slightly late or early. Chain rules keep consistency.
2) **Nonce mismatch**: submissions fail; nonce tracker resyncs; next loop tries again.
3) **Node unavailable**: scheduler cannot query state or submit; logs warnings; recovers when node returns.
4) **Admin key missing**: scheduler fails fast on startup.
5) **Multiple schedulers**: nonce collisions and duplicate start/end attempts; on-chain handlers should reject duplicates but nonce collisions may cause failed submissions.

Understanding these modes is crucial for production readiness. The scheduler is simple but the environment is complex.

---

### 16) Logging and observability

The scheduler logs:

- `tournament scheduler online`
- `starting tournament`
- `ending tournament`
- warnings on failure

This is minimal but useful. It gives operators a heartbeat and a record of actions. In production, you may want to add structured metrics such as:

- number of successful starts/ends per day
- average delay between schedule boundary and action
- submission failure rate

These can help detect drift or failures before users notice.

---

### 17) Why the scheduler uses a polling loop

The scheduler could have been implemented as a timer that sleeps until the next boundary. Instead, it uses a fixed interval loop. This has advantages:

- Simplicity: no complex scheduling logic required.
- Robustness: if a tick is delayed, the next tick still reconciles state.
- Flexibility: you can adjust the polling interval without rewriting scheduling logic.

The tradeoff is that it may do extra work (queries) even when nothing changes. But with a 5-second default, the load is small and predictable.

---

### 18) Separation of schedule calculation and chain truth

The scheduler computes expected times locally, but it always checks the chain’s tournament phase. It does not assume that a tournament is in a certain phase just because of local time. This is a critical design choice.

If the scheduler only trusted local time, it might attempt to end a tournament that never started, or start one twice. By inspecting chain state, it preserves correctness even if the local schedule is wrong.

This is a good example of a **control loop with feedback**: local time is the desired trajectory, chain state is the observed output, and admin instructions are the control signals.

---

### 19) Admin key security: why file inputs matter

The admin private key is the most sensitive secret in this flow. In production, you should store it in a file with restricted permissions and ideally mount it from a secret manager. The scheduler explicitly supports a file path for this reason.

Never embed admin keys in container images or environment variables in production. It is too easy to leak them via logs or debugging tools.

---

### 20) Replay safety and nonce discipline

Because admin instructions are transactions, they are subject to replay protection via nonce. This is why the scheduler’s nonce tracker is critical. If it reuses a nonce, the transaction is rejected. If it skips a nonce, that nonce becomes “lost” and the scheduler must resync.

This is the same nonce discipline that user transactions follow. The difference is that the scheduler must implement the discipline itself.

---

### 21) Integration with UI and client schedulers

In this system, UI hooks can also attempt to start or end tournaments. That means the scheduler is not the only actor. The chain’s handlers must therefore be idempotent: a second start attempt should be rejected without corrupting state.

The scheduler’s job is not to be the only starter; it is to ensure that **someone** starts and ends tournaments even if no UI is open.

---

### 22) Designing for recovery after downtime

If the scheduler goes down for an hour, when it restarts it should reconcile missed transitions. Checking the previous slot helps, but if downtime is long, you may have skipped multiple slots. In that case, the scheduler will only reconcile the current and previous slot, and older tournaments may remain in an incorrect phase.

This is a limitation. If long downtime is possible, you should extend the scheduler to reconcile more than one previous slot or to explicitly check for tournaments stuck in Active phase beyond their end time.

---

### 23) Possible hardening improvements

If you need production-grade reliability, consider:

- **Clock sanity checks**: refuse to run if system time is far off NTP.
- **State reconciliation window**: check several past slots, not just one.
- **Structured retries**: exponential backoff on submission failures.
- **Persistent nonce cache**: so restarts do not require immediate resync.
- **Metrics endpoint**: expose start/end counters and lag time.

The current design is minimal and works for small scale, but these changes make it more robust under failures.

---

### 24) Feynman analogy: a school bell operator

Imagine a school with classes that must start and end on time. The scheduler is the person in charge of ringing the bell. They look at a wall clock (local time), check whether a class is already in session (chain phase), and ring the bell to start or end the class.

If they are late, they might ring twice, but the teacher (on-chain handler) ignores duplicate bells. If they fall asleep and miss a class, the next bell helps the school catch up, but only partially. This analogy captures the essence: a simple, time-driven process that nudges a state machine forward.

---

### 25) Exercises for mastery

1) Compute the start/end times for slot 10 given TOURNAMENTS_PER_DAY = 240 and TOURNAMENT_DURATION_SECS = 300.
2) Explain what happens if the scheduler runs with a poll interval of 60 seconds.
3) Describe a failure scenario where the scheduler submits a start transaction twice, and explain how the on-chain handler should respond.
4) Propose a modification to handle multi-hour downtime and explain how it changes the loop logic.

If you can answer these, you understand the scheduler deeply.


### 26) Scheduling and daylight savings

The scheduler uses fixed millisecond math and does not care about local time zones or daylight savings. This is good: DST shifts would otherwise distort the schedule. By staying in UTC milliseconds, the schedule is stable year-round. Operators should still ensure the host clock is synced with NTP to avoid drift.


### 27) Submission batching is intentionally single‑tx

The scheduler submits exactly one transaction per action. It could batch multiple start/end actions, but that would complicate nonce tracking and error handling. Single‑tx submissions keep failures isolated and easier to debug.


## Key takeaways
- The scheduler is a server-side automation for tournament lifecycle.
- It uses slot math and admin-signed transactions to start/end tournaments.

## Next lesson
L28 - Auth admin sync: `feynman/lessons/L28-auth-admin-sync.md`
