# Mobile Gateway for Full-Stack Testing

## Review Summary (2025-12-27)

**Reviewers**: DHH-style, Kieran-style, Simplicity

### Critical Fixes Applied:
1. ✅ **Submission wrapper**: Changed from tag 0 to tag 1 (Submission::Transactions, not Submission::Seed)
2. ✅ **TRANSACTION_NAMESPACE**: Added `b"_NULLSPACE_TX"` for Ed25519 signing (not base NAMESPACE)
3. ✅ **CasinoRegister/CasinoDeposit**: Added player registration and chip deposit flow
4. ✅ **Session ID collision**: Fixed `Date.now()` to use hash of `publicKey + counter`
5. ✅ **Error taxonomy**: Added structured error codes for client/backend/session errors
6. ✅ **Nonce recovery**: Added sync-from-backend and pending transaction tracking

### DHH Review Notes:
- Suggested using existing WASM directly in React Native instead of gateway
- Valid alternative if WASM-in-RN works; gateway provides faster iteration for testing

### Kieran Review Notes:
- All critical protocol bugs now fixed in plan
- Vec encoding for Submission::Transactions uses u32 BE length prefix

---

## Overview

Build a TypeScript WebSocket gateway server that bridges the mobile app's JSON protocol to the Rust backend's binary protocol, enabling true on-chain game execution for mobile testing at scale.

**Goal**: Zero simulation - all game logic executed on-chain with real consensus and deterministic RNG.

## Problem Statement

The mobile app (`/mobile`) uses a simple JSON WebSocket protocol, while the Rust backend (`/simulator`) uses binary-encoded transactions via `commonware_codec`. This protocol mismatch prevents mobile clients from interacting with the real on-chain casino games.

| Component | Protocol | Format |
|-----------|----------|--------|
| Mobile App | JSON WebSocket | `{ type: 'blackjack_deal', amount: 100 }` |
| Rust Backend | Binary HTTP + WebSocket | `[nonce:u64][instruction][pubkey:32][sig:64]` |

## Proposed Solution

A TypeScript gateway server that:
1. Accepts JSON WebSocket connections from mobile clients
2. Translates JSON → binary transactions
3. Signs with Ed25519 using `@noble/curves`
4. Submits to `/submit` endpoint
5. Subscribes to `/updates/:filter` for events
6. Translates binary events → JSON for mobile

```
┌─────────────────┐    JSON WS     ┌─────────────────┐   Binary HTTP   ┌─────────────────┐
│   Mobile App    │ ◄───────────► │     Gateway     │ ◄─────────────► │    Simulator    │
│ (React Native)  │               │  (TypeScript)   │   Binary WS     │     (Rust)      │
└─────────────────┘               └─────────────────┘ ◄─────────────► └─────────────────┘
```

## Critical Protocol Details

### NAMESPACE and Signing

Transaction signatures use `TRANSACTION_NAMESPACE = b"_NULLSPACE_TX"` (NOT the base `NAMESPACE`).

```typescript
// gateway/src/codec/constants.ts
export const TRANSACTION_NAMESPACE = new TextEncoder().encode('_NULLSPACE_TX');
```

The signature covers: `TRANSACTION_NAMESPACE + payload` where `payload = nonce (8 bytes BE) + instruction bytes`.

### Submission Wrapper Format

