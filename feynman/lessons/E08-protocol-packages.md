# E08 - Protocol packages + schemas (from scratch, deep dive)

Focus files:
- Rust: `types/src/lib.rs`, `types/src/casino/game.rs`, `types/src/execution.rs`, `types/src/compat.rs`
- TypeScript: `packages/types/dist/index.js`, `packages/types/dist/game.js`, `packages/types/dist/cards.js`
- Protocol schemas: `packages/protocol/dist/schema/base.js`, `packages/protocol/dist/schema/websocket.js`, `packages/protocol/dist/schema/gateway.js`, `packages/protocol/dist/schema/mobile.js`
- Protocol encoders: `packages/protocol/dist/games/index.js`

Goal: explain how shared schemas are defined across Rust and TypeScript, how runtime validation protects the gateway, and how protocol encoding stays in sync with consensus-critical types. This is a full walkthrough of the schema pipeline from Rust definitions to JavaScript runtime validators.

---

## Learning objectives

By the end of this lesson you should be able to:

1) Explain why shared schemas are consensus-critical and why schema drift is dangerous.
2) Describe the role of the Rust `types` crate and how it encodes data deterministically.
3) Explain why `@nullspace/types` and `@nullspace/protocol` are separate packages.
4) Walk through how Zod schemas validate WebSocket and gateway messages at runtime.
5) Identify the key places where an enum value or field type change must be reflected.
6) Outline a safe workflow for changing a protocol or state schema.

---

## 1) The "schema ladder" (big picture)

You can think of the system as a ladder of schemas, moving from consensus-critical bytes to UI-friendly objects:

1) **Rust types and encodings**: the canonical definition for data that is signed, hashed, or stored on chain.
2) **TypeScript types**: developer ergonomics for clients and frontends.
3) **Runtime validators**: Zod schemas that validate incoming data before it touches the chain.
4) **UI models**: view models used by the mobile or web apps.

The first two layers are compile-time. The third is runtime. The fourth is product-level. Only the first two are consensus-critical, but the third protects the system against malformed or malicious input.

The challenge is keeping the layers aligned. If Rust and TypeScript drift, validators and clients disagree about the meaning of bytes. That is how you get consensus bugs and broken clients.

---

## 2) Rust `types` crate: the source of truth

The Rust `types` crate is designed to be the authoritative definition of shared data. It is used by the node, simulator, gateway, and any consensus logic. In `types/src/lib.rs`, the crate exposes several modules:

```rust
pub mod api;
pub mod casino;
pub mod execution;
pub mod token;
#[cfg(feature = "ts")]
pub mod casino_state;
```

The module layout is intentional:

- `api`: request/response types and proof verification helpers.
- `casino`: game state and casino-related types.
- `execution`: consensus-level types like instructions, transactions, tags, and seeds.
- `token`: token-related types.
- `casino_state`: TypeScript-oriented state exports (behind a feature flag).

There are also feature-gated re-exports (`root-reexports`) that make it easy to import types from the crate root. This is an ergonomics feature, but it keeps the authoritative source in one place.

### 2.1 Deterministic encoding is non-negotiable

These types are not just structs. They implement encoding traits from `commonware_codec` (`Write`, `Read`, `Encode`, `EncodeSize`, `FixedSize`). That means they can be serialized into a canonical binary representation. The encoding must be stable across versions; if it changes, signatures break and consensus fails.

The `types/src/compat.rs` tests explicitly lock down some encodings. For example, there is a test that a particular transaction must encode to an exact byte string. This is a strong statement: the encoding is part of the protocol.

---

## 3) Example: `GameType` in Rust

In `types/src/casino/game.rs`, `GameType` is defined as a `repr(u8)` enum:

```rust
#[repr(u8)]
pub enum GameType {
    Baccarat = 0,
    Blackjack = 1,
    CasinoWar = 2,
    Craps = 3,
    VideoPoker = 4,
    HiLo = 5,
    Roulette = 6,
    SicBo = 7,
    ThreeCard = 8,
    UltimateHoldem = 9,
}
```

This is not just a nice enum. The discriminant values (0..9) are part of the wire protocol. They are used in encoded payloads and in client messages. If you reorder or renumber these, you break compatibility.

The enum implements `Write` and `Read` so it can be encoded as a single byte. The `Read` implementation explicitly matches each value and rejects invalid values. This is important because the system treats invalid enums as invalid payloads.

### 3.1 Why `repr(u8)` matters

`repr(u8)` guarantees that the in-memory representation is exactly one byte. More importantly, it makes it explicit that the encoding is a single byte, which matches the protocol expectations. Without `repr(u8)`, the compiler could choose a larger representation and the encoding could drift.

