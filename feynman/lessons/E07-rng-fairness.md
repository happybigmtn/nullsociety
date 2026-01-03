# E07 - RNG + fairness model (from scratch, deep dive)

Focus file: `execution/src/casino/mod.rs`

Goal: explain how deterministic randomness is generated, why it is fair across validators, and how the code enforces those properties. This lesson is a full textbook-style walkthrough of the RNG model, the fairness guarantees it does and does not provide, and how the rest of the system must treat randomness to preserve consensus.

---

## Learning objectives (what you should be able to explain after this lesson)

1) Why a blockchain execution engine must use deterministic randomness.
2) How a hash-chain RNG works and how `GameRng` implements it.
3) What bias is, how modulo bias appears, and how rejection sampling fixes it.
4) How deck shuffling and card draws are made uniform and reproducible.
5) The difference between deterministic randomness and secrecy, and how that affects fairness claims.
6) Practical rules for engineers who add new games or new RNG calls.

---

## 1) The fairness problem in a blockchain game

A casino game depends on randomness. If the randomness is biased, players do not get fair odds. If the randomness differs across validators, consensus breaks. A blockchain game must satisfy two constraints at the same time:

- **Determinism:** every validator executes the same transaction and must produce the same result. If not, the state diverges and consensus fails.
- **Fairness:** outcomes must not be systematically biased toward or against the player or the house. Uniformity is part of fairness, but so is unpredictability at the time a player submits a move.

These requirements pull in different directions. In normal software you can use `rand::thread_rng()` and get fresh entropy, but that is nondeterministic across machines. In a blockchain you need the opposite: the RNG must be a pure function of shared inputs.

The solution is to treat randomness as **consensus data**, not as a local resource. The RNG in this system is deterministic and seeded by the consensus layer. That means every validator can reproduce the exact same random stream for the same move.

---

## 2) What "fair" means in this system

Fairness in a blockchain casino has three layers:

1) **Uniformity**: every possible outcome has the intended probability distribution (for example, each card draw is equally likely).
2) **Reproducibility**: once the seed is known, every validator and every client can verify that the result was computed correctly.
3) **Unpredictability before commit**: players cannot predict outcomes before they commit their move.

The execution engine guarantees the first two. The third depends on how the consensus seed is produced and when it becomes visible. That is handled by the consensus protocol, not by the execution engine. This is why you will see repeated emphasis on the phrase: *deterministic, not secret*.

The execution engine is designed to be fair in the statistical sense. It does not attempt to hide randomness from validators. Instead, it assumes the consensus seed is unpredictable until it is finalized, and then uses it deterministically.

---

## 3) Determinism across validators (the non-negotiable rule)

Suppose validator A and validator B process the same block. The same game move is in that block. If validator A draws a queen while validator B draws a seven, the two states diverge. That is a consensus failure.

Therefore every random draw must be a pure function of deterministic inputs:

- The consensus seed for that view (shared by all validators).
- The session id (unique per game session).
- The move number (unique per move in a session).
- The deterministic code path taken by the game logic.

The only acceptable randomness is **derived randomness**. `GameRng` is the implementation of that idea.

---

## 4) The RNG design: a hash-chain stream

The core of the RNG is extremely simple: compute a SHA-256 hash, then treat the output as a 32-byte stream. When you run out of bytes, hash the previous hash to get the next block. This is called a hash chain.

Here is the initialization code (simplified):

```rust
pub fn new(seed: &Seed, session_id: u64, move_number: u32) -> Self {
    let mut hasher = Sha256::new();
    hasher.update(seed.encode().as_ref());
    hasher.update(&session_id.to_be_bytes());
    hasher.update(&move_number.to_be_bytes());
    Self { state: hasher.finalize().0, index: 0 }
}
```

The critical properties:

- **Domain separation**: different session ids or move numbers lead to different RNG streams.
- **Determinism**: the exact same inputs yield the exact same stream.
- **Reproducibility**: given the seed and the move number, anyone can recompute the stream.

Note that SHA-256 here is not for secrecy. It is a deterministic mixing function. It is fast, well-studied, and gives output that behaves like random bits even if the input has structure.

---