**CRITICAL**: The `/submit` endpoint expects `Submission::Transactions` which is:
- Tag `1` (NOT tag 0 - that's for Seed)
- Followed by a Vec<Transaction> with length prefix

```typescript
// Correct encoding for Submission::Transactions
function wrapSubmission(tx: Uint8Array): Uint8Array {
  // Tag 1 = Transactions variant
  // Vec encoding: length as compact u32 (for single tx, length = 1)
  // Then the transaction bytes
  const result = new Uint8Array(1 + 4 + tx.length);
  result[0] = 1;  // tag 1 = Transactions
  // Vec length = 1 (single transaction)
  new DataView(result.buffer).setUint32(1, 1, false);  // BE u32
  result.set(tx, 5);
  return result;
}
```

### Session ID Generation

Session IDs must be unique per-player. Using `Date.now()` alone causes collisions.

```typescript
// Unique session ID: hash of publicKey + timestamp + counter
function generateSessionId(publicKey: Uint8Array, counter: bigint): bigint {
  const data = new Uint8Array(32 + 8 + 8);
  data.set(publicKey, 0);
  new DataView(data.buffer).setBigUint64(32, BigInt(Date.now()), false);
  new DataView(data.buffer).setBigUint64(40, counter, false);
  // Use first 8 bytes of hash
  const hash = sha256(data);
  return new DataView(hash.buffer).getBigUint64(0, false);
}
```

### Error Code Taxonomy

```typescript
// gateway/src/types/errors.ts
export const ErrorCodes = {
  // Client errors (4xx equivalent)
  INVALID_MESSAGE: 'INVALID_MESSAGE',         // Malformed JSON or unknown type
  INVALID_GAME_TYPE: 'INVALID_GAME_TYPE',     // Unknown game type
  INVALID_BET: 'INVALID_BET',                 // Bet amount out of range
  NO_ACTIVE_GAME: 'NO_ACTIVE_GAME',           // Move without active game
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE', // Not enough chips
  NOT_REGISTERED: 'NOT_REGISTERED',           // Player not registered

  // Backend errors (5xx equivalent)
  BACKEND_UNAVAILABLE: 'BACKEND_UNAVAILABLE', // Can't reach simulator
  TRANSACTION_REJECTED: 'TRANSACTION_REJECTED', // Backend rejected tx
  NONCE_MISMATCH: 'NONCE_MISMATCH',           // Nonce out of sync

  // Session errors
  SESSION_EXPIRED: 'SESSION_EXPIRED',         // Session timed out
  GAME_IN_PROGRESS: 'GAME_IN_PROGRESS',       // Can't start new game
} as const;
```

## Technical Approach

### Architecture

```
gateway/
├── src/
│   ├── index.ts                 # Entry point, HTTP/WS server
│   ├── codec/
│   │   ├── instructions.ts      # Binary instruction encoders
│   │   ├── transactions.ts      # Transaction builder + signer
│   │   ├── events.ts            # Binary event decoders
│   │   └── filters.ts           # UpdatesFilter encoder
│   ├── handlers/
│   │   ├── blackjack.ts         # Blackjack message handler
│   │   ├── hilo.ts              # Hi-Lo message handler
│   │   ├── roulette.ts          # Roulette message handler
│   │   └── ... (10 games)
│   ├── session/
│   │   ├── manager.ts           # Session lifecycle
│   │   ├── nonce.ts             # Nonce management
│   │   └── keys.ts              # Ed25519 key management
│   ├── backend/
│   │   ├── http.ts              # /submit client
│   │   ├── websocket.ts         # /updates subscriber
│   │   └── pool.ts              # Connection pooling
│   └── types/
│       ├── mobile.ts            # JSON message types
│       └── backend.ts           # Binary event types
├── tests/
│   ├── codec.test.ts
│   ├── integration.test.ts
│   └── load.test.ts
└── package.json
```

### Implementation Phases

#### Phase 1: Binary Codec (Foundation)

**Goal**: Encode/decode transactions compatible with `commonware_codec`

**Tasks:**

- [ ] **`gateway/src/codec/instructions.ts`** - Instruction encoders
  ```typescript
  // CasinoRegister = tag 10
  // [tag:u8][nameLen:u32 BE][nameBytes...]
  export function encodeCasinoRegister(name: string): Uint8Array {
    const nameBytes = new TextEncoder().encode(name);
    const result = new Uint8Array(1 + 4 + nameBytes.length);
    result[0] = 10;  // tag
    new DataView(result.buffer).setUint32(1, nameBytes.length, false);
    result.set(nameBytes, 5);
    return result;
  }

  // CasinoDeposit = tag 11 (for testing/faucet)
  // [tag:u8][amount:u64 BE]
  export function encodeCasinoDeposit(amount: bigint): Uint8Array {
    const result = new Uint8Array(9);
    result[0] = 11;  // tag
    new DataView(result.buffer).setBigUint64(1, amount, false);
    return result;
  }

  // CasinoStartGame = tag 12
  // [tag:u8][gameType:u8][bet:u64 BE][sessionId:u64 BE]
  export function encodeCasinoStartGame(
    gameType: GameType,
    bet: bigint,
    sessionId: bigint
  ): Uint8Array

  // CasinoGameMove = tag 13
  // [tag:u8][sessionId:u64 BE][payloadLen:u32 BE][payload...]
  export function encodeCasinoGameMove(
    sessionId: bigint,
    payload: Uint8Array
  ): Uint8Array

  // CasinoPlayerAction = tag 14
  // [tag:u8][action:u8]
  export function encodeCasinoPlayerAction(
    action: PlayerAction
  ): Uint8Array
  ```

- [ ] **`gateway/src/codec/transactions.ts`** - Transaction builder
  ```typescript
  import { ed25519 } from '@noble/curves/ed25519';
  import { TRANSACTION_NAMESPACE } from './constants';

  // Transaction = [nonce:u64 BE][instruction][pubkey:32][signature:64]
  // Signature signs: TRANSACTION_NAMESPACE + nonce + instruction
  export function buildTransaction(
    nonce: bigint,
    instruction: Uint8Array,
    privateKey: Uint8Array
  ): Uint8Array {
    const publicKey = ed25519.getPublicKey(privateKey);

    // Build payload for signing: nonce + instruction
    const payload = new Uint8Array(8 + instruction.length);
    new DataView(payload.buffer).setBigUint64(0, nonce, false);
    payload.set(instruction, 8);

    // Sign with namespace prefix: TRANSACTION_NAMESPACE + payload
    const toSign = new Uint8Array(TRANSACTION_NAMESPACE.length + payload.length);
    toSign.set(TRANSACTION_NAMESPACE, 0);
    toSign.set(payload, TRANSACTION_NAMESPACE.length);
    const signature = ed25519.sign(toSign, privateKey);

    // Build transaction: nonce + instruction + pubkey + signature
    const tx = new Uint8Array(8 + instruction.length + 32 + 64);
    tx.set(payload, 0);  // nonce + instruction
    tx.set(publicKey, 8 + instruction.length);
    tx.set(signature, 8 + instruction.length + 32);
    return tx;
  }

  // Submission wrapper (tag 1 for Transactions, NOT tag 0)
  export function wrapSubmission(tx: Uint8Array): Uint8Array {
    const result = new Uint8Array(1 + 4 + tx.length);
    result[0] = 1;  // tag 1 = Submission::Transactions
    new DataView(result.buffer).setUint32(1, 1, false);  // Vec length = 1
    result.set(tx, 5);
    return result;
  }
  ```

- [ ] **`gateway/src/codec/events.ts`** - Event decoders
  ```typescript
  // Decode Update from binary WebSocket
  export function decodeUpdate(data: ArrayBuffer): Update

  // Extract casino events from Update
  export function extractCasinoEvents(update: Update): CasinoEvent[]
  ```

- [ ] **`gateway/src/codec/filters.ts`** - Filter encoder
  ```typescript
  // Encode UpdatesFilter for URL path
  export function encodeAccountFilter(publicKey: Uint8Array): string
  export function encodeSessionFilter(sessionId: bigint): string
  ```

**Test**: Encode a transaction, submit to running simulator, verify acceptance

**Reference Files:**
- `/home/r/Coding/nullspace/types/src/execution.rs:355-550` - Instruction encoding
- `/home/r/Coding/nullspace/website/src/api/wasm.js:316-700` - WASM encoders (reference)
- `/home/r/Coding/nullspace/website/src/services/CasinoChainService.serializers.js` - JS serializers

---

#### Phase 2: Session & Key Management

**Goal**: Manage player sessions, keys, and nonces

**Tasks:**

- [ ] **`gateway/src/session/keys.ts`** - Key management
  ```typescript
  // For development: gateway-managed keys
  // Each mobile client gets assigned a keypair
  export class KeyVault {
    generateKeypair(): { publicKey: Uint8Array, privateKey: Uint8Array }
    getKeypairForSession(sessionId: string): Keypair | undefined
    sign(sessionId: string, message: Uint8Array): Promise<Uint8Array>
  }
  ```

- [ ] **`gateway/src/session/nonce.ts`** - Nonce management with recovery
  ```typescript
  // Per-player nonce tracking with recovery mechanism
  export class NonceManager {
    private nonces: Map<string, bigint> = new Map();
    private pending: Map<string, Set<bigint>> = new Map();  // Track in-flight txs

    // Get next nonce and mark as pending
    getAndIncrement(publicKeyHex: string): bigint {
      const current = this.nonces.get(publicKeyHex) ?? 0n;
      this.nonces.set(publicKeyHex, current + 1n);

      // Track as pending until confirmed
      if (!this.pending.has(publicKeyHex)) {
        this.pending.set(publicKeyHex, new Set());
      }
      this.pending.get(publicKeyHex)!.add(current);
      return current;
    }

    // Mark nonce as confirmed (received in block)
    confirmNonce(publicKeyHex: string, nonce: bigint): void {
      this.pending.get(publicKeyHex)?.delete(nonce);
    }

    // Recovery: query account state from backend
    async syncFromBackend(publicKeyHex: string, backendUrl: string): Promise<void> {
      // Query /account/:pubkey endpoint for current nonce
      const response = await fetch(`${backendUrl}/account/${publicKeyHex}`);
      if (response.ok) {
        const account = await response.json();
        const onChainNonce = BigInt(account.nonce);

        // Set to on-chain nonce (transactions will use this + 1)
        this.nonces.set(publicKeyHex, onChainNonce);
        // Clear pending - if tx was accepted, it's confirmed; if not, retry with new nonce
        this.pending.delete(publicKeyHex);
      }
    }

    // Detect nonce mismatch from rejected transaction
    handleRejection(publicKeyHex: string, error: string): boolean {
      if (error.includes('nonce') || error.includes('InvalidNonce')) {
        // Trigger resync
        return true;  // Caller should call syncFromBackend
      }
      return false;
    }

    // Persist to disk for restart recovery
    persist(): void {
      const data = Object.fromEntries(
        [...this.nonces.entries()].map(([k, v]) => [k, v.toString()])
      );
      writeFileSync('.gateway-nonces.json', JSON.stringify(data));
    }

    restore(): void {
      try {
        const data = JSON.parse(readFileSync('.gateway-nonces.json', 'utf8'));
        for (const [k, v] of Object.entries(data)) {
          this.nonces.set(k, BigInt(v as string));
        }
      } catch {}  // Ignore if file doesn't exist
    }
  }
  ```

- [ ] **`gateway/src/session/manager.ts`** - Session lifecycle with registration
  ```typescript
  export class SessionManager {
    private sessions: Map<WebSocket, Session> = new Map();
    private byPublicKey: Map<string, Session> = new Map();
    private submitClient: SubmitClient;
    private nonceManager: NonceManager;

    // Create session and register player on-chain
    async createSession(ws: WebSocket, playerName?: string): Promise<Session> {
      const privateKey = ed25519.utils.randomPrivateKey();
      const publicKey = ed25519.getPublicKey(privateKey);
      const publicKeyHex = Buffer.from(publicKey).toString('hex');

      const session: Session = {
        id: crypto.randomUUID(),
        ws,
        publicKey,
        privateKey,
        playerName: playerName || `Player_${publicKeyHex.slice(0, 8)}`,
        registered: false,
        hasBalance: false,
        activeGameId: null,
        gameType: null,
        gameSessionCounter: 0n,
        connectedAt: Date.now(),
      };

      this.sessions.set(ws, session);
      this.byPublicKey.set(publicKeyHex, session);

      // Auto-register player on connection
      await this.registerPlayer(session);

      return session;
    }

    // Register player on-chain (CasinoRegister)
    private async registerPlayer(session: Session): Promise<void> {
      const instruction = encodeCasinoRegister(session.playerName);
      const nonce = this.nonceManager.getAndIncrement(
        Buffer.from(session.publicKey).toString('hex')
      );
      const tx = buildTransaction(nonce, instruction, session.privateKey);
      const result = await this.submitClient.submit(wrapSubmission(tx));

      if (result.accepted) {
        session.registered = true;
        // Auto-deposit test chips
        await this.depositTestChips(session, 10000n);  // 10,000 chips
      }
    }

    // Deposit test chips (CasinoDeposit)
    private async depositTestChips(session: Session, amount: bigint): Promise<void> {
      const instruction = encodeCasinoDeposit(amount);
      const nonce = this.nonceManager.getAndIncrement(
        Buffer.from(session.publicKey).toString('hex')
      );
      const tx = buildTransaction(nonce, instruction, session.privateKey);
      const result = await this.submitClient.submit(wrapSubmission(tx));

      if (result.accepted) {
        session.hasBalance = true;
      }
    }

    getSession(ws: WebSocket): Session | undefined {
      return this.sessions.get(ws);
    }

    destroySession(ws: WebSocket): void {
      const session = this.sessions.get(ws);
      if (session) {
        this.byPublicKey.delete(Buffer.from(session.publicKey).toString('hex'));
        this.sessions.delete(ws);
      }
    }

    getSessionByPublicKey(publicKey: Uint8Array): Session | undefined {
      return this.byPublicKey.get(Buffer.from(publicKey).toString('hex'));
    }
  }

  interface Session {
    id: string
    ws: WebSocket
    publicKey: Uint8Array
    privateKey: Uint8Array
    playerName: string
    registered: boolean      // Has CasinoRegister been accepted?
    hasBalance: boolean      // Has CasinoDeposit been accepted?
    activeGameId: bigint | null
    gameType: GameType | null
    gameSessionCounter: bigint  // For unique session ID generation
    connectedAt: number
  }
  ```

**Test**: Create session, sign transaction, submit, verify nonce increments

---

#### Phase 3: Backend Integration

**Goal**: Connect to simulator HTTP and WebSocket endpoints

**Tasks:**

- [ ] **`gateway/src/backend/http.ts`** - HTTP client for /submit
  ```typescript
  export class SubmitClient {
    constructor(baseUrl: string)

    async submit(submission: Uint8Array): Promise<SubmitResult>
    // Returns: { accepted: true } or { accepted: false, error: string }
  }
  ```

- [ ] **`gateway/src/backend/websocket.ts`** - WebSocket subscriber
  ```typescript
  export class UpdatesSubscriber {
    constructor(baseUrl: string, filter: string)

    onUpdate(handler: (update: Update) => void): void
    onError(handler: (error: Error) => void): void
    connect(): Promise<void>
    disconnect(): void
  }
  ```

- [ ] **`gateway/src/backend/pool.ts`** - Connection management
  ```typescript
  // Single shared connection to backend (more efficient)
  // Routes events to correct session based on publicKey in event
  export class BackendPool {
    constructor(config: BackendConfig)

    subscribe(publicKey: Uint8Array): void
    unsubscribe(publicKey: Uint8Array): void
    onEvent(publicKey: Uint8Array, handler: EventHandler): void
  }
  ```

**Test**: Connect to running simulator, receive Seed event, submit transaction, receive GameStarted

**Reference Files:**
- `/home/r/Coding/nullspace/simulator/src/api/ws.rs:84-112` - WebSocket endpoint
- `/home/r/Coding/nullspace/simulator/src/api/http.rs:251-402` - Submit endpoint

---

#### Phase 4: Game Message Handlers

**Goal**: Translate mobile JSON → backend transactions for each game

**Tasks:**

- [ ] **`gateway/src/handlers/base.ts`** - Base handler
  ```typescript
  export abstract class GameHandler {
    abstract handleMessage(session: Session, msg: any): Promise<void>
    abstract translateEvent(event: CasinoEvent): MobileMessage | null
  }
  ```

- [ ] **`gateway/src/handlers/blackjack.ts`**
  ```typescript
  // blackjack_deal → CasinoStartGame(GameType.Blackjack, amount, sessionId)
  // blackjack_hit → CasinoGameMove(sessionId, [HIT])
  // blackjack_stand → CasinoGameMove(sessionId, [STAND])
  // blackjack_double → CasinoGameMove(sessionId, [DOUBLE])
  // blackjack_split → CasinoGameMove(sessionId, [SPLIT])
  ```

- [ ] **`gateway/src/handlers/hilo.ts`**
- [ ] **`gateway/src/handlers/roulette.ts`**
- [ ] **`gateway/src/handlers/baccarat.ts`**
- [ ] **`gateway/src/handlers/videopoker.ts`**
- [ ] **`gateway/src/handlers/craps.ts`**
- [ ] **`gateway/src/handlers/sicbo.ts`**
- [ ] **`gateway/src/handlers/casinowar.ts`**
- [ ] **`gateway/src/handlers/threecardpoker.ts`**
- [ ] **`gateway/src/handlers/ultimateholdem.ts`**

**Reference Files:**
- `/home/r/Coding/nullspace/mobile/src/types/protocol.ts` - Mobile JSON schemas
- `/home/r/Coding/nullspace/execution/src/casino/blackjack.rs` - Game move payloads
- `/home/r/Coding/nullspace/types/src/casino/game.rs` - GameType enum

---

#### Phase 5: WebSocket Server & Routing

**Goal**: Main gateway server with event routing

**Tasks:**

- [ ] **`gateway/src/index.ts`** - Main entry point
  ```typescript
  import { WebSocketServer } from 'ws';

  const wss = new WebSocketServer({ port: 8080 });

  wss.on('connection', (ws) => {
    const session = sessionManager.createSession(ws);

    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      await handleMobileMessage(session, msg);
    });

    ws.on('close', () => {
      sessionManager.destroySession(ws);
    });
  });
  ```

- [ ] **Event routing** - Route backend events to correct mobile client
  ```typescript
  backendPool.onEvent((event) => {
    const session = sessionManager.getSessionByPublicKey(event.player);
    if (session) {
      const mobileMsg = translateToMobile(event);
      session.ws.send(JSON.stringify(mobileMsg));
    }
  });
  ```

- [ ] **Error handling** - Structured error responses
  ```typescript
  function sendError(ws: WebSocket, code: string, message: string) {
    ws.send(JSON.stringify({
      type: 'error',
      code,
      message
    }));
  }
  ```

---

#### Phase 6: Testing & Load Testing

**Goal**: Verify correctness and scalability

**Tasks:**

- [ ] **Unit tests** - Codec encoding/decoding
  ```typescript
  // gateway/tests/codec.test.ts
  test('encodes CasinoStartGame correctly', () => {
    const encoded = encodeCasinoStartGame(GameType.Blackjack, 100n, 12345n);
    expect(encoded).toEqual(new Uint8Array([
      12,                                    // tag
      1,                                     // GameType.Blackjack
      0, 0, 0, 0, 0, 0, 0, 100,              // bet: 100 BE
      0, 0, 0, 0, 0, 0, 48, 57               // sessionId: 12345 BE
    ]));
  });
  ```

- [ ] **Integration tests** - End-to-end with real simulator
  ```typescript
  // gateway/tests/integration.test.ts
  test('plays full blackjack game', async () => {
    // 1. Connect mobile client
    // 2. Send blackjack_deal
    // 3. Receive game_started with cards
    // 4. Send blackjack_hit
    // 5. Receive state_update
    // 6. Send blackjack_stand
    // 7. Receive game_result with payout
  });
  ```

- [ ] **Load test script** - k6 for concurrent clients
  ```javascript
  // gateway/tests/load.k6.js
  import ws from 'k6/ws';

  export const options = {
    vus: 100,        // 100 concurrent users
    duration: '5m',
  };

  export default function () {
    const url = 'ws://localhost:8080';
    ws.connect(url, (socket) => {
      socket.send(JSON.stringify({ type: 'blackjack_deal', amount: 100 }));
      socket.on('message', (data) => { /* verify response */ });
    });
  }
  ```

---

## Acceptance Criteria

### Functional Requirements

- [ ] Mobile client can connect to gateway via WebSocket
- [ ] All 10 game types work end-to-end (JSON → binary → on-chain → events → JSON)
- [ ] Game outcomes match what website receives for same game
- [ ] Balance updates correctly after wins/losses
- [ ] Reconnecting client can resume (or properly handles lost game)

### Non-Functional Requirements

- [ ] Support 1000 concurrent WebSocket connections
- [ ] Transaction round-trip < 500ms p95
- [ ] No message loss during normal operation
- [ ] Graceful degradation if backend unavailable

### Testing Requirements

- [ ] Unit tests for all codec functions
- [ ] Integration tests for each game type
- [ ] Load test passing at 100 concurrent users playing continuously

## Success Metrics

| Metric | Target |
|--------|--------|
| Concurrent connections | ≥ 1000 |
| Transaction latency p95 | < 500ms |
| Error rate | < 0.1% |
| Test coverage | > 80% |

## Dependencies & Prerequisites

### Prerequisites

- [ ] `start-local-network.sh` working (simulator + 4 nodes)
- [ ] Generated keys in `configs/local/`
- [ ] Mobile app configured to connect to gateway (not production)

### Technical Dependencies

| Package | Purpose |
|---------|---------|
| `ws` | WebSocket server |
| `@noble/curves` | Ed25519 signing |
| `zod` | JSON schema validation |
| `pino` | Structured logging |
| `vitest` | Unit testing |
| `k6` | Load testing |

## Risk Analysis & Mitigation

### Risk 1: Binary Encoding Mismatch (High Impact, Medium Probability)

**Risk**: TypeScript codec doesn't match Rust codec exactly

**Mitigation**:
- Create test harness comparing TS output to WASM output
- Start with simplest instruction (CasinoPlayerAction), verify, then expand

### Risk 2: Nonce Synchronization (Medium Impact, High Probability)

**Risk**: Gateway nonce falls out of sync with on-chain state

**Mitigation**:
- Query account state on startup to sync nonce
- Listen for Transaction events to update nonce reactively
- Add nonce recovery mechanism (query + retry)

### Risk 3: Event Routing Failures (High Impact, Medium Probability)

**Risk**: Events routed to wrong client (security issue)

**Mitigation**:
- Extensive unit tests for routing logic
- Include player public key in all event logs
- Add request IDs for transaction correlation

### Risk 4: Memory Leaks from Unclosed Sessions (Medium Impact, Medium Probability)

**Risk**: Sessions not cleaned up on disconnect, memory grows

**Mitigation**:
- Session timeout (idle disconnect)
- Session count monitoring
- Periodic session audit

## Future Considerations

### Production Deployment

For production, additional work needed:
- Authentication (JWT or challenge-response)
- TLS termination
- Horizontal scaling with Redis for session state
- Rate limiting
- HSM for key storage

### Mobile SDK

Long-term, consider:
- Pure TypeScript codec in mobile app (eliminate gateway)
- React Native bindings for Rust codec via JSI
- Native module for Ed25519 on device

## References & Research

### Internal References

| File | Purpose | Lines |
|------|---------|-------|
| `/home/r/Coding/nullspace/types/src/execution.rs` | Instruction encoding | 355-550 |
| `/home/r/Coding/nullspace/types/src/casino/game.rs` | GameType enum | 1-50 |
| `/home/r/Coding/nullspace/execution/src/casino/blackjack.rs` | Move payloads | All |
| `/home/r/Coding/nullspace/simulator/src/api/ws.rs` | WebSocket endpoints | 84-298 |
| `/home/r/Coding/nullspace/simulator/src/api/http.rs` | HTTP submit | 251-402 |
| `/home/r/Coding/nullspace/website/src/api/client.js` | Client reference | 1-300 |
| `/home/r/Coding/nullspace/website/src/api/wasm.js` | WASM encoders | 316-700 |
| `/home/r/Coding/nullspace/website/src/api/nonceManager.js` | Nonce logic | 1-200 |
| `/home/r/Coding/nullspace/mobile/src/types/protocol.ts` | Mobile JSON | 1-423 |

### External References

| Resource | URL |
|----------|-----|
| @noble/curves docs | https://github.com/paulmillr/noble-curves |
| ws package | https://github.com/websockets/ws |
| k6 WebSocket testing | https://grafana.com/docs/k6/latest/javascript-api/k6-ws/ |
| commonware_codec | https://docs.rs/commonware-codec/latest/ |

---

## MVP Checklist

### Minimum Viable Gateway (for testing)

```typescript
// gateway/src/index.ts (corrected MVP with proper protocol)
import { WebSocketServer } from 'ws';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const TRANSACTION_NAMESPACE = new TextEncoder().encode('_NULLSPACE_TX');

const wss = new WebSocketServer({ port: 9001 });

// Per-client session state
interface ClientSession {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  nonce: bigint;
  gameSessionCounter: bigint;
  activeGameId: bigint | null;
  registered: boolean;
}

const sessions = new Map<WebSocket, ClientSession>();

wss.on('connection', async (ws) => {
  console.log('Mobile client connected');

  // Create session with new keypair
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  const session: ClientSession = {
    privateKey,
    publicKey,
    nonce: 0n,
    gameSessionCounter: 0n,
    activeGameId: null,
    registered: false,
  };
  sessions.set(ws, session);

  // Auto-register player
  await registerAndDeposit(session);

  ws.send(JSON.stringify({
    type: 'session_ready',
    publicKey: Buffer.from(publicKey).toString('hex'),
  }));

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    const session = sessions.get(ws)!;

    try {
      if (msg.type === 'blackjack_deal') {
        // Generate unique session ID
        const gameSessionId = generateSessionId(session.publicKey, session.gameSessionCounter++);

        // Encode CasinoStartGame instruction
        const instruction = encodeCasinoStartGame(1, BigInt(msg.amount), gameSessionId);

        // Build and sign transaction
        const tx = buildTransaction(session.nonce++, instruction, session.privateKey);

        // Submit with correct Submission::Transactions wrapper (tag 1)
        const response = await fetch(`${BACKEND_URL}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: wrapSubmission(tx),
        });

        if (response.ok) {
          session.activeGameId = gameSessionId;
          ws.send(JSON.stringify({
            type: 'game_started',
            sessionId: gameSessionId.toString(),
            accepted: true,
          }));
        } else {
          const error = await response.text();
          ws.send(JSON.stringify({
            type: 'error',
            code: 'TRANSACTION_REJECTED',
            message: error,
          }));
        }
      }
      // ... other message handlers
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        code: 'INTERNAL_ERROR',
        message: String(err),
      }));
    }
  });

  ws.on('close', () => sessions.delete(ws));
});

