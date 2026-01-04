# L45 - Global table handlers (on-chain) (from scratch)

Focus file: `execution/src/layer/handlers/casino.rs`

Goal: explain how the on-chain execution layer manages global table rounds for live craps. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Global table vs normal sessions
Normal craps uses a private session per player. Global table uses a shared round with a shared roll result. Players submit bets, the admin reveals the outcome, and then each player settles.

### 2) Admin-controlled phases
The admin key opens, locks, reveals, and finalizes each round. This keeps the round lifecycle consistent across all nodes.

### 3) Deterministic outcome
The reveal step generates a roll seed and processes a roll using the same game logic as normal craps. This makes results deterministic and auditable.

---

## Limits & management callouts (important)

1) **Time is derived from block view**
- `now_ms = seed_view * 3_000` assumes ~3 seconds per view.
- If block timing changes, round timing changes.

2) **Bet caps and limits are enforced here**
- `min_bet`, `max_bet`, and `max_bets_per_round` are enforced on-chain.
- Misconfiguration here will reject valid player bets.

3) **Totals list capped at 64 entries**
- `add_table_total` refuses to grow totals beyond 64.
- This avoids unbounded state growth but may drop rare bet types.

---

## Data structures and invariants (deep dive)

### 1) GlobalTableConfig is the contract for a game
The config is the on chain "rules sheet" for the table. It lives in
`types/src/casino/global_table.rs` and is written to state under
`Key::GlobalTableConfig(game_type)` in the handler. Important fields:

- `game_type`: ensures configs do not cross games.
- `betting_ms`, `lock_ms`, `payout_ms`, `cooldown_ms`: the phase timers.
- `min_bet`, `max_bet`: per bet limits.
- `max_bets_per_round`: a per player cap (per submit call).

Invariant: config is valid only if `min_bet > 0`, `max_bet >= min_bet`,
and every phase duration is nonzero. The handler enforces these, so later
calls can assume a sane config.

### 2) GlobalTableRound is the shared round snapshot
`GlobalTableRound` is the on chain snapshot of a round. It includes:

- `round_id`, `phase`, `phase_ends_at_ms`: the state machine.
- `main_point`, `d1`, `d2`, `made_points_mask`, `epoch_point_established`,
  `field_paytable`: the table state copied from the craps engine.
- `rng_commit`: commitment to the round RNG (empty before lock, 32 bytes after lock).
- `roll_seed`: 32-byte RNG snapshot derived at lock and reused at reveal/settle.
- `totals`: a bounded summary of bet totals (max 64 entries).

Invariant: `rng_commit` and `roll_seed` are either empty or exactly 32 bytes.
This is enforced at decode time (types layer) and at write time (handler uses
32 byte RNG state). If you see any other size, the data is invalid.

### 3) GlobalTablePlayerSession: per player state bridge
Every player has a `GlobalTablePlayerSession` which contains a full
`GameSession` plus `last_settled_round`. This lets the global table reuse the
normal craps engine while still enforcing per round settlement. The invariant
is simple: you can only settle `last_settled_round + 1`. That makes settlement
idempotent and ordered.

### 4) GlobalTableBet vs GlobalTableTotal
`GlobalTableBet` is the raw user intent: bet type + target + amount.
`GlobalTableTotal` is an aggregate of all bets of the same type/target.
Totals are stored on chain so the UI can build heatmaps without replaying
every player bet.

---

## Round lifecycle and time base (deep dive)

### 1) Time is derived from consensus views
Handlers compute `now_ms = seed_view * MS_PER_VIEW`. That means the "clock"
is not wall time; it is consensus time. On a fast or slow network, the round
windows lengthen or shrink in wall clock terms, but they remain consistent
across nodes. This is critical: consensus time is the only time all validators
agree on.

### 2) Phases are strict gates, not hints
The handlers reject any call that is "too early" or "too late" for the current
phase. That is why open, lock, reveal, and finalize all check `phase` and
`phase_ends_at_ms` in addition to `round_id`. If you skip a phase, you cannot
advance; if you call too early, you get an error.

### 3) Rolling phase is defined but not yet used
`GlobalTablePhase::Rolling` exists in the types, but the current handler jumps
from `Locked` directly to `Payout`. That is a design flexibility: you can
insert an intermediate "rolling" phase later without changing the wire format.

