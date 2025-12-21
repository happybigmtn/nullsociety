# 004: Stale Closure Bug in getDuration/getDelay

---
status: pending
priority: p1
issue_id: 004
tags: [code-review, react, hooks, bug]
dependencies: []
---

## Problem Statement

The `getDuration` and `getDelay` callbacks in `useAnimationMode` have `[mode]` in their dependency arrays, but the functions they call (`getScaledDuration`, `getScaledDelay`) read from the module-level `currentMode` variable instead of the local `mode` state. This creates a stale closure where the functions may return values based on an outdated mode.

## Findings

**Location**: `/website/src/hooks/useAnimationMode.ts:103-110`

**Evidence**:
```typescript
// In useAnimationMode hook
const getDuration = useCallback((baseDuration: number) => {
  return getScaledDuration(baseDuration); // Calls module function
}, [mode]); // mode is not used in function body!

const getDelay = useCallback((baseDelay: number) => {
  return getScaledDelay(baseDelay); // Calls module function
}, [mode]); // mode is not used in function body!
```

```typescript
// In animationMode.ts service (module-level)
let currentMode: AnimationMode = 'turbo'; // Module state

export function getScaledDuration(baseDuration: number): number {
  const scale = MODE_SCALES[currentMode].duration; // Reads module state
  return Math.round(baseDuration * scale);
}
```

**Stale Closure Scenario**:
1. Component mounts with `mode='turbo'`
2. User saves reference to `getDuration` (e.g., in a callback or closure)
3. User toggles to `mode='normal'`
4. Hook creates new `getDuration` (due to `[mode]` dep), but...
5. Old references still call `getScaledDuration()` which reads module state
6. If module state updates but component hasn't re-rendered, values mismatch

**Why This Matters**: The `[mode]` dependency array creates a false contract. TypeScript can't catch this bug because the function technically works - it just reads from the wrong source.

## Proposed Solutions

### Option A: Use Local Mode State Directly (Recommended)
**Pros**: Eliminates stale closure, self-contained
**Cons**: Duplicates scaling logic
**Effort**: Small (15 min)
**Risk**: Low

```typescript
const getDuration = useCallback((baseDuration: number) => {
  // Use local mode state, not module function
  const scale = mode === 'turbo' ? 0.15 : 1.0;
  return Math.round(baseDuration * scale);
}, [mode]);

const getDelay = useCallback((baseDelay: number) => {
  const scale = mode === 'turbo' ? 0.1 : 1.0;
  return Math.round(baseDelay * scale);
}, [mode]);
```

### Option B: Pass Mode to Service Functions
**Pros**: Single source of truth for scaling logic
**Cons**: More invasive change to service API
**Effort**: Medium (30 min)
**Risk**: Low

```typescript
// In animationMode.ts
export function getScaledDuration(baseDuration: number, mode: AnimationMode): number {
  const scale = MODE_SCALES[mode].duration;
  return Math.round(baseDuration * scale);
}

// In useAnimationMode.ts
const getDuration = useCallback((baseDuration: number) => {
  return getScaledDuration(baseDuration, mode); // Pass mode explicitly
}, [mode]);
```

## Recommended Action

**Option A**: Inline the scaling logic. It's simple math (one line) and eliminates the indirection that caused this bug.

## Technical Details

**Affected Files**:
- `/website/src/hooks/useAnimationMode.ts`

**Constants Used**:
- Turbo duration scale: 0.15
- Turbo delay scale: 0.1
- Normal scale: 1.0

## Acceptance Criteria

- [ ] `getDuration` uses local `mode` state, not module variable
- [ ] `getDelay` uses local `mode` state, not module variable
- [ ] Returned values always match current hook mode
- [ ] No stale values when mode changes mid-animation

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | useCallback deps must match actual dependencies |

## Resources

- PR: commit 72408c8
- React docs: [useCallback](https://react.dev/reference/react/useCallback)
