# L13 - Gateway entrypoint (register + faucet paths) (from scratch)

Focus file: `gateway/src/index.ts`

Goal: explain how the gateway accepts connections, auto‑registers sessions, handles faucet claims, and routes messages to game handlers. For every excerpt, you will see **why it matters** and a **plain description of what the code does**. We only explain syntax when it is genuinely tricky.

---

## Concepts from scratch (expanded)

### 1) The gateway is the client’s front door
Clients connect to the gateway via WebSocket. The gateway:
- creates a session,
- generates keys,
- auto‑registers the player on chain,
- and forwards game actions to the backend.

### 2) Auto‑registration
When a session is created, the gateway can register the player automatically. This reduces client complexity but requires careful error handling.

### 3) Faucet claims
The gateway exposes a “faucet_claim” message that triggers an on‑chain deposit. The gateway enforces cooldowns and sends a balance update afterward.

### 4) Origin and connection limits
Connections are validated by origin allowlist and rate limits. This prevents browsers or bots from overwhelming the gateway.

---

## Limits & management callouts (important)

1) **FAUCET_COOLDOWN_MS**
- Used in `requestFaucet` to throttle claims.
- Must align with on‑chain faucet rules to avoid confusing rejections.

2) **DEFAULT_FAUCET_AMOUNT**
- Used when the client does not specify an amount.
- If this differs from backend expectations, users will see mismatched balances.

3) **Origin allowlist** (`GATEWAY_ALLOWED_ORIGINS`)
- If set, connections without origin are rejected unless `GATEWAY_ALLOW_NO_ORIGIN` is true.

4) **Connection limits**
- `MAX_CONNECTIONS_PER_IP` and `MAX_TOTAL_SESSIONS` enforce caps.
- If too low, NAT’d users are blocked; if too high, memory can spike.

---

## Walkthrough with code excerpts

### 1) Handle a faucet claim
```ts
if (msgType === 'faucet_claim') {
  const session = sessionManager.getSession(ws);
  if (!session) {
    sendError(ws, ErrorCodes.SESSION_EXPIRED, 'No active session');
    return;
  }

  const amountRaw = typeof msg.amount === 'number' ? msg.amount : null;
  const amount = amountRaw && amountRaw > 0 ? BigInt(Math.floor(amountRaw)) : DEFAULT_FAUCET_AMOUNT;

  const result = await sessionManager.requestFaucet(session, amount, FAUCET_COOLDOWN_MS);
  if (!result.success) {
    sendError(ws, ErrorCodes.INVALID_MESSAGE, result.error ?? 'Faucet claim failed');
    return;
  }

  await sessionManager.refreshBalance(session);
  send(ws, {
    type: 'balance',
    registered: session.registered,
    hasBalance: session.hasBalance,
    publicKey: session.publicKeyHex,
    balance: session.balance.toString(),
    message: 'FAUCET_CLAIMED',
  });
  trackGatewayFaucet(session, amount);
  return;
}
```

Why this matters:
- Faucet claims are the first funding step for new users. If this fails, onboarding fails.

What this code does:
- Loads the current session and rejects if missing.
- Parses the requested amount (or uses a default).
- Calls `requestFaucet` with a cooldown window.
- Refreshes balance and sends a balance update back to the client.

---

### 2) WebSocket connection validation (origin + limits)
```ts
const clientIp = req.socket.remoteAddress ?? 'unknown';
const originHeader = req.headers.origin;
const originValue = typeof originHeader === 'string' ? originHeader : null;
const origin = originValue === 'null' ? null : originValue;

if (GATEWAY_ALLOWED_ORIGINS.length > 0) {
  if (!origin) {
    if (!GATEWAY_ALLOW_NO_ORIGIN) {
      sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Origin required');
      ws.close(1008, 'Origin required');
      return;
    }
  } else if (!GATEWAY_ALLOWED_ORIGINS.includes(origin)) {
    sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Origin not allowed');
    ws.close(1008, 'Origin not allowed');
    return;
  }
}

const limitCheck = connectionLimiter.canConnect(clientIp);
if (!limitCheck.allowed) {
  sendError(ws, limitCheck.code ?? ErrorCodes.BACKEND_UNAVAILABLE, limitCheck.reason ?? 'Connection limit exceeded');
  ws.close(1013, limitCheck.reason);
  return;
}
```

