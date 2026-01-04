# L23 - Casino handlers (register + deposit) (from scratch)

Focus file: `execution/src/layer/handlers/casino.rs`

Goal: explain how register and deposit instructions change on‑chain player state. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Register creates the player record
This allocates the player object and puts them in the registry.

### 2) Deposit is the faucet path
Deposits are rate‑limited and then credited to the player balance.

---

## Walkthrough with code excerpts

### 1) Register handler
```rust
pub(in crate::layer) async fn handle_casino_register(
    &mut self,
    public: &PublicKey,
    name: &str,
) -> anyhow::Result<Vec<Event>> {
    if self
        .get(Key::CasinoPlayer(public.clone()))
        .await?
        .is_some()
    {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_PLAYER_ALREADY_REGISTERED,
            "Player already registered",
        ));
    }

    let mut player = nullspace_types::casino::Player::new(name.to_string());
    let current_time_sec = self.seed_view.saturating_mul(SECS_PER_VIEW);
    player.profile.created_ts = current_time_sec;

    self.insert(
        Key::CasinoPlayer(public.clone()),
        Value::CasinoPlayer(player.clone()),
    );
    self.ensure_player_registry(public).await?;

    let mut events = vec![Event::CasinoPlayerRegistered {
        player: public.clone(),
        name: name.to_string(),
    }];
    if let Some(event) = self.update_casino_leaderboard(public, &player).await? {
        events.push(event);
    }

    Ok(events)
}
```

Why this matters:
- Without a player record, no other casino actions can succeed.

What this code does:
- Prevents duplicate registrations.
- Creates a new player, stamps creation time, and inserts into state.
- Emits a registration event and updates the leaderboard.

---

### 2) Deposit handler (faucet)
```rust
pub(in crate::layer) async fn handle_casino_deposit(
    &mut self,
    public: &PublicKey,
    amount: u64,
) -> anyhow::Result<Vec<Event>> {
    let mut player = match self.casino_player_or_error(public, None).await? {
        Ok(player) => player,
        Err(events) => return Ok(events),
    };

    // ... rate limit checks ...

    player.balances.chips = player.balances.chips.saturating_add(amount);
    player.session.last_deposit_block = current_block;

    self.insert(
        Key::CasinoPlayer(public.clone()),
        Value::CasinoPlayer(player.clone()),
    );

    let mut events = vec![Event::CasinoDeposited {
        player: public.clone(),
        amount,
        new_chips: player.balances.chips,
    }];
    if let Some(event) = self.update_casino_leaderboard(public, &player).await? {
        events.push(event);
    }

    Ok(events)
}
```

Why this matters:
- Faucet deposits are a core onboarding feature. If this fails, new users are blocked.

What this code does:
- Loads the player or returns an error event if missing.
- Enforces faucet rate limits (age + cooldown + daily).
- Adds chips and emits a deposit event and leaderboard update.

---

## Extended deep dive: register and deposit as state-machine transitions

The register and deposit handlers are not just functions. They are state-machine transitions: given a current on-chain state and an instruction, they compute a new state and a set of events. This section builds a university-level understanding of how those transitions are designed, why each guard exists, and what invariants they protect.

---

### 3) The Player record is a bundle of subsystems

The Player struct (in `types/src/casino/player.rs`) is a composite object. It is not just a name + balance. It includes:

- Profile: name, created timestamp, rank, KYC flags.
- Balances: chips (primary in-game currency), vusdt balance, freeroll credits.
- Modifiers: shields, doubles, super-mode flags, aura meter.
- Tournament state: tournament chips, shields/doubles, active tournament, daily limit.
- Session state: active session id, last faucet deposit block, daily flow counters.

Register constructs this entire object in one step. That means register is the only handler that can be responsible for initial values. If you see a Player object in state, you can assume these fields exist and are initialized. This is why register is a critical checkpoint for downstream handlers.

Feynman analogy: register is the "factory" that ships a fully assembled device. The factory does not ship just a shell; it ships a device with every subsystem installed and powered on.

---

### 4) Player::new and initial inventory

`Player::new(name)` sets default values for all substructures. Key details:

- `balances.chips` is initialized to `INITIAL_CHIPS`. This means new players can play immediately even if they never use the faucet.
- `modifiers.shields` and `modifiers.doubles` are initialized to `STARTING_SHIELDS` and `STARTING_DOUBLES`. These are gameplay affordances that new players receive.
- Tournament daily limit is set to the free tier default (`FREEROLL_DAILY_LIMIT_FREE`).
- `session.last_deposit_block` starts at 0, which signals "no faucet usage yet" and allows the first faucet claim.

