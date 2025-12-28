---
status: completed
priority: p3
issue_id: "014"
tags: [code-review, simplicity, mobile, duplication]
dependencies: []
---

# getDieFace Function Duplicated in Craps and Sic Bo

## Problem Statement

The `getDieFace` function (converting die value 1-6 to Unicode emoji) is copy-pasted in both CrapsScreen.tsx and SicBoScreen.tsx with identical logic.

**Why it matters:** Duplicate code; if dice representation changes, both files need updating.

## Findings

**Agent:** code-simplicity-reviewer
**Severity:** LOW (P3)

**Locations:**
- `mobile/src/screens/games/CrapsScreen.tsx`
- `mobile/src/screens/games/SicBoScreen.tsx`

```typescript
// Duplicated in both files:
const getDieFace = (value: number): string => {
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  return faces[value - 1] || '⚀';
};
```

## Proposed Solutions

### Option A: Move to Utils (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** DRY, single source
**Cons:** Trivial refactor

```typescript
// src/utils/dice.ts
export const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

export function getDieFace(value: number): string {
  return DICE_FACES[value - 1] || DICE_FACES[0];
}
```

### Option B: Die Component
**Effort:** Small
**Risk:** Low
**Pros:** Reusable UI component
**Cons:** May be overkill for text emoji

## Recommended Action

Implement Option A - simple utility function extraction.

## Technical Details

**Affected files:**
- Need to create: `mobile/src/utils/dice.ts`
- `mobile/src/screens/games/CrapsScreen.tsx`
- `mobile/src/screens/games/SicBoScreen.tsx`

**Estimated savings:** ~10 LOC

## Acceptance Criteria

- [ ] getDieFace function in single utils file
- [ ] Both screens import from utils
- [ ] No duplicate dice face logic

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Small utilities should be centralized |

## Resources

- Files: `CrapsScreen.tsx`, `SicBoScreen.tsx`
