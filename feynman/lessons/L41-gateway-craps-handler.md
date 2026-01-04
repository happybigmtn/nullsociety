# L41 - Gateway craps handler (global vs normal routing) (from scratch)

Focus file: `gateway/src/handlers/craps.ts`

Goal: explain how the gateway routes craps messages to either normal on-chain play or the global table flow. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) The gateway is the traffic director
The gateway receives client messages and decides where they go. For craps, it can:
- route bets to the normal on-chain session flow, or
- route bets to the global table coordinator (single shared table).

### 2) Atomic batch payloads
For normal craps, the gateway uses a single transaction that batches bets and the roll. This reduces latency and avoids multi-step client flows.

### 3) Global table mode
Global table mode is a shared, round-based experience. Players join a table and submit bets that get settled through the on-chain global table pipeline.

---

## Limits & management callouts (important)

1) **No explicit bet limits here**
- Bet limits are enforced later in the execution layer or global table coordinator.
- If those layers are misconfigured, the gateway will not block large bets.

2) **Session counter is local**
- `gameSessionCounter` increments in memory. If the gateway restarts, counters reset.
- This is usually fine because the session ID also uses the public key.

---

## Walkthrough with code excerpts

### 1) Routing by message type
```rust
async handleMessage(
  ctx: HandlerContext,
  msg: OutboundMessage
): Promise<HandleResult> {
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
}
```

Why this matters:
- This is the decision point for whether a request is global-table or normal on-chain.

Syntax notes:
- The `switch` uses the `msg.type` string to branch to the right handler.
- Both `craps_bet` and `craps_roll` share the same handler to support batching.

What this code does:
- Routes global-table messages to global-table handlers.
- Routes standard bet/roll messages to the on-chain flow.
- Returns a structured error for unknown message types.

---

### 2) Creating a normal on-chain session ID
```rust
const gameSessionId = generateSessionId(
  ctx.session.publicKey,
  ctx.session.gameSessionCounter++
);

// Start game with bet=0 (Craps requires bet as first move, not at start).
const startResult = await this.startGame(ctx, 0n, gameSessionId);
if (!startResult.success) {
  return startResult;
}
```

Why this matters:
- The session ID ties all later moves to a specific on-chain game session.

Syntax notes:
- `0n` is a BigInt literal for zero.
- `gameSessionCounter++` increments after using the current value.

What this code does:
- Builds a deterministic session ID from the public key and a counter.
- Starts the game with a zero bet, because craps places bets as the first move.

---

### 3) Normalizing bets and encoding the payload
```rust
const normalizeType = (value: string | number): CrapsAtomicBetInput['type'] => (
  typeof value === 'string' ? value.toUpperCase() as CrapsAtomicBetInput['type'] : value
);

const bets: CrapsAtomicBetInput[] = msg.type === 'craps_bet'
  ? [{
      type: normalizeType(msg.betType),
      amount: BigInt(msg.amount),
      target: msg.target,
    }]
  : msg.bets.map((bet) => ({
      type: normalizeType(bet.type),
      amount: BigInt(bet.amount),
      target: bet.target,
    }));

const payload = encodeAtomicBatchPayload('craps', bets);
return this.makeMove(ctx, payload);
```

Why this matters:
- This is where client-friendly input becomes the strict binary format used on chain.

Syntax notes:
- `as CrapsAtomicBetInput['type']` is a TypeScript type assertion.
- `BigInt(...)` converts numeric amounts into 64-bit integer format.

What this code does:
- Normalizes bet types to match the protocol format.
- Builds a list of bets from either a single bet or a batch.
- Encodes the bets into a single atomic payload and submits it as a move.

---

### 4) Global table delegation
```rust
private async handleLiveJoin(
  ctx: HandlerContext,
  _msg: CrapsLiveJoinRequest
): Promise<HandleResult> {
  return crapsLiveTable.join(ctx.session);
}

private async handleLiveBet(
  ctx: HandlerContext,
  msg: CrapsLiveBetRequest
): Promise<HandleResult> {
  return crapsLiveTable.placeBets(ctx.session, msg.bets);
}
```

Why this matters:
- Global table mode bypasses the per-session flow and uses a shared table coordinator.