---

## Bet submission pipeline (deep dive)

### 1) From player to session
When a player submits bets, the handler either loads their
`GlobalTablePlayerSession` or creates one. The initial session is set to:

- `id = round.round_id` (so the session is round scoped)
- `last_settled_round = round.round_id - 1` (so first settlement is allowed)

This is the bridge between the global table and the normal game engine: every
player has a real `GameSession` that can run `process_game_move`.

### 2) Session state is normalized for the round
The helper `ensure_craps_session_state` does two things:
1) If the session has no state blob, it runs `init_game` to build one.
2) It calls `sync_craps_session_to_table` to force the session state to match
   the shared table state (point, dice, field paytable, etc).

This ensures that when you simulate a bet, the session is in the same table
state as everyone else.

### 3) Validation uses the real game engine
For each bet, the handler builds a payload:

```
[0, bet_type, target, amount_bytes...]
```

and passes it to `process_game_move`. This is important: it is not a custom
validation layer. The same code that powers normal craps validates every
global table bet.

### 4) delta is computed via GameResult
`process_game_move` returns a `GameResult`. The helper `game_result_delta`
maps it into a signed integer. The delta represents immediate balance change
from placing the bet (for example, a wager can be deducted immediately).

If the delta is negative, the handler checks the player has enough chips and
then subtracts. If the delta is positive, the handler adds and adjusts house
PnL. This mirrors the normal session flow, but with per round guardrails.

### 5) Totals are updated on acceptance
After all bets are validated and applied, the handler calls `add_table_total`
for each bet. This builds the aggregate totals list for UI use. The totals are
bounded to 64 entries to prevent unbounded state growth.

### 6) Events are the public contract
The success path emits `GlobalTableBetAccepted`, including:
- the original bets
- the updated player balance snapshot

The failure path emits `GlobalTableBetRejected` with a structured error code
and message. These events are the only stable API the gateway should rely on.

---

## Settlement and payouts (deep dive)

### 1) Settlement is per player, per round
Settlement does not happen in the reveal step. Instead, each player calls
`handle_global_table_settle` after the round outcome is known. That design is
what makes large rounds feasible: settlement work is distributed over time and
over many transactions.

### 2) Roll determinism: same seed, same result
The round stores `roll_seed` (32 bytes). During settlement the handler builds
`GameRng::from_state(seed_bytes)` and calls `process_game_move` with `[2]`
(roll). This means every player settlement uses the same roll and therefore
must reach the same outcome.

### 3) Bet totals are reconciled
Settlement updates `round.totals` via `apply_bet_totals_delta`. That helper
computes totals before and after settlement by reading the session state blob.
If a bet resolves or is removed, the totals are decremented or removed.

This is a subtle but important invariant: totals are not just the sum of
submitted bets; they reflect what is still live in the current round.

### 4) Modifiers are consumed here
The settlement path includes logic for modifiers:
- `active_double` doubles payouts and decrements the `doubles` counter.
- `active_shield` can refund losses (consume a shield instead).

These modifiers are cleared after a resolving result. This keeps modifiers
from leaking across rounds.

### 5) Player history is recorded
When a session completes, `record_play_session` is called and the session is
added to player history. This is the analytics and leaderboard feed for
completed play, and it is only written when the session is complete.

---

## Determinism, fairness, and replay safety

The global table design uses three layers of determinism:

1) **Consensus view time**: phase transitions are based on `seed_view`.
2) **Seeded RNG**: all randomness is derived from the chain seed plus round id.
3) **Replayed game engine**: bets and rolls use the same `process_game_move`
   function that drives normal sessions.

Because every handler path is deterministic, any validator can replay the
round and arrive at the same outcome. The use of `roll_seed` guarantees that
the reveal event is not just "the dice result" but a full RNG snapshot that
can be used to replay exact sequences.

---

## Worked example (mental simulation)

Imagine round 12 opens with a betting window of 10 seconds. Player A submits a
pass line bet of 100. The handler:

1) Verifies round 12 is in Betting and the window is open.
2) Loads the player and session (or creates it).
3) Runs `process_game_move` with a bet payload.
4) Sees a negative delta (the wager is placed).
5) Deducts 100 chips and updates house PnL.
6) Adds a total entry for (bet_type=Pass, target=0, amount=100).
7) Emits `GlobalTableBetAccepted`.

