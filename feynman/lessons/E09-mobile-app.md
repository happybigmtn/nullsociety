# E09 - Mobile app architecture (from scratch, deep dive)

Focus files:
- `mobile/App.tsx`
- `mobile/src/hooks/useGatewaySession.ts`

Supporting context:
- `mobile/src/context/WebSocketContext.tsx`
- `mobile/src/services/websocket.ts`
- `mobile/src/hooks/useAppState.ts`
- `mobile/src/stores/gameStore.ts`
- `mobile/src/utils/numbers.ts`

Goal: explain how the mobile app boots, connects to the gateway, and updates UI state from WebSocket messages. This is a full walkthrough of the lifecycle, the data flow, and the concrete code paths that make the app feel "live" while staying safe and deterministic.

---

## Learning objectives

After this lesson you should be able to:

1) Trace the app boot sequence from `App.tsx` to the first balance fetch.
2) Explain how the WebSocket connection is created, validated, and reconnected.
3) Describe how `useGatewaySession` interprets messages and updates the store.
4) Explain how app lifecycle events (background/foreground) affect state persistence.
5) Identify the key failure modes and why the current design is robust against them.

---

## 1) The big picture: a live client for a deterministic chain

The mobile app is a live client for a deterministic blockchain system. That means it has to juggle two competing constraints:

- It must feel real-time (low latency, live updates, live table events).
- It must stay consistent with the chain (authoritative state comes from the gateway and validators).

The architecture is therefore centered around **a single shared WebSocket connection**, a **centralized store**, and **reactive hooks** that update UI state as messages arrive.

---

## 2) Entry point: `mobile/App.tsx`

`App.tsx` is the root of the Expo app. It is intentionally small, because its job is to compose app-wide providers and lifecycle hooks.

Key lines (simplified):

```tsx
import './src/utils/cryptoPolyfill';
import { initializeErrorReporter } from './src/services/errorReporter';

initializeErrorReporter();

function App() {
  useAppState();
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <AuthProvider>
        <WebSocketProvider>
          <GatewaySessionBridge>
            <RootNavigator />
          </GatewaySessionBridge>
        </WebSocketProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(App);
```

### 2.1 Crypto polyfill

The first import is `cryptoPolyfill`. This ensures that cryptographic primitives expected by libraries are available in React Native. Without it, some crypto operations would fail at runtime. This is a classic React Native issue: not all Node or browser globals are available by default.

### 2.2 Error reporting

`initializeErrorReporter()` runs before the component is rendered. This is deliberate: error reporting should be active as early as possible so crashes during boot are captured.

### 2.3 The provider stack

The provider stack defines the app's shared services:

- `AuthProvider` handles authentication state.
- `WebSocketProvider` creates a single shared connection to the gateway.
- `GatewaySessionBridge` invokes session boot logic (more on that below).
- `RootNavigator` renders the actual screens.

A key architecture choice: **the WebSocket is a singleton**. If each screen created its own socket, the server would see multiple conflicting sessions. The `WebSocketProvider` prevents that.

---

## 3) `GatewaySessionBridge`: where side effects live

`GatewaySessionBridge` is a tiny component that exists only to run hooks:

```tsx
function GatewaySessionBridge({ children }) {
  useGatewaySession();
  useWebSocketReconnectOnForeground();
  return children;
}
```

This pattern keeps `App` readable while still centralizing global side effects. Think of it as the "session bootstrap" wrapper.

Two hooks are invoked here:

- `useGatewaySession`: handles session setup, balance requests, and analytics.
- `useWebSocketReconnectOnForeground`: handles reconnect when the app returns to foreground.

---

## 4) App lifecycle persistence: `useAppState`

The `useAppState` hook stores and restores key UI state when the app is backgrounded. It does this using MMKV storage (a fast key-value store for React Native).

Key behaviors:

- On initial mount, it initializes storage and restores cached values.
- When the app goes to background, it persists balance and selected chip.
- When the app comes back to foreground, it restores those values.

Why this matters:

- Without persistence, a backgrounded app would lose the user's context.
- With persistence, the UI can rehydrate instantly while the gateway catches up.

A subtle design detail: `VALID_CHIP_VALUES` ensures that restored chip values are within the allowed set. This prevents corrupted storage from putting the UI into an invalid state.

---

## 5) WebSocket architecture: a single shared connection

The WebSocket connection is managed by a custom hook in `mobile/src/services/websocket.ts` and exposed through a React context in `WebSocketContext.tsx`.