Why this matters:
- Prevents unauthorized browsers and throttles abusive clients.

What this code does:
- Reads the Origin header and enforces allowlist rules.
- Uses a connection limiter to apply per‑IP and global limits.
- Closes the socket with appropriate WebSocket close codes on rejection.

---

### 3) Create a session and auto‑register
```ts
const session = await sessionManager.createSession(ws, {}, clientIp);
sessionManager.startBalanceRefresh(session, BALANCE_REFRESH_MS);

send(ws, {
  type: 'session_ready',
  sessionId: session.id,
  publicKey: session.publicKeyHex,
  registered: session.registered,
  hasBalance: session.hasBalance,
});
trackGatewaySession(session);
```

Why this matters:
- Session creation is the moment the client gets its keypair and on‑chain identity.

What this code does:
- Creates a session (which may auto‑register the player).
- Starts periodic balance refresh.
- Sends `session_ready` with identifiers so the client can proceed.

---

### 4) Message routing to handlers
```ts
const validation = OutboundMessageSchema.safeParse(msg);
if (!validation.success) {
  sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Invalid message payload');
  return;
}

const validatedMsg = validation.data as OutboundMessage;
const validatedType = validatedMsg.type;

const session = sessionManager.getSession(ws);
if (!session) {
  sendError(ws, ErrorCodes.SESSION_EXPIRED, 'Session not found');
  return;
}

const gameType = getOutboundMessageGameType(validatedType);
if (gameType === null || gameType === undefined) {
  sendError(ws, ErrorCodes.INVALID_MESSAGE, `Unknown message type: ${validatedType}`);
  return;
}

const handler = handlers.get(gameType);
if (!handler) {
  sendError(ws, ErrorCodes.INVALID_GAME_TYPE, `No handler for game type: ${gameType}`);
  return;
}

const ctx: HandlerContext = {
  session,
  submitClient,
  nonceManager,
  backendUrl: BACKEND_URL,
  origin: GATEWAY_ORIGIN,
};

const result = await handler.handleMessage(ctx, validatedMsg);
```

Why this matters:
- This routing is the bridge between client UI and on‑chain transactions.

What this code does:
- Validates the incoming message schema.
- Fetches the session and resolves the correct game handler.
- Builds a handler context and executes the handler.

---

### 5) Cleanup on disconnect
```ts
ws.on('close', () => {
  const destroyed = sessionManager.destroySession(ws);
  if (destroyed) {
    crapsLiveTable.removeSession(destroyed);
  }
  connectionLimiter.unregisterConnection(clientIp, connectionId);
});
```

Why this matters:
- Without cleanup, sessions would leak memory and keep stale global-table state.

What this code does:
- Destroys the session, removes it from the global table, and updates connection limits.

---

## Extended deep dive: registration + faucet lifecycle as a protocol flow

The register + faucet paths are not just “helper features.” They are the onboarding pipeline for every player. If these flows are unreliable, the rest of the system feels broken. The sections below explain the lifecycle at a systems level.

### 6) The `session_ready` handshake is the contract

When a socket connects, the gateway sends:

```json
{
  "type": "session_ready",
  "sessionId": "...",
  "publicKey": "...",
  "registered": false|true,
  "hasBalance": false|true
}
```

This is the client’s “passport.” It says:

- The gateway accepted your connection.
- This is your temporary session ID.
- This is the public key you will use for on‑chain identity.
- Here is your initial registration/balance status.

