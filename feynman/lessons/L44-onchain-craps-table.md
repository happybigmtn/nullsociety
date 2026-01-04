# L44 - OnchainCrapsTable (global table orchestration) (from scratch)

Focus file: `gateway/src/live-table/craps.ts`

Goal: explain how the gateway orchestrates the on-chain global table for live craps. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) On-chain global table
Instead of each player running an individual session, the global table creates a shared round on chain. Admin transactions open, lock, reveal, and finalize each round.

### 2) Updates client
The gateway subscribes to on-chain events through the updates service, then pushes those updates to connected players.

### 3) Nonce management for admin txs
Admin instructions must be signed and submitted in order. The gateway uses a nonce manager to handle retries and resyncs.

---

## Limits & management callouts (important)

1) **Global table can be disabled**
- `GATEWAY_LIVE_TABLE_CRAPS` toggles the table (default on in production).
- If disabled, clients will receive `LIVE_TABLE_DISABLED`.

2) **Fanout throttling is configurable**
- `GATEWAY_LIVE_TABLE_BROADCAST_MS` and `GATEWAY_LIVE_TABLE_BROADCAST_BATCH` control update cadence and batch sizes.
- Too low wastes bandwidth; too high makes countdowns feel laggy.

3) **Global presence aggregation is opt-in**
- `GATEWAY_INSTANCE_ID` identifies each gateway for global player counts.
- `GATEWAY_LIVE_TABLE_PRESENCE_UPDATE_MS` controls update cadence to the simulator.

4) **Bet and timing limits are env-configured**
- `GATEWAY_LIVE_TABLE_MIN_BET`, `MAX_BET`, `MAX_BETS_PER_ROUND`.
- Timing windows: `BETTING_MS`, `LOCK_MS`, `PAYOUT_MS`, `COOLDOWN_MS`.
- Misconfiguration will break UX or economics.

5) **Bot configuration is explicit**
- `GATEWAY_LIVE_TABLE_BOT_*` controls bot count, participation, and bet sizing.
- Production default is zero; require explicit opt-in.

6) **Admin key handling in prod**
- Production requires a key file unless `GATEWAY_LIVE_TABLE_ALLOW_ADMIN_ENV=1`.
- This is important for security.

7) **Retry throttling**
- `GATEWAY_LIVE_TABLE_ADMIN_RETRY_MS` limits how often admin actions are retried.
- Too low can spam the chain; too high can stall rounds.

---

## Walkthrough with code excerpts

### 1) Starting the on-chain table
```rust
configure(deps: LiveTableDependencies): void {
  this.deps = deps;
  if (this.enabled) {
    void this.ensureStarted().catch((err) => {
      console.error('[GlobalTable] Failed to start on-chain table:', err);
    });
  }
}

private async ensureStarted(): Promise<void> {
  if (this.started) return;
  if (this.startPromise) {
    await this.startPromise;
    return;
  }
  if (!this.deps) {
    throw new Error('Live table dependencies not configured');
  }

  this.startPromise = (async () => {
    const admin = this.buildAdminSigner();
    if (!admin) {
      throw new Error('Missing admin key');
    }
    this.admin = admin;

    await this.deps!.nonceManager.syncFromBackend(admin.publicKeyHex, this.deps!.backendUrl)
      .catch(() => undefined);

    await this.connectUpdates();
    await this.initGlobalTable();
    await this.attemptOpenRound();
    this.ensureBots();
    void this.registerBots();

    if (!this.ticker) {
      this.ticker = setInterval(() => {
        void this.tick();
      }, CONFIG.tickMs);
    }

    this.started = true;
  })();

  try {
    await this.startPromise;
  } finally {
    this.startPromise = null;
  }
}
```

Why this matters:
- This bootstraps the global table and starts the round machine.

What this code does:
- Stores dependencies and ensures the table starts only once.
- Builds the admin signer and syncs nonce state.
- Connects to updates, initializes the table, and opens the first round.
- Starts the ticking loop that drives phases.

---