If you ever change those constants, you are changing the onboarding economics. That is why the register handler should be reviewed when product or economy rules change.

---

### 5) Duplicate registration: state uniqueness invariant

Register begins by checking whether `Key::CasinoPlayer(public)` already exists. If it does, the handler returns a `CasinoError` event with `ERROR_PLAYER_ALREADY_REGISTERED`.

This protects a core invariant: one public key equals one player record. If we allowed re-registration, we would have to answer hard questions like:

- Do we reset balances?
- Do we reset session history?
- Do we allow name changes?

The system answers those questions by refusing re-registration. The user can still rename via a dedicated update pathway (if implemented), but register is a one-time operation.

---

### 6) Deterministic time and created_ts

Registration writes:

```
current_time_sec = seed_view * SECS_PER_VIEW
player.profile.created_ts = current_time_sec
```

This is deterministic time derived from consensus view numbers, not system clocks. The advantage:

- Every validator computes the same timestamp.
- Faucet age checks are consistent across nodes.
- There is no clock skew vulnerability.

The tradeoff is that created_ts is "block time" not UTC time. It might drift from real-world time by a few seconds or minutes, but the system is consistent, which is more important for consensus.

---

### 7) Player registry: an index, not the source of truth

`ensure_player_registry` maintains a global list of player public keys. It loads the registry, inserts the public key if missing, sorts, and deduplicates.

This registry is **not** the authoritative record for player data; the individual `CasinoPlayer` entries are. The registry is simply an index to allow listing all players for explorers, analytics, or admin dashboards.

Sorting and deduplicating keeps the list canonical. If you do not sort/dedup, two validators could insert in different orders and produce diverging state. The registry is therefore a good example of how small details matter for determinism.

---

### 8) Leaderboard update: change detection before event emission

After registration, the handler calls `update_casino_leaderboard`. That helper:

1) Loads the current leaderboard (or default).
2) Applies the player's chips and name.
3) Compares the updated leaderboard to the previous one.
4) Only writes and emits an event if a change occurred.

This avoids unnecessary events and reduces update stream noise. It is also a form of compression: if multiple register events yield the same leaderboard view, we do not emit identical updates.

---

### 9) Event discipline: every outcome is observable

Register emits:

- `CasinoPlayerRegistered` on success.
- Optional `CasinoLeaderboardUpdated` if the leaderboard changed.
- `CasinoError` on failure.

This ensures that clients do not have to guess. The updates stream is the official story of what happened. If a transaction was executed, it yields events. If it failed for a user-level reason, it yields an error event. That consistency is a design principle across the execution layer.

---

## Deep dive: faucet deposit as a guarded transition

Deposit is a classic abuse target. The handler therefore layers multiple guards to prevent faucet spam while keeping onboarding friendly.

---

### 10) Player lookup helper: `casino_player_or_error`

The first line of defense is a helper that loads the player or returns an error event. This pattern is used across casino handlers because it keeps error reporting consistent and reduces code duplication.

If a public key is not registered, the handler returns `ERROR_PLAYER_NOT_FOUND`. This prevents faucet usage without registration and gives the client a clear reason.

---

### 11) Guard 1: minimum account age or sessions played

The faucet requires either:

- the account is older than `FAUCET_MIN_ACCOUNT_AGE_SECS`, or
- the player has completed at least `FAUCET_MIN_SESSIONS` sessions.

The logic is expressed as a conjunction:

```
if account_age < MIN_AGE && sessions_played < MIN_SESSIONS => deny
```

This is a carefully chosen rule. It allows a brand-new account to claim the faucet only if they have actually played. This reduces bot abuse while still enabling genuine new users to progress quickly.

---

### 12) Guard 2: block-based cooldown

Next, the handler enforces a cooldown between deposits:

```
block_delta = current_block - last_deposit_block
if last_deposit_block != 0 && block_delta < FAUCET_RATE_LIMIT => deny
```

This means a player cannot claim the faucet again until a certain number of blocks (views) have passed. Because the block rate is stable, this provides predictable pacing.

Note that the first deposit is allowed because `last_deposit_block` starts at 0. That is why register initializes it to zero.

---

### 13) Guard 3: daily limit

Finally, a "once per day" limit is enforced:

```
current_day = current_time_sec / 86_400
last_deposit_day = (last_deposit_block * SECS_PER_VIEW) / 86_400
if last_deposit_block != 0 && last_deposit_day == current_day => deny
```

This provides an intuitive policy: even if you wait out the cooldown, you can only claim once per day.

