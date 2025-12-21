# 003: Web Audio Oscillator Memory Leak

---
status: pending
priority: p1
issue_id: 003
tags: [code-review, performance, memory-leak, web-audio]
dependencies: []
---

## Problem Statement

Web Audio API oscillators and gain nodes are created for each sound effect but never disconnected after playback completes. This causes memory to grow unbounded as users play games, potentially leading to browser tab crashes during long sessions.

## Findings

**Location**: `/website/src/services/sfxEnhanced.ts:167-183`

**Evidence**:
```typescript
function playTone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  attack: number,
  decay: number
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  // ... gain envelope setup ...

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration);
  // MISSING: No cleanup after stop!
}
```

**Also affected**:
- `playNoiseBurst()` (lines 117-152)
- `playFilteredSweep()` (lines 155-183)
- Sound definitions using `generate()` callbacks (lines 329-460)

**Memory Impact**:
- Each oscillator: ~2-5KB
- Craps game: 4 sounds per roll = ~16KB per roll
- Long session with 100 rolls = ~1.6MB leaked
- Compounds across all game types

## Proposed Solutions

### Option A: Add onended Cleanup Handler (Recommended)
**Pros**: Automatic cleanup, no timing issues
**Cons**: Slightly more code
**Effort**: Small (30 min)
**Risk**: Low

```typescript
function playTone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  volume: number,
  type: OscillatorType,
  attack: number,
  decay: number
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  // ... envelope setup ...

  osc.connect(gain);
  gain.connect(ctx.destination);

  // ADD: Cleanup when oscillator finishes
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };

  osc.start(now);
  osc.stop(now + duration);
}
```

### Option B: Use Timeout-Based Cleanup
**Pros**: Works for all AudioNode types
**Cons**: Timing must match duration exactly
**Effort**: Small (20 min)
**Risk**: Medium (timing mismatch could disconnect too early)

```typescript
setTimeout(() => {
  osc.disconnect();
  gain.disconnect();
}, duration * 1000 + 100); // Small buffer for safety
```

## Recommended Action

**Option A**: Use `onended` event handler. It's the correct Web Audio API pattern and handles timing automatically.

## Technical Details

**Affected Files**:
- `/website/src/services/sfxEnhanced.ts`

**Functions to Update**:
- `playTone()`
- `playNoiseBurst()`
- `playFilteredSweep()`
- All `generate()` callbacks in `SOUND_DEFINITIONS`

## Acceptance Criteria

- [ ] All oscillators have `onended` cleanup handlers
- [ ] All gain nodes disconnected after use
- [ ] Memory usage stays stable during long play sessions
- [ ] Chrome DevTools Memory panel shows no AudioNode growth

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2024-12-19 | Created from code review | Web Audio nodes must be explicitly disconnected |

## Resources

- PR: commit 72408c8
- Web Audio API: [AudioNode.disconnect()](https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/disconnect)
