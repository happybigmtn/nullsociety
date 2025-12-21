export type SfxName = 'deal' | 'win' | 'click' | 'dice';

let enabled = true;
let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let noiseSampleRate = 0;

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

function getNoiseBuffer(ctx: AudioContext, duration = 0.35): AudioBuffer {
  if (noiseBuffer && noiseSampleRate === ctx.sampleRate) return noiseBuffer;
  const frameCount = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i += 1) {
    const fade = 1 - i / frameCount;
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  noiseBuffer = buffer;
  noiseSampleRate = ctx.sampleRate;
  return buffer;
}

function playDiceRoll(ctx: AudioContext) {
  const startAt = ctx.currentTime;
  const output = ctx.createGain();
  output.gain.setValueAtTime(0.0001, startAt);
  output.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
  output.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.7);
  output.connect(ctx.destination);

  const bursts = 6 + Math.floor(Math.random() * 3);
  for (let i = 0; i < bursts; i += 1) {
    const t = startAt + i * 0.055 + Math.random() * 0.025;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    src.playbackRate.setValueAtTime(0.9 + Math.random() * 0.25, t);

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(1600 + Math.random() * 1400, t);
    band.Q.setValueAtTime(0.8 + Math.random() * 0.6, t);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(5200, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08 + Math.random() * 0.05);

    src.connect(band);
    band.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(output);

    src.start(t);
    src.stop(t + 0.12);
  }

  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(150, startAt);
  thumpGain.gain.setValueAtTime(0.0001, startAt);
  thumpGain.gain.exponentialRampToValueAtTime(0.1, startAt + 0.012);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.16);
  thump.connect(thumpGain);
  thumpGain.connect(output);
  thump.start(startAt);
  thump.stop(startAt + 0.18);
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

  if (name === 'dice') {
    playDiceRoll(ctx);
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
