# L46 - Compare global table vs normal craps (from scratch)

Focus files: `gateway/src/handlers/craps.ts`, `execution/src/layer/handlers/casino.rs`

Goal: compare the two craps flows end-to-end: normal per-session craps vs the on-chain global table. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Normal craps (session-based)
- Each player runs a private `GameSession`.
- Bets and rolls are processed directly in the execution layer.
- The outcome only affects that player’s session.

### 2) Global-table craps (on-chain)
- Players join a shared round.
- Bets are aggregated and an admin reveals the outcome.
- Each player settles after the round using the shared roll.

### 3) Tradeoffs
- **Normal**: simpler, per-player determinism, fewer admin actions.
- **Global table**: shared experience, on-chain confirmations, but requires admin orchestration and more complex state.

---

## Limits & management callouts (important)

1) **Normal mode relies on atomic batch payloads**
- If clients do not use the atomic batch, latency and UX degrade.

2) **Global table mode has more moving parts**
- Requires admin key, global table config, and round orchestration.
- Misconfiguration can stall the table for all players.

3) **Bet limits enforced in different layers**
- Normal mode relies on execution-layer checks.
- Global table mode enforces additional global table limits.

---

## Two flows as explicit state machines

### 1) Normal craps: per player session machine
Normal mode is a classic single player state machine. The canonical state is
`GameSession` in the execution layer, keyed by a session id and owner. The
gateway always:

1) Creates a new session id with `generateSessionId`.
2) Calls `startGame` (with bet = 0 for craps).
3) Submits a single payload via `makeMove`.

This is why `craps_bet` and `craps_roll` both call `handleBet`: every request
is a fresh session with an atomic payload. The handler does not attempt to
resume a prior session id. If a multi roll flow is desired, the client and
gateway would need to coordinate that explicitly, but this handler does not.

### 2) Global table: shared round machine
Global table mode is a shared round state machine. The state is stored in
`GlobalTableRound` and advanced by admin instructions:

1) `GlobalTableOpenRound` opens betting.
2) `GlobalTableLock` closes betting.
3) `GlobalTableReveal` produces the shared outcome.
4) `GlobalTableSettle` is called once per player.
5) `GlobalTableFinalize` ends the round and enters cooldown.

Players submit bets and later settle. The shared round is the "clock" and the
session state is just a bridge to reuse the craps engine.

---

## Message flow comparison (step by step)

### 1) Normal mode request path
The normal path is short and synchronous:

1) Client sends `craps_bet` or `craps_roll`.
2) Gateway `CrapsHandler` builds an atomic payload and sends one transaction.
3) Execution layer applies `process_game_move` to the session.
4) An event is emitted; the UI updates from the event stream.

The atomic payload format is documented in the craps engine:

```
[4, bet_count, bets...]
```

Each bet is 10 bytes: `[bet_type, target, amount (u64 BE)]`.

### 2) Global table request path
The global flow is longer and split into admin actions and player actions:

1) Admin (gateway live table coordinator) opens the round.
2) Players submit `GlobalTableSubmitBets` while Betting is open.
3) Admin locks the round.
4) Admin reveals the outcome (roll seed + dice values).
5) Each player calls `GlobalTableSettle`.
6) Admin finalizes and the next round may open.

The outcome and totals are broadcast as events; the gateway does not "decide"
what happened. It simply relays on chain events to connected players.

---

## Determinism and fairness: same engine, different clocks

### 1) Determinism in normal mode
Normal mode uses the chain seed and session id to derive randomness.
`process_game_move` is called once for the atomic batch, so the full result is
deterministic for that player. The only party that matters is the session
owner; nobody else shares the state.

### 2) Determinism in global mode
Global mode stores the `roll_seed` on chain in the round record. Every player
settles using `GameRng::from_state(roll_seed)`, so the roll is identical across
all players. The session state is synced to the shared table state before
settlement. This means everyone sees the same dice and the same point state.

### 3) Fairness differences
Normal mode fairness is "per player": if your transaction is included, the
engine is deterministic and fair. Global mode fairness is "shared": the admin
cannot choose a different outcome for different players because the same seed
is replayed for all settlements.

---

## State storage comparison

### 1) Normal mode storage
The chain stores a `GameSession` for the player. That session contains:

- A binary state blob for craps.
- A move counter.
- Completion flags and timestamps.

Because each request starts a new session id, the state is short lived and
mostly used for result logging and player history.

