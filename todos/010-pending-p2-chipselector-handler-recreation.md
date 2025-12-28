---
status: completed
priority: p2
issue_id: "010"
tags: [code-review, performance, mobile, react, memoization]
dependencies: []
---

# ChipSelector onSelect Handler Recreation on Every Render

## Problem Statement

The `ChipSelector` component receives `onChipSelect` callback that gets recreated on every parent render. This causes unnecessary re-renders of the chip selection UI in all game screens.

**Why it matters:** ChipSelector appears on 10 game screens; recreation multiplies across all games causing frame drops during betting.

## Findings

**Agent:** performance-oracle
**Severity:** HIGH (P2)

**Location:** Multiple game screens pass inline callbacks to ChipSelector

Example from multiple screens:
```typescript
<ChipSelector
  selectedChip={selectedChip}
  onChipSelect={(value) => setSelectedChip(value)}  // Recreated every render
/>
```

## Proposed Solutions

### Option A: useCallback in Parent Screens (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Simple fix, maintains flexibility
**Cons:** Requires changes in multiple files

```typescript
const handleChipSelect = useCallback((value: number) => {
  setSelectedChip(value);
}, []);

<ChipSelector
  selectedChip={selectedChip}
  onChipSelect={handleChipSelect}
/>
```

### Option B: ChipSelector Internal Memoization
**Effort:** Small
**Risk:** Low
**Pros:** Single change
**Cons:** ChipSelector can't prevent parent's function recreation

Add React.memo to ChipSelector with custom comparison.

## Recommended Action

Apply Option A across all 10 game screens.

## Technical Details

**Affected files:**
- All 10 game screens in `mobile/src/screens/games/`
- `mobile/src/components/casino/ChipSelector.tsx`

## Acceptance Criteria

- [ ] All game screens use useCallback for onChipSelect
- [ ] ChipSelector wrapped with React.memo
- [ ] No unnecessary re-renders during chip selection

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Callbacks passed to children should be memoized |

## Resources

- Component: `mobile/src/components/casino/ChipSelector.tsx`
