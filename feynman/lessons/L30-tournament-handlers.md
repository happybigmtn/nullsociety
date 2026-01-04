# L30 - Casino handlers (tournament lifecycle) (from scratch)

Focus file: `execution/src/layer/handlers/casino.rs`

Goal: explain how tournaments are joined, started, and ended on chain. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Tournament phases
- **Registration**: players can join.
- **Active**: games are played with tournament chips.
- **Complete**: prizes distributed, tournament closed.

### 2) Freeroll rewards
Prizes are granted as freeroll credits (not cash) and may vest/expire.

---

## Walkthrough with code excerpts

### 1) Join tournament
```rust
pub(in crate::layer) async fn handle_casino_join_tournament(
    &mut self,
    public: &PublicKey,
    tournament_id: u64,
) -> anyhow::Result<Vec<Event>> {
    let mut player = match self.casino_player_or_error(public, None).await? {
        Ok(player) => player,
        Err(events) => return Ok(events),
    };

    // cooldown + daily limit checks
    // ...

    let mut tournament = match self.get(Key::Tournament(tournament_id)).await? {
        Some(Value::Tournament(t)) => t,
        _ => nullspace_types::casino::Tournament {
            id: tournament_id,
            phase: nullspace_types::casino::TournamentPhase::Registration,
            start_block: 0,
            start_time_ms: 0,
            end_time_ms: 0,
            players: Vec::new(),
            prize_pool: 0,
            starting_chips: nullspace_types::casino::STARTING_CHIPS,
            starting_shields: nullspace_types::casino::STARTING_SHIELDS,
            starting_doubles: nullspace_types::casino::STARTING_DOUBLES,
            leaderboard: nullspace_types::casino::CasinoLeaderboard::default(),
        },
    };

    if !matches!(
        tournament.phase,
        nullspace_types::casino::TournamentPhase::Registration
    ) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_TOURNAMENT_NOT_REGISTERING,
            "Tournament is not in registration phase",
        ));
    }

    if !tournament.add_player(public.clone()) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_ALREADY_IN_TOURNAMENT,
            "Already joined this tournament",
        ));
    }

    // update player + tournament records
    // ...

    Ok(vec![Event::PlayerJoined { tournament_id, player: public.clone() }])
}
```

Why this matters:
- Joining is the gateway into tournament play and reward eligibility.

What this code does:
- Enforces cooldown and daily limit checks.
- Creates the tournament record if missing.
- Adds the player to the tournament and emits a join event.

---

### 2) Start tournament
```rust
pub(in crate::layer) async fn handle_casino_start_tournament(
    &mut self,
    public: &PublicKey,
    tournament_id: u64,
    start_time_ms: u64,
    end_time_ms: u64,
) -> anyhow::Result<Vec<Event>> {
    if !super::is_admin_public_key(public) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_UNAUTHORIZED,
            "Unauthorized admin instruction",
        ));
    }

    // enforce fixed duration
    let expected_duration_ms =
        nullspace_types::casino::TOURNAMENT_DURATION_SECS.saturating_mul(1000);
    let end_time_ms = if end_time_ms >= start_time_ms
        && end_time_ms.saturating_sub(start_time_ms) == expected_duration_ms
    {
        end_time_ms
    } else {
        start_time_ms.saturating_add(expected_duration_ms)
    };

    // compute prize pool + update players
    // ...

    Ok(vec![Event::TournamentStarted { id: tournament_id, start_block: self.seed_view }])
}
```

Why this matters:
- Starting a tournament mints the prize pool and resets player stacks.

What this code does:
- Requires admin authorization.
- Enforces a fixed duration.
- Calculates prize pool and initializes tournament state.
- Emits a `TournamentStarted` event.

---

### 3) End tournament
```rust
pub(in crate::layer) async fn handle_casino_end_tournament(
    &mut self,
    public: &PublicKey,
    tournament_id: u64,
) -> anyhow::Result<Vec<Event>> {
    if !super::is_admin_public_key(public) {
        return Ok(casino_error_vec(
            public,
            None,
            nullspace_types::casino::ERROR_UNAUTHORIZED,
            "Unauthorized admin instruction",
        ));
    }

    if !matches!(
        tournament.phase,
        nullspace_types::casino::TournamentPhase::Active
    ) {
        return Ok(vec![]);
    }

    // compute rankings, distribute freeroll credits
    // reset tournament flags
    // ...

    Ok(vec![Event::TournamentEnded { id: tournament_id, rankings: rankings_summary }])
}
```

Why this matters:
- Ending is when rewards are distributed and the tournament is finalized.

What this code does:
- Requires admin authorization and active phase.
- Calculates rankings and distributes freeroll credits.
- Clears tournament state and emits a `TournamentEnded` event.

---

## Extended deep dive: tournament lifecycle as an on‑chain state machine

