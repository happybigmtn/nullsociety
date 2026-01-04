# L31 - Rust types (tournament instructions + events) (from scratch)

Focus file: `types/src/execution.rs`

Goal: explain the on‑chain instruction and event types that represent tournament lifecycle. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Tournament lifecycle is encoded as instructions + events
- Instructions: join, start, end, and admin limit updates.
- Events: player joined, tournament started/ended, phase changes.

---

## Walkthrough with code excerpts

### 1) Tournament instructions
```rust
pub enum Instruction {
    /// Admin: Set a player's daily tournament limit.
    /// Binary: [15] [player:PublicKey] [dailyLimit:u8]
    CasinoSetTournamentLimit {
        player: PublicKey,
        daily_limit: u8,
    },

    /// Join a tournament.
    /// Binary: [16] [tournamentId:u64 BE]
    CasinoJoinTournament { tournament_id: u64 },

    /// Start a tournament (Registration -> Active).
    /// Binary: [17] [tournamentId:u64 BE] [startTimeMs:u64 BE] [endTimeMs:u64 BE]
    CasinoStartTournament {
        tournament_id: u64,
        start_time_ms: u64,
        end_time_ms: u64,
    },

    /// End a tournament.
    /// Binary: [29] [tournamentId:u64 BE]
    CasinoEndTournament { tournament_id: u64 },
    // ...
}
```

Why this matters:
- These opcodes define the wire format for all tournament transactions.

What this code does:
- Declares each tournament instruction with exact binary layout notes.

---

### 2) Tournament events
```rust
pub enum Event {
    TournamentStarted {
        id: u64,
        start_block: u64,
    },
    PlayerJoined {
        tournament_id: u64,
        player: PublicKey,
    },
    TournamentPhaseChanged {
        tournament_id: u64,
        phase: crate::casino::TournamentPhase,
    },
    TournamentEnded {
        id: u64,
        rankings: Vec<(PublicKey, u64)>,
    },
    // ...
}
```

Why this matters:
- Clients and indexers only see tournament state via these events.

What this code does:
- Defines the event payloads emitted during tournament lifecycle.

---

## Extended deep dive: tournament ABI and state types

The tournament lifecycle is encoded in two layers:

1) **Instruction and event enums** in `types/src/execution.rs` (the wire format).
2) **Tournament state types** in `types/src/casino/tournament.rs` (the persistent state).

Understanding both layers is essential. The instruction/event layer defines how bytes move across the network. The state layer defines what actually lives on chain between blocks.

---

### 3) Instruction tags and binary layouts

Tournament-related instruction tags live in the `tags::instruction` module:

- `CASINO_SET_TOURNAMENT_LIMIT` = 15
- `CASINO_JOIN_TOURNAMENT` = 16
- `CASINO_START_TOURNAMENT` = 17
- `CASINO_END_TOURNAMENT` = 29

These numbers are protocol constants. They cannot be changed without a hard fork. The gateway and any SDK must use the same values, or decoding will fail.

The wire formats are:

- `CasinoSetTournamentLimit` → `[15][player:PublicKey][dailyLimit:u8]`
- `CasinoJoinTournament` → `[16][tournamentId:u64]`
- `CasinoStartTournament` → `[17][tournamentId:u64][startTimeMs:u64][endTimeMs:u64]`
- `CasinoEndTournament` → `[29][tournamentId:u64]`

All integers are encoded using the commonware codec (big endian for fixed-size primitives). That means u64 is always 8 bytes, u32 is 4 bytes, and so on.

---

### 4) Decode rules: how the backend validates instructions

The `Read` impl for `Instruction` enforces basic structural validity:

- It reads the opcode first.
- It reads the exact number of bytes for each field.
- It returns `Error::EndOfBuffer` if bytes are missing.
- It returns `Error::InvalidEnum` if an unknown tag is used.

This ensures malformed or truncated instructions cannot pass into the execution layer. The handler logic can therefore assume that fields like `tournament_id` and `start_time_ms` are present and correctly typed.

---

### 5) EncodeSize: why instruction size matters

`Instruction` implements `EncodeSize` so the system can compute size without serializing. For tournament instructions:

- Set limit: `1 + publicKeySize + 1`
- Join: `1 + 8`
- Start: `1 + 8 + 8 + 8`
- End: `1 + 8`

The size is used when calculating submission limits and block size constraints. If a client submits a transaction that exceeds size limits, it will be rejected before execution. Knowing sizes ahead of time lets clients avoid building oversize transactions.