### 5.1 `WebSocketProvider`

The provider creates the connection once and shares it:

```tsx
const manager = useWebSocket<GameMessage>(wsUrl);
return (
  <WebSocketContext.Provider value={manager}>
    {children}
  </WebSocketContext.Provider>
);
```

This is crucial for consistency: all screens observe the same `lastMessage` and share the same connection state.

### 5.2 `useWebSocket`: connection lifecycle and reconnection

The `useWebSocket` hook encapsulates connection behavior:

- It opens a WebSocket to the URL returned by `getWebSocketUrl()`.
- It parses messages and validates them against `BaseMessageSchema`.
- It reconnects with exponential backoff if the connection drops.

The connection state flows through `connectionState` and `isConnected`. The hook also exposes a `reconnect` function for manual triggers.

### 5.3 Environment-aware URL selection

`getWebSocketUrl()` chooses the URL based on environment:

- In dev, it uses Expo host metadata to connect to the local machine.
- In production, it defaults to `wss://api.nullspace.casino/ws`.

This is a pragmatic approach: developers get local testing without manual configuration, while production uses a secure WebSocket endpoint.

---

## 5.4) WebSocket event handling in detail

The `useWebSocket` hook wires the low-level browser WebSocket events into app state:

- `onopen`: marks the connection as connected, resets reconnect counters, and clears reconnect attempts.
- `onmessage`: parses JSON, validates it with `BaseMessageSchema.safeParse`, then stores it as `lastMessage`.
- `onerror`: logs diagnostics (URL, readyState, error). This is used to debug flaky networks.
- `onclose`: handles reconnect logic if the close was not clean.

The logic for reconnect is careful and intentional. It does **not** reconnect if the close was clean (`event.wasClean`). This avoids reconnect loops when the server explicitly closes the socket (for example, during maintenance or a version upgrade). If the close is not clean, the hook uses exponential backoff with a max delay and a max number of attempts. The result is a resilient but bounded retry strategy.

The hook also uses `useRef` for reconnect counters and timeouts. That is important: reconnect counters should not trigger re-renders. React state is reserved for values that affect UI (connection state, last message). This is a clean separation of concerns.

---

## 5.5) Minimal validation is still validation

Notice that `BaseMessageSchema` only checks that a message has a `type` field. This is intentionally minimal. Deep validation happens in higher-level schemas (see `@nullspace/protocol/mobile`), but the WebSocket layer still filters out obviously malformed JSON. This prevents random data or garbage messages from breaking the UI logic.

Minimal validation at the socket layer is also a performance choice. The socket might receive frequent messages (live tables, state updates). Full validation of every message could be expensive. The design splits validation into layers: quick structural validation at the socket, then deeper handling in the session hook.

---

## 6) The `useGatewaySession` hook: the heart of session management

`useGatewaySession` glues everything together. It watches the WebSocket state, interprets incoming messages, updates the store, and emits analytics events.

### 6.1 Dependencies and stores

The hook pulls state and actions from several sources:

- `useWebSocketContext` provides `connectionState`, `send`, and `lastMessage`.
- `useGameStore` provides actions to update balance, session info, and faucet status.
- `parseNumeric` normalizes numeric values from either number or string.
- Analytics functions (`initAnalytics`, `track`, `setAnalyticsContext`).

This design keeps the hook focused on orchestration rather than data modeling.

### 6.2 Analytics initialization

The hook initializes analytics once, on mount:

```tsx
useEffect(() => {
  void initAnalytics();
}, []);
```

This ensures analytics is ready before any meaningful events are tracked.

### 6.3 Fetching balance on connect

When the socket connects, the hook immediately requests the balance:

```tsx
if (connectionState === 'connected') {
  send({ type: 'get_balance' });
}
```

This is a simple but important flow: the app must always get an authoritative balance from the server, not from local cache.

### 6.4 Handling `session_ready`

The `session_ready` message is the gateway saying "you have a session now." The hook does several things in response:

- Stores the session id in a ref so it survives re-renders.
- Updates the store with session info (public key, registration, balance status).
- Sets analytics context to the public key.
- Tracks a session started event.
- Parses the initial balance if provided.
- Sends another `get_balance` request to confirm state.

This sequence is deliberately redundant. It treats `session_ready` as both a state update and a trigger for a fresh balance fetch. Redundancy is good here: it helps recover from races.

#### 6.4.1 Why `lastSessionIdRef` is a ref, not state

