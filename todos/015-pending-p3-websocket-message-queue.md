---
status: completed
priority: p3
issue_id: "015"
tags: [code-review, architecture, mobile, websocket, reliability]
dependencies: ["007"]
---

# No Message Queue During WebSocket Reconnection

## Problem Statement

When the WebSocket disconnects and reconnects, any messages sent during that window are silently dropped. There's no queue to buffer messages for retry.

**Why it matters:** User actions during brief disconnects are lost; bets may not register.

## Findings

**Agent:** architecture-strategist
**Severity:** MEDIUM (P3)

**Location:** `mobile/src/services/websocket.ts`

Current send implementation:
```typescript
const send = useCallback((message: object) => {
  if (ws.current?.readyState === WebSocket.OPEN) {
    ws.current.send(JSON.stringify(message));
  }
  // Messages dropped if not OPEN!
}, []);
```

## Proposed Solutions

### Option A: Message Queue with Retry (Recommended)
**Effort:** Medium
**Risk:** Low
**Pros:** Messages survive reconnection
**Cons:** Queue management complexity

```typescript
const messageQueue = useRef<object[]>([]);

const send = useCallback((message: object) => {
  if (ws.current?.readyState === WebSocket.OPEN) {
    ws.current.send(JSON.stringify(message));
  } else {
    messageQueue.current.push(message);
  }
}, []);

// On reconnect:
const flushQueue = useCallback(() => {
  while (messageQueue.current.length > 0) {
    const msg = messageQueue.current.shift();
    ws.current?.send(JSON.stringify(msg));
  }
}, []);
```

### Option B: Optimistic UI with Rollback
**Effort:** High
**Risk:** Medium
**Pros:** Better UX
**Cons:** Complex state management

## Recommended Action

Implement Option A as part of WebSocket singleton refactor (issue #007).

## Technical Details

**Affected files:**
- `mobile/src/services/websocket.ts`

## Acceptance Criteria

- [ ] Messages queued when WebSocket is disconnected
- [ ] Queue flushed on successful reconnection
- [ ] Queue has reasonable size limit (e.g., 100 messages)
- [ ] Old messages expire after timeout

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Offline-first patterns improve reliability |

## Resources

- File: `mobile/src/services/websocket.ts`