Later, the admin locks and reveals. The round stores `d1`, `d2`, and the
shared `roll_seed`. Player A calls settle:

1) The handler loads the session, syncs table state, and replays the roll.
2) The result is a win; payout is computed (maybe doubled if a modifier is
   active).
3) Chips are credited and house PnL is adjusted.
4) Totals are updated to remove any resolved bets.
5) `GlobalTablePlayerSettled` is emitted with the updated balances and
   the player's post settlement bets list.

This is the exact same logic as a normal session, just split across a shared
round and two transactions.

---

## Operational pitfalls to watch

1) **Round id drift**
If the gateway submits bets with a stale round id, every bet is rejected. This
shows up as a flood of `GlobalTableBetRejected` events with "Round ID mismatch".
In production, that usually means the gateway missed a `GlobalTableRoundOpened`
event or is lagging the updates stream.

2) **Clock skew vs view time**
Because time is derived from `seed_view`, local wall clocks are irrelevant. If
an operator "eyeballs" the UI and thinks a lock should have happened, they may
be wrong; the chain view time is the authority. That is why round timing should
be measured in views or in events, not wall time.

3) **Totals overflow**
The totals list is capped at 64. If you add too many bet types or targets, some
totals will be dropped silently. The fix is to keep the bet menu compact or
aggregate more aggressively in the UI.

4) **Settlement order**
The handler enforces sequential settlement: `last_settled_round + 1` must equal
`round_id`. If a player skips a round (or never settles), later rounds will
always fail. This is a deliberate design choice to keep per player history
consistent. Gateways should surface this as "settle pending" in the UI rather
than treating it as a generic error.

---

## Walkthrough with code excerpts

### 1) Initializing global table config
```rust
pub(in crate::layer) async fn handle_global_table_init(
    &mut self,
    public: &PublicKey,
    config: &nullspace_types::casino::GlobalTableConfig,
) -> anyhow::Result<Vec<Event>> {
    if !super::is_admin_public_key(public) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_UNAUTHORIZED,
            "Unauthorized admin instruction",
        ));
    }
    if config.min_bet == 0 {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_BET,
            "Minimum bet must be greater than zero",
        ));
    }
    if config.max_bet < config.min_bet {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_BET,
            "Maximum bet must be >= minimum bet",
        ));
    }
    if config.betting_ms == 0
        || config.lock_ms == 0
        || config.payout_ms == 0
        || config.cooldown_ms == 0
    {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Timing windows must be greater than zero",
        ));
    }

    let game_type = config.game_type;
    self.insert(
        Key::GlobalTableConfig(game_type),
        Value::GlobalTableConfig(config.clone()),
    );

    if self
        .get(Key::GlobalTableRound(game_type))
        .await?
        .is_none()
    {
        let round = default_global_table_round(game_type);
        self.insert(
            Key::GlobalTableRound(game_type),
            Value::GlobalTableRound(round),
        );
    }

    Ok(Vec::new())
}
```

Why this matters:
- This sets the authoritative limits and timing for the global table.

What this code does:
- Ensures only the admin can initialize global table config.
- Validates bet and timing constraints.
- Stores the config and initializes a default round if needed.

---

### 2) Opening a new round
```rust
pub(in crate::layer) async fn handle_global_table_open_round(
    &mut self,
    public: &PublicKey,
    game_type: nullspace_types::casino::GameType,
) -> anyhow::Result<Vec<Event>> {
    if !super::is_admin_public_key(public) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_UNAUTHORIZED,
            "Unauthorized admin instruction",
        ));
    }
    if game_type != nullspace_types::casino::GameType::Craps {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Global table supports craps only",
        ));
    }

    let config = match self.get(Key::GlobalTableConfig(game_type)).await? {
        Some(Value::GlobalTableConfig(config)) => config,
        _ => {
            return Ok(casino_error_vec(
                public,
                None,
                nullspace_types::casino::ERROR_INVALID_MOVE,
                "Global table config missing",
            ))
        }
    };

    let now_ms = self.seed_view.saturating_mul(3_000);
    let mut round = match self.get(Key::GlobalTableRound(game_type)).await? {
        Some(Value::GlobalTableRound(round)) => round,
        _ => default_global_table_round(game_type),
    };

    let can_open = round.round_id == 0
        || (matches!(
            round.phase,
            nullspace_types::casino::GlobalTablePhase::Cooldown
        ) && now_ms >= round.phase_ends_at_ms);
    if !can_open {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Round already active",
        ));
    }

    round.round_id = round.round_id.saturating_add(1);
    round.phase = nullspace_types::casino::GlobalTablePhase::Betting;
    round.phase_ends_at_ms = now_ms.saturating_add(config.betting_ms);
    round.rng_commit.clear();
    round.roll_seed.clear();

    self.insert(
        Key::GlobalTableRound(game_type),
        Value::GlobalTableRound(round.clone()),
    );

    Ok(vec![Event::GlobalTableRoundOpened { round }])
}
```

