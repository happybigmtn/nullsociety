---
status: completed
priority: p2
issue_id: "007"
tags: [code-review, architecture, mobile, websocket, performance]
dependencies: ["003"]
---

# WebSocket Connection Per Game Instead of Singleton

## Problem Statement

The `useWebSocket` hook creates a new connection on every mount. When navigating from Blackjack to Roulette, the Blackjack WebSocket is closed and Roulette creates a new one. Any in-flight messages are lost.

**Why it matters:** Connection churn wastes resources, messages can be lost during navigation, and balance state from the old game is orphaned.

## Findings

**Agent:** architecture-strategist
**Severity:** HIGH (P2)

**Location:** `mobile/src/services/websocket.ts` (hook creates connection on mount)

Each game screen calls `useWebSocket` independently:
- `HiLoScreen.tsx`: `useWebSocket<HiLoMessage>(getWebSocketUrl())`
- `BlackjackScreen.tsx`: `useWebSocket<BlackjackMessage>(getWebSocketUrl())`
- All 10 screens create separate connections

## Proposed Solutions

### Option A: WebSocket Provider at App Level (Recommended)
**Effort:** Medium
**Risk:** Low
**Pros:** Single connection, shared state
**Cons:** Requires provider setup

```typescript
// App.tsx
<WebSocketProvider url={getWebSocketUrl()}>
  <RootNavigator />
</WebSocketProvider>

// Games access via context
const { send, subscribe } = useWebSocketContext();
```

### Option B: Singleton WebSocket Manager
**Effort:** Medium
**Risk:** Low
**Pros:** No React context needed
**Cons:** Manual lifecycle management

```typescript
// src/services/websocketManager.ts
class WebSocketManager {
  private static instance: WebSocketManager;
  static getInstance(): WebSocketManager;
  connect(): void;
  send(message: object): void;
  subscribe(callback: (msg: any) => void): () => void;
}
```

## Recommended Action

Implement Option A as part of fixing issue #003 (state duplication).

## Technical Details

**Affected files:**
- `mobile/src/services/websocket.ts`
- `mobile/App.tsx`
- All game screens

## Acceptance Criteria

- [ ] Single WebSocket connection for entire app
- [ ] Connection persists across game navigation
- [ ] Messages are queued during reconnection
- [ ] All games receive relevant updates

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | WebSocket connections should be app-level singletons |

## Resources

- File: `mobile/src/services/websocket.ts`