---

### 6) Event tags and payloads

Tournament events live in `tags::event`:

- `TOURNAMENT_STARTED` = 25
- `PLAYER_JOINED` = 26
- `TOURNAMENT_PHASE_CHANGED` = 27
- `TOURNAMENT_ENDED` = 28

These events are the public record of tournament activity. The UI and indexers rely on them.

Event payloads:

- `TournamentStarted { id, start_block }`
- `PlayerJoined { tournament_id, player }`
- `TournamentPhaseChanged { tournament_id, phase }`
- `TournamentEnded { id, rankings }`

`rankings` is a vector of `(PublicKey, u64)` pairs representing chips at the end. This is compact but still informative for leaderboards.

---

### 7) Event decoding and safety

Event decoding mirrors instruction decoding: tag first, then payload. The decoder enforces length limits on vectors. For example, when decoding tournament state elsewhere, player lists are limited to 1000 entries. This prevents oversized payloads from blowing up memory.

These guardrails are critical in a decentralized system. You must assume someone will eventually submit malformed or malicious data.

---

### 8) TournamentPhase enum: a one-byte state machine

The `TournamentPhase` enum is defined in `types/src/casino/tournament.rs`. It has three values:

- `Registration = 0`
- `Active = 1`
- `Complete = 2`

The enum is `repr(u8)` and implements `Write` and `Read`. That means it is encoded as a single byte on the wire. This is a compact, explicit state machine.

If you add new phases, you must add new enum variants and update both encode and decode logic. Otherwise, nodes will reject the new phase as `InvalidEnum`.

---

### 9) Tournament state structure

The `Tournament` struct includes:

- `id: u64`
- `phase: TournamentPhase`
- `start_block: u64`
- `start_time_ms: u64`
- `end_time_ms: u64`
- `players: Vec<PublicKey>`
- `prize_pool: u64`
- `starting_chips, starting_shields, starting_doubles`
- `leaderboard: CasinoLeaderboard`

This state is stored on chain under `Key::Tournament(id)`.

Important property: the players list is **sorted and deduped** on decode. This means the on-chain representation is canonical even if someone submits a malformed or unsorted list. The decode step enforces order, which is crucial for deterministic comparisons and binary searches.

---

### 10) Player list limits and O(log n) membership checks

The tournament player list is decoded with `ReadRangeExt` and limited to 1000 entries. This is a protection against state bloat and memory abuse.

The `Tournament` struct also implements `contains_player` and `add_player` using binary search, which is O(log n). This is why the player list must remain sorted.

This is a classic tradeoff: using a sorted vec is more efficient than a hash set for deterministic serialization and compact encoding.

---

### 11) Leaderboard embedded in tournament state

The tournament contains its own `CasinoLeaderboard`. This means each tournament has a snapshot of rankings separate from the global cash leaderboard. The leaderboard is updated during tournament play and finalized at the end.

Embedding the leaderboard directly in the tournament state makes it easy for clients to fetch tournament standings in one state query. The tradeoff is that the tournament state grows with leaderboard size. The system mitigates this with entry limits and careful encoding.

---

### 12) Key and Value tags for state storage

`types/src/execution.rs` defines a `Key::Tournament(u64)` variant. This is how tournament state is stored in the key-value state store. The key tag for tournaments is 13 in the `tags::key` module.

This is part of the canonical state encoding. If a client wants to read tournament state directly, it must compute the correct key encoding using the same tag and fields.

---

### 13) How instruction and state layers interact

The instruction layer defines how to request changes (join/start/end). The state layer defines what those changes mean and how they persist. The handlers in `execution/src/layer/handlers/casino.rs` are the bridge: they interpret instructions and mutate tournament state accordingly.

From a systems perspective:

- Instruction = command
- Handler = state transition function
- State = persistent data
- Event = observable output

This is a canonical state machine architecture.

---

### 14) ABI stability and compatibility

Any change to instruction tags, event tags, or field order is a protocol change. These values must remain stable across versions.

The safest way to evolve the tournament ABI is to add new instruction variants with new tags, rather than modifying existing ones. This preserves backward compatibility for historical transactions and older clients.

---

### 15) Byte-level examples

**Join tournament 42:**

- Tag: 16 → 0x10
- tournamentId: 42 → 0x00 00 00 00 00 00 00 2A

Encoded bytes:

```
10 00 00 00 00 00 00 00 2A
```

**Start tournament 42 at time 1000 with duration 300000:**

