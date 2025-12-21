# 014: Type Safety Violation - actions: any

---
status: completed
priority: p2
issue_id: 014
tags: [code-review, typescript, type-safety]
dependencies: []
---

## Problem Statement

The RouletteView component accepts `actions: any` which defeats TypeScript's purpose. This allows typos, missing method calls, and incorrect parameters to slip through without compile-time errors.

## Findings

**Location**: `/website/src/components/casino/games/RouletteView.tsx:12`

**Evidence**:
```typescript
export const RouletteView = React.memo<{
  gameState: GameState;
  numberInput?: string;
  actions: any;  // Type safety violation
  lastWin?: number;
  playMode?: 'CASH' | 'FREEROLL' | null
}>(...)
```

**Used methods observed**:
- `actions?.placeRouletteBet?.(type, target)`
- `actions?.setGameState?.(updater)`
- `actions?.deal?.()`
- `actions?.rebetRoulette?.()`
- `actions?.undoRouletteBet?.()`
- `actions?.cycleRouletteZeroRule?.()`
- `actions?.toggleShield?.()`
- `actions?.toggleDouble?.()`
- `actions?.toggleSuper?.()`

## Proposed Solutions

### Option A: Define RouletteActions Interface (Recommended)
**Pros**: Full type safety, IDE autocomplete
**Cons**: More code
**Effort**: Medium (30 min)
**Risk**: Low

```typescript
interface RouletteActions {
  placeRouletteBet?: (type: string, target?: number) => void;
  setGameState?: (updater: (prev: GameState) => GameState) => void;
  deal?: () => void;
  rebetRoulette?: () => void;
  undoRouletteBet?: () => void;
  cycleRouletteZeroRule?: () => void;
  toggleShield?: () => void;
  toggleDouble?: () => void;
  toggleSuper?: () => void;
}
```

## Recommended Action

**Option A**: Create typed interface for actions.

## Technical Details

**Affected Files**:
- `/website/src/components/casino/games/RouletteView.tsx`

## Acceptance Criteria

- [x] RouletteActions interface defined
- [x] No `any` types in component props
- [x] TypeScript catches typos in action method names

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from TypeScript review | Avoid any - always type action props |
| 2024-12-19 | Fixed - created RouletteActions interface with 9 methods | Type all action props for IDE autocomplete and compile-time safety |

## Resources

- Kieran TypeScript Reviewer findings
