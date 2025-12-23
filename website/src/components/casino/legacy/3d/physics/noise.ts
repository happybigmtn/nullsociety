/**
 * Seeded Noise Utilities
 *
 * Wraps simplex-noise with deterministic seeding for reproducible
 * visual variation across clients.
 */

import { createNoise2D, createNoise3D, createNoise4D } from 'simplex-noise';
import { SeededRandom } from '../engine/deterministicRng';

// ─────────────────────────────────────────────────────────────────────────────
// Seeded Noise Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create deterministic 2D noise function from seed
 */
export function createSeededNoise2D(seed: number): (x: number, y: number) => number {
  const rng = new SeededRandom(seed);
  return createNoise2D(() => rng.next());
}

/**
 * Create deterministic 3D noise function from seed
 */
export function createSeededNoise3D(
  seed: number
): (x: number, y: number, z: number) => number {
  const rng = new SeededRandom(seed);
  return createNoise3D(() => rng.next());
}

/**
 * Create deterministic 4D noise function from seed (useful for time-varying 3D noise)
 */
export function createSeededNoise4D(
  seed: number
): (x: number, y: number, z: number, w: number) => number {
  const rng = new SeededRandom(seed);
  return createNoise4D(() => rng.next());
}

// ─────────────────────────────────────────────────────────────────────────────
// Noise Sampling Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sample 3D noise with position and time
 * Returns value in [-1, 1]
 */
export function sampleNoise3D(
  noise3D: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  frequency: number = 1.0
): number {
  return noise3D(x * frequency, y * frequency, z * frequency);
}

/**
 * Sample noise mapped to [0, 1] range
 */
export function sampleNoise01(
  noise3D: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  frequency: number = 1.0
): number {
  return (sampleNoise3D(noise3D, x, y, z, frequency) + 1) * 0.5;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fractal Brownian Motion (FBM)
// ─────────────────────────────────────────────────────────────────────────────

export interface FBMOptions {
  octaves: number;
  lacunarity: number; // Frequency multiplier per octave (typically 2.0)
  persistence: number; // Amplitude multiplier per octave (typically 0.5)
}

const DEFAULT_FBM: FBMOptions = {
  octaves: 4,
  lacunarity: 2.0,
  persistence: 0.5,
};

/**
 * Create fractal noise function for richer detail
 */
export function createFBM3D(
  noise3D: (x: number, y: number, z: number) => number,
  options: Partial<FBMOptions> = {}
): (x: number, y: number, z: number) => number {
  const { octaves, lacunarity, persistence } = { ...DEFAULT_FBM, ...options };

  return (x: number, y: number, z: number) => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * noise3D(x * frequency, y * frequency, z * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue; // Normalize to [-1, 1]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cached Noise Instances (per round seed)
// ─────────────────────────────────────────────────────────────────────────────

const noiseCache = new Map<
  number,
  {
    noise2D: ReturnType<typeof createSeededNoise2D>;
    noise3D: ReturnType<typeof createSeededNoise3D>;
    fbm3D: ReturnType<typeof createFBM3D>;
  }
>();

/**
 * Get or create noise functions for a round seed
 */
export function getNoiseForSeed(seed: number) {
  let cached = noiseCache.get(seed);
  if (!cached) {
    const noise3D = createSeededNoise3D(seed);
    cached = {
      noise2D: createSeededNoise2D(seed),
      noise3D,
      fbm3D: createFBM3D(noise3D),
    };
    noiseCache.set(seed, cached);

    // Limit cache size
    if (noiseCache.size > 50) {
      const firstKey = noiseCache.keys().next().value;
      if (firstKey !== undefined) noiseCache.delete(firstKey);
    }
  }
  return cached;
}

/**
 * Clear noise cache (call on game session end)
 */
export function clearNoiseCache(): void {
  noiseCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Specialized Noise Patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turbulence pattern (absolute value of FBM for sharp features)
 */
export function turbulence3D(
  fbm: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number
): number {
  return Math.abs(fbm(x, y, z));
}

/**
 * Ridged multifractal (inverted turbulence for ridge-like features)
 */
export function ridged3D(
  fbm: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number
): number {
  return 1 - Math.abs(fbm(x, y, z));
}

/**
 * Curl noise for divergence-free vector fields (smoke, particles)
 * Returns 3D vector perpendicular to noise gradient
 */
export function curlNoise3D(
  noise3D: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
  epsilon: number = 0.0001
): [number, number, number] {
  // Numerical gradient
  const dx =
    (noise3D(x + epsilon, y, z) - noise3D(x - epsilon, y, z)) / (2 * epsilon);
  const dy =
    (noise3D(x, y + epsilon, z) - noise3D(x, y - epsilon, z)) / (2 * epsilon);
  const dz =
    (noise3D(x, y, z + epsilon) - noise3D(x, y, z - epsilon)) / (2 * epsilon);

  // Curl = cross product of gradient
  return [dy - dz, dz - dx, dx - dy];
}