This section goes beyond the short excerpts and walks through the full logic of the tournament handlers in `execution/src/layer/handlers/casino.rs`. It treats each handler as a formal state transition and explains the economic and fairness consequences of each step.

---

### 4) Tournament join: the gatekeeper logic

`handle_casino_join_tournament` is the entry point into a freeroll. It enforces three independent constraints:

1) **Cooldown between tournaments** (anti-spam).
2) **Daily limit** (anti-abuse and tiering).
3) **Phase constraint** (registration only).

#### 4.1 Cooldown and day rollover

The handler derives a deterministic “current time” from the consensus view:

```
current_time_sec = seed_view * SECS_PER_VIEW
```

It then computes the current day and compares it to the player’s last tournament day. If the day has advanced, `tournaments_played_today` resets to 0. This ensures daily limits are per day, not cumulative forever.

Cooldown is enforced by checking `last_tournament_ts`. If the player joined too recently, the handler emits `ERROR_TOURNAMENT_LIMIT_REACHED` with a cooldown message.

This is a typical rate‑limit pattern in on‑chain systems: use deterministic time derived from block view to ensure all validators agree.

#### 4.2 Daily limit with account age tiers

The handler computes a base limit from the player’s stored `daily_limit` (set by admin) or falls back to `FREEROLL_DAILY_LIMIT_FREE`. Then it applies a **new‑account tier cap**:

- If account age < `ACCOUNT_TIER_NEW_SECS`, limit is reduced to `FREEROLL_DAILY_LIMIT_TRIAL`.

This is a subtle anti-abuse measure: brand‑new accounts cannot immediately consume full freeroll allowances. They must age into the system.

#### 4.3 Phase check and idempotency

The tournament must be in `Registration` phase to allow join. If not, the handler returns an error event. If the player is already in the tournament, `tournament.add_player` returns false and the handler emits `ERROR_ALREADY_IN_TOURNAMENT`.

This makes joining idempotent: if a player retries the join transaction, they do not get added twice.

---

### 5) Tournament start: minting and resetting state

`handle_casino_start_tournament` is an admin‑only instruction that transitions a tournament from Registration to Active. It does several critical jobs:

1) Enforce admin authorization.
2) Enforce fixed duration.
3) Calculate prize pool inflation.
4) Reset player tournament stacks.
5) Rebuild tournament leaderboard.

#### 5.1 Admin authorization

The handler calls `is_admin_public_key`. If the caller is not an admin, it emits `ERROR_UNAUTHORIZED`. This is a hard boundary: only privileged keys can start tournaments. The scheduler and auth service act as these privileged actors.

#### 5.2 Fixed duration enforcement

The handler checks whether `end_time_ms - start_time_ms` matches `TOURNAMENT_DURATION_SECS * 1000`. If not, it overrides the end time to enforce the fixed duration. This prevents clients from arbitrarily extending or shortening tournaments.

This is a safeguard against malicious or misconfigured schedulers: even if they provide wrong times, the chain enforces the canonical duration.

#### 5.3 Prize pool inflation model

The prize pool is computed from the emission schedule:

- `TOTAL_SUPPLY`
- `ANNUAL_EMISSION_RATE_BPS`
- `TOURNAMENTS_PER_DAY`
- `REWARD_POOL_BPS`

The logic calculates an annual emission, divides by 365 to get daily emission, and then divides by tournaments per day to get per‑tournament emission. It then caps the emission by the remaining reward pool (a fixed percentage of total supply).

This makes tournament rewards **inflationary but capped**. Over time, total issuance cannot exceed `REWARD_POOL_BPS` of the total supply. This is how the system prevents infinite inflation while still rewarding tournament play.

#### 5.4 House issuance tracking

The prize pool is accounted for by incrementing `house.total_issuance`. This is critical for auditing inflation. The handler uses saturating math to avoid overflow and clamps to the reward pool cap. This ensures the system remains within the intended emission budget.

#### 5.5 Resetting tournament stacks

When a tournament starts, each participant’s tournament stack is reset:

- tournament chips → `starting_chips`
- tournament shields → `starting_shields`
- tournament doubles → `starting_doubles`
- active modifiers cleared
- active session cleared
- aura meter reset

This is essential fairness: everyone starts with the same stack. The handler loops over all tournament players and writes their updated state back into the pending map.

#### 5.6 Tournament leaderboard rebuild

The handler rebuilds the tournament leaderboard from scratch based on the reset stacks. This ensures the leaderboard matches the fresh state rather than carrying over stale values from previous tournaments.

---

### 6) Tournament end: payout and cleanup

`handle_casino_end_tournament` finalizes the tournament and distributes rewards. Its steps are:

1) Verify admin authorization.
2) Ensure tournament is Active.
3) Compute rankings and proof weights.
4) Determine winners (top 15%).
5) Distribute prize pool as freeroll credits.
6) Reset player tournament state.
7) Mark tournament Complete and emit event.