## 5) The byte stream and the cursor

The RNG stores two fields:

- `state: [u8; 32]` which is the current 32-byte block.
- `index: usize` which indicates how many bytes have been consumed.

The core method is `next_byte`:

```rust
fn next_byte(&mut self) -> u8 {
    if self.index >= 32 {
        let mut hasher = Sha256::new();
        hasher.update(&self.state);
        self.state = hasher.finalize().0;
        self.index = 0;
    }
    let result = self.state[self.index];
    self.index += 1;
    result
}
```

This means the RNG is just a deterministic stream of bytes. All other methods build on top of it. When the block is exhausted, it rehashes the previous block to get a new one.

**Why this matters**: every method, from `next_u32` to `shuffle`, must consume bytes in a deterministic, repeatable pattern. If the code path changes, the entire stream shifts.

---

## 6) Byte accounting and why control flow matters

Suppose a game has two branches:

- Branch A draws a card and then rolls a die.
- Branch B rolls a die and then draws a card.

Even though both branches use the same two RNG operations, they consume the bytes in a different order. That will diverge the stream and produce different outcomes later in the game. In a single-player game this might not be noticed, but in a distributed system it is fatal.

Therefore game logic must satisfy two rules:

1) Control flow is deterministic given the state and the payload.
2) RNG calls happen in a fixed order for a given state and payload.

When you read the game code, you should always ask: "Is the order of RNG calls guaranteed for every possible path?" If not, you need to refactor.

---

## 7) Generating integers: `next_u8` and `next_u32`

Integer generation is built on the byte stream:

```rust
pub fn next_u32(&mut self) -> u32 {
    let a = self.next_byte() as u32;
    let b = self.next_byte() as u32;
    let c = self.next_byte() as u32;
    let d = self.next_byte() as u32;
    (a << 24) | (b << 16) | (c << 8) | d
}
```

This is just four consecutive bytes in big-endian order. The important thing is not the endian choice (as long as it is fixed), but that it is deterministic and consistent.

---

## 8) Generating floats: why 24 bits matter

`next_f32` is a specialized helper for generating a uniform float in the interval [0.0, 1.0). It uses 24 bits of randomness:

```rust
pub fn next_f32(&mut self) -> f32 {
    let a = self.next_byte() as u32;
    let b = self.next_byte() as u32;
    let c = self.next_byte() as u32;
    let bits = (a << 16) | (b << 8) | c; // 24 bits
    bits as f32 / 16_777_216.0 // 2^24
}
```

Why 24 bits? A float32 has a 23-bit mantissa plus an implicit leading 1. If you use only 16 bits, you would get only 65,536 distinct values and a visible bias. Using 24 bits fills the mantissa range and yields roughly 16 million distinct values.

This is a nice example of engineering detail that matters for fairness: the distribution of floats has a measurable effect on outcomes in games that use thresholds.

---

## 9) Bounded randomness and modulo bias

Most games do not want a raw 32-bit integer. They want a value in a range: [0, 6) for a die, [0, 52) for a card, [0, 37) for roulette. If you compute `value % max`, you introduce bias unless `max` divides the base evenly.

Example: suppose the RNG provides a byte in [0, 255] and you want a value in [0, 6). If you do `byte % 6`, you get:

- 0..5 each appear 42 times for values 0..251.
- 0..3 each appear one extra time for values 252..255.

So 0..3 are slightly more likely. That is small, but in a casino system it matters. Over many spins, the bias is measurable. In a blockchain, even tiny biases can be exploited by bots that place millions of micro-bets.

### 9.1 Rejection sampling (the fix)

`next_bounded` uses rejection sampling to eliminate bias:

```rust
pub fn next_bounded(&mut self, max: u8) -> u8 {
    if max == 0 { return 0; }
    let limit = u8::MAX - (u8::MAX % max);
    loop {
        let value = self.next_u8();
        if value < limit {
            return value % max;
        }
    }
}
```

Here is the logic:

- `limit` is the largest multiple of `max` that fits in 0..255.
- Values above `limit` are discarded.
- The remaining range splits evenly into buckets of size `max`.

