# 009: Missing Web Audio Cleanup in wheel-spin Sound

---
status: completed
priority: p1
issue_id: 009
tags: [code-review, memory-leak, web-audio]
dependencies: []
---

## Problem Statement

The 'wheel-spin' sound definition creates oscillator and gain nodes but lacks `onended` cleanup handler. This is the exact same bug pattern that was fixed in `playTone`, `playNoiseBurst`, and `playFilteredSweep` but was missed in this inline definition.

## Findings

**Location**: `/website/src/services/sfxEnhanced.ts:346-363`

**Evidence**:
```typescript
'wheel-spin': {
  category: 'wheel',
  generate: (ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 2);
    gain.gain.setValueAtTime(0.05 * masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 2);
    // MISSING: osc.onended cleanup!
  },
  normalOnly: true,
},
```

**Impact**: Memory leak - oscillator and gain nodes are never disconnected.

## Proposed Solutions

### Option A: Add onended Handler (Recommended)
**Pros**: Consistent with other fixes in this file
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

**Option A**: Add onended handler matching the pattern in playTone, playNoiseBurst, etc.

## Technical Details

**Affected Files**:
- `/website/src/services/sfxEnhanced.ts`

## Acceptance Criteria

- [x] wheel-spin sound has onended cleanup handler
- [x] No orphaned audio nodes after wheel spin sound ends

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from parallel code review | Inline sound definitions need same cleanup as helper functions |
| 2024-12-19 | Fixed - added onended cleanup handler | Applied same pattern as playTone, playNoiseBurst |

## Resources

- Related: 003-completed-p1-oscillator-memory-leak.md