---

## 4) Example: bounded vectors and defensive decoding

The `SuperModeState` struct includes a vector of `SuperMultiplier` entries. Its `Read` implementation uses `read_range` to enforce a maximum length:

```rust
multipliers: Vec::<SuperMultiplier>::read_range(reader, 0..=10)?
```

This is a security feature. If a malicious payload claims to include a million multipliers, the decoder would attempt to allocate a huge vector and blow up memory. The range check prevents that. These are part of the schema and must match wherever the data is produced.

---

## 4.1) A deeper look at `commonware_codec` and canonical encoding

The `commonware_codec` traits do more than serialization. They define a canonical byte layout that is consistent across languages and versions:

- `Write` specifies how to encode a value into bytes.
- `Read` specifies how to decode bytes back into a value.
- `EncodeSize` lets the system precompute sizes for efficient buffering.
- `FixedSize` expresses that a type has constant-size encoding (like `GameType`).
- `ReadRangeExt` and `ReadRange` add defensive limits to variable-length data.

Why this matters: if a type uses a variable-length encoding in one place and a fixed-length encoding in another, you can get ambiguous or incompatible interpretations. The trait system forces you to be explicit and consistent.

This is a subtle but powerful design choice. It turns encoding into part of the type definition, which means you can audit encoding logic at the type level rather than in ad hoc helper functions.

---

## 5) Execution-level tags and schema stability

`types/src/execution.rs` defines instruction tags and key tags. For example, casino instructions are tagged with byte values 10-17. These tags are not just internal; they determine how instructions are encoded and decoded.

If you change an instruction tag, you have effectively changed the wire protocol. That is a hard fork. The `types` crate is where these tags live because it is the consensus-critical boundary.

---

## 6) TypeScript `@nullspace/types`: runtime and type-only exports

The TypeScript package `@nullspace/types` provides client-friendly exports. The compiled JS in `packages/types/dist/index.js` re-exports modules like `cards.js`, `game.js`, `player.js`, and `events.js`.

Two important details:

1) **Some files compile to empty JS**: many TypeScript types are erased at runtime, so the output file might contain only `export {}`. This is normal. It means those types are compile-time only.
2) **Some files do provide runtime values**: for example, `game.js` exports the `GameType` enum values, and `cards.js` exports constants for suit symbols and colors.

The key rule is that anything that must be used at runtime (like enum numeric values) must be exported as actual JavaScript values, not just TypeScript types.

### 6.1 GameType in TypeScript

`packages/types/dist/game.js` defines `GameType` with the same numeric values as Rust. The comment explicitly says it must match `types/src/casino/game.rs`. This is not a suggestion; it is a protocol requirement.

If you add a new game in Rust, you must update this enum. Otherwise the client will send the wrong numeric value or reject valid values.

---

## 7) Why `@nullspace/protocol` is separate from `@nullspace/types`

`@nullspace/types` is about shared data shapes. `@nullspace/protocol` is about **runtime validation** and **message encoding**. Separating them avoids a dangerous trap:

- If protocol schemas live in the same package as general types, it is easy to accidentally drift or over-export them.
- Protocol schemas are tightly coupled to gateway and WebSocket message flows, which change more frequently.

The separation enforces a boundary: `@nullspace/types` contains stable shared types, while `@nullspace/protocol` contains schemas that validate and encode client-server messages.

---

## 8) Base protocol schemas: numeric strings and u64 limits

In `packages/protocol/dist/schema/base.js`, the base schemas define low-level constraints:

- `MAX_U64` defines the maximum for u64 values.
- `betAmountSchema` validates numeric strings and checks they fit in u64.
- `sessionIdSchema` validates numeric strings.
- `gameTypeSchema` validates a number and checks that it is one of the enum values in `GameType`.

Why numeric strings? JavaScript cannot represent all 64-bit integers exactly as `number`. Using strings avoids silent precision loss. The schema then uses `BigInt` to validate bounds.

This is a good example of protocol design meeting language constraints: Rust can handle `u64` directly; JavaScript cannot. So the schema bridges the gap by using strings for large integers.

---

## 8.1) Enum validation and the \"double values\" problem

TypeScript enums compile to objects that contain both string and numeric keys. That means `Object.values(GameType)` includes both numeric values (0..9) and string names ("Baccarat", "Blackjack", ...). If you check membership with `val in GameType`, you can accidentally accept a string or the wrong numeric form.

The `gameTypeSchema` avoids this by filtering `Object.values(GameType)` down to numeric values only, then checking that the candidate is included. This is a tiny detail, but it prevents subtle bugs where a string value might pass validation.

