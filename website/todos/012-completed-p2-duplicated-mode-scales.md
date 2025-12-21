# 012: Duplicated Animation Mode Scale Constants

---
status: completed
priority: p2
issue_id: 012
tags: [code-review, maintainability, dry]
dependencies: []
---

## Problem Statement

The `useAnimationMode` hook hardcodes scaling factors that duplicate `MODE_SCALES` from `animationMode.ts`. If scales change in one place, they must be manually updated in the other.

## Findings

**Location**: `/website/src/hooks/useAnimationMode.ts:98-99`

**Evidence**:
```typescript
// In useAnimationMode.ts - hardcoded
const durationScale = mode === 'turbo' ? 0.15 : 1.0;
const delayScale = mode === 'turbo' ? 0.1 : 1.0;

// In animationMode.ts - also defined
const MODE_SCALES: Record<AnimationMode, { duration: number; delay: number }> = {
  turbo: { duration: 0.15, delay: 0.1 },
  normal: { duration: 1.0, delay: 1.0 },
};
```

**Comment in code**: Line 97 says "must match animationMode.ts MODE_SCALES" but this is error-prone.

## Proposed Solutions

### Option A: Export MODE_SCALES (Recommended)
**Pros**: Single source of truth
**Cons**: Minor API addition
**Effort**: Small (15 min)
**Risk**: Low

```typescript
// animationMode.ts
export const MODE_SCALES = { ... };

// useAnimationMode.ts
import { MODE_SCALES } from '../services/animationMode';
const durationScale = MODE_SCALES[mode].duration;
const delayScale = MODE_SCALES[mode].delay;
```

## Recommended Action

**Option A**: Export `MODE_SCALES` from animationMode.ts and import in hook.

## Technical Details

**Affected Files**:
- `/website/src/services/animationMode.ts`
- `/website/src/hooks/useAnimationMode.ts`

## Acceptance Criteria

- [x] MODE_SCALES exported from animationMode.ts
- [x] useAnimationMode imports and uses MODE_SCALES
- [x] No hardcoded scale values in hook

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from TypeScript review | DRY principle - single source of truth for constants |
| 2024-12-19 | Fixed - exported MODE_SCALES and updated imports | Simple export/import eliminates duplication risk |

## Resources

- Kieran TypeScript Reviewer findings
