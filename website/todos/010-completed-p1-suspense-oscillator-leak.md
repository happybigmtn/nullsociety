# 010: Missing Web Audio Cleanup in suspense Sound

---
status: completed
priority: p1
issue_id: 010
tags: [code-review, memory-leak, web-audio]
dependencies: []
---

## Problem Statement

The 'suspense' sound definition creates oscillator and gain nodes but lacks `onended` cleanup handler. Same pattern as issue 009.

## Findings

**Location**: `/website/src/services/sfxEnhanced.ts:441-458`

**Evidence**:
```typescript
'suspense': {
  category: 'ambient',
  generate: (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.5);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 1);
    gain.gain.setValueAtTime(0.03 * masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05 * masterVolume, ctx.currentTime + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
    // MISSING: osc.onended cleanup!
  },
  normalOnly: true,
},
```

**Impact**: Memory leak - oscillator and gain nodes never disconnected.

## Proposed Solutions

### Option A: Add onended Handler (Recommended)
**Pros**: Consistent with other fixes
**Cons**: None
**Effort**: Small (5 min)
**Risk**: Low

```typescript
osc.onended = () => {
  osc.disconnect();
  gain.disconnect();
};
```

## Recommended Action

**Option A**: Add onended handler.

## Technical Details

**Affected Files**:
- `/website/src/services/sfxEnhanced.ts`

## Acceptance Criteria

- [x] suspense sound has onended cleanup handler

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from parallel code review | All SOUND_DEFINITIONS with inline generate() need cleanup |
| 2024-12-19 | Fixed - added onended cleanup handler | Applied same pattern as wheel-spin fix |

## Resources

- Related: 009-completed-p1-wheel-spin-oscillator-leak.md
