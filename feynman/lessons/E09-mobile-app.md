# E09 - Mobile app architecture (React Native fundamentals + gateway sync)

Focus files:
- `mobile/App.tsx`
- `mobile/src/context/WebSocketContext.tsx`
- `mobile/src/services/websocket.ts`
- `mobile/src/hooks/useGatewaySession.ts`

Supporting context:
- `mobile/src/hooks/useAppState.ts`
- `mobile/src/hooks/useGameConnection.ts`
- `mobile/src/stores/gameStore.ts`
- `packages/protocol/src/schema/mobile.ts`

Goal: start with React Native fundamentals, then walk through how the mobile client connects to the gateway, stays in sync with the web app, and updates UI state from authoritative messages.

---

## 0) Big idea (Feynman summary)

The mobile app is a React Native client that renders UI locally but treats the gateway as the source of truth. It stays in sync by:

- sharing the same protocol schema as the web app,
- maintaining one WebSocket connection,
- updating a single state store from incoming messages,
- reconnecting and rehydrating on mobile lifecycle changes.

If you understand those four ideas, the rest of the code is just wiring.

---

## 1) React Native fundamentals (for readers with zero RN background)

This section is longer on purpose. You should be able to understand how React Native works, then map that directly to how our app stays in sync with the gateway.

### 1.1 What React Native actually is

React Native lets you write UI in JavaScript/TypeScript using React, but the UI that appears on screen is **native** (iOS/Android) views, not HTML.

Think of it as:

- **React (JS)** describes the UI tree.
- **React Native renderer** turns that tree into **native views**.

So you write `<View>` and `<Text>` in JS, and React Native renders native equivalents.

### 1.2 The runtime model: JS thread + UI thread

React Native has at least two main threads:

- **JS thread**: runs your app logic (hooks, state updates, message parsing).
- **UI thread**: renders native views and animations.

The JS thread updates state, React calculates what changed, and the renderer sends updates to the UI thread. That means:

- expensive JS work can block UI if done at the wrong time,
- animations often run on the UI thread (Reanimated) to stay smooth.

In our app this is why:

- `react-native-reanimated` is used for animations,
- `InteractionManager.runAfterInteractions` delays state updates until after UI work.

### 1.3 React components, props, and state

React Native is still React. The core ideas are:

- **Components** are functions that return UI.
- **Props** flow down into components.
- **State** is local data that triggers re-render when it changes.

The same rules apply:

- State updates are async and batched.
- UI is derived from state, not mutated directly.

### 1.4 Hooks are the behavioral layer

Hooks add behavior to components:

- `useState` stores component state.
- `useEffect` runs side effects (network, subscriptions).
- `useMemo` caches derived values.
- `useCallback` stabilizes function references.

We build custom hooks (like `useGatewaySession`, `useGameConnection`) to bundle complex behavior into reusable units.

### 1.5 Layout and styling (no CSS cascade)

React Native styling is not CSS. It is JS objects.

Key differences:

- **Flexbox is default** for layout.
- No cascade: styles are explicit and local.
- Units are device-independent pixels (numbers, not strings).

Example mental model:

```tsx
<View style={{ flex: 1, padding: 16 }}>
  <Text style={{ fontSize: 18 }}>Hello</Text>
</View>
```

The styles are simple objects, and arrays merge styles in order.

### 1.6 Navigation is also React

React Navigation treats screens as components. Navigation state is React state:

- `RootNavigator` decides which screen tree to render.
- Screen changes are just component tree changes.

This matters because all screens still share the same providers and store.

### 1.7 Networking and async in RN

React Native uses the same `fetch` and `WebSocket` APIs you know from the web, but:

- networking is tied to mobile lifecycle (background can suspend sockets),
- reconnect logic must be explicit.

So the "mobile-specific" part is mostly about lifecycle, not syntax.

### 1.8 App lifecycle: foreground/background

Phones suspend apps. When an app goes to background:

- JS may pause,
- sockets may disconnect,
- UI state may be dropped.

That is why we use `useAppState` and `useWebSocketReconnectOnForeground`. React Native apps must explicitly rehydrate and reconnect when coming back.

