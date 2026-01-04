# L02 - Session manager and account lifecycle (from scratch)

Focus file: `gateway/src/session/manager.ts`

Goal: explain how sessions are created, registered, and kept in sync. For every code excerpt, you’ll see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) What is a session?
A session is the gateway’s in‑memory record for one connected player. It holds:
- the WebSocket connection,
- an Ed25519 keypair (identity on chain),
- cached balances,
- the active game session ID,
- update stream subscriptions.

If this session state is wrong, every later decision (nonce, balance, game state) is wrong.

### 2) Why generate keys on the server?
The gateway acts like a lightweight wallet for the client. It generates a fresh Ed25519 keypair per session so the client doesn’t need to manage keys.

### 3) Why subscribe to updates before registration?
On‑chain events are delivered over a WebSocket updates stream. If you submit a transaction **before** you subscribe, you can miss the confirmation event. That creates confusing “silent success” behavior.

### 4) What is a nonce?
A nonce is a counter that must increase with each transaction for a given account. Reusing a nonce causes the chain to reject the transaction. That’s why nonces must be locked and persisted.

### 5) Local cache vs chain truth
The gateway keeps local balances for responsiveness, but the chain is the source of truth. Regular refresh is required to avoid drift.

---

## Limits & management callouts (important)

1) **Session creation rate limits**
```ts
points: 10 per window (default)
window: 1 hour (default)
block: 1 hour (default)
```
- These defaults can be too strict for NAT-heavy networks.
- Adjust `GATEWAY_SESSION_RATE_LIMIT_POINTS/WINDOW/BLOCK` based on traffic patterns.

2) **CASINO_INITIAL_CHIPS is applied after registration**
- The on‑chain registration grants initial chips (from `@nullspace/constants/limits`).
- The session manager marks the balance locally after successful registration.
- If you want a different starting balance, change the on‑chain handler and the shared limits constant.

3) **Idle session cleanup (default 30 min)**
- `cleanupIdleSessions` uses a default of 30 minutes. Too short can disconnect slow players; too long can waste resources.

4) **Faucet cooldown**
- Passed in from gateway config (default 60s). Must be aligned with on‑chain faucet rules.

---

## Walkthrough with code excerpts

### 1) Rate limit config
```ts
const readEnvLimit = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const SESSION_CREATE_LIMIT = {
  points: readEnvLimit('GATEWAY_SESSION_RATE_LIMIT_POINTS', 10),
  durationMs: readEnvLimit('GATEWAY_SESSION_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
  blockMs: readEnvLimit('GATEWAY_SESSION_RATE_LIMIT_BLOCK_MS', 60 * 60 * 1000),
};
```

Why this matters:
- These values control onboarding rate and protect the gateway from abuse.

What this code does:
- Defines default limits and reads override values from environment variables.
- Keeps the rate limiter logic centralized so other code can assume it exists.

---

### 2) SessionManager fields and constructor
```ts
export class SessionManager {
  private sessions: Map<WebSocket, Session> = new Map();
  private byPublicKey: Map<string, Session> = new Map();
  private nonceManager: NonceManager;
  private submitClient: SubmitClient;
  private backendUrl: string;
  private origin: string;
  private sessionCreateAttempts: Map<string, { count: number; windowStart: number; blockedUntil: number }> = new Map();

  constructor(
    submitClient: SubmitClient,
    backendUrl: string,
    nonceManager?: NonceManager,
    origin?: string,
  ) {
    this.submitClient = submitClient;
    this.backendUrl = backendUrl;
    this.nonceManager = nonceManager ?? new NonceManager();
    this.origin = origin ?? 'http://localhost:9010';
  }
```

Why this matters:
- This is the state hub. It keeps every active session, plus the nonce manager and submit client.

What this code does:
- Initializes maps to store sessions and rate limit counters.
- Stores dependencies (submit client, nonce manager, backend URL, origin).

---

### 3) Private key generation with entropy check
```ts
private generatePrivateKey(): Uint8Array {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const privateKey = ed25519.utils.randomPrivateKey();
    const allZeros = privateKey.every((b) => b === 0);
    const allSame = privateKey.every((b) => b === privateKey[0]);
    if (!allZeros && !allSame) {
      return privateKey;
    }
  }
  throw new Error('Insufficient entropy detected for session key generation');
}
```

Why this matters:
- The private key is the player’s identity. Weak keys would compromise security.

What this code does:
- Generates an Ed25519 private key and rejects obviously broken RNG output.

