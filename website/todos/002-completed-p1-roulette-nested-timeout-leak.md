# 002: RouletteView Nested Timeout Memory Leak

---
status: pending
priority: p1
issue_id: 002
tags: [code-review, performance, memory-leak, react]
dependencies: []
---

## Problem Statement

In RouletteView, `revealTimeout` is set inside the `spinTimeout` callback, but the cleanup function tries to clear both timeouts immediately. If the component unmounts before `spinTimeout` fires, `revealTimeout` doesn't exist yet. After unmount, `spinTimeout` fires and creates `revealTimeout`, which then calls `setShowResult()` on an unmounted component.

## Findings

**Location**: `/website/src/components/casino/games/RouletteView.tsx:42-64`

**Evidence**:
```typescript
useEffect(() => {
    let spinTimeout: ReturnType<typeof setTimeout>;
    let revealTimeout: ReturnType<typeof setTimeout>;

    if (gameState.rouletteHistory.length > prevHistoryLengthRef.current) {
        prevHistoryLengthRef.current = gameState.rouletteHistory.length;
        if (isSpinning && animationMode === 'normal') {
            const spinDuration = 4000;

            // PROBLEM: revealTimeout created INSIDE spinTimeout callback
            spinTimeout = setTimeout(() => {
                setIsSpinning(false);
                setShowResult(true);
                revealTimeout = setTimeout(() => setShowResult(false), 1500);
            }, spinDuration * 0.1);
        }
    }

    return () => {
        clearTimeout(spinTimeout);
        clearTimeout(revealTimeout); // revealTimeout is undefined at cleanup time!
    };
}, [gameState.rouletteHistory.length, isSpinning, animationMode]);
```

**Race Condition**:
1. Effect runs, schedules `spinTimeout` for 400ms
2. User navigates away after 200ms
3. Cleanup runs, clears `spinTimeout` (OK), clears `revealTimeout` (undefined - no-op)
4. 400ms later (after unmount), `spinTimeout` fires, calls `setIsSpinning(false)` on unmounted component
5. Creates `revealTimeout`, which will also fire on unmounted component

## Proposed Solutions

### Option A: Array-Based Timeout Tracking (Recommended)
**Pros**: Handles arbitrarily nested timeouts
**Cons**: Slight code complexity
**Effort**: Small (20 min)
**Risk**: Low

```typescript
useEffect(() => {
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    if (gameState.rouletteHistory.length > prevHistoryLengthRef.current) {
        prevHistoryLengthRef.current = gameState.rouletteHistory.length;
        if (isSpinning && animationMode === 'normal') {
            const spinDuration = 4000;

            timeoutIds.push(setTimeout(() => {
                setIsSpinning(false);
                setShowResult(true);
                // Push nested timeout to same array (captured in closure)
                timeoutIds.push(setTimeout(() => setShowResult(false), 1500));
            }, spinDuration * 0.1));
        }
    }

    return () => {
        timeoutIds.forEach(id => clearTimeout(id));
    };
}, [gameState.rouletteHistory.length, isSpinning, animationMode]);
```

### Option B: Use Ref for Outer Tracking
**Pros**: Works with existing pattern
**Cons**: Ref mutation in effect is a smell
**Effort**: Small (15 min)
**Risk**: Low

```typescript
const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

useEffect(() => {
    // Clear previous timeouts
    timeoutIdsRef.current.forEach(clearTimeout);
    timeoutIdsRef.current = [];

    // ... schedule new timeouts, push to ref

    return () => {
        timeoutIdsRef.current.forEach(clearTimeout);
    };
}, [deps]);
```

## Recommended Action

**Option A**: Array-based tracking within the effect. Simpler, no ref needed.

## Technical Details

**Affected Files**:
- `/website/src/components/casino/games/RouletteView.tsx`

**Components**: RouletteView (used when playing roulette in normal animation mode)

## Acceptance Criteria

- [ ] All timeouts tracked in array
- [ ] Cleanup clears all timeouts, including nested ones
- [ ] No console warnings about state updates on unmounted components
- [ ] Roulette spin animation still works correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | Nested timeouts need special cleanup handling |

## Resources

- PR: commit 72408c8