This is an example of a general rule: **runtime validation must defend against language quirks**, not just obvious invalid values.

---

## 9) WebSocket server messages: discriminated unions

`packages/protocol/dist/schema/websocket.js` defines the server-to-client message types used by the gateway and mobile clients:

- `GameStartedMessageSchema`
- `GameStateMessageSchema`
- `GameResultMessageSchema`
- `ErrorMessageSchema`

These are combined into a discriminated union on the `type` field:

```rust
export const ServerMessageSchema = z.discriminatedUnion('type', [
    GameStartedMessageSchema,
    GameStateMessageSchema,
    GameResultMessageSchema,
    ErrorMessageSchema,
]);
```

Discriminated unions are the safest pattern for runtime validation because the `type` field determines which schema applies. If the `type` is unknown or the fields are wrong, the message is rejected.

Notice that `initialState` and `state` are strings. The server transmits binary state as base64 strings. This keeps the wire protocol JSON-friendly while preserving the ability to decode the exact bytes.

---

## 9.1) Base64 state and lossless transport

Casino session state is a binary blob in Rust. It might contain packed bytes or canonical encodings. JSON cannot carry raw bytes, so the protocol encodes state as base64 strings.

This choice preserves two critical properties:

- **Losslessness**: base64 is a reversible encoding. You can decode it back to exactly the same bytes.
- **Uniformity**: any client (web, mobile, node) can decode base64 without ambiguity.

The cost is size overhead (base64 expands by about 33 percent), but for game state this is an acceptable tradeoff. The alternative would be to expose a lossy JSON representation, which would leak complexity into every client and still risk drift.

---

## 9.2) Error schemas as part of UX

The `ErrorMessageSchema` in WebSocket schemas is not just a validation tool. It is the bridge between protocol errors and user-facing feedback. A consistent error envelope (`type`, `code`, `message`) means clients can render errors in a uniform way and analytics can aggregate errors by code.

This is a subtle but important design goal: **schema consistency helps both correctness and product quality**. When error shapes are consistent, the UI does not have to guess how to render them.

---

## 10) Gateway client messages: validation before relay

The gateway accepts client messages and relays them to the chain. It must not forward malformed or dangerous data. That is why the gateway uses Zod schemas in `packages/protocol/dist/schema/gateway.js`.

Key parts:

- `startGameSchema` defines the fields for a `start_game` message.
- `sideBets` is an optional array of `{ type, amount }` objects.
- `requestId` is optional to support client-side correlation.
- `gameMoveSchema` is a union of all game-specific move schemas.

There is also a `ZERO_BET_GAME_TYPES` set (Baccarat, Craps, Roulette, SicBo). This enforces a rule: those games can start with bet 0 because they take bets inside the game flow, while other games require a positive bet at start.

`startGameSchema` uses `superRefine` to enforce that rule. This is a runtime validation rule that is more complex than a simple type check.

### 10.1 Why `gameMoveSchema` is a union, not a discriminated union

The comment in the code explains it: roulette and craps move schemas are themselves unions, so Zod cannot use a discriminated union at the top level. The safe alternative is a union of schemas.

This is a design compromise. A discriminated union gives better error messages and faster validation, but the nested unions make it tricky. The system chooses correctness and simplicity over perfect error messages.

---

## 11) Mobile schemas: permissive but structured

The mobile schemas in `packages/protocol/dist/schema/mobile.js` are extensive. They include:

- Base message schema with a `type` field.
- Card schemas (suit and rank).
- Game phase enums (betting, playing, waiting, result).
- Game-specific message schemas for Blackjack, Roulette, HiLo, Baccarat, Craps, Casino War, and more.
- Live table schemas for global table updates.

Many of these schemas use `.passthrough()` which allows extra fields to be present. This is a practical choice: it allows the server to add new fields without breaking older clients, while still validating core fields.

This illustrates a common schema design tradeoff:

- **Strict schemas** catch errors but can break old clients when new fields are added.
- **Passthrough schemas** are more forward-compatible but less strict.

For mobile clients, forward compatibility matters more, so the schemas are permissive.

---

## 12) Protocol codecs: encoding game moves

The protocol package also includes encoders for game moves in `packages/protocol/dist/games/index.js`:

- `GAME_CODECS` is a list of per-game codecs.
- `GAME_MOVE_SCHEMAS` is the flattened list of move schemas.
- `encodeGameMove` dispatches to the correct codec based on `message.game`.
- `encodeGameMovePayload` wraps the message in a standard envelope.

This is the bridge between JSON messages and the binary payloads consumed by the Rust execution engine. The codecs must remain aligned with the Rust `payload` parsing logic. If the encoding changes, the Rust parser will reject moves or misinterpret them.