From this point forward, the client should not assume anything else. It should not generate its own key, and it should not guess its on‑chain status. This message is the authoritative starting state.

### 7) Auto‑registration is asynchronous by design

The gateway creates the session and *then* attempts registration. That means it is possible for a client to receive `session_ready` before the on‑chain registration has been confirmed.

This is why the message includes `registered` and `hasBalance` flags. They start as `false` and can later become `true` after registration succeeds and balance is refreshed.

The important concept: **registration is a transaction**, and transactions are asynchronous. The UI must be prepared to see a short delay between session creation and registration confirmation.

### 8) Faucet is a deposit, but with human‑friendly semantics

The faucet is implemented as a `CasinoDeposit` instruction. From the backend’s perspective, it is just a deposit.

From the user’s perspective, it is a “give me test chips” button. That is why the gateway adds two behaviors:

1) a client‑side cooldown to prevent spam;
2) an immediate balance refresh after success.

These behaviors are not part of the chain protocol; they are part of the UX contract.

### 9) Why the gateway refreshes balance after a faucet claim

After a faucet claim, the gateway calls `refreshBalance` and then sends a `balance` message. This is important because:

- The local balance may be stale.
- The faucet transaction could have been accepted but not yet reflected in local cache.

By refreshing explicitly, the gateway forces the latest truth from the backend and aligns the UI with on‑chain state.

Think of it as a “read‑after‑write” guarantee for the faucet flow.

### 10) Error taxonomy and why it matters to UX

The gateway has structured error codes (see `gateway/src/types/errors.ts`):

- `INVALID_MESSAGE`
- `SESSION_EXPIRED`
- `INVALID_GAME_TYPE`
- `BACKEND_UNAVAILABLE`
- `TRANSACTION_REJECTED`
- and others.

These codes are not cosmetic. They shape the client’s UX:

- `INVALID_MESSAGE` means “your request was malformed.”
- `SESSION_EXPIRED` means “you need to reconnect.”
- `BACKEND_UNAVAILABLE` means “the system is down, try later.”

If the UI treats all errors the same, players cannot recover intelligently. The gateway provides a structured taxonomy so the UI can respond appropriately.

### 11) Close codes: why 1008 and 1013 are chosen

The gateway closes sockets with specific WebSocket close codes:

- **1008 (Policy Violation)** when origin validation fails.
- **1013 (Try Again Later)** when connection limits are hit.

These are standard semantics. They give clients machine‑readable hints:

- 1008 means “your request violated server policy.”
- 1013 means “service is overloaded; retry later.”

If you ever build a native client, you can use these codes to drive reconnection logic.

### 12) Ops analytics: invisible but important

The gateway calls:

- `trackGatewaySession`
- `trackGatewayFaucet`
- `trackGatewayResponse`

These functions emit lightweight analytics events to an ops endpoint. The key points:

- They are best‑effort; failures are ignored.
- They include the public key and session ID (when available).
- They allow operators to track onboarding, faucet usage, and game lifecycle events.

Even though this is not part of gameplay, it is essential for production observability.

### 13) Origin allowlist is a security boundary

The gateway checks `GATEWAY_ALLOWED_ORIGINS` and optionally `GATEWAY_ALLOW_NO_ORIGIN`.

Why it matters:

- Browsers always send Origin headers.
- Without allowlist checks, any website can connect and abuse your gateway.

In production, the allowlist should be strict. For native clients without Origin, you must explicitly allow “no origin” or enforce a different network boundary.

### 14) Connection limits are a DoS defense, not a feature

The `ConnectionLimiter` enforces per‑IP and global caps. These are not just “nice limits.” They prevent a single client (or botnet) from consuming all sockets and memory.

This is why the limiter is checked *before* session creation. If a connection cannot be accepted, the gateway rejects it early and cheaply.

### 15) The faucet cooldown is a local defense

The gateway uses a local timestamp (`lastFaucetAt`) to enforce cooldown. This is not a cryptographic guarantee; it is an anti‑spam UX guard.