### 1.9 How our app maps onto these fundamentals

Now connect the fundamentals to our code:

- **Component tree**: `App.tsx` is the root. Everything starts there.
- **Providers**: auth, WebSocket, session hooks are global.
- **State**: `useGameStore` holds shared state (balance, session, UI prefs).
- **Hooks**: `useGatewaySession` listens to gateway messages and updates the store.
- **Screens**: subscribe to store + parse game state bytes for UI.

The architecture is a standard React Native app, but with a strict rule:

> All authoritative state comes from the gateway, never from local prediction.

That rule is what keeps mobile and web in sync.

### 1.10 Sync with gateway in RN terms

If you think in React Native primitives, sync looks like this:

1) **WebSocket** receives a message (async event).
2) `useGatewaySession` **handles the event** (hook logic).
3) The store **updates state** (Zustand).
4) The component tree **re-renders** (React).

This is the same one-way data flow React teaches, but driven by the gateway instead of local user actions. The gateway is just another event source.

---

## 2) Entry point and provider stack

### 2.1 App boot sequence (`mobile/App.tsx`)

At startup, the app does three things in order:

1) Loads crypto polyfills.
2) Initializes error reporting.
3) Mounts the provider stack.

Key idea: boot should be deterministic and fast. All global services are created at the top level.

Concrete excerpt:

```tsx
function GatewaySessionBridge({ children }: { children: React.ReactNode }) {
  useGatewaySession();
  useWebSocketReconnectOnForeground();
  return children;
}

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
```

Walkthrough:

1) `useAppState()` wires AppState persistence (background/foreground) before any screens render.
2) `WebSocketProvider` creates a single socket for the whole tree.
3) `GatewaySessionBridge` runs `useGatewaySession()` exactly once for the tree and wires reconnect-on-foreground.
4) `RootNavigator` renders screens; those screens can access the shared socket/store through hooks.

### 2.2 Provider stack (why it exists)

The provider stack composes shared dependencies:

- `AuthProvider` for authentication state.
- `WebSocketProvider` for the gateway connection.
- `GatewaySessionBridge` to run session and reconnect hooks.
- `RootNavigator` for screen routing.

This is the canonical React pattern for global services: build once, use everywhere.

---

## 3) The shared protocol boundary (mobile <-> gateway <-> web)

### 3.1 One protocol, two clients

Both the mobile app and the web app use the same message schema from `@nullspace/protocol/mobile`. This creates a shared contract:

- The gateway emits messages in a known format.
- Both clients parse those messages the same way.
- Balance, session, and game updates are interpreted consistently.

This is the primary reason the two clients stay in sync: they agree on the protocol and both trust the gateway as the authority.

### 3.2 The gateway is the source of truth

The clients do not simulate authoritative state. They render what the gateway reports. This avoids drift between mobile and web:

- Balance updates always come from gateway messages.
- Game state is driven by `game_started`, `game_move`, and `game_result`.
- Global table updates come from live table message types.

If the gateway changes, both clients update in the same way because they share the same protocol definitions.

---

## 4) WebSocket transport (the live connection)

### 4.1 The WebSocket service

`mobile/src/services/websocket.ts` owns the connection lifecycle:

- opens the WebSocket,
- validates incoming JSON minimally,
- reconnects with backoff on unclean close.

This layer is intentionally low-level: it only cares about connectivity and message shape.

Concrete excerpt:

```ts
ws.current.onmessage = (event) => {
  const raw = JSON.parse(event.data);
  const baseResult = BaseMessageSchema.safeParse(raw);
  if (!baseResult.success) {
    console.error('Invalid message format:', baseResult.error.message);
    return;
  }
  setLastMessage(raw as T);
};
```

Walkthrough:

1) Parse JSON.
2) Validate minimal structure (must have a `type`).
3) Store as `lastMessage` for higher-level hooks.

This keeps the transport layer fast and pushes semantic handling up to `useGatewaySession` and game screens.

### 4.2 WebSocket context

`WebSocketContext.tsx` exposes a singleton connection:

- a shared `send` function,
- `lastMessage`,
- connection state and retry metadata.