- Tag: 17 → 0x11
- id: 42 → 8 bytes
- start_time_ms: 1000 → 8 bytes
- end_time_ms: 301000 → 8 bytes

This fixed-length encoding makes it easy to parse and validate.

---

### 16) Error codes vs events

Tournament instructions can fail for reasons like “not registering” or “unauthorized.” The handler usually returns `CasinoError` events instead of hard failures. That means the transaction still appears in outputs, but the event indicates failure.

This is important for client UX: the user sees an explicit reason for failure. It also means nonces are consumed even on error, so clients must do prechecks when possible.

---

### 17) Encode/Decode for TournamentPhaseChanged

`TournamentPhaseChanged` events exist in the event enum, even if not always emitted in the current handlers. This is a form of forward compatibility: if the system adds explicit phase change events later, the event type is already defined.

This kind of anticipatory design reduces the need for future protocol changes. It’s an example of designing for evolution.

---

### 18) Testing ABI correctness

To ensure the ABI is correct:

- Encode a tournament instruction in Rust and compare with a known hex string.
- Decode the same bytes and verify the struct fields.
- Repeat for events.
- Validate that `EncodeSize` matches actual encoded length.

These tests catch subtle bugs such as incorrect length prefixes or wrong tag values.

---

### 19) Feynman analogy: a sports rulebook

The instruction/event enums are the rulebook of the tournament. They define which moves are legal and how outcomes are recorded. The state structs are the score sheet. If you change the rulebook, all referees (validators) must learn the new rules, or games will be called differently.

This is why ABI stability is so critical.

---

### 20) Exercises for mastery

1) Manually encode a `CasinoSetTournamentLimit` instruction for a given player key and limit.
2) Explain why `TournamentPhase` is a u8 and not a string.
3) Describe how a client would decode a `TournamentEnded` event to show final rankings.
4) Identify every place in `execution.rs` that must be updated if you add a new tournament instruction.

If you can answer these, you understand tournament types at a protocol level.


## Addendum: state serialization and client integration

### 21) Tournament state encoding in detail

The `Tournament` struct implements `Write` and `Read`. The order of fields is the serialization order. This order matters; changing it would break decoding across the network.

The encoded layout is:

```
[id:u64]
[phase:u8]
[start_block:u64]
[start_time_ms:u64]
[end_time_ms:u64]
[players:Vec<PublicKey>]
[prize_pool:u64]
[starting_chips:u64]
[starting_shields:u32]
[starting_doubles:u32]
[leaderboard:CasinoLeaderboard]
```

Each `PublicKey` is itself a fixed-size encoding (32 bytes for Ed25519), and the vector uses a length prefix. This means the players list has a deterministic binary shape.

Because the list is sorted and deduped on decode, the serialization is canonical. Two nodes that store the same logical set of players will produce identical bytes, which is vital for consensus.

---

### 22) EncodeSize for Tournament

`EncodeSize` for `Tournament` adds the size of each field. For vectors, the encode size includes a length prefix plus the size of each element. This is why the size grows linearly with number of players and leaderboard entries.

In practice, this matters for state query payloads. If a tournament has hundreds of players, its encoded size will be larger. Clients should be prepared to handle larger responses for active tournaments.

---

### 23) State keys and hashing

State keys are encoded with tags and then hashed before being used in the state API. For tournaments, the key encoding is something like:

```
[keyTag: u8 = 13][tournament_id: u64]
```

The hashed key is what the `/state/<hash>` endpoint expects. Client code that reads tournament state directly must use the same encoding rules. This is why the WASM module provides `encode_*_key` helpers: it keeps clients in sync with the Rust encoding.

---

### 24) Value tags and typed decoding

The state store is key-value, but values are tagged by type. For example, a tournament value is tagged as `Value::Tournament`. This tag is also encoded, ensuring that decoding can verify the type before parsing the payload.

If a key returns the wrong value type, the decoder will error. This guards against state corruption and coding mistakes.

---

### 25) Tournament phase changes and event consistency

The event `TournamentPhaseChanged` is defined but not always emitted in current handlers. This may be intentional: the system can rely on `TournamentStarted` and `TournamentEnded` instead. However, phase changes are still encoded as an event type, so future versions can emit them without changing the ABI.

Clients should therefore be robust: they should handle `TournamentPhaseChanged` if it appears, but not require it.

---

### 26) Client-side encoding in practice

The gateway or web client builds tournament instructions using the WASM SDK or local encoders. It must ensure:

- correct tag values,
- correct field order,
- correct integer widths,
- correct endianness.