### 2) Global mode storage
Global mode stores three distinct state records:

- `GlobalTableConfig`: the table rules and timing.
- `GlobalTableRound`: the shared round snapshot.
- `GlobalTablePlayerSession`: per player session + last settled round.

This separation is what allows thousands of players to interact with a single
round while still reusing the same game engine code.

---

## Gateway level differences

### 1) Normal mode handler
In `gateway/src/handlers/craps.ts`, the normal path does not depend on any
global coordinator. The handler:

- Generates a session id from the public key and a counter.
- Calls `startGame` and then `makeMove`.
- Relies on the execution layer to validate the payload.

This makes normal mode resilient: it does not require any background tasks.

### 2) Global mode coordinator
Global table mode routes to `crapsLiveTable` which is a coordinator in
`gateway/src/live-table/craps.ts`. That coordinator:

- Loads the admin key and uses a `NonceManager`.
- Submits `GlobalTable*` transactions on a schedule.
- Tracks phase timing and broadcasts updates.

This means global mode depends on a running coordinator to advance rounds. If
the coordinator stops, the table stops.

---

## Error surfaces and failure modes

### 1) Normal mode failures
Failures are localized:

- If the session is invalid, the single player sees an error.
- If the bet is invalid, the player sees an error event.
- If the transaction fails, only that player is affected.

### 2) Global mode failures
Failures are shared:

- If betting is closed, every player is rejected until the next round.
- If the admin does not reveal, no player can settle.
- If the admin key is misconfigured, the entire table stalls.

The failure radius is larger, which is why global mode requires careful ops.

---

## Economic and accounting differences

### 1) Normal mode accounting
`process_game_move` updates balances and house PnL inside the session handler.
The result is applied immediately for a single player. There is no shared
totals list; any aggregation happens off chain.

### 2) Global mode accounting
Global mode uses two accounting paths:

- On submit, the bet delta adjusts balances immediately.
- On settle, the roll result adjusts balances again.

The round totals are maintained in `round.totals` and represent the aggregate
live exposure of the table. This is used for UI and analytics, and it is
bounded for safety.

---

## Worked example: same bet in both flows

### Normal mode
Player A sends a single pass line bet:

1) Gateway creates a new session id.
2) Payload `[4, 1, bet...]` is sent.
3) Execution layer places the bet and rolls once.
4) A result is emitted for Player A.

Outcome and payout are visible immediately after one transaction.

### Global mode
Player A sends the same bet to the global table:

1) Gateway submits `GlobalTableSubmitBets` while betting is open.
2) The bet is accepted, and the player's chips may be deducted.
3) The admin later reveals a shared roll.
4) Player A calls `GlobalTableSettle` and gets the payout.

Outcome is shared, but the flow is split across multiple transactions.

---

## Operational guidance

If you are choosing between these modes, think like a systems engineer:

- If you need a fully shared, synchronous experience, global table is the only
  path, but it requires round orchestration and careful monitoring.
- If you need a simple, resilient path with fewer moving parts, normal mode
  is the safest choice, but it does not create a shared experience.

Both paths use the same underlying craps engine. The difference is in the
orchestration layer and the state machine that frames each move.

---

## Metrics to watch in each mode

In normal mode, the most important metrics are per player:

- bet acceptance rate
- average confirmation latency
- balance update errors

In global mode, the most important metrics are round based:

- time spent in each phase
- number of bets per round
- number of players who settle
- distribution of settlement latency

These metrics map directly to user experience. A normal mode failure affects
one player. A global mode failure affects an entire round.

---

## Mini glossary (shared vocabulary)

- **Session**: a per player state machine in normal mode.
- **Round**: a shared state machine in global mode.
- **Phase**: a timed state within a round (betting, locked, payout).
- **Settle**: the per player replay of the shared roll.

Using this vocabulary consistently makes it much easier to debug logs and
communicate issues across teams.

One subtle benefit of shared terms is faster incident response. When someone
says "round stuck in lock" or "session replay failed," everyone should know
exactly which subsystem is at fault and which logs to check first.
Clarity beats speed in incidents.

---

## FAQ style clarifications

### "Can a player mix modes?"
Not in the same round. Normal mode and global mode are separate instruction
paths and separate event vocabularies. A client may choose to send either
`craps_bet` (normal) or `craps_live_bet` (global), but those bets go to
different state machines. Mixing them would confuse the UI and the accounting.