### 2) Loading the admin key safely
```rust
private buildAdminSigner(): SignerState | null {
  if (this.admin) return this.admin;
  const envKeyRaw = (process.env.GATEWAY_LIVE_TABLE_ADMIN_KEY
    ?? process.env.CASINO_ADMIN_PRIVATE_KEY_HEX
    ?? '').trim();
  if (envKeyRaw && !ALLOW_ADMIN_KEY_ENV) {
    throw new Error(
      'Global table admin key env vars are disabled in production. Use GATEWAY_LIVE_TABLE_ADMIN_KEY_FILE or set GATEWAY_LIVE_TABLE_ALLOW_ADMIN_ENV=1.',
    );
  }

  let key: Uint8Array | null = null;
  if (ADMIN_KEY_FILE) {
    try {
      const raw = readFileSync(ADMIN_KEY_FILE, 'utf8').trim();
      key = parseHexKey(raw) ?? null;
    } catch {
      key = null;
    }
  }
  if (!key && ALLOW_ADMIN_KEY_ENV) {
    key = parseHexKey(envKeyRaw);
  }

  if (!key) return null;

  const publicKey = ed25519.getPublicKey(key);
  const publicKeyHex = Buffer.from(publicKey).toString('hex');
  this.admin = { privateKey: key, publicKey, publicKeyHex };
  return this.admin;
}
```

Why this matters:
- The admin key is required to open/lock/reveal rounds on chain.

What this code does:
- Loads the admin key from file (preferred) or env (if allowed).
- Derives the public key and caches the signer for later use.

---

### 3) Placing bets on the global table
```rust
async placeBets(session: Session, bets: LiveCrapsBetInput[]): Promise<HandleResult> {
  if (!this.enabled) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_MESSAGE, 'LIVE_TABLE_DISABLED'),
    };
  }

  if (!this.sessions.has(session.id)) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_MESSAGE, 'NOT_SUBSCRIBED'),
    };
  }

  if (!session.registered) {
    return {
      success: false,
      error: createError(ErrorCodes.NOT_REGISTERED, 'Player not registered'),
    };
  }

  try {
    await this.ensureStarted();
  } catch (err) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_MESSAGE, 'LIVE_TABLE_UNAVAILABLE'),
    };
  }

  if (this.roundId === 0n) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_MESSAGE, 'LIVE_TABLE_NOT_READY'),
    };
  }

  let normalized: { betType: number; target: number; amount: bigint }[] = [];
  try {
    normalized = this.normalizeBets(bets);
  } catch (err) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_BET, err instanceof Error ? err.message : 'Invalid bet'),
    };
  }

  if (normalized.length === 0) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_BET, 'No bets submitted'),
    };
  }

  if (normalized.length > CONFIG.maxBetsPerRound) {
    return {
      success: false,
      error: createError(ErrorCodes.INVALID_BET, 'Too many bets submitted'),
    };
  }

  const instruction = encodeGlobalTableSubmitBets(
    GameType.Craps,
    this.roundId,
    normalized
  );

  const accepted = await this.submitInstruction(session, instruction);
  if (!accepted) {
    return {
      success: false,
      error: createError(ErrorCodes.TRANSACTION_REJECTED, 'Bet submission rejected'),
    };
  }

  this.sendConfirmation(session.publicKeyHex, 'pending', 'Awaiting on-chain confirmation', session.balance, this.roundId);
  return { success: true };
}
```

Why this matters:
- This function is where player bets become on-chain global table instructions.

What this code does:
- Validates session membership, registration, and round availability.
- Normalizes bets and enforces max bet count.
- Encodes a global table submission instruction and submits it on chain.
- Sends a pending confirmation back to the player.

---

### 4) Opening and advancing rounds
```rust
private async attemptOpenRound(): Promise<void> {
  if (!this.admin || !this.shouldAttempt('open')) return;
  if (this.pendingSettlements.size > 0 || this.settleInFlight.size > 0) {
    return;
  }
  const instruction = encodeGlobalTableOpenRound(GameType.Craps);
  await this.submitInstruction(this.admin, instruction);
}

private async attemptLockRound(): Promise<void> {
  if (!this.admin || !this.shouldAttempt('lock')) return;
  if (this.roundId === 0n) return;
  const instruction = encodeGlobalTableLock(GameType.Craps, this.roundId);
  await this.submitInstruction(this.admin, instruction);
}
```

Why this matters:
- These admin actions drive the global table lifecycle on chain.

What this code does:
- Submits admin instructions to open or lock the round.
- Uses retry throttling to avoid spamming the chain.

---

