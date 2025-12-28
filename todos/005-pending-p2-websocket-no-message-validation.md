---
status: completed
priority: p2
issue_id: "005"
tags: [code-review, security, mobile, websocket, validation]
dependencies: []
---

# WebSocket Messages Parsed Without Runtime Validation

## Problem Statement

Incoming WebSocket messages are parsed and cast to the expected type without runtime validation. A malicious server or MITM attacker could inject malformed messages that the client would blindly trust.

**Why it matters:** An attacker controlling the WebSocket connection could inject fake balance updates, trigger unexpected UI states, or exploit type confusion bugs.

## Findings

**Agent:** security-sentinel
**Severity:** HIGH (P2)

**Location:** `mobile/src/services/websocket.ts:67-74`

```typescript
ws.current.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data) as T;  // Type assertion only
    setLastMessage(data);
  } catch (e) {
    console.error('Failed to parse WebSocket message:', e);
  }
};
```

## Proposed Solutions

### Option A: Zod Runtime Validation (Recommended)
**Effort:** Medium
**Risk:** Low
**Pros:** Type-safe, catches malformed data
**Cons:** Adds bundle size (~12KB)

```typescript
import { z } from 'zod';

const BaseMessageSchema = z.object({
  type: z.string(),
});

ws.current.onmessage = (event) => {
  const parsed = BaseMessageSchema.safeParse(JSON.parse(event.data));
  if (!parsed.success) {
    console.error('Invalid message:', parsed.error);
    return;
  }
  setLastMessage(parsed.data);
};
```

### Option B: Manual Validation Functions
**Effort:** Medium
**Risk:** Medium (easy to miss cases)
**Pros:** No dependencies
**Cons:** More code, error-prone

## Recommended Action

Add Zod to dependencies and create message schemas in `src/types/protocol.ts`.

## Technical Details

**Affected files:**
- `mobile/src/services/websocket.ts`
- Need to create: `mobile/src/types/protocol.ts`

## Acceptance Criteria

- [ ] All incoming WebSocket messages are validated
- [ ] Invalid messages are logged and ignored
- [ ] Type safety is enforced at runtime
- [ ] Balance updates are validated before applying

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | TypeScript types are compile-time only; runtime validation is separate |

## Resources

- File: `mobile/src/services/websocket.ts:67-74`
- Zod docs: https://zod.dev