The hook stores the session id in a `useRef`. That means it does not trigger re-renders when it changes. This is intentional. The session id is not needed to render most UI elements on every message. Instead, it is used as a stable reference for other hooks or functions that may need the session id without causing a re-render storm.

Using a ref also avoids a subtle bug: if the session id were stored in state, every change would re-run the hook logic in ways that might duplicate analytics or extra `get_balance` calls. The ref is a stable, low-noise storage location.

#### 6.4.2 Analytics context and privacy considerations

When `session_ready` arrives, the hook calls `setAnalyticsContext({ publicKey })`. This ties future events to a stable identifier. It is useful for debugging and product analytics, but it also means the public key is part of analytics context. This is an explicit design choice: the system values traceability of sessions over anonymous metrics. If privacy requirements change, this is the place you would start auditing.

### 6.5 Handling `balance`

The `balance` message updates the store with the latest account balance and registration state. It also checks if the faucet was just claimed:

```tsx
if (lastMessage.message === 'FAUCET_CLAIMED') {
  setFaucetStatus('success', 'Faucet claimed');
  void track('casino.faucet.claimed', { source: 'mobile' });
}
```

This is an example of how protocol messages drive UI feedback: a backend event becomes a UI toast and an analytics event.

### 6.6 Handling `game_started`

When a game starts, the hook:

- Tracks a game started event.
- Updates the balance if included in the message.

The important idea: the app does not compute balances itself. It trusts the server as the source of truth.

### 6.7 Handling live table updates

For live table messages (`live_table_state`, `live_table_result`, `live_table_confirmation`), the hook extracts balance and updates it. This keeps the account balance consistent even when bets are placed in the live table flow.

### 6.8 Handling `game_result` and `game_move`

When a game result arrives, the hook tracks a completion event and updates balance from either `balance` or `finalChips`. It also handles `game_move` messages in case they include balance updates.

This is a pragmatic design: different message types sometimes include balances, so the hook treats them all as potential balance updates.

### 6.9 Error handling and faucet flow

If an error arrives while a faucet request is pending, the hook sets the faucet status to error and surfaces the error message. This ensures the UI does not stay stuck in "pending" forever.

---

## 6.10) Foreground reconnect logic

`useWebSocketReconnectOnForeground` listens to `AppState` transitions and triggers a reconnect when the app becomes active. It does this with two refs:

- `appStateRef` tracks the previous app state.
- `connectionStateRef` tracks the latest socket state.

When the app transitions from background or inactive to active, the hook checks whether the socket is already connected. If not, it calls `reconnect()`. This pattern avoids unnecessary reconnects and prevents reconnect storms when the app is already online.

This hook exists because mobile operating systems frequently suspend network activity in the background. Without an explicit reconnect on foreground, the socket could remain stale even though the UI looks active.

---

## 7) The faucet request helper

The hook exposes `requestFaucet`:

```tsx
const requestFaucet = useCallback((amount?: number) => {
  setFaucetStatus('pending', 'Requesting faucet...');
  if (typeof amount === 'number' && amount > 0) {
    send({ type: 'faucet_claim', amount });
  } else {
    send({ type: 'faucet_claim' });
  }
}, [send, setFaucetStatus]);
```

This encapsulates two ideas:

- The UI does not need to know protocol details; it calls a helper.
- The helper updates state before sending, so the UI can immediately show feedback.

---

## 8) The store: a single source of UI truth

`useGameStore` (Zustand) holds the session state that all screens use:

- `balance` and `balanceReady`
- `sessionId`, `publicKey`
- `registered`, `hasBalance`
- `faucetStatus` and `faucetMessage`
- `selectedChip`

This is a deliberate choice: a single store avoids inconsistencies across screens and avoids prop-drilling. The `useGatewaySession` hook is the sole writer for many of these fields, making it easier to audit state changes.

---

## 8.1) Parsing numeric values safely

The gateway sometimes sends numeric values as strings (for example, balances or payouts). This is common when values can exceed JavaScript's safe integer range. The `parseNumeric` helper in `mobile/src/utils/numbers.ts` handles this by accepting either a finite number or a numeric string and returning a `number` or `null`.

This design has tradeoffs:

- It keeps UI math simple because the store always uses `number`.
- It risks precision loss for very large values, but the UI mostly displays balances rather than performing critical arithmetic.

The key is that authoritative accounting still happens on-chain. The UI uses numbers for display, not for consensus-critical computation.