### 5) Handling on-chain events
```rust
private handleGlobalTableEvent = (event: GlobalTableEvent): void => {
  switch (event.type) {
    case 'round_opened': {
      this.applyRoundUpdate(event.round);
      this.botQueue = this.bots.map((bot) => bot.publicKeyHex);
      this.requestBroadcast(true);
      break;
    }
    case 'outcome': {
      this.applyRoundUpdate(event.round);
      this.pendingSettlements = new Set(this.activePlayers);
      this.settleInFlight.clear();
      this.requestBroadcast(true);
      break;
    }
    case 'bet_accepted': {
      const playerHex = Buffer.from(event.player).toString('hex');
      if (this.roundId !== event.roundId) {
        this.roundId = event.roundId;
        if (this.phase !== 'betting') {
          this.setPhase('betting', CONFIG.bettingMs);
        }
      }
      this.activePlayers.add(playerHex);
      this.addBetsToMap(this.playerBets, playerHex, event.bets);
      this.addBetsToTotals(event.bets);
      if (event.balanceSnapshot?.chips !== undefined) {
        this.updateSessionsBalance(playerHex, event.balanceSnapshot.chips);
      }
      this.sendConfirmation(
        playerHex,
        'confirmed',
        'On-chain bet accepted',
        event.balanceSnapshot?.chips,
        event.roundId,
      );
      this.requestBroadcast(true);
      break;
    }
    default:
      break;
  }
};
```

Why this matters:
- The on-chain events are the source of truth for table state and player balances.

What this code does:
- Updates round state and phase from on-chain events.
- Tracks active players and their bets.
- Broadcasts state and confirmations back to clients.

---

### 6) Submitting instructions with nonce management
```rust
private async submitInstruction(signer: SignerState, instruction: Uint8Array): Promise<boolean> {
  if (!this.deps) return false;
  const { submitClient, nonceManager, backendUrl } = this.deps;

  return nonceManager.withLock(signer.publicKeyHex, async (nonce) => {
    const tx = buildTransaction(nonce, instruction, signer.privateKey);
    const submission = wrapSubmission(tx);
    const result = await submitClient.submit(submission);

    if (result.accepted) {
      nonceManager.setCurrentNonce(signer.publicKeyHex, nonce + 1n);
      return true;
    }

    if (result.error && nonceManager.handleRejection(signer.publicKeyHex, result.error)) {
      const synced = await nonceManager.syncFromBackend(signer.publicKeyHex, backendUrl);
      if (synced) {
        const retryNonce = nonceManager.getCurrentNonce(signer.publicKeyHex);
        const retryTx = buildTransaction(retryNonce, instruction, signer.privateKey);
        const retrySubmission = wrapSubmission(retryTx);
        const retryResult = await submitClient.submit(retrySubmission);
        if (retryResult.accepted) {
          nonceManager.setCurrentNonce(signer.publicKeyHex, retryNonce + 1n);
          return true;
        }
      }
    }

    return false;
  });
}
```

Why this matters:
- Admin and player instructions must use correct nonces or they will be rejected.

Syntax notes:
- `withLock` serializes nonce usage per public key.
- The retry path resyncs from the backend if a rejection suggests nonce drift.

What this code does:
- Builds and submits a signed transaction.
- Updates the local nonce on success.
- Attempts a resync and retry if a rejection indicates a nonce mismatch.

---

## Extended deep dive: the global table as a distributed state machine

The OnchainCrapsTable is a gateway‑side coordinator that drives a *shared* on‑chain game. This is different from normal sessions: instead of one player’s session state, the table maintains a global round state and fans out updates to many players.

This section walks through the major components of the file and explains how they fit together.

---

### 7) Configuration is behavior

The top of `gateway/src/live-table/craps.ts` reads a large set of environment variables into a `CONFIG` object. These values are not cosmetic. They define core game behavior:

- Round timing windows (betting, lock, payout, cooldown).
- Bet limits and maximum bets per round.
- Fanout batch sizes and broadcast cadence.
- Bot behavior and participation rate.
- Admin retry throttles.

The live table is effectively driven by this config. Misconfiguration can create unfair rounds, spam the chain, or stall the game entirely. This is why the lesson highlights configuration so heavily.

---

### 8) Admin key enforcement and production safety

The global table requires admin instructions (open round, lock, reveal, finalize). Those instructions are signed with an admin key. The code enforces stricter rules in production:

- If `GATEWAY_LIVE_TABLE_ALLOW_ADMIN_ENV` is false and no key file is provided, it throws on startup.
- This prevents accidental use of environment variables for admin keys in production.

This is a security boundary. It ensures that production deployment must be configured with a secure key file or explicit override.

---

### 9) LiveTableDependencies: coupling to other services

The table depends on:

- `SubmitClient` for sending transactions.
- `NonceManager` for per‑key nonce tracking.
- `UpdatesClient` for on‑chain event streams.

These are injected via `configure()`. This makes the table testable and allows the gateway to wire it up with real network clients.

---

### 10) Session tracking and membership

The table keeps:

- `sessions`: map of sessionId → Session object.
- `sessionsByKey`: map of publicKeyHex → set of session IDs.

This allows the table to track multiple sessions per public key (e.g., multiple devices). It also supports efficient fanout updates to all sessions for a given player.

The join/leave handlers simply add/remove sessions from these maps. This is the membership layer of the global table.

---

### 11) UpdatesClient and event-driven state

The table subscribes to on‑chain events via `UpdatesClient`. Events are the authoritative source of truth for:

- round state (open, outcome, finalized),
- bet acceptance,
- balance updates.

When an event arrives, `handleGlobalTableEvent` updates local state and triggers broadcasts. This means the table is **reactive**: it does not guess outcomes; it waits for on‑chain confirmation.

---

### 12) Round lifecycle

The table drives a round lifecycle with phases:

- betting
- locked
- rolling
- payout
- cooldown

These phases map to on‑chain global table phases. The table uses a ticker to drive time‑based transitions, but it always reconciles against on‑chain events to remain correct.

Admin actions (open, lock, reveal, finalize) are submitted when the ticker decides they are due. If the chain is behind or events are delayed, the table adapts based on event confirmations.

---

### 13) The “tick” loop

A periodic timer calls `tick()` every `CONFIG.tickMs`. The tick loop:

- advances phases when timers expire,
- submits admin instructions if needed,
- handles settlement batching,
- triggers broadcasts.

The loop is designed to be idempotent: if a tick runs late or multiple ticks overlap, it should not corrupt state. The `tickRunning` flag prevents overlapping ticks.

---

### 14) Betting normalization and encoding

Bets arrive as human‑friendly objects. The table normalizes them into the strict on‑chain format:

- bet type → numeric code (via `encodeCrapsBet`)
- target → validated numeric target
- amount → BigInt

Normalization enforces min/max bet limits and bet count limits. It also validates allowed targets (YES/NO, NEXT, HARDWAY). This is a key safety layer before bets are sent on chain.

---

### 15) Global bet aggregation

The table tracks:

- `playerBets`: per-player bet map
- `totals`: aggregated bet totals

These maps are used to broadcast a table view to all players (current totals, their own bets). The table does *not* trust client state; it rebuilds from on‑chain confirmations.

---

### 16) Pending settlements and batching

After an outcome event, the table sets `pendingSettlements` to all active players. It then settles bets in batches (`CONFIG.settleBatchSize`) by submitting settle instructions for each player’s bet set.

Batching prevents spamming the chain with too many settle transactions at once. It also allows the table to make progress even if some settlements fail temporarily.

---

### 17) Nonce management and retry logic

The table uses `NonceManager.withLock` to serialize nonce usage per signer. If a transaction is rejected with a nonce error, it resyncs from the backend and retries once.

This is the same retry pattern used in other gateway components. It is essential because admin operations and player submissions both require correct nonces.

---

### 18) Bots as liquidity and activity

The table can spawn bots in non‑production environments. Bots:

- generate random keys,
- register as players,
- place bets with controlled sizes and frequencies.

Bots provide activity for testing and demos. They are disabled by default in production. The configuration controls how many bots participate and how aggressive they are.

---

### 19) Presence and global player count

The table can publish player presence to a simulator endpoint using `GATEWAY_INSTANCE_ID` and `GATEWAY_LIVE_TABLE_PRESENCE_TOKEN`. This aggregates player counts across gateway instances and enables a global “players online” display.

Presence updates are throttled (`presenceUpdateMs`) to avoid spamming the simulator.

---

### 20) Fanout broadcasting