---

### 4) Session creation rate limit enforcement
```ts
private enforceSessionRateLimit(clientIp: string): void {
  const now = Date.now();
  const existing = this.sessionCreateAttempts.get(clientIp);
  if (existing && existing.blockedUntil > now) {
    throw new Error('Session creation rate limit exceeded');
  }

  const record = existing ?? { count: 0, windowStart: now, blockedUntil: 0 };
  if (now - record.windowStart > SESSION_CREATE_LIMIT.durationMs) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  if (record.count > SESSION_CREATE_LIMIT.points) {
    record.blockedUntil = now + SESSION_CREATE_LIMIT.blockMs;
    this.sessionCreateAttempts.set(clientIp, record);
    throw new Error('Session creation rate limit exceeded');
  }
  this.sessionCreateAttempts.set(clientIp, record);
}
```

Why this matters:
- This prevents one IP from creating unlimited sessions and exhausting memory.

What this code does:
- Tracks session creation attempts per IP and blocks when limits are exceeded.

---

### 5) Creating a session
```ts
async createSession(ws: WebSocket, options: SessionCreateOptions = {}, clientIp: string = 'unknown'): Promise<Session> {
  this.enforceSessionRateLimit(clientIp);
  let privateKey: Uint8Array;
  let publicKey: Uint8Array;
  let publicKeyHex: string;
  let attempts = 0;
  do {
    privateKey = this.generatePrivateKey();
    publicKey = ed25519.getPublicKey(privateKey);
    publicKeyHex = Buffer.from(publicKey).toString('hex');
    attempts += 1;
  } while (this.byPublicKey.has(publicKeyHex) && attempts < 3);

  if (this.byPublicKey.has(publicKeyHex)) {
    throw new Error('Failed to generate unique session key');
  }

  const playerName = options.playerName ?? `Player_${publicKeyHex.slice(0, 8)}`;

  const now = Date.now();
  const session: Session = {
    id: randomUUID(),
    ws,
    publicKey,
    privateKey,
    publicKeyHex,
    playerName,
    registered: false,
    hasBalance: false,
    balance: 0n,
    activeGameId: null,
    gameType: null,
    gameSessionCounter: 0n,
    connectedAt: now,
    lastActivityAt: now,
    lastFaucetAt: 0,
  };

  this.sessions.set(ws, session);
  this.byPublicKey.set(publicKeyHex, session);

  try {
    await this.initializePlayer(session);
  } catch (err) {
    logError(`Failed to initialize player ${playerName}:`, err);
  }

  return session;
}
```

Why this matters:
- This is the **main entrypoint** for creating players. It generates keys, ensures uniqueness, stores the session, and triggers on‑chain registration.

What this code does:
- Enforces rate limit.
- Generates a keypair and ensures it does not collide.
- Builds the session object and stores it in maps.
- Calls `initializePlayer` to connect updates and register on chain.

---

### 6) Initialize player (updates first, then register)
```ts
private async initializePlayer(session: Session): Promise<void> {
  try {
    const updatesClient = new UpdatesClient(this.backendUrl, this.origin);
    await updatesClient.connectForAccount(session.publicKey);
    session.updatesClient = updatesClient;
    logDebug(`Connected to updates stream for ${session.playerName}`);
  } catch (err) {
    logWarn(`Failed to connect to updates stream for ${session.playerName}:`, err);
  }

  const registerResult = await this.registerPlayer(session);
  if (!registerResult) {
    logWarn(`Registration failed for ${session.playerName}`);
    return;
  }

  session.hasBalance = true;
  session.balance = BigInt(CASINO_INITIAL_CHIPS);
}
```

Why this matters:
- Establishing updates first prevents missing registration events.
- It sets the local balance to match the chain’s initial grant.

What this code does:
- Connects to the updates stream.
- Registers the player on chain.
- Marks the session as registered and sets the local balance to the initial grant.

---