This prevents each screen from opening its own socket, which would produce inconsistent sessions.

Concrete excerpt:

```tsx
export function WebSocketProvider({ children, url }: WebSocketProviderProps) {
  const wsUrl = url ?? getWebSocketUrl();
  const manager = useWebSocket<GameMessage>(wsUrl);
  return (
    <WebSocketContext.Provider value={manager}>
      {children}
    </WebSocketContext.Provider>
  );
}
```

Walkthrough:

1) Pick a URL (env override, dev host, or prod).
2) Create one `useWebSocket` manager.
3) Share it across the entire component tree.

---

## 5) Session orchestration (`useGatewaySession`)

This hook is the core of the mobile client. It wires protocol messages into the store.

### 5.1 Connect -> balance

When the socket is connected, the app sends `get_balance`. This forces an authoritative state refresh on every connect or reconnect.

Concrete excerpt:

```ts
useEffect(() => {
  if (connectionState === 'connected') {
    send({ type: 'get_balance' });
  }
}, [connectionState, send]);
```

This is why reconnect always converges to the gateway state.

### 5.2 session_ready -> session identity

When `session_ready` arrives:

- session id and public key are stored,
- analytics context is set,
- the app re-requests balance for redundancy.

Redundancy is intentional: it reduces the risk of stale balance after reconnect.

Concrete excerpt:

```ts
if (lastMessage.type === 'session_ready') {
  lastSessionIdRef.current = lastMessage.sessionId;
  setSessionInfo({
    sessionId: lastMessage.sessionId,
    publicKey: lastMessage.publicKey,
    registered: lastMessage.registered,
    hasBalance: lastMessage.hasBalance,
  });
  setAnalyticsContext({ publicKey: lastMessage.publicKey });
  send({ type: 'get_balance' });
  return;
}
```

Walkthrough:

1) Store the session id in a ref (no re-render churn).
2) Update the shared store (global session identity).
3) Set analytics context for tracing.
4) Request balance again to confirm authoritative state.

### 5.3 balance, game, and live table messages

The hook updates store state in response to:

- `balance` (canonical balance update),
- `game_started`, `game_move`, `game_result` (game lifecycle),
- live table message types (global table state and results).

Every update is treated as authoritative. The UI never tries to predict balance locally.

Concrete excerpt:

```ts
if (lastMessage.type === 'game_result' || lastMessage.type === 'game_move') {
  const balanceValue = parseNumeric(lastMessage.balance ?? lastMessage.finalChips);
  if (balanceValue !== null) {
    setBalance(balanceValue);
    setBalanceReady(true);
  }
}
```

This is the key sync rule: if the gateway provides a balance, it overwrites local UI state.

### 5.4 Faucet flow

The faucet helper in `useGatewaySession`:

- sets local status to pending,
- sends `faucet_claim`,
- reconciles success or error on the next message.

This is a consistent pattern: send a command, wait for a message, update the store.

Concrete excerpt:

```ts
const requestFaucet = useCallback((amount?: number) => {
  setFaucetStatus('pending', 'Requesting faucet...');
  if (typeof amount === 'number' && amount > 0) {
    send({ type: 'faucet_claim', amount });
  } else {
    send({ type: 'faucet_claim' });
  }
}, [send, setFaucetStatus]);
```

The UI becomes "pending" immediately, then resolves when the gateway replies.

---

## 6) UI state and game screens

### 6.1 Single store for UI truth

`useGameStore` is the single source of truth for session state:

- balance and balance readiness,
- session identifiers,
- faucet state,
- selected chip and other UI preferences.

Every screen subscribes to the same store, so the UI stays coherent across navigation.

Concrete excerpt:

```ts
export const useGameStore = create<GameState>((set) => ({
  balance: 0,
  balanceReady: false,
  selectedChip: 25,
  setBalance: (balance) => set({ balance }),
  setBalanceReady: (ready) => set({ balanceReady: ready }),
}));
```

Walkthrough:

1) Zustand holds canonical UI state.
2) Any component can subscribe to `balance` or `selectedChip`.
3) Updates from `useGatewaySession` propagate to all screens.

### 6.2 Game screens are message-driven

