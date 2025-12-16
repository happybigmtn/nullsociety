export type SfxName = 'deal' | 'win' | 'click';

let enabled = true;
let audioContext: AudioContext | null = null;

export function setSfxEnabled(next: boolean) {
  enabled = next;
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
}

function freqFor(name: SfxName): number {
  if (name === 'deal') return 660;
  if (name === 'win') return 880;
  return 520;
}

export async function playSfx(name: SfxName) {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') await ctx.resume();
  } catch {
    return;
  }

  const startAt = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqFor(name), startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + 0.18);
}