### 7) Register player (CasinoRegister)
```ts
private async registerPlayer(session: Session): Promise<boolean> {
  return this.nonceManager.withLock(session.publicKeyHex, async (nonce) => {
    const instruction = encodeCasinoRegister(session.playerName);
    const tx = buildTransaction(nonce, instruction, session.privateKey);
    const submission = wrapSubmission(tx);

    const result = await this.submitClient.submit(submission);

    if (result.accepted) {
      session.registered = true;
      this.nonceManager.setCurrentNonce(session.publicKeyHex, nonce + 1n);
      logDebug(`Registered player: ${session.playerName}`);
      return true;
    }

    if (result.error && this.nonceManager.handleRejection(session.publicKeyHex, result.error)) {
      const synced = await this.nonceManager.syncFromBackend(session.publicKeyHex, this.getBackendUrl());
      if (synced) {
        const retryNonce = this.nonceManager.getCurrentNonce(session.publicKeyHex);
        const retryTx = buildTransaction(retryNonce, instruction, session.privateKey);
        const retrySubmission = wrapSubmission(retryTx);
        const retryResult = await this.submitClient.submit(retrySubmission);
        if (retryResult.accepted) {
          session.registered = true;
          this.nonceManager.setCurrentNonce(session.publicKeyHex, retryNonce + 1n);
          logDebug(`Registered player: ${session.playerName}`);
          return true;
        }
      }
    }

    logWarn(`Registration rejected for ${session.playerName}: ${result.error}`);
    return false;
  });
}
```

Why this matters:
- Registration is the gate to gameplay. If this fails, nothing else works.
- Nonce mismatches are common; the retry path makes registration reliable.

What this code does:
- Builds and submits a registration transaction.
- Updates local nonce on success.
- If rejected due to nonce mismatch, syncs and retries once.

---

### 8) Deposit chips (CasinoDeposit)
```ts
private async depositChips(session: Session, amount: bigint): Promise<boolean> {
  return this.nonceManager.withLock(session.publicKeyHex, async (nonce) => {
    const instruction = encodeCasinoDeposit(amount);
    const tx = buildTransaction(nonce, instruction, session.privateKey);
    const submission = wrapSubmission(tx);

    const result = await this.submitClient.submit(submission);

    if (result.accepted) {
      session.hasBalance = true;
      session.balance = session.balance + amount;
      this.nonceManager.setCurrentNonce(session.publicKeyHex, nonce + 1n);
      logDebug(`Deposited ${amount} chips for ${session.playerName}`);
      return true;
    }

    if (result.error && this.nonceManager.handleRejection(session.publicKeyHex, result.error)) {
      const synced = await this.nonceManager.syncFromBackend(session.publicKeyHex, this.getBackendUrl());
      if (synced) {
        const retryNonce = this.nonceManager.getCurrentNonce(session.publicKeyHex);
        const retryTx = buildTransaction(retryNonce, instruction, session.privateKey);
        const retrySubmission = wrapSubmission(retryTx);
        const retryResult = await this.submitClient.submit(retrySubmission);
        if (retryResult.accepted) {
          session.hasBalance = true;
          session.balance = session.balance + amount;
          this.nonceManager.setCurrentNonce(session.publicKeyHex, retryNonce + 1n);
          logDebug(`Deposited ${amount} chips for ${session.playerName}`);
          return true;
        }
      }
    }

    logWarn(`Deposit rejected for ${session.playerName}: ${result.error}`);
    return false;
  });
}
```

Why this matters:
- Faucet and test deposits use this path. It must be robust or onboarding breaks.

What this code does:
- Builds and submits a deposit transaction.
- Updates local balance if accepted.
- Retries once on nonce mismatch.

---

### 9) Balance refresh and periodic polling
```ts
async refreshBalance(session: Session): Promise<bigint | null> {
  const account = await this.submitClient.getAccount(session.publicKeyHex);
  if (!account) {
    return null;
  }
  session.balance = account.balance;
  return account.balance;
}

startBalanceRefresh(session: Session, intervalMs: number): void {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }
  if (session.balanceRefreshIntervalId) {
    clearInterval(session.balanceRefreshIntervalId);
  }
  session.balanceRefreshIntervalId = setInterval(async () => {
    try {
      await this.refreshBalance(session);
    } catch (err) {
      logWarn(`[Gateway] Balance refresh failed for ${session.playerName}:`, err);
    }
  }, intervalMs);
}
```

Why this matters:
- Ensures local cache stays close to the chain’s truth.
- Prevents the UI from drifting too far from reality.

What this code does:
- Fetches account state from the backend.
- Optionally starts a timer to refresh balance at intervals.

---