Because the RNG is deterministic, all validators discard the same values and accept the same values. So the loop does not introduce nondeterminism. It only introduces variable length, which is safe because it is driven by the RNG stream itself.

### 9.2 Expected number of iterations

The rejection loop might run multiple times, but the expected number of iterations is very close to 1. For example, with `max = 6`, `limit = 252`, so only 4 out of 256 values are rejected. That means on average you reject 1.6 percent of draws. This is a very small overhead.

---

## 10) Shuffling decks fairly (Fisher-Yates)

Shuffling is the core of card game fairness. The code uses Fisher-Yates:

```rust
pub fn shuffle<T>(&mut self, slice: &mut [T]) {
    if slice.len() <= u8::MAX as usize {
        for i in (1..slice.len()).rev() {
            let j = self.next_bounded((i + 1) as u8) as usize;
            slice.swap(i, j);
        }
        return;
    }

    for i in (1..slice.len()).rev() {
        let j = self.next_bounded_usize(i + 1);
        slice.swap(i, j);
    }
}
```

Fisher-Yates is the standard unbiased shuffle algorithm. It works by choosing a random index `j` from 0..i for each position `i`, then swapping. This produces a uniform distribution over all permutations.

The important thing is that the RNG used for `j` is unbiased. If `j` were biased, the shuffle would be biased. That is why `next_bounded` is essential here.

---

## 11) Drawing cards without replacement

The `draw_card` method uses `swap_remove` to remove a random card from a deck in O(1):

```rust
pub fn draw_card(&mut self, deck: &mut Vec<u8>) -> Option<u8> {
    if deck.is_empty() { return None; }
    let idx = if deck.len() <= u8::MAX as usize {
        self.next_bounded(deck.len() as u8) as usize
    } else {
        self.next_bounded_usize(deck.len())
    };
    Some(deck.swap_remove(idx))
}
```

This is important for two reasons:

1) **Uniform selection:** each remaining card is equally likely.
2) **Efficiency:** `swap_remove` avoids shifting elements.

A subtle detail: the index is derived using `next_bounded` (or `next_bounded_usize`), not with modulo. This preserves uniformity.

---

## 12) Dice, roulette, and other bounded draws

The helpers `roll_die` and `spin_roulette` are just thin wrappers:

- `roll_die` calls `next_bounded(6) + 1`.
- `spin_roulette` calls `next_bounded(37)`.

These exist to reduce mistakes. They centralize the logic for bounded ranges, so game implementations do not accidentally bypass rejection sampling.

---

## 13) Domain separation with session id and move number

Two different moves in the same session must not share the same RNG stream. If they did, the second move could leak information about the first. That is why `GameRng::new` hashes the move number into the seed.

### 13.1 Session id

The session id ensures two different games do not share the same stream. Without it, a lucky sequence in one game could correlate with another game, which is both unfair and easier to exploit.

### 13.2 Move number

The move number ensures each move is independent. Each move has its own RNG stream. This is stronger than just using a single long stream. It also makes verification easier: you can recompute randomness for a single move without needing to replay all previous RNG calls.

### 13.3 Super mode separation

The casino handler uses `move_number = u32::MAX` when generating super mode multipliers. This deliberately creates a separate RNG domain so that super mode randomness cannot be influenced by game move RNG calls. This is a common domain separation trick: use a sentinel value to carve out a separate stream.

---

## 14) Determinism tests in the codebase

The module includes tests that validate the fairness and determinism assumptions:

- **Determinism test**: two RNGs with the same seed must produce identical sequences.
- **Different session test**: session id changes should yield different sequences.
- **Bounded range tests**: values stay within bounds (dice, roulette, deck).
- **Deck tests**: shuffles contain all cards exactly once.
- **Float precision test**: ensures `next_f32` produces many distinct values.

These tests are not just unit tests; they encode the contract. If a future refactor breaks any of these invariants, the tests catch it.

---

## 15) Fairness vs unpredictability: what the RNG does not guarantee

Because the RNG is deterministic, anyone who knows the seed can predict all outcomes. That is expected. Fairness in the blockchain context relies on the seed being unpredictable **before** the move is committed.

If you want stronger privacy or unpredictability guarantees, you need mechanisms like:

- **Commit-reveal**: players commit to a secret, then reveal it later, combining with the consensus seed.
- **VRFs (verifiable random functions)**: produce a random value with a proof that it was generated correctly.
- **Threshold randomness beacons**: multiple validators collaborate to produce a seed without any one party controlling it.

These are consensus-layer topics, not execution-layer topics. The execution engine assumes the seed is valid and deterministic.

---

## 16) Attack surfaces and how this RNG defends (or does not)

### 16.1 Seed grinding

If the consensus process allows participants to bias the seed (for example, by choosing whether to finalize a block based on the seed), then the RNG can be biased. The execution engine cannot fix this. The fix must be in consensus or in the randomness beacon design.

### 16.2 Front-running

If a player can see the seed before submitting a move, they could choose only moves that are favorable. This is an application-layer issue. Solutions include delaying seed disclosure or including commit-reveal steps in the protocol.

### 16.3 RNG call order bugs

A subtle but common source of determinism bugs is call order. If you add a call to `next_u32` for logging or debugging, you change every subsequent outcome. That is a consensus bug. Therefore RNG calls must never be added for non-functional reasons. Even a debug print that consumes randomness is not acceptable.

### 16.4 Rejection sampling loops

Rejection sampling can loop multiple times. That is fine because the loop condition is based on RNG output, which is deterministic. The number of iterations is itself deterministic. This does not create nondeterminism, but it does mean the number of bytes consumed depends on the RNG stream. That is acceptable as long as all validators run the same code.

---

## 17) Engineering rules when adding new games

If you are implementing a new game module, follow these rules:

1) **Never use non-deterministic RNGs**. Only use `GameRng`.
2) **Never use modulo for bounded ranges**. Use `next_bounded` or `next_bounded_u32`.
3) **Keep RNG call order deterministic**. Avoid randomness in logging, telemetry, or debug code.
4) **Avoid data-dependent loops that call RNG** unless you can guarantee the loop runs the same number of iterations across all validators for the same state and payload.
5) **Record RNG state if you need to resume mid-game**. Use `GameRng::state()` or `GameRng::from_state` when resuming.

These rules are not stylistic. They are the boundary between a deterministic blockchain and a divergent one.

---

## 18) Mental model recap (Feynman style)

Imagine every validator has the same deck of cards and the same rule book. The rule book says: "Before you draw a card, read the next byte from the magic notebook. If you use up the notebook, rewrite the notebook by hashing it." Every validator does this in the same order, so they draw the same card every time.

The fairness comes from the fact that the magic notebook is filled in a way that looks random, but it is identical for everyone. Nobody gets to secretly swap cards. Everyone can check the notebook after the fact and confirm the dealer followed the rules.

---

## 19) Exercises (to build mastery)

1) Explain why using `value % max` is biased. Give a numeric example with `max = 6`.
2) Trace the RNG byte consumption for a move that calls `next_u32`, `next_f32`, then `draw_card` five times.
3) If a game is refactored and an extra RNG call is added inside a debug log, what happens to determinism?
4) Why is the session id part of the RNG seed? Give a concrete example of what would go wrong without it.
5) If you wanted to add commit-reveal randomness to the system, where would that logic live: execution engine or consensus? Why?

---

## 20) Practical fairness audit checklist

When you review a new game or a new RNG-heavy change, walk through this checklist:

- **Input determinism**: confirm all inputs to `GameRng::new` are deterministic (seed, session id, move number).
- **RNG usage**: ensure every random choice uses `GameRng` methods, not any external RNG or system clock.
- **Bounded ranges**: verify every bounded random selection uses `next_bounded` or `next_bounded_u32`, not modulo.
- **Branching**: inspect branches that call RNG and ensure they are purely derived from state and payload.
- **State persistence**: if a game can pause and resume, confirm RNG state or equivalent deterministic state is saved.
- **Tests**: add or update tests that lock in determinism and distribution properties for the new logic.

This checklist is the difference between a safe refactor and a consensus-breaking bug. If any item is unclear, you should treat it as a blocker until it is resolved.

---

## Next lesson

E08 - Protocol packages + schemas: `feynman/lessons/E08-protocol-packages.md`