### "Why does global mode require a settle call?"
Because settlement is how the system distributes work across many players. If
the admin tried to settle every player in a single transaction, it would exceed
block limits. By making settlement per player, the system allows thousands of
players to resolve without exceeding per transaction compute bounds.

### "Why not use global mode for everything?"
Global mode is great for shared experiences, but it is expensive in terms of
transactions and operational complexity. Normal mode is still valuable for
simple play and for fallback scenarios when the live table coordinator is down.

---

## Protocol and event surface comparison (deep dive)

### 1) Instruction shapes
Normal mode primarily uses:

- `CasinoStartGame` (implicit in `startGame`)
- `CasinoGameMove` (payload with action 4 for atomic bets)

Global mode uses the global table instructions:

- `GlobalTableInit`, `OpenRound`, `SubmitBets`
- `Lock`, `Reveal`, `Settle`, `Finalize`

These are distinct instruction types, which means a node can observe the chain
and tell which mode is active based solely on instruction tags.

### 2) Event shapes
Normal mode emits standard `CasinoGameUpdate` and completion events tied to the
player session. Global mode emits specific global table events:

- `GlobalTableRoundOpened`
- `GlobalTableBetAccepted` / `GlobalTableBetRejected`
- `GlobalTableLocked`
- `GlobalTableOutcome`
- `GlobalTablePlayerSettled`
- `GlobalTableFinalized`

From the UI perspective, this is two different event vocabularies. That is why
the gateway has two distinct handlers.

---

## Why the atomic batch matters in normal mode

The craps engine supports multiple actions (place bet, add odds, roll). The
gateway chooses to use action 4, the atomic batch, which combines bet placement
and roll in one move. This has three consequences:

1) **Fewer round trips**: one move covers bet and roll.
2) **All or nothing**: if any bet in the batch is invalid, the whole move
   fails and the session is unchanged.
3) **No odds in atomic batch**: the engine explicitly disallows odds in the
   batch, which means the normal flow does not expose odds betting.

This is why normal mode feels fast: it is a single transaction path.

---

## State blob vs round state (why sync exists)

Normal mode uses the craps state blob as the canonical state. The blob encodes:

- phase (come out vs point)
- dice results
- active bets
- rule flags such as field paytable

Global mode uses `GlobalTableRound` as the canonical state for the shared
table, and then syncs that state into each player's session blob before
processing moves or settlement.

This sync is necessary because the craps engine expects to read and write the
state blob. Without syncing, two players could be settling against different
table states, which would be a consensus failure. The sync operation is the
bridge that keeps shared state and per player state consistent.

---

## Latency and throughput tradeoffs (deep dive)

### 1) Normal mode latency
Normal mode latency is one transaction and one event. The only waiting is the
chain confirmation time. This makes it a good choice for fast feedback loops.

### 2) Global mode latency
Global mode latency is the sum of multiple phases. A bet may be accepted in
phase 1, but the outcome is not known until after lock and reveal. Then each
player must settle. The total time from bet to final balance update can be
multiple seconds or minutes depending on configuration.

### 3) Throughput implications
Normal mode throughput is "one transaction per player per roll". Global mode
throughput is "one bet tx per player plus one settle tx per player plus admin
txs". That is higher total transaction volume, but the shared outcome allows
all players to consume the same roll result without each running their own RNG
seed selection.

---

## Testing differences (deep dive)

### 1) Normal mode tests
Normal mode can be tested with simple request/response cycles:

- Send `craps_bet`, expect one event.
- Validate balance changes.

### 2) Global mode tests
Global mode requires multi step integration tests:

- Open round, submit bets, lock, reveal.
- Settle for multiple players.
- Finalize and open a new round.

Because multiple actors are involved, end to end tests are more important than
unit tests for the global flow.

---

## Practical guidance for product teams

If you want a live shared experience, global table is the right path. But you
must design the UI for phase transitions and latency. The user should see:

- a countdown to lock
- a locked state
- a reveal event with shared dice
- a settlement confirmation

Normal mode does not need any of that. The user can see "bet accepted" and
"result" almost immediately. That is why normal mode feels like a typical
single player casino game, while global mode feels like a live event.

---

## Walkthrough with code excerpts