Why this matters:
- This starts each new global round and defines the betting window.

What this code does:
- Verifies admin authority and the correct game type.
- Checks the prior round is in cooldown and has ended.
- Advances the round ID and sets the phase to betting.
- Emits a `GlobalTableRoundOpened` event.

---

### 3) Submitting bets to the global table
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

    let config = match self.get(Key::GlobalTableConfig(game_type)).await? {
        Some(Value::GlobalTableConfig(config)) => config,
        _ => {
            return Ok(vec![Event::GlobalTableBetRejected {
                player: public.clone(),
                round_id,
                error_code: nullspace_types::casino::ERROR_INVALID_MOVE,
                message: "Global table config missing".to_string(),
            }])
        }
    };

    let now_ms = self.seed_view.saturating_mul(3_000);
    let mut round = match self.get(Key::GlobalTableRound(game_type)).await? {
        Some(Value::GlobalTableRound(round)) => round,
        _ => {
            return Ok(vec![Event::GlobalTableBetRejected {
                player: public.clone(),
                round_id,
                error_code: nullspace_types::casino::ERROR_INVALID_MOVE,
                message: "Round not initialized".to_string(),
            }])
        }
    };

    if round.round_id != round_id {
        return Ok(vec![Event::GlobalTableBetRejected {
            player: public.clone(),
            round_id,
            error_code: nullspace_types::casino::ERROR_INVALID_MOVE,
            message: "Round ID mismatch".to_string(),
        }]);
    }

    if !matches!(
        round.phase,
        nullspace_types::casino::GlobalTablePhase::Betting
    ) || now_ms >= round.phase_ends_at_ms
    {
        return Ok(vec![Event::GlobalTableBetRejected {
            player: public.clone(),
            round_id,
            error_code: nullspace_types::casino::ERROR_INVALID_MOVE,
            message: "Betting window closed".to_string(),
        }]);
    }

    // ... validate session, amounts, and balances, then apply
}
```

Why this matters:
- This is where player bets are accepted or rejected on-chain.

What this code does:
- Validates the round, phase, and game type.
- Ensures the betting window is still open.
- Rejects invalid bets with a structured event.

---

### 4) Revealing the outcome
```rust
pub(in crate::layer) async fn handle_global_table_reveal(
    &mut self,
    public: &PublicKey,
    game_type: nullspace_types::casino::GameType,
    round_id: u64,
) -> anyhow::Result<Vec<Event>> {
    if !super::is_admin_public_key(public) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_UNAUTHORIZED,
            "Unauthorized admin instruction",
        ));
    }

    let config = match self.get(Key::GlobalTableConfig(game_type)).await? {
        Some(Value::GlobalTableConfig(config)) => config,
        _ => {
            return Ok(casino_error_vec(
                public,
                None,
                nullspace_types::casino::ERROR_INVALID_MOVE,
                "Global table config missing",
            ))
        }
    };

    let now_ms = self.seed_view.saturating_mul(3_000);
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

    if !matches!(
        round.phase,
        nullspace_types::casino::GlobalTablePhase::Locked
    ) || now_ms < round.phase_ends_at_ms
    {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Round not locked",
        ));
    }

    let roll_seed: [u8; 32] = round
        .roll_seed
        .as_slice()
        .try_into()
        .unwrap_or([0u8; 32]);
    let expected_commit = hash_roll_seed(&roll_seed);
    if !round.rng_commit.is_empty() && round.rng_commit != expected_commit {
        // ... error: commit mismatch
    }
    if round.rng_commit.is_empty() {
        round.rng_commit = expected_commit;
    }

    let mut table_session = nullspace_types::casino::GameSession {
        id: round.round_id,
        player: public.clone(),
        game_type,
        bet: 0,
        state_blob: vec![],
        move_count: 0,
        created_at: self.seed_view,
        is_complete: false,
        super_mode: nullspace_types::casino::SuperModeState::default(),
        is_tournament: false,
        tournament_id: None,
    };
    let mut init_rng = crate::casino::GameRng::from_state(roll_seed);
    crate::casino::init_game(&mut table_session, &mut init_rng);
    sync_craps_session_to_table(&mut table_session, &round);

    let mut roll_rng = crate::casino::GameRng::from_state(roll_seed);
    let _ = crate::casino::process_game_move(&mut table_session, &[2], &mut roll_rng)
        .map_err(|_| anyhow::anyhow!("roll failed"))?;

    if let Some(state) = read_craps_table_state(&table_session.state_blob) {
        round.main_point = state.main_point;
        round.d1 = state.d1;
        round.d2 = state.d2;
        round.made_points_mask = state.made_points_mask;
        round.epoch_point_established = state.epoch_point_established;
        round.field_paytable = state.field_paytable;
    }

    round.phase = nullspace_types::casino::GlobalTablePhase::Payout;
    round.phase_ends_at_ms = now_ms.saturating_add(config.payout_ms);

    self.insert(
        Key::GlobalTableRound(game_type),
        Value::GlobalTableRound(round.clone()),
    );

    Ok(vec![Event::GlobalTableOutcome { round }])
}
```

Why this matters:
- This is where the shared roll outcome is generated and recorded on chain.

What this code does:
- Confirms the round is locked and ready for reveal.
- Generates a roll seed and runs the craps roll in a temp session.
- Copies the resulting state (dice, point, etc) into the round record.
- Emits a `GlobalTableOutcome` event.

---

### 5) Settling a player
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

    let mut player = match self.casino_player_or_error(public, None).await? {
        Ok(player) => player,
        Err(events) => return Ok(events),
    };

    let mut player_session = match self
        .get(Key::GlobalTablePlayerSession(game_type, public.clone()))
        .await?
    {
        Some(Value::GlobalTablePlayerSession(session)) => session,
        _ => {
            return Ok(casino_error_vec(
                public,
                None,
                nullspace_types::casino::ERROR_INVALID_MOVE,
                "Player not registered for global table",
            ))
        }
    };

    if player_session.last_settled_round.saturating_add(1) != round.round_id {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_INVALID_MOVE,
            "Round already settled or out of order",
        ));
    }

    // ... apply roll result and update balances
}
```

