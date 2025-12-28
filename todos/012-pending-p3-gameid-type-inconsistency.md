---
status: completed
priority: p3
issue_id: "012"
tags: [code-review, architecture, mobile, typescript, types]
dependencies: []
---

# GameId Type Definition Inconsistency

## Problem Statement

`GameId` is defined as a union type in `types.ts` but some screens use string literals directly. This can lead to typos that TypeScript won't catch and makes refactoring harder.

**Why it matters:** Type safety is reduced; adding new games requires updating multiple places.

## Findings

**Agent:** architecture-strategist
**Severity:** MEDIUM (P3)

**Location:** `mobile/src/types/types.ts` and game screens

```typescript
// types.ts defines:
export type GameId = 'hi-lo' | 'blackjack' | 'roulette' | ...;

// But some screens use literals:
navigation.navigate('Game', { gameId: 'hilo' });  // Wrong! 'hilo' vs 'hi-lo'
```

## Proposed Solutions

### Option A: Centralized Constants (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Single source of truth, autocomplete
**Cons:** Minor refactor

```typescript
// src/constants/games.ts
export const GAME_IDS = {
  HI_LO: 'hi-lo',
  BLACKJACK: 'blackjack',
  ROULETTE: 'roulette',
  // ...
} as const;

export type GameId = typeof GAME_IDS[keyof typeof GAME_IDS];

// Usage:
navigation.navigate('Game', { gameId: GAME_IDS.HI_LO });
```

### Option B: Enum
**Effort:** Small
**Risk:** Low
**Pros:** Built-in reverse mapping
**Cons:** Enums have quirks in TypeScript

## Recommended Action

Implement Option A with constants object.

## Technical Details

**Affected files:**
- `mobile/src/types/types.ts`
- `mobile/src/screens/LobbyScreen.tsx`
- `mobile/src/screens/GameScreen.tsx`

## Acceptance Criteria

- [ ] GameId derived from single constants object
- [ ] All screens import and use constants
- [ ] No literal game ID strings in navigation calls
- [ ] TypeScript catches invalid game IDs

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Derive types from constants for single source of truth |

## Resources

- File: `mobile/src/types/types.ts`