The helper also rejects `NaN`, `Infinity`, empty strings, and non-numeric strings. That means a malformed message will not silently corrupt the UI state.

---

## 9) Data flow summary (message to UI)

The message flow is:

1) Gateway sends JSON message via WebSocket.
2) `useWebSocket` validates the message shape against `BaseMessageSchema`.
3) `useGatewaySession` reads `lastMessage`, matches on `type`, and updates the store.
4) UI components subscribe to `useGameStore` and re-render.

This architecture keeps the system predictable. There is exactly one ingress point for gateway data and exactly one state store for UI updates.

---

## 9.1) A concrete timeline (app launch to first bet)

To make the flow less abstract, here is a concrete timeline for a typical user session:

1) The user opens the app. `App.tsx` initializes error reporting, storage, and providers.
2) `WebSocketProvider` creates a single socket connection. The socket transitions to `connecting`.
3) When the socket opens, `connectionState` becomes `connected` and `useGatewaySession` sends `get_balance`.
4) The gateway responds with `session_ready` (includes session id and public key). The hook stores the session id, sets analytics context, and triggers another `get_balance`.
5) The gateway responds with `balance` (and possibly `FAUCET_CLAIMED` if the user just claimed faucet). The UI now shows a valid balance.
6) The user starts a game. The gateway sends `game_started` and includes a new balance. The hook updates the store and logs the analytics event.
7) During the game, the gateway may send `game_move` updates (for example, live state changes or table updates). The hook updates balance when present.
8) At game completion, the gateway sends `game_result`. The hook logs the completion event and updates balance again.

Notice that the UI always follows the gateway. It does not attempt to predict or simulate game logic. This is deliberate: in a blockchain system, the chain is the authority, and the UI is just a projection.

This timeline also explains why redundant `get_balance` requests exist. The app prefers to be slightly chatty if it means it recovers quickly from missed messages or reconnects.

---

## 10) Failure modes and how the design handles them

### 10.1 Reconnect storms

If the app reconnects too aggressively, it can overload the gateway. The `useWebSocket` hook uses exponential backoff with a max delay and a max number of attempts. This limits load and prevents tight reconnect loops.

### 10.2 Invalid messages

Messages are validated by `BaseMessageSchema`. If a message is malformed, it is ignored and logged. This prevents untrusted data from polluting state.

### 10.3 Balance format drift

`parseNumeric` accepts numbers or numeric strings and rejects invalid values. This protects the app if the gateway changes balance formats slightly (for example, returning strings). Without this, the balance could become `NaN` and break the UI.

### 10.4 Race conditions

Messages can arrive out of order. The hook uses idempotent updates: it always sets the store based on the latest message. It does not try to compute deltas locally. This reduces the risk of stale UI state.

### 10.5 Observability and diagnostics

The WebSocket layer logs connection errors, reconnect attempts, and invalid message formats. These logs are crucial when diagnosing flaky networks or gateway misconfigurations. On mobile, where connectivity is variable, explicit logging is often the only way to understand what happened on a user's device.

The analytics hooks also act as a lightweight observability system. Events like `casino.session.started`, `casino.game.started`, and `casino.game.completed` can be aggregated to detect drop-offs or failures in the user funnel. This is a subtle but important part of the architecture: **correctness is not just code correctness; it is also operational correctness**. When these events spike or disappear, you know a core workflow is broken even if the UI looks fine.

---

## 11) Extensibility: adding new message types

If you add a new message type, you must:

1) Add it to `@nullspace/protocol/mobile` schema.
2) Update `useGatewaySession` to handle it (if it affects balance or session state).
3) Consider whether analytics should track it.

This is a predictable workflow. The app's architecture makes it obvious where new protocol changes should be reflected.

---

## 12) Feynman recap: explain it like I am five

Imagine the app is a radio. The gateway is the broadcast station. The WebSocket is the antenna. The store is the scoreboard you show your friends. When the station sends an update, the radio catches it, checks that it looks like a real message, and then updates the scoreboard. If the station is silent or drops out, the radio keeps trying to tune back in.

---

## 13) Exercises

1) Why does the app send `get_balance` right after it connects?
2) What is the difference between `session_ready` and `balance` messages?
3) How does the app avoid showing stale balance values after reconnect?
4) Why is `BaseMessageSchema` validation important before processing messages?
5) If you add a new game result field, where should it be validated and stored?

---

## Next lesson

E10 - Web app architecture: `feynman/lessons/E10-web-app.md`
