# E06 - Execution engine internals (game logic) (from scratch, full walkthrough)

Focus file: `execution/src/casino/mod.rs` (with supporting modules like `payload`, `serialization`, `super_mode`, and individual game modules)

Goal: understand how the casino execution engine works end to end: deterministic RNG, game dispatch, state mutation, modifier logic, and the exact semantics of game outcomes. This is a deep dive into the core game execution layer that every validator runs.

---

## Learning map

If you want the fastest practical understanding:

1) Read Sections 1 to 3 for the overall structure of the casino execution module.
2) Read Sections 4 to 8 for `GameRng` and deterministic randomness.
3) Read Sections 9 to 12 for `GameResult`, modifiers, and dispatch.
4) Read Sections 13 to 16 for tests, fairness guarantees, and failure modes.

If you only read one section, read Section 6 (deterministic RNG) and Section 10 (game result semantics). Those two are the heart of correctness.

---

## 1) What the execution engine does

In this system, the execution engine is the authoritative interpreter of game logic. It runs inside validators. When a transaction is included in a block, the execution engine:

- Parses the instruction payload.
- Updates game session state deterministically.
- Adjusts balances and emits events.

This module (`execution/src/casino/mod.rs`) is the entry point for all casino game logic. It exposes a unified API for initializing games and processing moves. Each individual game (blackjack, baccarat, craps, etc.) lives in its own module, but the engine dispatches to them through shared interfaces.

The key design principle is determinism: given the same inputs (state, payload, seed), every validator must produce the same outputs. If one validator diverges, consensus breaks. That is why this module invests so much in deterministic RNG and strict payload handling.

---

## 2) Module layout and responsibilities

The top of the file lists the submodules:

- `baccarat`, `blackjack`, `casino_war`, `craps`, `hilo`, `roulette`, `sic_bo`, `three_card`, `ultimate_holdem`, `video_poker`
- `cards`, `payload`, `serialization`, `logging`, `limits`, `super_mode`

Conceptually:

- Each game module implements the game rules (init and process_move).
- `cards` and `serialization` provide helpers shared across card games.
- `payload` defines how game move payloads are parsed.
- `limits` and `super_mode` enforce game modifiers and special rule systems.
- `logging` provides standardized event logs.

The `mod.rs` file itself defines the shared RNG (`GameRng`), shared result types (`GameResult`, `GameError`), and the dispatch functions that route to each game.

---

## 3) Shared types imported from `nullspace_types`

The execution engine does not define its own state types; it uses shared types in `nullspace_types`:

- `GameSession`: stores game state, session id, game type, and state blob.
- `GameType`: enum for all supported games.
- `Player`: contains chip balances and modifiers.
- `Seed`: consensus-derived randomness seed.

This is important: state types used in execution are the same types used in network messages, indexer summaries, and client decoders. That is how state remains consistent across components.

---

## 4) The determinism problem

If you implement randomness using `rand::thread_rng()` or any local RNG, different validators will produce different results. That would break consensus immediately.

Therefore, the execution engine uses **consensus-derived randomness**. The `Seed` value is produced by consensus (see E04). Every validator receives the same seed for a given view. The execution engine turns that seed into deterministic random values.

The rest of this chapter is largely about how that deterministic RNG is built and used.

---

## 5) GameRng: deterministic randomness engine

`GameRng` is defined as:

```rust
#[derive(Clone)]
pub struct GameRng {
    state: [u8; 32],
    index: usize,
}
```

This RNG stores 32 bytes of internal state (one SHA-256 output) and an index into that state. When the index reaches the end, it rehashes the state to produce another 32 bytes.

This is effectively a hash-chain RNG. It is deterministic, reproducible, and cheap to compute.

### 5.1 Seeding

`GameRng::new` uses three values:

- `seed` (consensus seed)
- `session_id` (game session id)
- `move_number` (the move index inside the session)

```rust
pub fn new(seed: &Seed, session_id: u64, move_number: u32) -> Self {
    let mut hasher = Sha256::new();
    hasher.update(seed.encode().as_ref());
    hasher.update(&session_id.to_be_bytes());
    hasher.update(&move_number.to_be_bytes());
    Self {
        state: hasher.finalize().0,
        index: 0,
    }
}
```

This is a crucial design choice:

- The consensus seed ensures all validators start from the same randomness for the same view.
- The session id ensures different game sessions do not share randomness.
- The move number ensures each move gets a unique RNG stream.

This gives **domain separation** inside the RNG: different games and moves do not collide.

### 5.2 Rehydration

`GameRng::from_state` allows restoring an RNG from a previously captured state. This is useful for games that store RNG state in their session blob so they can resume deterministically.

### 5.3 Snapshotting

`GameRng::state()` returns the current 32-byte state. This is used by some games to persist RNG state between moves.