Broadcasts are throttled and batched. The table queues broadcasts and sends them at most every `broadcastIntervalMs`. This prevents WebSocket floods while still keeping the UI responsive.

The broadcast batching is critical when many players are connected. Without it, each on‑chain event could trigger thousands of immediate updates.

---

### 21) Error handling and availability

If the table fails to start (missing admin key, updates connection failure), it returns `LIVE_TABLE_UNAVAILABLE` to users. This is better than silently failing. It tells the client to fall back to normal play or show a clear error.

---

### 22) Security boundary recap

The global table is a privileged component because it holds the admin key and submits admin instructions. That means:

- It must run in a trusted environment.
- Its configuration must be protected.
- Its logs should be monitored for unusual activity.

Treat it as infrastructure, not just a feature.

---

### 23) Feynman analogy: a casino pit boss

The OnchainCrapsTable is like a pit boss in a casino:

- It opens and closes betting rounds.
- It enforces table limits.
- It confirms bets and pays out winnings.
- It updates all players about the current state of the table.

The pit boss doesn’t roll the dice (the chain does), but it coordinates everything around the roll.

---

### 24) Exercises for mastery

1) Describe the sequence of admin instructions in a single round (open → lock → reveal → finalize).
2) Explain how the table prevents double submissions when admin retries are needed.
3) Describe how player bet submissions are validated before on‑chain encoding.
4) Explain why fanout throttling is necessary.

If you can answer these, you understand the global table orchestrator deeply.


## Addendum: deeper mechanics and edge cases

### 25) Bet type mapping and UI friendliness

The table maps numeric bet types back to human‑readable strings using `betTypeToView`. This is used for broadcasting state to clients. If a bet type is unknown, it falls back to `BET_<id>`. This ensures the UI can still display something even if new bet types are introduced before the UI is updated.

This is a forward‑compatibility pattern: degrade gracefully instead of crashing.

---

### 26) Phase mapping from on‑chain values

The table converts numeric phases into strings (`betting`, `locked`, `rolling`, `payout`, `cooldown`). This mapping must match the on‑chain enum values. If the on‑chain phase codes change, this mapping must be updated to avoid mis‑labeling phases.

This is a subtle dependency between gateway and execution code. It should be treated like an API contract.

---

### 27) Dice and point handling

The table tracks `point` and `dice` values when present in events. These values are part of the craps game state and are broadcast to clients. The table does not compute them; it only reflects on‑chain outcomes. This preserves fairness: all outcomes come from the chain.

---

### 28) Round ID zero sentinel

`roundId === 0n` is treated as “not ready.” This sentinel prevents bets before the first round is opened. It is an important guard to avoid submitting bets to a non‑existent round.

---

### 29) Admin retry throttling

The `shouldAttempt`/`lastAdminAttempt` logic ensures admin instructions are not spammed. This prevents the gateway from hammering the chain during network failures. The retry delay is configurable via `GATEWAY_LIVE_TABLE_ADMIN_RETRY_MS`.

---

### 30) Boot sequence ordering

The start sequence is deliberate:

1) Build admin signer.
2) Sync nonce from backend.
3) Connect updates.
4) Initialize global table config.
5) Attempt to open first round.
6) Spawn bots.
7) Start ticker.

If you change this order, you risk sending admin instructions before the table is configured or before nonce state is synced. The order is a correctness requirement, not just style.

---

### 31) Final recap

The OnchainCrapsTable is a mini distributed system inside the gateway. It coordinates time, state, admin actions, player submissions, and broadcasting, all while remaining consistent with on‑chain truth.


### 32) Tiny epilogue

Global tables feel simple to players, but behind the scenes they are a careful choreography of timing, nonce management, and event‑driven state. Keeping that choreography stable is the core maintenance task for this component.


### 33) Final word

Treat the table coordinator like infrastructure: configure, monitor, and test it as rigorously as consensus.


### 34) Epilogue

Shared tables are deceptively hard; this file makes them possible.

One operational habit that pays off: bind alerts to every phase transition. If you can page on “betting opened but never locked” or “payout never finalized,” you catch stalls before players notice.


## Key takeaways
- OnchainCrapsTable orchestrates global rounds through admin instructions.
- It listens to on-chain events to update client state.
- Nonce management and retries are essential for reliability.

## Next lesson
L45 - Global table handlers (on-chain): `feynman/lessons/L45-global-table-handlers.md`