Game screens do not connect directly to the socket. They use hooks like:

- `useGameConnection` (reads `lastMessage`, exposes `send`),
- `useChipBetting` (local bet UI state).

When a `game_move` message arrives, the screen parses the state bytes and updates its local game view. That is the pattern across the casino screens.

Concrete excerpt (Hi-Lo):

```ts
const { isDisconnected, send, lastMessage } = useGameConnection<GameMessage>();

useEffect(() => {
  if (!lastMessage) return;
  if (lastMessage.type === 'game_started' || lastMessage.type === 'game_move') {
    const stateBytes = decodeStateBytes((lastMessage as { state?: unknown }).state);
    if (!stateBytes) return;
    InteractionManager.runAfterInteractions(() => {
      const parsed = parseHiLoState(stateBytes);
      if (!parsed?.currentCard) return;
      setState((prev) => ({
        ...prev,
        currentCard: parsed.currentCard,
        phase: 'playing',
        message: 'Make your call',
      }));
    });
    return;
  }
}, [lastMessage]);
```

Walkthrough:

1) Screen subscribes to `lastMessage` from the shared socket.
2) It decodes state bytes (binary compact game state).
3) It parses them into a typed game state object.
4) It updates local UI state after interactions to avoid jank.

This is how game screens stay live without owning the socket.

---

## 7) How the mobile app stays in sync with the web app

### 7.1 Shared protocol, shared authority

The mobile app and web app both:

- consume the same protocol schema,
- rely on the same gateway messages,
- update their state from those messages.

This is the sync mechanism. There is no device-to-device sync. Both clients are projections of the same backend state.

### 7.2 What happens if both clients are open

If the same account is used on two clients, each client:

- has its own session id,
- receives authoritative updates from the gateway,
- refreshes balance on connect.

Because balance and game results are authoritative, each client converges to the same state after messages arrive.

### 7.3 What prevents drift

Drift is prevented by design:

- the gateway is the only source of truth,
- local state is overwritten by gateway updates,
- reconnect triggers a fresh balance fetch.

This is why the architecture is consistent across mobile and web.

---

## 8) Mobile lifecycle and resilience

### 8.1 AppState persistence

`useAppState` persists small pieces of UI state (balance, selected chip) so the app can rehydrate quickly after backgrounding.

This is not authoritative state. It is a UI convenience that gets overwritten by gateway updates on reconnect.

Concrete excerpt:

```ts
AppState.addEventListener('change', (nextAppState) => {
  const previousState = appStateRef.current;
  if (previousState === 'active' && (nextAppState === 'background' || nextAppState === 'inactive')) {
    persistGameState();
  }
  if ((previousState === 'background' || previousState === 'inactive') && nextAppState === 'active') {
    restoreGameState();
  }
  appStateRef.current = nextAppState;
});
```

Walkthrough:

1) On background: cache balance + selected chip locally.
2) On foreground: restore immediately for snappy UI.
3) Gateway balance will still overwrite later.

### 8.2 Foreground reconnect

`useWebSocketReconnectOnForeground` reconnects when the app becomes active. Mobile OSes suspend sockets in the background, so explicit reconnect is required for correctness.

### 8.3 Failure modes and safeguards

The design anticipates:

- flaky networks (backoff reconnect),
- malformed messages (schema check),
- stale balances (re-fetch on connect).

The system is intentionally conservative: it prefers to re-sync rather than guess.

---

## 9) Data flow summary (message -> UI)

1) Gateway sends a JSON message over WebSocket.
2) `useWebSocket` validates it and exposes `lastMessage`.
3) `useGatewaySession` and screen hooks react to the message.
4) The store updates, and the UI re-renders.

This is the full loop: transport -> session -> store -> UI.

---

## 10) Exercises

1) Why is `get_balance` sent on every connect, even if local cache exists?
2) Which parts of state are authoritative vs UI-only?
3) How do game screens avoid opening their own WebSocket connections?
4) What makes the mobile and web clients stay in sync without talking to each other?
5) If you add a new protocol message, which files must change?

---

## Next lesson

E10 - Web app architecture: `feynman/lessons/E10-web-app.md`