The real enforcement still happens on chain. That means:

- If the gateway cooldown is too lenient, the chain will still reject spam, but the user will see confusing errors.
- If the gateway cooldown is too strict, users will be prevented from claiming even when the chain would allow it.

So cooldown settings should match on‑chain rules as closely as possible.

### 16) Read‑after‑write consistency is not automatic

The gateway’s local session state is a cache, not the source of truth. That is why it refreshes balance explicitly after faucet claims and during the periodic balance refresh loop.

If you ever see mismatch between UI and chain, the correct fix is usually:

- increase refresh frequency, or
- use updates stream events as the source of truth for UI state.

The important idea: **sessions are fast caches, not authoritative storage**.

### 17) Feynman analogy: front desk + cash drawer

Imagine a hotel front desk:

- The “session_ready” message is your room key.
- Auto‑registration is the staff checking you into the system.
- The faucet is like giving you a starter credit.
- Balance refresh is the cashier verifying your account balance.

If any of those steps fails, the rest of the stay is frustrating. That is why the gateway focuses on making these flows predictable and explicit.

### 18) Practical troubleshooting checklist

If users are stuck during onboarding, check these in order:

1) Do they receive `session_ready`?
2) Does `registered` eventually flip to true (via updates or balance refresh)?
3) Does faucet_claim return `FAUCET_CLAIMED` and a new balance?
4) Are errors labeled with the right codes (INVALID_MESSAGE vs BACKEND_UNAVAILABLE)?
5) Are origin and connection limits configured correctly?

These steps map directly to the code paths in this file.

---

### 19) Message parsing and why the gateway is strict

Before the gateway does anything, it parses JSON and checks for a `type` field. This seems obvious, but it is a reliability safeguard:

- If JSON parsing fails, the gateway immediately returns `INVALID_MESSAGE`.
- If `type` is missing, it returns `INVALID_MESSAGE`.

Why be strict? Because downstream handlers assume structured input. If malformed inputs leaked into the handler registry, you would get runtime errors or inconsistent state transitions.

So strict validation at the front door keeps the rest of the system simpler and safer.

### 20) The special system messages: `ping` and `get_balance`

The gateway handles a small set of system messages before routing to handlers:

- `ping` returns a `pong` with a timestamp.
- `get_balance` forces a balance refresh and returns the current balance.

These are operational tools for the client:

- `ping` is a liveness probe.
- `get_balance` is a manual “sync me” tool.

They also demonstrate a pattern: some messages are handled centrally because they are not game-specific. Everything else goes through the handler registry.

### 21) Faucet amount parsing and rounding

The faucet handler accepts `msg.amount` if it is a number. It converts it to BigInt via:

```ts
BigInt(Math.floor(amountRaw))
```

This does two things:

1) It avoids fractional chips.
2) It prevents floating-point rounding from leaking into the on-chain amount.

If the client sends a negative or non-numeric amount, the gateway falls back to `DEFAULT_FAUCET_AMOUNT`.

This is a protective default: it ensures the faucet flow remains usable even if the client sends a malformed amount.

### 22) Why `requestFaucet` returns a structured result

The `requestFaucet` method returns `{ success, error? }` instead of throwing. This is consistent with the gateway’s philosophy:

- Errors are part of normal control flow (e.g., cooldown hit).
- The caller should be able to respond without try/catch.

This keeps the handler code simple and reduces the chance of unhandled promise rejections.

### 23) Session creation failures and backpressure

When `createSession` fails, the gateway:

- logs the error,
- sends a `BACKEND_UNAVAILABLE` error to the client,
- unregisters the connection,
- and closes the socket.

This is deliberate. A failed session creation means the gateway cannot safely proceed. It is better to fail fast than to leave a half-initialized session.

### 24) Logging as an operational interface

The gateway logs:

- incoming message types (truncated to avoid leaking large payloads),
- handler results (success/failure),
- connection events,
- and errors with context.

Operators rely on these logs to diagnose issues like:

- spikes in invalid messages (client bugs),
- frequent faucet claims (abuse),
- connection limit rejections (capacity issues).

So treat logging as a second API. Changes to log message structure can affect monitoring pipelines.

### 25) Performance considerations

Even though this file is mostly I/O, a few choices affect performance:

- `BALANCE_REFRESH_MS` controls how often the gateway polls account state.
- `SUBMIT_TIMEOUT_MS` controls how long the gateway waits on backend submissions.
- `SUBMIT_MAX_BYTES` protects the backend from oversized submissions.

If the gateway feels slow:

- check submit latency and timeout settings,
- ensure backend health is good,
- verify that balance refresh is not too aggressive.

These tunables are often more impactful than code changes.

### 26) Feynman analogy: triage desk at a hospital

Think of the gateway like a hospital triage desk:

- It checks that the patient has an ID (`session_ready`).
- It answers basic questions (`ping`, `get_balance`).
- It directs the patient to the right specialist (handler registry).
- It enforces capacity limits so the hospital does not collapse under load.

If triage fails, the whole hospital fails. That is why this “simple” gateway file is operationally critical.

---

### 27) A concrete onboarding timeline (step-by-step)

Here is a concrete timeline of what happens when a brand-new user opens the app:

1) The app opens a WebSocket connection to the gateway.
2) The gateway validates origin and connection limits.
3) The gateway creates a session and generates a keypair.
4) The gateway attempts registration in the background.
5) The gateway sends `session_ready` immediately.
6) The client UI renders a “connecting” or “registering” state.
7) The registration transaction is accepted on chain.
8) The gateway’s updates client receives the registration event.
9) The gateway’s balance refresh pulls the updated balance.
10) The client UI shows the initial chips and enables gameplay.

This shows why the gateway sends `session_ready` before registration completes: it allows the UI to render immediately, while the chain catches up asynchronously.

### 28) Common pitfalls and how to avoid them

1) **Assuming registration is instant**  
   Always check `session.registered` and be prepared for a short delay. If the UI starts a game before registration, the backend will reject it.

2) **Ignoring faucet cooldown errors**  
   Treat faucet errors as normal, not fatal. The client should show a message and keep the session alive.

3) **Mismatch between gateway and backend origin policy**  
   If the gateway sends an Origin header the backend does not allow, every submission will fail. Always update both allowlists together.

4) **Connection limits too strict**  
   If many clients are behind the same NAT, a low per-IP limit will block them. Adjust `MAX_CONNECTIONS_PER_IP` in production.

5) **Nonce persistence disabled**  
   If `GATEWAY_NONCE_PERSIST_INTERVAL_MS` is set to 0 in production, restarts will cause nonce drift and transaction rejections.

These are not code bugs; they are configuration pitfalls. They show up first in the register + faucet flows because those are the first actions every user takes.

### 29) Suggested tests for this file

Even though this is a runtime entrypoint, you can still test key behaviors:

- **Unit test** the faucet amount parsing (negative or non-numeric should fallback to default).
- **Integration test** a full session creation: ensure `session_ready` arrives and registration eventually succeeds.
- **Load test** connection limits to confirm `1013` is returned when the limit is exceeded.

These tests give you confidence that onboarding remains stable as you evolve the gateway.

---

One final reminder: if the register or faucet flow feels flaky, start by verifying the updates stream. Many “registration failed” bugs are actually “registration succeeded but the client never heard about it.” Always check both sides. This is crucial here.

## Key takeaways
- The gateway auto‑creates sessions and can auto‑register players.
- Faucet claims are throttled and immediately reflected in balance updates.
- Origin allowlists and connection limits protect the gateway from abuse.

## Next lesson
L14 - Session registration + faucet flows: `feynman/lessons/L14-session-register-faucet.md`