What this code does:
- Delegates join and bet actions to `crapsLiveTable`.
- Keeps the gateway handler small and focused on routing.

---

## Extended deep dive: routing, batching, and live‑table semantics

The craps handler is small, but it encodes several important design choices about how the gateway interacts with the chain. This section breaks those choices down and connects them to the on‑chain protocol.

---

### 4) GameHandler inheritance and GameType

`CrapsHandler` extends `GameHandler` and passes `GameType.Craps` to the base class. This is more than a label: the base class uses the game type to construct on‑chain instructions (start game, move) that are correctly typed for the execution layer.

This pattern keeps each game’s handler focused on game‑specific logic, while shared transaction logic lives in the base class.

---

### 5) Message routing is the first policy layer

The `handleMessage` switch is the gateway’s policy layer for craps. It decides whether a message is:

- **Live table** (`craps_live_*`): global shared table flow.
- **Normal play** (`craps_bet`, `craps_roll`): per‑player session flow.

This matters because the on‑chain execution path is different. Live table uses a global table coordinator (see L44/L45). Normal play uses per‑session on‑chain game state.

The gateway is the only component that sees the raw client message type, so this is the correct place to implement the routing policy.

---

### 6) Why `craps_roll` uses the same handler as `craps_bet`

Both `craps_bet` and `craps_roll` are routed to `handleBet`. This is not a mistake; it is a deliberate batching design. The handler builds a single **atomic batch** payload that includes all bets and the roll in one transaction.

This design has benefits:

- **Latency reduction**: one transaction instead of two.
- **Atomicity**: either bets and roll both execute, or neither does.
- **Simpler client flow**: client can send a roll request without tracking multiple moves.

The downside is that the handler must interpret both single‑bet and multi‑bet inputs, which it does via payload normalization.

---

### 7) Session ID generation and uniqueness

The handler generates a session ID using:

```
generateSessionId(publicKey, gameSessionCounter++)
```

This yields a deterministic ID per public key, incremented locally. The session counter lives in the gateway session state, not on chain. That means:

- Session IDs are unique per gateway process.
- If the gateway restarts, the counter resets, but session IDs are still unique enough because they include the public key.

The design assumes that session ID collisions are extremely unlikely in practice. This is acceptable because session IDs are scoped to the player’s public key.

---

### 8) Starting a game with bet=0

Craps uses the atomic batch move to place bets and roll. The game start instruction does not include a bet. Therefore, the handler calls `startGame` with `bet=0n` and immediately follows with a move payload that places bets and rolls.

This is a protocol-specific nuance: unlike some games where the bet is part of the start, craps separates it. The gateway encodes that nuance so clients do not have to.

---

### 9) Atomic batch payload structure

The atomic payload is encoded by `encodeAtomicBatchPayload('craps', bets)`. The underlying format (documented in the file header) is:

```
[4, bet_count, bets...]
```

Each bet is 10 bytes:

- bet_type: u8
- target: u8
- amount: u64 (big endian)

This compact payload is why the gateway normalizes bets into a strict structure. If the payload is invalid, the encoder throws and the handler returns `INVALID_BET`.

---

### 10) Bet normalization and typing

The handler accepts bet types as either strings or numbers. It normalizes string types to uppercase and then asserts they match the protocol type. This is a usability feature: clients can send “pass” instead of “PASS,” and the gateway normalizes it.

Normalization is done before encoding. If a bet type is invalid or the payload is malformed, encoding throws and the handler returns a structured error. This is the gateway’s first line of validation.

---

### 11) Error handling strategy

The handler wraps payload encoding in a try/catch. On error, it returns a `HandleResult` with `ErrorCodes.INVALID_BET`. This is a user‑friendly error category. It avoids surfacing low‑level encoder errors directly to the client.

This is an example of error abstraction: internal errors are mapped to stable, client‑visible error codes.

---

### 12) Live table delegation

Live table messages are delegated to `crapsLiveTable`:

- `join`
- `leave`
- `placeBets`

This keeps the handler thin. The live table coordinator is responsible for its own state and validation. The gateway merely routes messages.

