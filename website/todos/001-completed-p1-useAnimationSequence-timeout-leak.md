# 001: Memory Leak in useAnimationSequence Hook

---
status: pending
priority: p1
issue_id: 001
tags: [code-review, performance, memory-leak, react]
dependencies: []
---

## Problem Statement

The `useAnimationSequence` hook creates multiple `setTimeout` calls without storing timeout IDs. If a component unmounts during an animation sequence, all these timers continue running and attempt to call `setState` on an unmounted component, causing memory leaks and React warnings.

## Findings

**Location**: `/website/src/hooks/useAnimationMode.ts:186-215`

**Evidence**:
```typescript
const start = useCallback(() => {
  if (isPlaying) return;
  setIsPlaying(true);
  setCurrentPhase(0);

  let elapsed = 0;
  phases.forEach((phase, index) => {
    const duration = scaleByMode ? getDuration(phase.duration) : phase.duration;

    // PROBLEM: setTimeout IDs not stored
    setTimeout(() => {
      setCurrentPhase(index);
      phase.onStart?.();
    }, elapsed);

    elapsed += duration;
    setTimeout(() => {
      phase.onEnd?.();
    }, elapsed);
  });

  setTimeout(() => {
    setIsPlaying(false);
    setCurrentPhase(-1);
    onComplete?.();
  }, elapsed);
}, [isPlaying, phases, getDuration, scaleByMode, onComplete]);
```

**Impact**:
- Memory leak from orphaned callback closures
- React warnings: "Can't perform a React state update on an unmounted component"
- Potential crashes if callbacks reference disposed resources

## Proposed Solutions

### Option A: Track and Clear Timeouts (Recommended)
**Pros**: Proper cleanup, maintains hook functionality
**Cons**: Slight code complexity increase
**Effort**: Small (30 min)
**Risk**: Low

```typescript
const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

const start = useCallback(() => {
  // Clear any existing timeouts first
  timeoutsRef.current.forEach(clearTimeout);
  timeoutsRef.current = [];

  if (isPlaying) return;
  setIsPlaying(true);
  setCurrentPhase(0);

  let elapsed = 0;
  phases.forEach((phase, index) => {
    const duration = scaleByMode ? getDuration(phase.duration) : phase.duration;

    timeoutsRef.current.push(setTimeout(() => {
      setCurrentPhase(index);
      phase.onStart?.();
    }, elapsed));

    elapsed += duration;
    timeoutsRef.current.push(setTimeout(() => {
      phase.onEnd?.();
    }, elapsed));
  });

  timeoutsRef.current.push(setTimeout(() => {
    setIsPlaying(false);
    setCurrentPhase(-1);
    onComplete?.();
  }, elapsed));
}, [isPlaying, phases, getDuration, scaleByMode, onComplete]);

// Add cleanup effect
useEffect(() => {
  return () => {
    timeoutsRef.current.forEach(clearTimeout);
  };
}, []);
```

### Option B: Remove Hook Entirely
**Pros**: Simplest solution, hook is never used in codebase
**Cons**: Loses potential future functionality
**Effort**: Small (15 min)
**Risk**: Low

The hook has zero call sites in the codebase. Remove lines 148-230.

## Recommended Action

**Option B**: Remove the unused hook. If animation sequencing is needed later, implement it with proper cleanup from the start.

## Technical Details

**Affected Files**:
- `/website/src/hooks/useAnimationMode.ts`

**Components**: None (hook is unused)

## Acceptance Criteria

- [ ] No setTimeout calls without tracked IDs
- [ ] All timeouts cleared on component unmount
- [ ] No React state update warnings in console
- [ ] Tests verify cleanup behavior (if hook is kept)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | Memory leaks in hooks are silent until production |

## Resources

- PR: commit 72408c8
- React docs: [Hooks Effect Cleanup](https://react.dev/learn/synchronizing-with-effects#how-to-handle-the-effect-firing-twice-in-development)
