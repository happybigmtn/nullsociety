# 007: Audio/Visual Timing Desynchronization

---
status: completed
priority: p2
issue_id: 007
tags: [code-review, architecture, ux]
dependencies: []
---

## Problem Statement

Sound sequences and visual animations have hardcoded timing values that don't reference the same source of truth. This causes a 800ms gap where the roulette wheel is still spinning but the sound has finished.

## Findings

**Location**: Multiple files

**Evidence**:

In sfxEnhanced.ts (sound timing):
```typescript
rouletteSpin: async () => {
  await playLayered([
    { name: 'wheel-spin', delay: 0 },
    { name: 'ball-bounce', delay: 2400 },
    { name: 'ball-bounce', delay: 2700 },
    { name: 'ball-bounce', delay: 2900 },
    { name: 'ball-bounce', delay: 3050 },
    { name: 'ball-settle', delay: 3200 },  // Sound ends at 3200ms
  ]);
}
```

In CSS (visual timing):
```css
--roulette-spin-duration: 4000ms  /* Visual ends at 4000ms */
```

**Gap**: 800ms of silent spinning.

**Similar Issues**:
- Dice throw sounds may not match dice animation
- Card dealing sounds may not sync with card animations

## Proposed Solutions

### Option A: Reference Centralized Timing (Recommended)
**Pros**: Single source of truth, stays in sync
**Cons**: Requires refactoring sound delays
**Effort**: Medium (1 hour)
**Risk**: Low

```typescript
import { BASE_DURATIONS } from './animationMode';

rouletteSpin: async () => {
  const duration = BASE_DURATIONS.rouletteSpin; // 4000ms
  await playLayered([
    { name: 'wheel-spin', delay: 0 },
    { name: 'ball-bounce', delay: duration * 0.6 },   // 2400ms
    { name: 'ball-bounce', delay: duration * 0.675 }, // 2700ms
    { name: 'ball-bounce', delay: duration * 0.725 }, // 2900ms
    { name: 'ball-bounce', delay: duration * 0.7625 },// 3050ms
    { name: 'ball-settle', delay: duration * 0.95 },  // 3800ms (closer to end)
  ]);
}
```

### Option B: Extend Sound Duration
**Pros**: Quick fix
**Cons**: Doesn't address root cause
**Effort**: Small (15 min)
**Risk**: Low

Just add more bounce sounds at the end.

## Recommended Action

**Option A**: Express sound delays as ratios of `BASE_DURATIONS`. This ensures audio and visual stay in sync when timing constants change.

## Technical Details

**Affected Files**:
- `/website/src/services/sfxEnhanced.ts`
- `/website/src/services/animationMode.ts`

## Acceptance Criteria

- [x] Sound delays reference BASE_DURATIONS
- [x] Ball settle sound plays near animation end (92% of duration)
- [x] Mode switching keeps audio/visual in sync
- [ ] Add timing validation tests (future enhancement)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | Animation timings need single source of truth |
| 2024-12-19 | Fixed - sound delays now use getScaledDuration(BASE_DURATIONS.rouletteSpin) | Express delays as ratios (60%, 70%, 80%, 92%) for automatic sync |

## Resources

- PR: commit 72408c8