// Helper: Register player and deposit test chips
async function registerAndDeposit(session: ClientSession): Promise<void> {
  // CasinoRegister
  const name = `Player_${Buffer.from(session.publicKey).toString('hex').slice(0, 8)}`;
  const registerInstr = encodeCasinoRegister(name);
  const registerTx = buildTransaction(session.nonce++, registerInstr, session.privateKey);
  await fetch(`${BACKEND_URL}/submit`, {
    method: 'POST',
    body: wrapSubmission(registerTx),
  });

  // CasinoDeposit (10,000 test chips)
  const depositInstr = encodeCasinoDeposit(10000n);
  const depositTx = buildTransaction(session.nonce++, depositInstr, session.privateKey);
  await fetch(`${BACKEND_URL}/submit`, {
    method: 'POST',
    body: wrapSubmission(depositTx),
  });

  session.registered = true;
}

// Helper: Unique session ID from publicKey + counter
function generateSessionId(publicKey: Uint8Array, counter: bigint): bigint {
  const data = new Uint8Array(32 + 8);
  data.set(publicKey, 0);
  new DataView(data.buffer).setBigUint64(32, counter, false);
  const hash = sha256(data);
  return new DataView(hash.buffer).getBigUint64(0, false);
}

// Helper: Build signed transaction
function buildTransaction(nonce: bigint, instruction: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const publicKey = ed25519.getPublicKey(privateKey);

  // Payload = nonce + instruction
  const payload = new Uint8Array(8 + instruction.length);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);
  payload.set(instruction, 8);

  // Sign: TRANSACTION_NAMESPACE + payload
  const toSign = new Uint8Array(TRANSACTION_NAMESPACE.length + payload.length);
  toSign.set(TRANSACTION_NAMESPACE, 0);
  toSign.set(payload, TRANSACTION_NAMESPACE.length);
  const signature = ed25519.sign(toSign, privateKey);

  // Transaction = nonce + instruction + pubkey + signature
  const tx = new Uint8Array(payload.length + 32 + 64);
  tx.set(payload, 0);
  tx.set(publicKey, payload.length);
  tx.set(signature, payload.length + 32);
  return tx;
}

