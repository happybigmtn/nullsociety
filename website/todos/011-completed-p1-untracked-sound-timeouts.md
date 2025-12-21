# 011: Untracked Timeouts in playLayered and playChime

---
status: completed
priority: p1
issue_id: 011
tags: [code-review, memory-leak, performance]
dependencies: []
---

## Problem Statement

The `playLayered` function and several inline sound definitions create `setTimeout` calls that are never tracked or cleaned up. If audio is disabled or component unmounts while these timeouts are pending, they still fire - potentially creating audio nodes after cleanup.

## Findings

**Location**: Multiple locations in `/website/src/services/sfxEnhanced.ts`

**Evidence 1 - playLayered (lines 492-501)**:
```typescript
export async function playLayered(
  sounds: Array<{ name: SfxName; delay: number }>
): Promise<void> {
  if (!enabled) return;
  if (!(await ensureContextResumed())) return;

  sounds.forEach(({ name, delay }) => {
    setTimeout(() => playSfx(name), delay);  // Never tracked or cleaned
  });
}
```

**Evidence 2 - playChime (lines 201-213)**:
```typescript
function playChime(...) {
  frequencies.forEach((freq, i) => {
    setTimeout(() => {
      playTone(ctx, freq, ...);  // Never tracked
    }, i * stagger * 1000);
  });
}
```

**Evidence 3 - dice-rattle (lines 304-315)**:
```typescript
'dice-rattle': {
  generate: (ctx) => {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {  // Never tracked
        playNoiseBurst(ctx, ...);
      }, i * 40 + Math.random() * 20);
    }
  },
},
```

**Impact at Scale**:
- Each roulette spin creates 6 layered timeouts
- 10 spins/minute × 60 minutes = 3,600 untracked timeouts/hour
- Risk of sounds playing after audio disabled

## Proposed Solutions

### Option A: Track Timeouts in Module Set (Recommended)
**Pros**: Centralized cleanup, low code churn
**Cons**: Global state
**Effort**: Medium (1 hour)
**Risk**: Low

```typescript
const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

export async function playLayered(sounds: ...) {
  sounds.forEach(({ name, delay }) => {
    const id = setTimeout(() => {
      playSfx(name);
      activeTimeouts.delete(id);
    }, delay);
    activeTimeouts.add(id);
  });
}

export function cleanupSfx(): void {
  activeTimeouts.forEach(id => clearTimeout(id));
  activeTimeouts.clear();
}
```

### Option B: Check enabled flag in timeout callback
**Pros**: Simpler, no tracking needed
**Cons**: Timeout still fires, just returns early
**Effort**: Small (30 min)
**Risk**: Low

```typescript
setTimeout(() => {
  if (!enabled) return;  // Guard check
  playSfx(name);
}, delay);
```

## Recommended Action

**Option A** for `playLayered`, **Option B** for inline sound definitions.

## Technical Details

**Affected Files**:
- `/website/src/services/sfxEnhanced.ts`

## Acceptance Criteria

- [x] playLayered tracks and can cleanup pending timeouts
- [x] playChime checks enabled before playing
- [x] dice-rattle checks enabled before playing
- [x] No sounds play after setSfxEnabled(false)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from performance review | Sound sequences need cleanup mechanisms |
| 2024-12-19 | Fixed - implemented hybrid approach | Option A for playLayered (tracked Set), Option B for inline (enabled guard) |

## Resources

- Performance Oracle analysis
