---
status: completed
priority: p2
issue_id: "008"
tags: [code-review, performance, mobile, reanimated, react]
dependencies: []
---

# SharedValue in useEffect Dependency Array Causes Animation Re-triggers

## Problem Statement

In Roulette, Craps, and Sic Bo screens, SharedValues are incorrectly placed in useEffect dependency arrays. SharedValues should never be in deps - they are stable refs. Including them triggers effect re-runs on every animation frame change.

**Why it matters:** CPU spikes during animations, jank, battery drain.

## Findings

**Agent:** performance-oracle
**Severity:** HIGH (P2)

**Locations:**
- `mobile/src/screens/games/RouletteScreen.tsx:80-109` - `wheelRotation` in deps
- `mobile/src/screens/games/CrapsScreen.tsx:84-124` - `die1Rotation, die2Rotation` in deps
- `mobile/src/screens/games/SicBoScreen.tsx:82-132` - `dice1Bounce, dice2Bounce, dice3Bounce` in deps

```typescript
// RouletteScreen.tsx
useEffect(() => {
  // ... animation code
}, [lastMessage, wheelRotation]);  // wheelRotation should NOT be here
```

## Proposed Solutions

### Option A: Remove SharedValue from Dependencies (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Correct behavior, fixes performance issue
**Cons:** None

```typescript
useEffect(() => {
  if (!lastMessage) return;
  // ... animation code using wheelRotation.value
}, [lastMessage]); // Only lastMessage needed
```

## Recommended Action

Remove all SharedValues from useEffect dependency arrays in affected files.

## Technical Details

**Affected files:**
- `mobile/src/screens/games/RouletteScreen.tsx`
- `mobile/src/screens/games/CrapsScreen.tsx`
- `mobile/src/screens/games/SicBoScreen.tsx`

## Acceptance Criteria

- [ ] No SharedValues in useEffect dependency arrays
- [ ] Animations run smoothly without extra re-renders
- [ ] Wheel/dice animations don't cause CPU spikes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | SharedValues are refs, not reactive state |

## Resources

- Files: `RouletteScreen.tsx`, `CrapsScreen.tsx`, `SicBoScreen.tsx`
- Reanimated docs: https://docs.swmansion.com/react-native-reanimated/