#### 6.1 Ranking and proof-of-play weighting

The handler collects each player’s tournament chips and a `proof_weight` computed by `proof_of_play_multiplier`. This weight biases payouts toward players who actively played rather than idle participants. It is a fairness layer designed to discourage “join and idle” strategies.

Rankings are sorted by chips descending. The top 15% (at least 1 player) are winners.

#### 6.2 Harmonic weighting for payouts

The payout weights are computed as `1 / rank` (harmonic distribution) scaled by proof‑of‑play. This creates a steep gradient: top ranks receive larger shares, but lower ranks still get something if they are within the winner cohort.

This is a classic tournament payout curve that balances competitiveness with inclusivity.

#### 6.3 Freeroll credits, not cash

Winners receive credits via `award_freeroll_credits`. These are **non‑transferable** credits that can be used in freeroll contexts. This prevents prize pools from becoming direct cash equivalents and reduces economic abuse.

The credits are credited to the player with vesting rules determined by policy (`get_or_init_policy`). This adds an additional economic layer: rewards can be delayed or unlocked over time.

#### 6.4 Cleanup and state reset

After payouts, the handler clears tournament flags for each player:

- `active_tournament = None`
- tournament chips/shields/doubles set to 0
- active modifiers cleared
- active session cleared

This ensures that once a tournament ends, players return to normal mode and do not accidentally carry tournament state into cash games.

#### 6.5 Tournament end event

The handler emits `TournamentEnded` with a summary of rankings (player public key and chips). This is what the UI uses to display final results.

---

### 7) Daily limit admin updates

The handler `handle_casino_set_tournament_limit` lets admins set a per‑player daily limit. This is the on‑chain side of the entitlement sync described in L28.

Key points:

- Only admin public keys can call it.
- `daily_limit` must be > 0.
- It directly updates the player’s `tournament.daily_limit` field.

This is a powerful control lever. It lets the system differentiate free users from paid tiers and enforce those limits on chain.

---

### 8) Determinism and time modeling

All time calculations use `seed_view` and `SECS_PER_VIEW`. This makes tournament joins deterministic. If you used real wall‑clock time, different validators could disagree about cooldowns and daily limits. The system avoids that by using consensus time.

The scheduler uses wall‑clock time, but the chain enforces its own time model. This duality is important: the chain is authoritative, the scheduler is a liveness helper.

---

### 9) Observability and logging

The start and end handlers log key metrics:

- tournament_id
- start/end time
- prize pool
- number of players
- winners count

These logs are vital for auditing and debugging. They provide a trace of economic events (minted prize pool) and lifecycle transitions.

---

### 10) Failure modes and safe behavior

Common failure cases:

- Start called twice → returns error event, prevents double mint.
- End called when not Active → returns empty vec, no changes.
- Join when not registering → error event, no state changes.
- Join when daily limit reached → error event, no state changes.

Notice the design: errors become events, and state is unchanged. This keeps the system safe and predictable.

---

### 11) Concurrency and overlay effects

Because execution uses a Layer overlay, you can join a tournament and then start it in the same block (if admin transaction is in the same batch). The overlay ensures that newly joined players are visible to the start handler in the same block.

This property is subtle but important: it allows dense batching without race conditions. It also means the ordering of transactions within a block affects which players are included in a tournament start.

---

### 12) Economic interpretation: why tournaments mint rewards

Tournament rewards are minted (inflationary) rather than transferred from an existing pool. This aligns incentives: playing in tournaments increases overall issuance but is bounded by a long-term cap.

From a macro perspective, this is similar to staking rewards. The system distributes new tokens to active participants but limits total inflation to a fraction of supply. This is a common design in token economies.

---

### 13) Feynman analogy: a scheduled sports league

Imagine a sports league:

- **Join**: players sign up before the season starts, subject to eligibility rules.
- **Start**: the league begins, everyone gets the same equipment, and the scoreboard resets.
- **End**: rankings are finalized, prizes are distributed, and the season closes.

The handlers are the league officials enforcing this lifecycle. The scheduler is the calendar. The chain is the official record.

---

### 14) Exercises for mastery

1) Trace a player joining two tournaments in one day and explain when the daily counter resets.
2) Compute a prize pool for a tournament given total supply and emission parameters.
3) Explain why tournament start uses the admin key instead of allowing any player to start.
4) Describe how the proof-of-play weight influences payouts.

If you can answer these, you understand the tournament lifecycle deeply.


## Addendum: deeper mechanics of tournament payouts

### 15) Proof-of-play multiplier in detail

The `proof_of_play_multiplier` function (defined earlier in the same file) computes a weight that reflects how much a player has participated. It blends two factors:

- **activity weight**: derived from sessions played or other engagement signals
- **age weight**: derived from account age

These weights are combined and clamped within `[PROOF_WEIGHT_MIN, PROOF_WEIGHT_SCALE]`. The result multiplies the base payout weight for each rank.

This is an anti-farming mechanism: players who are new and inactive get lower weights, while active, established players receive closer to full rewards. It encourages real play and discourages bots that simply join and idle.

---

### 16) Harmonic payouts: why 1/rank is used

The code uses `1 / rank` to compute base weights for winners. This is a common tournament payout curve because it:

- rewards top ranks significantly more,
- still gives meaningful prizes to lower winners,
- avoids a flat distribution that removes incentive to climb the leaderboard.

The combination of harmonic weights and proof-of-play weighting creates a two-dimensional fairness scheme: rank matters, but participation matters too.

---

### 17) The winners cutoff logic

Winners are determined by taking the top 15% of players, with at least 1 winner. The formula:

```
num_winners = (num_players * 15 + 99) / 100
```

This is integer math that effectively rounds up. For small tournaments, it ensures at least one winner. For larger tournaments, it caps at 15% so the prize pool isn’t spread too thin.

This is a design choice. You could choose 10% or 20% instead, but 15% balances exclusivity and participation.

---

### 18) Prize pool cap and issuance safety

The prize pool is capped by a reward pool limit (`REWARD_POOL_BPS` of total supply). This ensures the chain never inflates beyond a predefined cap.

This is an important monetary policy invariant. Even if tournaments run forever, the total issued rewards cannot exceed the reward pool cap. This is achieved by subtracting `house.total_issuance` from the cap and taking the min of remaining pool and per-game emission.

---

### 19) What happens when the reward pool is exhausted

If the reward pool is exhausted, `remaining_pool` becomes 0. This causes `capped_emission` to be 0, and the prize pool for subsequent tournaments becomes 0. The tournament can still run, but there are no rewards to distribute.

This is a graceful degradation: the system continues to function but stops minting rewards. It avoids negative issuance or underflow, which would be catastrophic.

---

### 20) Event semantics and client expectations

The `TournamentEnded` event includes `rankings: Vec<(PublicKey, u64)>`, which is a summary of chips for each player. It does not include payout amounts. That means clients must compute or infer payouts from policy rules if they want to show them.

This is a design choice: keep events compact and deterministic, but let UIs compute extra context if needed.

---

### 21) Player state resets and session termination

Ending a tournament clears `player.session.active_session`. This is critical: a game session that was active in tournament mode should not continue after the tournament ends. By clearing it, the system forces a fresh session start.

It also clears active modifiers to avoid players carrying tournament-specific modifiers into cash games. This maintains separation between tournament and cash modes.

---

### 22) Potential edge case: missing player records

The end handler iterates over `tournament.players` and attempts to load each player record. If a record is missing, that player simply does not get paid. This is a rare edge case but it highlights a design assumption: the tournament player list is authoritative, and all players should exist. If a record is missing, it indicates state corruption or a bug.

In production, missing player records should trigger alerts because they imply a deeper consistency issue.

---

### 23) Idempotency of end operations

The end handler returns an empty vector if the tournament is not Active. That means repeated end calls after completion are safe; they do nothing. This is an idempotency property that makes it safe for multiple schedulers or retry logic.

Start is not fully idempotent because it can return error events if the tournament is already Active or Complete. But it still prevents double minting, which is the critical invariant.

---

### 24) How tournament phases map to UI

The UI typically maps phases to either "registration" or "active". The chain has a third phase "complete". The UI uses this to decide whether a tournament is joinable, playable, or finished. This mapping is part of the client contract.

If you introduce new phases (e.g., "cooldown"), you must update both the handler logic and UI mapping logic.

---

### 25) Testing strategies

To test tournament handlers, you can:

- Create a tournament, join several players, start it, simulate chip updates, and end it.
- Verify that prize pool issuance increments `house.total_issuance` correctly.
- Verify that winners receive freeroll credits and losers do not.
- Verify that daily limits and cooldowns are enforced.
- Verify that attempting to start twice does not mint twice.

These tests are essential for economic correctness.

---

### 26) Feynman exercise: explain to a gamer

Explain tournament join/start/end to a gamer using only game terms (no blockchain jargon). Then map each step back to the handler code. This exercise ensures you can reason about both the UX and the protocol level simultaneously.


### 27) Tiny but important: saturating arithmetic everywhere

The handler uses `saturating_*` operations for time and issuance calculations. This prevents integer overflow from turning into consensus divergence. It is a quiet but critical defensive pattern.


## Key takeaways
- Tournament lifecycle is strictly enforced by phase checks.
- Start/end actions are admin-only and affect rewards.

## Next lesson
L31 - Tournament types: `feynman/lessons/L31-tournament-types.md`