### 10) Faucet request (client-side throttle)
```ts
async requestFaucet(session: Session, amount: bigint, cooldownMs: number): Promise<{ success: boolean; error?: string }> {
  const now = Date.now();
  const lastClaim = session.lastFaucetAt ?? 0;
  if (now - lastClaim < cooldownMs) {
    const seconds = Math.ceil((cooldownMs - (now - lastClaim)) / 1000);
    return { success: false, error: `Faucet cooling down. Try again in ${seconds}s.` };
  }

  const ok = await this.depositChips(session, amount);
  if (ok) {
    session.lastFaucetAt = now;
    return { success: true };
  }

  return { success: false, error: 'Faucet claim rejected' };
}
```

Why this matters:
- Prevents spamming the faucet endpoint and improves UX by giving immediate feedback.

What this code does:
- Enforces a local cooldown, then submits a deposit if allowed.

---

### 11) Session lookup helpers
```ts
getSession(ws: WebSocket): Session | undefined {
  return this.sessions.get(ws);
}

getSessionByPublicKey(publicKey: Uint8Array): Session | undefined {
  const hex = Buffer.from(publicKey).toString('hex');
  return this.byPublicKey.get(hex);
}

getSessionByPublicKeyHex(publicKeyHex: string): Session | undefined {
  return this.byPublicKey.get(publicKeyHex);
}
```

Why this matters:
- These helpers make it easy to find the session for a given socket or key.

What this code does:
- Looks up sessions in the internal maps.

---

### 12) Destroy session
```ts
destroySession(ws: WebSocket): Session | undefined {
  const session = this.sessions.get(ws);
  if (session) {
    if (session.balanceRefreshIntervalId) {
      clearInterval(session.balanceRefreshIntervalId);
    }
    if (session.updatesClient) {
      session.updatesClient.disconnect();
    }
    if (session.sessionUpdatesClient) {
      session.sessionUpdatesClient.disconnect();
    }
    this.byPublicKey.delete(session.publicKeyHex);
    this.sessions.delete(ws);
    logDebug(`Session destroyed: ${session.playerName}`);
  }
  return session;
}
```

Why this matters:
- Without cleanup, you leak memory and WebSocket connections.

What this code does:
- Stops timers, disconnects update streams, and removes the session from maps.

---

### 13) Touch/start/end game helpers
```ts
touchSession(session: Session): void {
  session.lastActivityAt = Date.now();
}

startGame(session: Session, gameType: GameType): bigint {
  const gameId = generateSessionId(session.publicKey, session.gameSessionCounter++);
  session.activeGameId = gameId;
  session.gameType = gameType;
  session.lastActivityAt = Date.now();
  return gameId;
}

endGame(session: Session): void {
  session.activeGameId = null;
  session.gameType = null;
  session.lastActivityAt = Date.now();
}
```

Why this matters:
- These are lightweight helpers used by handlers to keep session state consistent.

What this code does:
- Updates activity timestamp and stores the current game session ID.

---

### 14) Accessors and metrics
```ts
getNonceManager(): NonceManager { return this.nonceManager; }
getSubmitClient(): SubmitClient { return this.submitClient; }
getAllSessions(): Session[] { return Array.from(this.sessions.values()); }
getSessionCount(): number { return this.sessions.size; }
getBackendUrl(): string { return this.backendUrl; }
```

Why this matters:
- Exposes internal components for other parts of the gateway and for diagnostics.

What this code does:
- Returns references or counts from internal state.

---

### 15) Cleanup idle sessions
```ts
cleanupIdleSessions(maxIdleMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [ws, session] of this.sessions.entries()) {
    if (now - session.lastActivityAt > maxIdleMs) {
      this.destroySession(ws);
      try {
        ws.close(1000, 'Session timeout');
      } catch {
        // Ignore close errors
      }
      cleaned++;
    }
  }

  return cleaned;
}
```

Why this matters:
- Prevents zombie sessions from consuming memory forever.

What this code does:
- Closes and removes sessions that have been idle too long.

---

## Extended deep dive: session state as a protocol boundary

The SessionManager is not just a storage map. It is a state machine that ensures every player transitions through a safe, consistent lifecycle. Below are the concepts that are easy to miss if you only read the code.

### 16) The session object is the in-memory truth

Each `Session` contains:

- the WebSocket,
- the keypair,
- registration status,
- balance cache,
- active game ID and type,
- timestamps for activity and faucet usage,
- optional updates clients.

This is the gateway's working memory. When you respond to a client or build a transaction, you are always using this session as the source of truth.

That is why the SessionManager does *not* store partial objects or references; it stores full `Session` objects. It can answer questions like:

- "Is this player registered?"
- "Does this player have balance?"
- "Which game is currently active?"

If this state gets out of sync, the user experience breaks. That is why the session layer is so strict about initialization and cleanup.