// Helper: Wrap as Submission::Transactions (tag 1, not tag 0!)
function wrapSubmission(tx: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + 4 + tx.length);
  result[0] = 1;  // tag 1 = Transactions
  new DataView(result.buffer).setUint32(1, 1, false);  // Vec length = 1
  result.set(tx, 5);
  return result;
}

// Instruction encoders
function encodeCasinoRegister(name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const result = new Uint8Array(1 + 4 + nameBytes.length);
  result[0] = 10;  // tag
  new DataView(result.buffer).setUint32(1, nameBytes.length, false);
  result.set(nameBytes, 5);
  return result;
}

function encodeCasinoDeposit(amount: bigint): Uint8Array {
  const result = new Uint8Array(9);
  result[0] = 11;
  new DataView(result.buffer).setBigUint64(1, amount, false);
  return result;
}

function encodeCasinoStartGame(gameType: number, bet: bigint, sessionId: bigint): Uint8Array {
  const result = new Uint8Array(18);
  result[0] = 12;  // tag
  result[1] = gameType;
  new DataView(result.buffer).setBigUint64(2, bet, false);
  new DataView(result.buffer).setBigUint64(10, sessionId, false);
  return result;
}

console.log('Gateway listening on ws://0.0.0.0:9001');
```

---

**Plan Created**: 2025-12-27
**Author**: Claude Code