Note: the day boundary is defined by block time, not wall time. That means "day" is a deterministic block-based day, which could drift slightly from UTC midnight. This is acceptable because consistency is the primary goal.

---

### 14) The deposit itself: saturating arithmetic

Once all guards pass, the handler performs the update:

- `player.balances.chips = saturating_add(amount)`
- `player.session.last_deposit_block = current_block`

Using saturating arithmetic is a defensive choice: it prevents overflow and keeps the state valid even in extreme cases. For a faucet, amounts are typically small, but the safe choice costs nothing.

---

### 15) Leaderboard coupling

After a deposit, the leaderboard might change because the player's chip balance increases. The handler therefore calls `update_casino_leaderboard` again and emits a `CasinoLeaderboardUpdated` event if needed.

This means the leaderboard is not just updated by gameplay. It is updated by onboarding and faucet activity too. That might sound surprising, but it matches the concept that "chips" represent overall status.

---

### 16) Error events and observability

All faucet denial paths return `CasinoError` with `ERROR_RATE_LIMITED`. The helper `casino_error_vec` also logs a warning with structured fields (player, session_id, error_code, message). This is important for ops:

- You can track how often rate limiting triggers.
- You can detect abuse patterns.
- You can alert on spikes in faucet denial events.

The handler therefore doubles as a behavioral telemetry source.

---

## Operational implications and UX tradeoffs

### 17) Why faucet limits live on-chain

A gateway can enforce limits, but it is not trustworthy. Anyone can bypass it and submit transactions directly. That is why the faucet limits live in the handler itself.

Think of the gateway as a convenience. The validator is the real rule enforcer. This is the correct boundary for security in a decentralized system.

---

### 18) Nonce consumption on error

A subtle but important detail: even if the faucet is denied, the transaction has already passed `prepare` and nonce validation. That means the nonce is consumed and the transaction is considered executed, albeit with an error event.

This is different from "revert" semantics in some other blockchains. The benefit is clarity: the user sees a clear event. The cost is that the user might be surprised that a failed faucet still advanced their nonce.

This is why client-side validation is still important. The gateway should check rate limits proactively to avoid wasting a user's nonce.

---

### 19) Determinism beats real-time accuracy

Every guard uses `seed_view` and `SECS_PER_VIEW`. This is a conscious decision to favor determinism. In a distributed system, the most important property is that all validators compute the same answer for the same input.

Real-time accuracy is secondary. A faucet day that starts 10 minutes earlier or later than UTC is acceptable as long as every node agrees.

---

### 20) How to debug faucet issues in production

When a user reports "faucet not working," follow this checklist:

1) Inspect the updates stream for `CasinoError` events.
2) Check `created_ts` and `sessions_played` to see if guard 1 triggered.
3) Check `last_deposit_block` and `current_block` to see if cooldown triggered.
4) Compute `current_day` and `last_deposit_day` to see if daily limit triggered.
5) Confirm that the player record exists and has not been reset.

This step-by-step approach quickly isolates which guard caused the denial.

---

## Feynman mental model

Imagine a casino front desk with a clerk.

- Register: the clerk creates your membership profile, gives you starter chips, and writes your name on the leaderboard if you qualify.
- Deposit: the clerk gives you extra chips only if you have played enough, waited long enough, and have not claimed today.

The clerk always hands you a receipt (event). If the clerk denies the request, the receipt says "rate limited" or "already registered" with a code. The UI is just reading the receipts.

---

## Exercises for mastery

1) Trace a register transaction end-to-end and list every state key modified.
2) Derive the exact faucet eligibility formula for a player with created_ts = 0 and sessions_played = 2 at view 500.
3) Modify the faucet rule to "two deposits per day" and identify which fields would need to change.
4) Explain why the player registry must be sorted and deduplicated.
5) Describe how a missing leaderboard update could occur and how to detect it in logs.

If you can answer these, you have internalized the register/deposit handler logic deeply.


## Advanced topics: concurrency, determinism, and performance

This extra section fills in the higher-level reasoning that is easy to miss when you only read the handler code.

---

### 21) How register and deposit behave in the same block

Because the execution layer uses a staging overlay, a register and deposit from the same account can appear in the same block and still work. The sequence is:

1) Transaction 1 (register) runs, inserts `Key::CasinoPlayer` into the pending map.
2) Transaction 2 (deposit) runs, calls `casino_player_or_error`, which reads from the pending map first.

This is why a deposit can succeed in the same block as registration. The system does not require a round trip to storage in between. It is a subtle but important property of the Layer overlay model.

---

### 22) Separation of concerns: instruction validation vs handler logic

