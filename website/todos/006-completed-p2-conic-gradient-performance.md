# 006: RouletteView conic-gradient Performance Issue

---
status: pending
priority: p2
issue_id: 006
tags: [code-review, performance, react, css]
dependencies: []
---

## Problem Statement

The roulette wheel uses an inline `conic-gradient` with 37 color stops that is recalculated on every render. Combined with transform animations, this causes dropped frames on mobile devices (estimated 30-45fps instead of 60fps target).

## Findings

**Location**: `/website/src/components/casino/games/RouletteView.tsx:232-237`

**Evidence**:
```typescript
background: `conic-gradient(from 0deg, ${WHEEL_ORDER.map((num, i) => {
  const color = num === 0 ? '#22c55e' : getRouletteColor(num) === 'RED' ? '#ef4444' : '#1f2937';
  const start = (i / 37) * 100;
  const end = ((i + 1) / 37) * 100;
  return `${color} ${start}% ${end}%`;
}).join(', ')})`
```

**Problems**:
1. Inline style recalculated on every render
2. `getRouletteColor()` called 37 times per render
3. String concatenation creates new gradient string each time
4. During spin animation, browser must repaint complex gradient per frame

**Performance Impact**:
- Initial paint: ~15-25ms blocking main thread
- During spin: Continuous repaints cause frame drops
- Mobile devices most affected

## Proposed Solutions

### Option A: Memoize Static Gradient (Recommended)
**Pros**: Simple, significant improvement
**Cons**: None
**Effort**: Small (15 min)
**Risk**: Low

```typescript
const wheelGradient = useMemo(() => {
  return `conic-gradient(from 0deg, ${WHEEL_ORDER.map((num, i) => {
    const color = num === 0 ? '#22c55e' : getRouletteColor(num) === 'RED' ? '#ef4444' : '#1f2937';
    const start = (i / 37) * 100;
    const end = ((i + 1) / 37) * 100;
    return `${color} ${start}% ${end}%`;
  }).join(', ')})`;
}, []); // Never changes - wheel colors are static
```

### Option B: Pre-render to Canvas/SVG
**Pros**: Maximum performance, no gradient repainting
**Cons**: More complex implementation
**Effort**: Large (3 hours)
**Risk**: Low

## Recommended Action

**Option A**: Memoize the gradient. It's static and should only be computed once.

## Technical Details

**Affected Files**:
- `/website/src/components/casino/games/RouletteView.tsx`

## Acceptance Criteria

- [ ] Wheel gradient computed once per mount
- [ ] No gradient recalculation during spin
- [ ] 60fps maintained during wheel animation
- [ ] Chrome DevTools shows no long paint times

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | Inline styles in JSX are recalculated every render |

## Resources

- PR: commit 72408c8