### 17) Two maps, two lookup paths

The manager keeps:

- `sessions: Map<WebSocket, Session>`
- `byPublicKey: Map<string, Session>`

Why two maps?

Because in some code paths you start from the socket (incoming WebSocket message), and in other code paths you start from a public key (updates events or transaction results).

If you only had one map, you would be forced to scan the entire set for each lookup. That would be slow and error-prone.

So the SessionManager uses two indexes. This is a common pattern: one map for the "primary key" (socket) and one for the "foreign key" (public key).

### 18) Initialization is a handshake, not just object creation

`createSession` does three critical things beyond allocation:

1) **Rate limiting**: Prevents a single IP from creating unlimited sessions.
2) **Key generation**: Creates a new Ed25519 keypair for the session.
3) **On-chain registration**: Ensures the session can actually submit transactions.

This means `createSession` is not just "new Session"; it is a full handshake. If registration fails, the session still exists, but the client cannot play.

That is a deliberate choice. It allows the gateway to recover and retry without dropping the connection immediately.

### 19) Updates first, then register: the race condition story

The code explicitly connects to the updates stream before submitting the registration transaction.

Why?

Because transactions are confirmed by events over the updates stream. If you submit first and connect second, you can miss the confirmation event. That would leave the gateway thinking the player is unregistered even though the chain accepted the registration.

This is the "race" in distributed systems: the event might arrive before the subscription is active.

So the SessionManager always subscribes first, then submits.

### 20) Nonce locking as a concurrency control mechanism

Both `registerPlayer` and `depositChips` wrap their logic in `nonceManager.withLock(...)`.

This is critical. It prevents two concurrent calls from using the same nonce. Without the lock, two transactions could be built with the same nonce, causing one to be rejected by the backend.

The nonce lock is effectively a per-account mutex. It serializes transaction submission for a given account.

### 21) Retry logic and backend sync

If a transaction is rejected and the error suggests a nonce mismatch, the session manager:

1) syncs the current nonce from the backend, and
2) retries once.

This is a controlled, minimal retry strategy. It avoids infinite loops while still handling the common case where local nonce state drifted.

It is also a good example of dividing responsibility:

- SubmitClient reports the error.
- NonceManager interprets it.
- SessionManager decides whether to retry.

That separation makes the system easier to evolve without creating circular dependencies.

### 22) Faucet requests are a local UX guard

The faucet cooldown is enforced locally at the gateway. This does not replace on-chain rules; it simply protects the backend from trivial spamming and gives users quick feedback.

If the backend rejects the faucet anyway (for example, because the on-chain cooldown is stricter), the gateway will still report failure.

So think of this as a "first line of defense," not the ultimate authority.

### 23) Balance refresh: best-effort, not a guarantee

`refreshBalance` and `startBalanceRefresh` are explicitly best-effort. If the backend is down, they return `null` or log a warning.

This is important. You do not want the entire gateway to crash just because the balance endpoint is temporarily unavailable. A stale balance is better than no gateway at all.

### 24) Start and end game as state transitions

The `startGame` and `endGame` helpers are the bridge between:

- *stateless* requests (incoming WebSocket messages), and
- *stateful* protocol flows (active game sessions).

When a game starts, `startGame`:

- generates a deterministic session ID,
- records the game type,
- updates activity timestamps.

When a game ends, `endGame` clears those fields.

This means you can always ask "is the player in a game?" and get a reliable answer.

### 25) Idle cleanup and resource hygiene

Idle sessions are cleaned up by scanning `sessions` and calling `destroySession`. This does three things:

- disconnects updates streams,
- stops balance refresh timers,
- removes references from both maps.

If you omit any of those, you leak resources. The cleanup function is the final safety net to prevent that.

### 26) Feynman analogy: the session as a passport

Imagine a session as a passport issued at the border:

- It has a unique ID (session UUID).
- It contains identity (public key).
- It has stamps (registered, balance).
- It expires if unused for too long.

The SessionManager is the border control office. It issues passports, verifies them, and invalidates them when they expire.

That analogy captures the role of the session manager: it is the gateway's identity authority.

---

## Key takeaways
- SessionManager is the **wallet + session registry** for the gateway.
- Nonce control and update subscriptions are the core reliability features.
- Cleanup and limits protect the gateway from abuse and leaks.

## Next lesson
L03 - Instruction encoding (binary formats): `feynman/lessons/L03-instructions-encoding.md`
