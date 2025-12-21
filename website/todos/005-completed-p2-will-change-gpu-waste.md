# 005: Excessive will-change GPU Memory Usage

---
status: completed
priority: p2
issue_id: 005
tags: [code-review, performance, css, gpu]
dependencies: []
---

## Problem Statement

Multiple CSS classes apply permanent `will-change: transform` hints, creating GPU compositor layers that persist even when animations aren't running. This wastes approximately 448KB of GPU memory per game view when idle.

## Findings

**Location**: `/website/src/index.css`

**Evidence**:
```css
/* Line 388 */
.animate-shaker-shake {
  animation: shakerShake 1.8s ease-in-out;
  will-change: transform; /* Permanent GPU layer */
}

/* Line 682 */
.animate-wheel-spin {
  will-change: transform; /* Permanent GPU layer */
  transform: translateZ(0); /* Double GPU promotion */
}

/* Line 700 */
.animate-ball-orbit {
  will-change: transform; /* Permanent GPU layer */
}

/* Line also affected */
.animate-dice-throw {
  will-change: transform, opacity;
}
```

**GPU Memory Impact**:
- Roulette wheel (256x256 element): ~256KB texture
- Ball orbit element: ~64KB texture
- Shaker dome: ~128KB texture
- **Total idle waste**: ~448KB per game view

**Impact**: Especially problematic on mobile devices with limited GPU memory.

## Proposed Solutions

### Option A: Apply will-change Dynamically via JS (Recommended)
**Pros**: Zero idle overhead, optimal during animation
**Cons**: Requires JS coordination
**Effort**: Medium (1 hour)
**Risk**: Low

```typescript
// Before animation
element.style.willChange = 'transform';

// After animation completes
setTimeout(() => {
  element.style.willChange = 'auto';
}, animationDuration);
```

### Option B: Use animation-play-state Instead
**Pros**: CSS-only solution
**Cons**: Still creates layer when paused
**Effort**: Small (30 min)
**Risk**: Low

Remove `will-change`, rely on browser auto-optimization.

## Recommended Action

**Option A**: Dynamic application. Add `will-change` before animation starts, remove after completion.

## Technical Details

**Affected Files**:
- `/website/src/index.css`
- `/website/src/components/casino/games/RouletteView.tsx`
- `/website/src/components/casino/games/SicBoView.tsx`

## Acceptance Criteria

- [x] No permanent will-change hints in CSS
- [x] will-change applied only during active animations (via .animating class)
- [x] GPU memory stable when idle
- [x] 60fps maintained during animations

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | will-change should be temporary |
| 2024-12-19 | Fixed - moved will-change to .animating modifier class | Use CSS class combinations for dynamic GPU hints |

## Resources

- PR: commit 72408c8
- MDN: [will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
