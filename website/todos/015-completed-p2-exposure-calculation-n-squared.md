# 015: Exposure Calculation Runs 37 Times Per Render

---
status: completed
priority: p2
issue_id: 015
tags: [code-review, performance, react]
dependencies: []
---

## Problem Statement

The `renderExposureRow` callback recalculates `calculateRouletteExposure()` for each of 37 roulette numbers on every render. With 10+ bets, this results in 37 × O(n) calculations = ~370 operations per render.

## Findings

**Location**: `/website/src/components/casino/games/RouletteView.tsx:124-148`

**Evidence**:
```typescript
const renderExposureRow = useCallback((num: number) => {
  const pnl = calculateRouletteExposure(num, gameState.rouletteBets);  // Called 37 times
  const maxScale = totalBet * 36;  // Also recalculated 37 times
  // ... rendering logic
}, [gameState.rouletteBets, totalBet]);

// Called in sidebar:
{Array.from({length: 37}, (_, i) => renderExposureRow(i))}
```

**Impact**:
- ~50-80ms per render with 10+ bets
- Jank on mobile devices when placing bets rapidly

## Proposed Solutions

### Option A: Memoize Exposure Map (Recommended)
**Pros**: O(n) once instead of O(37×n), significant speedup
**Cons**: Slightly more memory
**Effort**: Medium (30 min)
**Risk**: Low

```typescript
const exposureMap = useMemo(() => {
  const map = new Map<number, number>();
  for (let num = 0; num <= 36; num++) {
    map.set(num, calculateRouletteExposure(num, gameState.rouletteBets));
  }
  return map;
}, [gameState.rouletteBets]);

const maxScale = useMemo(() => totalBet * 36, [totalBet]);

const renderExposureRow = useCallback((num: number) => {
  const pnl = exposureMap.get(num)!;
  // ... rendering logic using pre-computed maxScale
}, [exposureMap, maxScale]);
```

## Recommended Action

**Option A**: Pre-compute exposure map and maxScale.

## Technical Details

**Affected Files**:
- `/website/src/components/casino/games/RouletteView.tsx`

## Acceptance Criteria

- [x] Exposure calculated once per number, not per render
- [x] maxScale calculated once, not 37 times
- [x] Render time reduced from 50-80ms to <20ms

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from performance review | Pre-compute in useMemo for repeated calculations |
| 2024-12-19 | Fixed - added exposureMap and maxScale useMemo | Pre-compute expensive calculations; O(n) once beats O(37×n) per render |

## Resources

- Performance Oracle analysis
