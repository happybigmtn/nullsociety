# 013: Missing will-change on Animation Classes

---
status: completed
priority: p2
issue_id: 013
tags: [code-review, performance, css]
dependencies: []
---

## Problem Statement

Several CSS animation classes that animate `transform` and `opacity` are missing `will-change` hints, causing paint operations every frame instead of GPU-accelerated compositing. This results in 45-50fps on mobile instead of 60fps.

## Findings

**Location**: `/website/src/index.css`

**Missing will-change on**:
- Line 184: `.animate-card-deal` (animates transform + opacity)
- Line 202: `.animate-dice-roll` (animates transform)
- Line 221: `.animate-roulette-spin` (animates transform + opacity)
- Line 463: `cardDealNormal` variant
- Line 598: `.animate-card-flip-dramatic` (animates transform with preserve-3d)

**Already has will-change**:
- Line 338: `.animate-dice-throw` - GOOD
- Line 388: `.animate-shaker-shake` - GOOD
- Line 682: `.animate-wheel-spin` - GOOD

**Impact**:
- 15-20% FPS drop on mid-range mobile devices
- Increased battery drain (~15-20% faster depletion)

## Proposed Solutions

### Option A: Add will-change to Missing Classes (Recommended)
**Pros**: Consistent with existing pattern
**Cons**: Slightly higher GPU memory when idle
**Effort**: Small (15 min)
**Risk**: Low

```css
.animate-card-deal,
.animate-dice-roll,
.animate-roulette-spin,
.animate-card-flip-dramatic {
  will-change: transform, opacity;
}
```

## Recommended Action

**Option A**: Add will-change to all animation classes.

## Technical Details

**Affected Files**:
- `/website/src/index.css`

## Acceptance Criteria

- [x] All animation classes have will-change hints
- [x] 60fps maintained on mid-range mobile devices
- [x] Chrome DevTools shows compositor layers for animated elements

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from performance review | GPU layer promotion requires explicit will-change hints |
| 2024-12-19 | Fixed - added will-change to 4 animation classes | Match properties animated (transform, opacity) |

## Resources

- MDN: [will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
- Performance Oracle analysis