In other words: the encoding of game moves is part of the consensus interface, even if it happens in JavaScript.

---

## 12.1) End-to-end example: a move from client to chain

Here is a simplified lifecycle of a single move:

1) A client constructs a JSON message like `{ type: 'game_move', game: 'blackjack', sessionId: '123', action: 'hit' }`.
2) The gateway validates it against `gameMoveSchema`, which is a union of all game move schemas.
3) The gateway uses `encodeGameMove` (from `games/index.js`) to convert the JSON into a binary payload.
4) The payload is wrapped into an instruction (Rust `Instruction::CasinoGameMove`) by the node or gateway layer.
5) The execution engine parses the payload with its Rust `payload` decoder and dispatches to the appropriate game.

At each step, the schema boundary must match exactly. If the JSON schema and the binary encoder disagree, the gateway will accept a message but the execution engine will reject it (or interpret it incorrectly). The point of `@nullspace/protocol` is to keep steps 2 and 3 in sync with steps 4 and 5.

This flow also explains why tests in both Rust and JS matter. A change that compiles is not enough; it must also preserve byte-level compatibility.

---

## 13) Schema drift: how it happens and why it is dangerous

Schema drift can happen in several ways:

1) **Enum value mismatch**: Rust assigns `GameType::Roulette = 6`, but TS enum says 5.
2) **Field type mismatch**: Rust expects `u64` but TS uses `number` and loses precision.
3) **Encoding mismatch**: Rust uses big-endian encoding but JS encodes little-endian.
4) **Different validation rules**: gateway accepts a value that the Rust decoder rejects.

Any of these can create hard-to-debug failures. For example, if the gateway accepts an invalid move, the chain rejects it and the user sees an opaque error. If the gateway rejects a valid move, the user cannot play.

Therefore, schema drift is not a minor bug. It is a protocol error.

---

## 14) Compatibility tests as protocol locks

The `types/src/compat.rs` tests act as protocol locks. They assert that certain encodings are stable and exact. For example, a transaction encoding is compared to a fixed hex string.

These tests serve two purposes:

- They prevent accidental changes to encoding.
- They document the exact byte-level representation for critical types.

If you change the encoding, you must update the test and you must coordinate that change across the entire stack. That is effectively a versioned protocol upgrade.

---

## 15) A safe workflow for schema changes

If you need to change a schema, follow this workflow:

1) **Update Rust types first**. Add fields, update enums, update encoding logic.
2) **Update TS runtime values**. If an enum or runtime constant changes, update `@nullspace/types`.
3) **Update protocol schemas**. Add or modify Zod schemas in `@nullspace/protocol`.
4) **Update codecs**. Ensure encoding/decoding logic aligns with Rust parsing.
5) **Update compatibility tests**. If the encoding changes, update `types/src/compat.rs` with new expected bytes.
6) **Update documentation**. Reflect the change in the Feynman lessons and in any public API docs.
7) **Run full test suite**. Protocol changes are cross-cutting; you want gateway, simulator, and node tests.

Skipping any step usually creates subtle bugs later.

---

## 15.1) Backward compatibility strategies

When possible, prefer additive changes over breaking changes. Adding optional fields or new enum variants can often be handled by permissive schemas (`passthrough`) and by ignoring unknown fields in Rust decoders. Breaking changes should be reserved for coordinated upgrades where every component is updated together.

This is why the protocol schemas often allow extra fields and why enums are validated explicitly: it is easier to evolve safely when you can detect and gate new values.

---

## 16) Feynman recap: explain it like I am five

Imagine the system is a multi-language cookbook. Rust writes the master recipe. TypeScript is the translator. The protocol package is the kitchen inspector who checks that the ingredients are the right size and shape.

If the translator changes a teaspoon to a tablespoon but the recipe still expects a teaspoon, you get a disaster. If the inspector stops checking ingredient sizes, someone might sneak in a rotten ingredient.

The solution is to keep one master recipe (Rust types), ensure the translation is exact (TS enums and types), and have inspectors at the door (Zod schemas) that reject malformed ingredients.

---

## 17) Exercises

1) Why are bets represented as strings in the protocol schemas instead of numbers?
2) What does `repr(u8)` guarantee in Rust, and why does it matter for protocol stability?
3) Explain why `gameMoveSchema` is a union instead of a discriminated union.
4) If you add a new game type, list every file or package that must be updated.
5) What is the risk if `GameType` values in Rust and TS drift?

---

## Next lesson

E09 - Mobile app architecture: `feynman/lessons/E09-mobile-app.md`