---

## 6) Generating random values

`GameRng` provides a suite of methods to generate random values. Each method consumes bytes from the internal state and rehashes as needed.

### 6.1 `next_byte` and `next_u8`

The primitive is `next_byte`, which returns one byte and advances the index. `next_u8` simply calls it.

### 6.2 `next_u32`

`next_u32` uses four bytes and assembles them into a big-endian u32:

```
(a << 24) | (b << 16) | (c << 8) | d
```

This is deterministic and avoids endianness ambiguity.

### 6.3 `next_f32`

This method produces a float in [0.0, 1.0). It uses 24 bits of randomness because f32 has 23 bits of mantissa plus an implicit leading 1. By using 24 bits, it fills the mantissa with full precision.

This is a subtle but important point: if you use fewer bits, you get fewer distinct float values and bias. This method avoids that.

### 6.4 Bounded randomness (rejection sampling)

`next_bounded` and `next_bounded_u32` generate random values in [0, max). They use rejection sampling to avoid modulo bias.

For example, for `u8`:

```rust
let limit = u8::MAX - (u8::MAX % max);
loop {
    let value = self.next_u8();
    if value < limit {
        return value % max;
    }
}
```

This ensures each outcome is equally likely, which is critical for fairness.

### 6.5 Bounded `usize`

`next_bounded_usize` chooses between `u8` and `u32` based on the range size, falling back to `u32::MAX` if larger. This is adequate for casino ranges, which are always small.

### 6.6 Step-by-step RNG evolution (byte accounting)

It helps to treat the RNG as a 32-byte bucket with a cursor:

1) On creation, `state = sha256(seed || session_id || move_number)` and `index = 0`.
2) Every `next_byte` returns `state[index]` and increments the index.
3) If `index` reaches 32, rehash: `state = sha256(state)` and reset `index = 0`.

So the RNG is a deterministic stream of 32-byte blocks linked by hashing. The critical detail is that calls consume bytes in a strict order. If a game accidentally inserts a "bonus" RNG call in one branch, every subsequent random draw changes and the game diverges. This is why the game code needs to be deterministic not just in the control flow but also in the exact sequence of RNG calls.

Here is a worked example of byte usage:

- `next_u32` consumes 4 bytes.
- `next_f32` consumes 3 bytes (24 bits).
- `next_bounded(6)` consumes 1 byte in the common case (and potentially more if rejection sampling loops).

Suppose a game does `next_u32`, `next_f32`, then draws 20 cards (20 calls to `draw_card` which each consume one bounded byte for the index). That is at least 4 + 3 + 20 = 27 bytes. The next draw will still be in the same 32-byte block. If the game adds another 10 draws, the stream will cross the 32-byte boundary, and the RNG will rehash and continue from the next block.

Because all validators run the exact same code, they consume the same bytes in the same order, so they stay in lockstep.

### 6.7 Why SHA-256 is used here

The RNG uses SHA-256 not because it is "secret" but because it is deterministic, fast, and has good mixing properties. This makes it act like a pseudorandom function over the inputs we already trust (the consensus seed, session id, and move number). The security model is "unpredictable until the seed is known," which is enforced by consensus. Once the seed is known, the output is reproducible, which is exactly what validators need.

---

## 7) Cards and shuffling

Many games use card decks. The RNG includes helpers for deck operations:

### 7.1 `create_deck`

Creates a single deck of 52 cards (0-51). It then shuffles using Fisher-Yates.

### 7.2 `create_shoe`

Creates a multi-deck shoe by repeating cards and shuffling.

### 7.3 `shuffle`

Implements Fisher-Yates with deterministic randomness.

### 7.4 `draw_card`

Removes a random card from the deck without replacement using `swap_remove`. This is O(1) and deterministic.

### 7.5 Excluding cards

There are three functions to create decks with exclusions:

- `create_deck_excluding`: excludes cards using a bitset.
- `create_shoe_excluding`: excludes counts for a multi-deck shoe.
- `create_shoe_excluding_counts`: excludes using a precomputed count table.

These are performance optimizations. Using a bitset is O(n) rather than O(n*m). That matters when you frequently filter decks (e.g., in multi-hand games).

---

## 8) `GameRng` implements `rand::RngCore`

The RNG implements `rand::RngCore` so it can be used by other utilities that expect a generic RNG. That provides compatibility while preserving determinism.

This is a subtle design benefit: you can reuse existing algorithms that operate on `RngCore` without rewriting them for `GameRng`.

### 8.1 `next_u64` and `fill_bytes`

The `RngCore` implementation defines `next_u64` as two `next_u32` calls and `fill_bytes` as a simple loop of `next_byte`. This is exactly what you want for determinism: there is a single underlying byte stream, and every method is just a deterministic transformation of that stream.