### 1) Gateway routing: global vs normal
```rust
switch (msg.type) {
  case 'craps_live_join':
    return this.handleLiveJoin(ctx, msg);
  case 'craps_live_leave':
    return this.handleLiveLeave(ctx, msg);
  case 'craps_live_bet':
    return this.handleLiveBet(ctx, msg);
  case 'craps_bet':
    return this.handleBet(ctx, msg);
  case 'craps_roll':
    return this.handleBet(ctx, msg);
  default:
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_MESSAGE, `Unknown craps message: ${msg.type}`),
    };
}
```

Why this matters:
- This switch decides which flow the player enters.

What this code does:
- Sends global table requests to the global-table handlers.
- Sends normal bets/rolls to the on-chain session flow.

---

### 2) Normal mode: per-session move handling
```rust
pub(in crate::layer) async fn handle_casino_game_move(
    &mut self,
    public: &PublicKey,
    session_id: u64,
    payload: &[u8],
) -> anyhow::Result<Vec<Event>> {
    let mut session = match self
        .casino_session_owned_active_or_error(public, session_id)
        .await?
    {
        Ok(session) => session,
        Err(events) => return Ok(events),
    };
    let now = self.seed_view.saturating_mul(3);
    let payload_len = payload.len();
    let payload_action = payload.first().copied();

    session.move_count += 1;
    let mut rng = crate::casino::GameRng::new(&self.seed, session_id, session.move_count);

    let result = match crate::casino::process_game_move(&mut session, payload, &mut rng) {
        Ok(r) => r,
        Err(err) => {
            tracing::warn!(
                player = ?public,
                session_id = session_id,
                game_type = ?session.game_type,
                payload_len = payload_len,
                payload_action = payload_action,
                ?err,
                "casino move rejected"
            );
            return Ok(casino_error_vec(
                public,
                Some(session_id),
                nullspace_types::casino::ERROR_INVALID_MOVE,
                "Invalid game move",
            ));
        }
    };

    // ... update balances and emit events
}
```

Why this matters:
- This is the canonical flow for normal craps: a single player’s session advances.

What this code does:
- Loads the session owned by the player.
- Runs the move through the game engine with deterministic RNG.
- Emits success or error events for that one player.

---

### 3) Global table mode: submitting to a shared round
```rust
pub(in crate::layer) async fn handle_global_table_submit_bets(
    &mut self,
    public: &PublicKey,
    game_type: nullspace_types::casino::GameType,
    round_id: u64,
    bets: &[nullspace_types::casino::GlobalTableBet],
) -> anyhow::Result<Vec<Event>> {
    if game_type != nullspace_types::casino::GameType::Craps {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Global table supports craps only",
        ));
    }

    if bets.is_empty() {
        return Ok(vec![Event::GlobalTableBetRejected {
            player: public.clone(),
            round_id,
            error_code: nullspace_types::casino::ERROR_INVALID_BET,
            message: "No bets provided".to_string(),
        }]);
    }

    // ... check config, phase, balances, then apply
}
```

Why this matters:
- In global table mode, bets are attached to a shared round instead of a private session.

What this code does:
- Validates the game type and bet list.
- Rejects bad requests with a global-table-specific event.
- Later in the function, applies bets and updates the shared round state.

---

### 4) Global table mode: settling after a shared outcome
```rust
pub(in crate::layer) async fn handle_global_table_settle(
    &mut self,
    public: &PublicKey,
    game_type: nullspace_types::casino::GameType,
    round_id: u64,
) -> anyhow::Result<Vec<Event>> {
    let mut round = match self.get(Key::GlobalTableRound(game_type)).await? {
        Some(Value::GlobalTableRound(round)) => round,
        _ => {
            return Ok(casino_error_vec(
                public,
                None,
                nullspace_types::casino::ERROR_INVALID_MOVE,
                "Round not initialized",
            ))
        }
    };

    if round.roll_seed.len() != 32 {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Round outcome not revealed",
        ));
    }

    // ... apply roll outcome to the player’s session and update balances
}
```

Why this matters:
- Global table mode requires a separate settlement step for each player.

What this code does:
- Confirms the round outcome exists.
- Applies the shared roll result to the player’s session.
- Updates balances and emits settlement events.

---

## Key takeaways
- Normal craps is private and session-based.
- Global table craps is shared and round-based, with extra admin steps.
- Both flows reuse the same core game logic, but state ownership differs.

## Next lesson
Optional extensions and concept labs continue in `feynman/lessons/`.