Some validation happens before the handler ever runs:

- Instruction bytes are decoded and validated in `types/src/execution.rs`.
- Name length and UTF-8 checks happen during decode.
- Nonce validation happens in `prepare`.

That means the handler can assume certain invariants:

- The name is valid UTF-8 and within length limits.
- The nonce has already advanced.
- The instruction tag is correct.

This separation makes the handler simpler and more focused: it only cares about semantic rules (e.g., rate limits, duplicate checks) not binary parsing.

---

### 23) Error codes as a stable user contract

The error codes used in register and deposit are defined in the types layer. These codes are part of the client contract, not just internal signals. For example:

- `ERROR_PLAYER_ALREADY_REGISTERED`
- `ERROR_PLAYER_NOT_FOUND`
- `ERROR_RATE_LIMITED`

Because these codes are part of the ABI, you should treat them like tags: stable, versioned, and carefully updated. The UI relies on them to display localized error messages. If you change the meaning of a code without updating the client, you create silent user confusion.

---

### 24) Performance characteristics of register

Register does a small number of operations:

- A state read to check for existing player.
- A state write for the new player.
- A state read/write for the player registry.
- A state read/write for the leaderboard if it changes.

The registry and leaderboard operations are the most expensive because they involve vector updates. In practice this is fine for onboarding scale, but it is worth monitoring if player counts become very large. If needed, these structures could be replaced with more scalable index structures.

---

### 25) Performance characteristics of deposit

Deposit performs:

- A state read for the player.
- A few arithmetic checks for rate limits.
- A state write for the updated player.
- A possible leaderboard update.

The arithmetic is cheap, and the main cost is the state read/write and potential leaderboard update. This means faucet throughput is mostly limited by storage IO and leaderboard updates, not by CPU.

---

### 26) Deterministic arithmetic and saturating ops

Register and deposit use saturating arithmetic for time and balance calculations. The purpose is not just to avoid panic; it also ensures deterministic behavior in extreme cases. In distributed systems, "undefined" behavior is deadly. Saturating arithmetic provides a well-defined result even at numeric boundaries.

---

### 27) The handler does not enforce name policies beyond length

The register handler does not enforce profanity filters or complex name policies. It only relies on the decode layer to enforce length and UTF-8 validity. This is a design choice: content policy is best enforced at the UI level, while the chain enforces only hard limits necessary for safety and determinism.

If you need stronger name policies, add them explicitly in the handler and make sure to emit clear error events.

---

### 28) Interaction with account nonces

The handler never reads or writes account nonces. That is the job of `prepare` in the execution layer. This separation is deliberate. It keeps nonce logic centralized and prevents duplication or mistakes.

The tradeoff is that errors in the handler still consume nonces. This is why client-side prechecks matter: they avoid wasting nonces on predictable failures.

---

### 29) Security posture of the faucet

Even with rate limits, the faucet is a potential abuse vector. The chain mitigates this by:

- Requiring registration (identity binding to public key).
- Enforcing minimum age or session count.
- Enforcing cooldown and daily limits.
- Emitting error events and logs for monitoring.

If abuse becomes a serious issue, additional controls can be added, such as:

- Per-IP gating at the gateway.
- On-chain proof-of-human (KYC) requirements.
- Global faucet budget per epoch.

The handler is the correct place to add on-chain enforcement.

---

### 30) Testing ideas: property and simulation tests

Beyond unit tests, you can test register/deposit via simulation:

- Generate random sequences of register/deposit instructions for multiple accounts.
- Ensure that balances never go negative.
- Ensure that `last_deposit_block` only moves forward.
- Ensure that no player can bypass rate limits by interleaving other actions.

These property-style tests catch subtle edge cases that individual unit tests might miss.

---

### 31) Design alternative: allow re-registration

What if we wanted to allow re-registration (e.g., name changes)? We would need to make deliberate design choices:

- Should balances reset? Probably not.
- Should tournament progress reset? Probably not.
- Should we keep historical names? Maybe yes.

Allowing re-registration is not trivial. The existing code avoids this complexity by forbidding it outright. This is an example of making the system simpler by narrowing the state transitions.

---

### 32) Advanced Feynman exercise

Explain register and deposit to a non-technical teammate without using the words "nonce," "state," or "transaction." If you can do that, you have internalized the system. Then map each part of your explanation back to the exact code lines in `casino.rs`.


## Key takeaways
- Register creates a player record and updates the leaderboard.
- Deposit adds chips but is protected by multiple rate limits.

## Next lesson
L24 - Register types: `feynman/lessons/L24-register-types.md`