The `try_fill_bytes` method simply calls `fill_bytes` and always returns `Ok(())`, because there is no external source of entropy that could fail.

---

## 9) Game results: the semantic contract

`GameResult` is the contract between game modules and the execution engine. It encodes exactly what happened during a move and how balances should change.

The variants include:

- `Continue(Vec<String>)`: game continues, no balance change.
- `ContinueWithUpdate { payout, logs }`: game continues with balance change.
- `Win(u64, Vec<String>)`: game ends with win. Value is total return (stake + profit).
- `Loss(Vec<String>)`: game ends with loss.
- `LossWithExtraDeduction(u64, Vec<String>)`: game ends with loss and extra deduction.
- `LossPreDeducted(u64, Vec<String>)`: loss already deducted during play.
- `Push(u64, Vec<String>)`: tie, refund amount.

These variants exist because different games handle betting differently:

- Some games deduct the bet at the start.
- Others deduct during play (e.g., table games with multiple bets).
- Some games allow additional bets mid-game (double-down, war, etc.).

By encoding these variants explicitly, the engine can update balances correctly without guessing.

### 9.1 `#[must_use]` and why result handling is enforced

`GameResult` is annotated with `#[must_use]`. That attribute tells the compiler to warn if you ignore the result. This is not a cosmetic choice: forgetting to handle a `GameResult` means you would update game state without adjusting balances or logging events, which would be a consensus bug.

This is a good example of "type-level safety." The Rust compiler becomes a guardrail: any handler that discards the result will be noisy at compile time.

### 9.2 How results map to balance deltas (the handler contract)

The execution engine itself does not update balances. Instead, the casino handler (see `execution/src/layer/handlers/casino.rs`) interprets results. The `game_result_delta` function in that file spells out the default delta mapping:

- `Continue` -> 0
- `ContinueWithUpdate { payout, .. }` -> `payout`
- `Win(amount, _)` -> `amount` (return amount; stake + profit)
- `Push(amount, _)` -> `amount` (refund)
- `LossWithExtraDeduction(extra, _)` -> `-extra`
- `Loss` and `LossPreDeducted` -> 0 (deductions already handled elsewhere)

This mapping is why the enum has so many variants: the handler needs to know whether a loss has already been deducted (for table games that place bets incrementally) versus a loss that still needs to deduct the initial stake.

If you ever change the semantics of a game, you must check whether you should return a different variant. For example, if a game starts deducting chips during play, it must switch from `Loss` to `LossPreDeducted`, or you will double-charge players.

---

## 10) Game errors: how invalid moves are rejected

`GameError` enumerates failure cases:

- `InvalidPayload`: payload format is wrong.
- `InvalidMove`: move is not valid for the current state.
- `GameAlreadyComplete`: session is finished.
- `InvalidState`: corrupted or inconsistent state.
- `DeckExhausted`: no more cards available.

These errors allow the execution engine to reject invalid transactions. They are part of the deterministic rules: if a move is invalid, all validators must reject it in the same way.

---

## 11) The game interface

Each game implements `CasinoGame`:

```rust
pub trait CasinoGame {
    fn init(session: &mut GameSession, rng: &mut GameRng) -> GameResult;
    fn process_move(session: &mut GameSession, payload: &[u8], rng: &mut GameRng)
        -> Result<GameResult, GameError>;
}
```

The engine calls `init` when a session starts, and `process_move` for each move.

The trait enforces two things:

- Game modules must be deterministic (all state updates must be derived from session + payload + RNG).
- Game modules must return explicit result semantics (GameResult).

---

## 12) Dispatching games

The engine dispatches to the appropriate game module based on `GameType`:

```rust
pub fn init_game(session: &mut GameSession, rng: &mut GameRng) -> GameResult {
    match session.game_type {
        GameType::Baccarat => baccarat::Baccarat::init(session, rng),
        // ...
    }
}
```

and similarly for `process_game_move`.

This is an exhaustive match. Adding a new game requires updating this match in both functions. That is a deliberate design: the compiler forces you to wire the new game into the engine.

### 12.1 How the handler seeds RNGs for init and moves

The execution engine does not choose its own `move_number`. The casino handler does, and it uses that to generate distinct random streams:

- On game start, it uses `GameRng::new(&seed, session_id, 0)` when calling `init_game`.
- On every move, it increments `session.move_count` and uses that value as the `move_number`.
- For super mode multipliers, it uses `move_number = u32::MAX` to carve out a separate RNG domain.

This is a subtle but important design: super mode multipliers are chosen from a stream that does not overlap with any normal game RNG usage. That prevents accidental coupling (for example, a game calling RNG more or fewer times should not influence the super mode multipliers).

