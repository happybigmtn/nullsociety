---
status: completed
priority: p1
issue_id: "003"
tags: [code-review, architecture, mobile, state-management]
dependencies: []
---

# Massive State Duplication Across 10 Game Screens

## Problem Statement

Each of the 10 game screens independently manages balance state, WebSocket connections, bet state, chip selection, phase management, and tutorial visibility. This creates:
- 10 separate WebSocket connections when navigating between games
- 10 independent balance values that can drift out of sync
- ~400+ lines of nearly identical state management code

**Why it matters:** Data inconsistency, memory waste, maintenance burden, and potential for balance to show different values across screens.

## Findings

**Agent:** architecture-strategist
**Severity:** CRITICAL (P1)

**Locations:**
- `mobile/src/screens/games/BlackjackScreen.tsx:66-84`
- `mobile/src/screens/games/HiLoScreen.tsx:50-63`
- `mobile/src/screens/games/RouletteScreen.tsx:64-77`
- `mobile/src/screens/games/CrapsScreen.tsx:65-79`
- All 10 game screens follow this anti-pattern

**Evidence of duplication:**

Header component duplicated 10x:
```typescript
<View style={styles.header}>
  <View style={styles.balanceContainer}>
    <Text style={styles.balanceLabel}>Balance</Text>
    <Text style={styles.balance}>${state.balance.toLocaleString()}</Text>
  </View>
  <HelpButton onPress={() => setShowTutorial(true)} />
</View>
```

Same styles copied 10 times (~200 duplicate lines).

## Proposed Solutions

### Option A: Global State Management with Zustand (Recommended)
**Effort:** Medium
**Risk:** Low
**Pros:** Single source of truth, shared WebSocket
**Cons:** Requires refactoring all screens

```typescript
// src/stores/gameStore.ts
import { create } from 'zustand';

interface GameStore {
  balance: number;
  selectedChip: ChipValue;
  updateBalance: (delta: number) => void;
  setSelectedChip: (chip: ChipValue) => void;
}

const useGameStore = create<GameStore>((set) => ({
  balance: 0,
  selectedChip: 25,
  updateBalance: (delta) => set((s) => ({ balance: s.balance + delta })),
  setSelectedChip: (chip) => set({ selectedChip: chip }),
}));
```

### Option B: Shared GameLayout Component + Context
**Effort:** Medium
**Risk:** Low
**Pros:** Reusable layout, reduces per-screen code
**Cons:** Still need context for cross-component state

### Option C: Custom useGameState Hook
**Effort:** Small
**Risk:** Low
**Pros:** Quick win, extracts common logic
**Cons:** Still creates multiple instances

## Recommended Action

Implement Option A (Zustand) for global state + Option B for shared layout.

## Technical Details

**Affected files:**
- All 10 game screens in `mobile/src/screens/games/`
- Need to create: `mobile/src/stores/gameStore.ts`
- Need to create: `mobile/src/components/game/GameLayout.tsx`

**Estimated LOC reduction:** ~400 lines

## Acceptance Criteria

- [ ] Single balance value shared across all games
- [ ] Single WebSocket connection at app level
- [ ] Header/ChipSelector/Tutorial extracted to shared component
- [ ] Styles consolidated into shared game styles
- [ ] Balance updates from any game reflect in lobby

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | State duplication is a common pattern that indicates missing abstraction |

## Resources

- Files: All `mobile/src/screens/games/*.tsx`
- Zustand docs: https://github.com/pmndrs/zustand
