# 008: Hardcoded Magic Numbers in RouletteView

---
status: completed
priority: p2
issue_id: 008
tags: [code-review, maintainability, pattern]
dependencies: []
---

## Problem Statement

RouletteView uses hardcoded timing values (`4000`, `1500`, `0.1`) instead of referencing the centralized `BASE_DURATIONS` constants. This creates inconsistency if the constants change and makes the code harder to maintain.

## Findings

**Location**: `/website/src/components/casino/games/RouletteView.tsx:50-55`

**Evidence**:
```typescript
const spinDuration = 4000; // Magic number - should be BASE_DURATIONS.rouletteSpin
spinTimeout = setTimeout(() => {
  setIsSpinning(false);
  setShowResult(true);
  revealTimeout = setTimeout(() => setShowResult(false), 1500); // Magic number
}, spinDuration * 0.1); // Magic multiplier
```

**Problems**:
- `4000` should reference `BASE_DURATIONS.rouletteSpin`
- `1500` should reference a reveal duration constant
- `0.1` multiplier is undocumented

## Proposed Solutions

### Option A: Use Hook-Provided Durations (Recommended)
**Pros**: Consistent with rest of codebase
**Cons**: None
**Effort**: Small (15 min)
**Risk**: Low

```typescript
import { BASE_DURATIONS } from '../../../services/animationMode';

// In component
const { getDuration } = useAnimationMode();
const spinDuration = getDuration(BASE_DURATIONS.rouletteSpin);
const revealDuration = getDuration(BASE_DURATIONS.resultReveal || 1500);

spinTimeout = setTimeout(() => {
  setIsSpinning(false);
  setShowResult(true);
  revealTimeout = setTimeout(() => setShowResult(false), revealDuration);
}, spinDuration * 0.1); // 10% delay after result
```

## Recommended Action

**Option A**: Import and use `BASE_DURATIONS`. Add a constant for reveal duration if one doesn't exist.

## Technical Details

**Affected Files**:
- `/website/src/components/casino/games/RouletteView.tsx`
- `/website/src/services/animationMode.ts` (add resultReveal if needed)

## Acceptance Criteria

- [x] No hardcoded timing values in RouletteView
- [x] All durations reference BASE_DURATIONS
- [x] Comment explains 0.1 multiplier purpose

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | Magic numbers should be named constants |
| 2024-12-19 | Fixed - imported BASE_DURATIONS, documented 0.1 multiplier | Single source of truth for timing across CSS, sounds, and components |

## Resources

- PR: commit 72408c8