This separation also allows the live table to evolve independently. If global table rules change, only the live table module needs updates, not the handler’s routing logic.

---

### 13) No explicit bet limits at the gateway

The handler does not enforce bet limits. It assumes the execution layer or the global table coordinator will enforce them. This is a deliberate choice: the gateway is not the final authority. It is a routing and encoding layer.

The consequence is that if downstream validation is misconfigured, the gateway will happily forward invalid bets. That’s why downstream validation is critical.

---

### 14) Concurrency and ordering

The handler increments `gameSessionCounter` on every bet/roll request. This is a local counter, not a global nonce. It ensures session IDs are unique within the gateway process.

There is no explicit locking around this counter. The session object is assumed to be used in a single request context. If you add parallel handling for the same session, you should protect the counter to avoid race conditions.

---

### 15) Why live table is a separate mode

Live table mode is fundamentally different:

- It uses shared rounds instead of per‑player sessions.
- It requires coordinated betting windows and settlement.
- It often needs admin actions (open round, reveal, settle).

These differences justify a separate routing path. The gateway hides this complexity from clients by exposing distinct message types.

---

### 16) Observability considerations

The handler itself does not log, but errors are returned to the client. If you need deeper observability, you can add logging at the gateway handler level to capture invalid payloads or excessive error rates.

This can help detect client bugs or abuse patterns.

---

### 17) Feynman analogy: a train switchyard

Imagine a train switchyard. The gateway receives incoming trains (messages) and sends them down one of two tracks:

- Track A: individual trains (normal on‑chain sessions).
- Track B: a shared rail yard (global table).

The switchyard doesn’t decide how the trains are run; it only routes them. That is exactly what the craps handler does.

---

### 18) Exercises for mastery

1) Explain why the handler starts a game with a zero bet.
2) Describe how the atomic batch payload encodes multiple bets.
3) Explain why bet limits are enforced downstream rather than in the gateway.
4) Propose how you would add a new live‑table message type and route it.

If you can answer these, you understand the craps handler deeply.


## Addendum: protocol details and gateway ergonomics

### 19) Why `encodeAtomicBatchPayload` lives in protocol package

The gateway imports `encodeAtomicBatchPayload` from `@nullspace/protocol`. This keeps protocol encoding logic centralized. If the on‑chain format changes, you update the protocol package and all callers stay in sync. This avoids duplicate encoding logic across services.

This is the same pattern used for transaction encoding in the WASM module for admin sync. The system intentionally avoids “hand‑rolled” encoders.

---

### 20) BigInt conversion and overflow safety

Amounts are converted via `BigInt(...)` before encoding. This is important because JavaScript numbers lose precision beyond 2^53. Casino bets can exceed that range in theory. Using BigInt ensures exact 64‑bit integer encoding.

If a client sends a value that cannot be converted to BigInt (e.g., a float or invalid string), the encoder throws and the handler returns `INVALID_BET`. This is a safety check against malformed inputs.

---

### 21) Target fields and optionality

Craps bets may include a `target` (e.g., specific numbers or points). The handler forwards `target` as provided by the client. The encoder is responsible for validating whether the target is legal for the given bet type.

This is another instance of layered validation: the gateway does minimal normalization, the protocol encoder enforces structural correctness, and the execution layer enforces semantic correctness.

---

### 22) Session counter and user experience

The session counter increments on every bet/roll message, even if the start game call fails. That means a failed start still “burns” a session ID. This is not a problem because session IDs are cheap and not user‑visible. It does, however, mean that session IDs will skip numbers on transient failures.

This is a good tradeoff: simplicity over perfect sequential numbering.

---

### 23) Why live table is handled in the gateway, not the client

You might wonder why the client doesn’t talk directly to the live table coordinator. The gateway acts as a compatibility layer:

- It ensures all clients use the same message format.
- It can enforce rate limiting or authentication in one place.
- It lets you change live table internals without changing client protocols.

This is an architectural choice: centralize routing and validation in the gateway to keep clients thin.

---

### 24) Error codes as UX contracts

The handler uses `ErrorCodes.INVALID_MESSAGE` and `ErrorCodes.INVALID_BET`. These error codes are part of the client contract. They should not be changed lightly because clients may map them to user‑facing messages.

