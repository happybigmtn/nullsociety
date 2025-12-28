---
status: completed
priority: p2
issue_id: "009"
tags: [code-review, performance, mobile, reanimated, react]
dependencies: []
---

# Card Component - onFlipComplete Causes Animation Re-triggers

## Problem Statement

The `onFlipComplete` callback is in the useEffect dependency array without a stable reference guarantee. This causes flip animations to re-run on every parent re-render.

**Why it matters:** Card flip animation replays unexpectedly, haptic feedback triggers repeatedly without user action, visual jank.

## Findings

**Agent:** performance-oracle
**Severity:** HIGH (P2)

**Location:** `mobile/src/components/casino/Card.tsx:82-99`

```typescript
useEffect(() => {
  flip.value = withTiming(
    faceUp ? 180 : 0,
    // ...
  );
}, [faceUp, flip, onFlipComplete]);  // onFlipComplete changes on every render
```

## Proposed Solutions

### Option A: Use Ref for Callback (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Stable reference, correct behavior
**Cons:** Slightly more code

```typescript
const onFlipCompleteRef = useRef(onFlipComplete);
onFlipCompleteRef.current = onFlipComplete;

useEffect(() => {
  flip.value = withTiming(
    faceUp ? 180 : 0,
    {
      duration: ANIMATION.normal,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    },
    (finished) => {
      'worklet';
      if (finished && faceUp) {
        runOnJS(() => {
          haptics.cardDeal();
          onFlipCompleteRef.current?.();
        })();
      }
    }
  );
}, [faceUp, flip]); // Remove onFlipComplete from deps
```

### Option B: Remove onFlipComplete Entirely
**Effort:** Small
**Risk:** Low
**Pros:** Simplest fix
**Cons:** Removes unused functionality

The prop is never used by any caller currently.

## Recommended Action

Implement Option A if the callback is needed, or Option B if unused.

## Technical Details

**Affected files:**
- `mobile/src/components/casino/Card.tsx`

## Acceptance Criteria

- [ ] Card flip animation only triggers on faceUp change
- [ ] No unexpected re-renders cause flip replays
- [ ] Haptic feedback only fires once per intended flip

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Callback props should use refs in useEffect deps |

## Resources

- File: `mobile/src/components/casino/Card.tsx:82-99`