Even a single mismatch (e.g., using u32 instead of u64 for `tournament_id`) will render the instruction invalid. This is why most systems delegate encoding to a shared library, not handwritten code.

---

### 27) Tournament ID as a logical clock

Tournament IDs are not random. They often correspond to schedule slots (e.g., slot number in a day). This makes them a form of logical time. By looking at a tournament ID, clients can infer when it was scheduled.

This is a design pattern: use monotonically increasing IDs to make state queries predictable and easy to index.

---

### 28) Rankings vector encoding

`TournamentEnded` encodes a vector of `(PublicKey, u64)` pairs. This is not a built-in primitive, so it is encoded as a vector of tuples. Each tuple is encoded in order:

```
[player:PublicKey][chips:u64]
```

The event decoder reconstructs the vector accordingly. This is efficient but requires both encoder and decoder to agree on the tuple order. Any change here would be a protocol break.

---

### 29) Size limits for events

While the tournament state limits players to 1000, the end event does not enforce a hard limit in code. In practice, the rankings vector size will be limited by the number of players in the tournament. This means the end event can be large, but still bounded by the tournament size.

Clients should be prepared for large `TournamentEnded` payloads if tournaments are large.

---

### 30) Relationship to updates stream

Events are streamed to clients via the updates feed. Clients should treat tournament events as authoritative signals for UI transitions. The event order (events before transaction output) means a client can update UI immediately after seeing `TournamentStarted` or `TournamentEnded`.

This ordering is a deliberate contract in the execution layer, so clients can react deterministically.

---

### 31) Hardening against malformed public keys

The decoder for `PublicKey` will fail if bytes are malformed. That means malformed tournament events cannot be parsed. This is good: it prevents state corruption from propagating into clients.

It also means that tournament events are only as safe as the integrity of the state. If the state is corrupted, decoding will fail fast, which is preferable to silently accepting wrong data.

---

### 32) Protocol evolution strategy for tournaments

If you want to add new tournament features (e.g., multi-stage tournaments or different payout curves), you should consider:

- adding new instruction tags instead of changing existing ones,
- adding new event variants if necessary,
- extending the `Tournament` struct carefully with backward compatibility in mind.

Because the `Tournament` struct is stored on chain, changing its encoding is a hard fork unless you version the struct. A safer approach is to store optional fields or create a new `TournamentV2` type with its own key tag.

---

### 33) Feynman exercise: explain to a protocol engineer

Explain why the tournament ABI is split between `Instruction`, `Event`, and `Tournament` state. Then explain how a client can reconstruct tournament history purely from events. Finally, explain why state queries are still needed even with events. This exercise builds a holistic understanding of protocol data flow.


### 34) TournamentPhase in client logic

Because `TournamentPhase` is encoded as a byte, clients often mirror it as an enum in TypeScript or another language. This is a subtle but important requirement: if a client mislabels the numeric values, it will interpret phases incorrectly (e.g., showing Active when the chain says Registration). When you update `TournamentPhase`, update all client enums in lockstep.

### 35) Consistency between start/end instructions and events

The `CasinoStartTournament` instruction carries `start_time_ms` and `end_time_ms`, but the `TournamentStarted` event only carries `start_block`. That means clients that want exact timing must also query state or rely on schedule math. This is a deliberate design to keep events compact. It is another example of the “events + state” duality: events show *that* something happened; state shows the full details.

### 36) Why tournament IDs are u64

Tournament IDs are u64, not u32, even though daily slot counts are small. This is forward compatibility. It ensures that if the system runs for years, IDs can continue to grow without overflow. It also avoids inconsistent sizes across instructions and keys, simplifying encoding rules.


### 37) Example decode failure and its UX impact

If a client receives a tournament event with an unknown tag (say, a future version added a new event), the decoder will fail with `InvalidEnum`. Clients should handle this gracefully: log the error and skip the event rather than crashing. This is a practical way to remain forward-compatible even when strict decoding is used.


### 38) Quick recap

The tournament ABI is small but rigid. Treat every byte as part of a long-term contract, and you will avoid protocol breakages later.


### 39) Final note

When in doubt, treat `execution.rs` as the canonical protocol spec.


### 40) Last word

ABI drift is forever.


## Key takeaways
- Tournament lifecycle is encoded in a small set of instructions and events.
- Binary layouts are fixed and must match gateway encoding.

## Next lesson
L32 - Auth server (login + signature verification): `feynman/lessons/L32-auth-server.md`