This is a general guideline: errors exposed by the gateway are part of the API surface.

---

### 25) Extensibility: adding new craps message types

If you add a new craps feature (e.g., “craps_insure”), you would:

1) Add a new message type to the protocol definitions.
2) Extend the switch in `handleMessage` to route it.
3) Implement a handler method to encode the correct payload.

Because the handler is a central router, it is the correct place to extend. This keeps the control flow explicit and easy to audit.

---

### 26) Why the handler uses `makeMove` after `startGame`

The base `GameHandler` likely provides `startGame` and `makeMove`. The craps handler uses both: it starts the session, then sends the atomic move payload.

This two‑step pattern mirrors the on‑chain protocol: you cannot send a game move without an active session. The gateway therefore enforces correct ordering at the client boundary.

---

### 27) Live table concurrency considerations

The live table coordinator likely tracks state across many players. The gateway delegates to it without additional locking. This implies the coordinator is responsible for concurrency safety. The handler’s job is simply to route and forward.

This is a clean separation of concerns: the handler should not become a stateful global table manager.

---

### 28) Observability and metrics

While the handler doesn’t log directly, you can instrument at higher layers to measure:

- rate of `craps_bet` vs `craps_live_bet` messages,
- error rate for invalid bets,
- average latency of start + move submissions.

These metrics help you understand user behavior and diagnose issues in the craps flow.

---

### 29) Security boundary recap

The gateway does not authenticate the raw user beyond the session context. That context must already be validated (e.g., via auth or session manager). The craps handler assumes `ctx.session` is legitimate. This is why session management is a critical upstream component.

---

### 30) Feynman analogy: a restaurant waiter

The handler is like a waiter who takes your order and sends it to either the kitchen (normal game) or the buffet station (live table). The waiter doesn’t cook the food; they just route the order and make sure it’s in the correct format.

---

### 31) Exercises for mastery

1) Describe how you would extend the handler to support a new bet type with additional metadata.
2) Explain how the two‑step start + move flow prevents invalid game state.
3) Explain why BigInt conversion is necessary in JavaScript.
4) Describe how you would test the handler’s routing logic.

If you can answer these, you understand the gateway craps handler at a deep level.


### 32) Payload size and submission limits

Atomic batch payloads can grow if many bets are included. The gateway should remain aware of submission size limits enforced by the submit layer. While the handler does not explicitly check size, the upstream SubmitClient may reject oversized submissions. If you plan to allow very large bet batches, consider adding a client-side or gateway-side cap.

### 33) Handling malformed bet arrays

The handler assumes `msg.bets` is a valid array for `craps_roll`. If a client sends malformed data, the encoder will throw. This is acceptable, but you could add defensive checks (e.g., ensure bets is non-empty, ensure amounts are positive) to provide clearer error messages.

### 34) Final note

The craps handler is a small router, but its choices determine how all craps traffic flows into the chain.


### 35) Practical troubleshooting checklist

If craps bets fail unexpectedly:

1) Verify the client message type (live vs normal).
2) Check that bet amounts are valid and convertable to BigInt.
3) Confirm the session start succeeded before the move was sent.
4) Inspect the payload encoder for errors (invalid bet types or targets).
5) Confirm downstream execution logs for bet validation failures.

This checklist helps isolate whether the failure occurred at the gateway, encoder, or execution layer.

### 36) Tiny epilogue

Routing looks simple until it’s wrong; test it thoroughly.


### 37) Final recap

Two paths, one handler: the gateway decides whether a bet becomes a private session transaction or part of the shared table flow. That routing decision is the core of this file.


### 38) Last word

If the gateway routes correctly, everything else becomes diagnosable.


### 39) Epilogue

Routing is policy. Policy deserves rigor.


### 40) Epilogue

Keep it simple.


## Key takeaways
- The gateway routes global-table messages and normal on-chain messages differently.
- Normal craps uses an atomic batch payload for bets + roll.
- Global table actions are delegated to the on-chain table coordinator.

## Next lesson
L44 - On-chain craps table coordinator: `feynman/lessons/L44-onchain-craps-table.md`