Why this matters:
- Each player must settle after the outcome to finalize their balance changes.

What this code does:
- Ensures the outcome has been revealed and the player is registered.
- Prevents double settlement or out-of-order settlement.
- Proceeds to apply the roll result and update balances.

---

### 6) Totals management helpers
```rust
fn add_table_total(
    totals: &mut Vec<nullspace_types::casino::GlobalTableTotal>,
    bet_type: u8,
    target: u8,
    amount: u64,
) {
    if amount == 0 {
        return;
    }
    if let Some(existing) = totals
        .iter_mut()
        .find(|entry| entry.bet_type == bet_type && entry.target == target)
    {
        existing.amount = existing.amount.saturating_add(amount);
        return;
    }
    if totals.len() >= 64 {
        return;
    }
    totals.push(nullspace_types::casino::GlobalTableTotal {
        bet_type,
        target,
        amount,
    });
}
```

Why this matters:
- Totals are used for UI and auditability. They must stay bounded and accurate.

What this code does:
- Aggregates amounts for each bet type + target.
- Prevents the totals list from growing beyond 64 entries.

---

## Key takeaways
- Global table rounds are controlled by admin instructions.
- Bets are validated and stored in a shared round record.
- Outcomes are computed deterministically and settled per player.

## Next lesson
L46 - Compare global table vs normal craps: `feynman/lessons/L46-live-vs-normal-craps.md`