This pattern is a common deterministic RNG technique: domain separation by injecting a label into the seed or by choosing a disjoint move number.

---

## 13) Modifiers: shield and double

Modifiers are a cross-game mechanic. They are applied after a game result is computed.

`apply_modifiers` takes a `Player` and a payout:

- If payout is negative and shield is active, it converts loss to 0 and consumes a shield.
- If payout is positive and double is active, it doubles the payout and consumes a double.
- It resets `active_shield` and `active_double` regardless of outcome.

This ensures modifiers are one-shot per game.

Important details:

- It uses `saturating_mul` to prevent overflow when doubling.
- It does not apply shield to wins or double to losses.
- It resets modifiers even if they were not used ("armed" per game).

This function is small but critical because it affects payouts and player balances across all games.

---

## 14) Super mode

Super mode is another modifier system. It has two parts:

1) A fee: `get_super_mode_fee(bet) -> bet / 5`, a fixed 20%.
2) A multiplier generator: `generate_super_multipliers` calls a game-specific function.

Not all games use super mode equally. For example, HiLo uses a streak-based system and returns an empty multiplier list.

The super mode system is separate from shield/double. It is typically applied at initialization or during game resolution depending on the game.

---

## 15) Tests: proving determinism and invariants

The tests in this module are an important part of the correctness story.

### 15.1 RNG determinism

`test_game_rng_deterministic` creates two RNGs with the same seed and verifies they produce identical sequences. This is the minimum requirement for deterministic execution.

### 15.2 RNG separation by session

`test_game_rng_different_sessions` ensures different session IDs produce different sequences.

### 15.3 Bounded RNG and deck behavior

There are tests for:

- bounded values staying in range.
- deck length and uniqueness.
- draw_card removing a card.
- dice and roulette ranges.
- f32 precision (ensuring many distinct values).

These tests confirm both correctness and fairness.

### 15.4 Modifiers fuzz test

The fuzz test generates random player states and payouts, then asserts invariants:

- active flags always reset.
- shield consumes only on loss.
- double consumes only on win.
- payouts are correct.

This is valuable because modifiers are easy to get subtly wrong.

---

## 16) Fairness and determinism in practice

The combination of consensus seed + session id + move number means:

- Every validator produces identical RNG streams for the same game.
- Clients cannot predict future RNG beyond what is already exposed.
- If a user replays the same move sequence, they get the same outcomes.

This is essential for fairness. You want outcomes that are unpredictable to the user but deterministic across validators.

The code achieves this by basing randomness on consensus seeds rather than local randomness.

---

## 17) Integration points outside this module

The execution engine uses this module from higher-level state transition logic (for example, in `execution/src/state_transition.rs`). The flow is:

1) A `StartGame` instruction creates a `GameSession` and calls `init_game`.
2) A `GameMove` instruction loads the session and calls `process_game_move`.
3) The `GameResult` is interpreted to update balances and session state.
4) Events are logged and persisted.

The `payload` and `serialization` submodules ensure payload bytes are interpreted consistently across clients and validators.

---

## 18) Failure modes and how they are handled

Here are common failure modes and how the engine handles them:

- **Invalid payload**: returns `GameError::InvalidPayload`.
- **Invalid move**: returns `GameError::InvalidMove`.
- **Game already complete**: returns `GameError::GameAlreadyComplete`.
- **Deck exhausted**: returns `GameError::DeckExhausted`.

These errors prevent invalid or malicious moves from changing state. They are deterministic and therefore safe to enforce across all validators.

---

## 19) Operational tuning and economic stability

Although this module is mostly pure logic, there are economic parameters embedded here:

- Super mode fee (20%).
- Modifier consumption rules.

Changing these values affects payouts and the economic balance of the game system. That means changes must be coordinated across clients, indexers, and any analytics systems that interpret game outcomes.

In practice, you treat these values as protocol constants. Changing them requires a network upgrade.

---

## 20) Feynman recap: explain it like I am five

- The game engine is a big rule book.
- It uses a special random number generator so all validators agree.
- Each game is separate, but they all follow the same interface.
- Results are explained clearly so balances update correctly.
- Modifiers like shield and double change outcomes but follow strict rules.

---

## 21) Exercises (to build mastery)

1) Trace how `GameRng::new` uses the seed, session id, and move number. Explain why all three are necessary.

2) Pick a game module (e.g., blackjack) and follow how it uses `GameRng` to draw cards. Map each RNG call to a game action.

3) Explain the difference between `Loss`, `LossWithExtraDeduction`, and `LossPreDeducted`. Why does the engine need all three?

4) Modify the super mode fee (in a dev branch) and see how payouts change. Describe what else would need to be updated in the system to safely deploy that change.

---

## Next lesson

E07 - RNG + fairness model: `feynman/lessons/E07-rng-fairness.md`
