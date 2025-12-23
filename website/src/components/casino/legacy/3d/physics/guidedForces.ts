/**
 * Guided Forces - Attractor system for deterministic physics convergence
 *
 * The core challenge: physics must appear chaotic but converge to chain outcome.
 * Attractors apply subtle forces only when objects slow down, avoiding visible
 * "magnetizing" while ensuring reliable settling.
 */

import { Vector3 } from 'three';
import type { RoundPhase } from '../engine/GuidedRound';
import { getNoiseForSeed } from './noise';

// ─────────────────────────────────────────────────────────────────────────────
// Attractor Configuration
// ─────────────────────────────────────────────────────────────────────────────

export type FalloffCurve = 'linear' | 'quadratic' | 'inverse-square';

export interface AttractorConfig {
  /** Force falloff curve type */
  falloffCurve: FalloffCurve;

  /** Base force strength in world units/s^2 */
  baseStrength: number;

  /** Effective radius - force = 0 beyond this distance */
  effectiveRadius: number;

  /** Velocity gate - attractors only active below this speed (m/s) */
  velocityGate: number;

  /** Maximum force magnitude cap (prevents teleportation) */
  forceClamp: number;

  /** Noise modulation amplitude (0-1, adds randomness to force) */
  noiseAmplitude: number;

  /** Noise frequency (higher = faster variation) */
  noiseFrequency: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attractor Presets
// ─────────────────────────────────────────────────────────────────────────────

export const ATTRACTOR_PRESETS: Record<string, AttractorConfig> = {
  // Dice settling (craps, sic bo)
  DICE_SETTLE: {
    falloffCurve: 'quadratic',
    baseStrength: 12.0,
    effectiveRadius: 0.8,
    velocityGate: 4.5,
    forceClamp: 18.0,
    noiseAmplitude: 0.15,
    noiseFrequency: 1.2,
  },

  // Roulette ball settling into pocket
  ROULETTE_BALL: {
    falloffCurve: 'inverse-square',
    baseStrength: 8.0,
    effectiveRadius: 0.5,
    velocityGate: 3.0,
    forceClamp: 12.0,
    noiseAmplitude: 0.22,
    noiseFrequency: 1.8,
  },

  // Card snapping to final position
  CARD_SNAP: {
    falloffCurve: 'linear',
    baseStrength: 6.0,
    effectiveRadius: 0.3,
    velocityGate: 2.0,
    forceClamp: 8.0,
    noiseAmplitude: 0.08,
    noiseFrequency: 0.8,
  },

  // Gentle nudge for objects that are almost settled
  GENTLE_NUDGE: {
    falloffCurve: 'linear',
    baseStrength: 2.0,
    effectiveRadius: 0.15,
    velocityGate: 1.0,
    forceClamp: 3.0,
    noiseAmplitude: 0.05,
    noiseFrequency: 0.5,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Guidance State
// ─────────────────────────────────────────────────────────────────────────────

export interface GuidanceState {
  /** Target position to attract toward */
  targetPosition: Vector3;

  /** Optional target rotation (for dice face alignment) */
  targetRotation?: { x: number; y: number; z: number; w: number };

  /** Current guidance phase */
  phase: 'cruise' | 'settle';

  /** Height gate - only apply guidance below this Y value */
  heightGate?: number;

  /** Noise offset (derived from round seed for consistency) */
  noiseOffset: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if velocity is below threshold for attractor activation
 */
export function evaluateVelocityGate(velocity: Vector3, threshold: number): boolean {
  return velocity.length() < threshold;
}

/**
 * Check if position is below height threshold for attractor activation
 */
export function evaluateHeightGate(position: Vector3, threshold?: number): boolean {
  if (threshold === undefined) return true;
  return position.y < threshold;
}

/**
 * Check if round phase allows guidance
 */
export function evaluatePhaseGate(phase: RoundPhase): boolean {
  return phase === 'settle';
}

// ─────────────────────────────────────────────────────────────────────────────
// Force Calculation
// ─────────────────────────────────────────────────────────────────────────────

// Pre-allocated work vectors to avoid GC
const _workDir = new Vector3();

/**
 * Calculate falloff factor based on curve type
 */
function calculateFalloff(
  normalizedDistance: number,
  curve: FalloffCurve
): number {
  switch (curve) {
    case 'linear':
      return 1 - normalizedDistance;

    case 'quadratic':
      return 1 - normalizedDistance * normalizedDistance;

    case 'inverse-square': {
      const safeDist = Math.max(0.05, normalizedDistance);
      return Math.min(1, 1 / (safeDist * safeDist));
    }

    default:
      return 1 - normalizedDistance;
  }
}

/**
 * Main attractor force calculation.
 *
 * Returns force vector to apply, or null if gates prevent application.
 * Uses pre-allocated workVec to avoid garbage collection.
 *
 * @param currentPos Current position of the object
 * @param currentVel Current velocity of the object
 * @param guidance Guidance state with target position
 * @param config Attractor configuration
 * @param seed Round seed for deterministic noise
 * @param time Current time for noise animation
 * @param workVec Pre-allocated vector for output (mutated and returned)
 */
export function calculateAttractorForce(
  currentPos: Vector3,
  currentVel: Vector3,
  guidance: GuidanceState,
  config: AttractorConfig,
  seed: number,
  time: number,
  workVec: Vector3
): Vector3 | null {
  // Phase gate
  if (guidance.phase !== 'settle') return null;

  // Velocity gate
  if (!evaluateVelocityGate(currentVel, config.velocityGate)) return null;

  // Height gate
  if (!evaluateHeightGate(currentPos, guidance.heightGate)) return null;

  // Calculate direction to target
  _workDir.copy(guidance.targetPosition).sub(currentPos);
  const distance = _workDir.length();

  // Outside effective radius
  if (distance > config.effectiveRadius) return null;

  // Already at target (avoid division by zero)
  if (distance < 0.001) return null;

  // Normalize direction
  _workDir.normalize();

  // Calculate falloff factor (0-1)
  const normalizedDist = distance / config.effectiveRadius;
  const falloff = calculateFalloff(normalizedDist, config.falloffCurve);

  // Apply noise modulation for natural variation
  const { noise3D } = getNoiseForSeed(seed);
  const noiseValue = noise3D(
    currentPos.x * config.noiseFrequency,
    currentPos.y * config.noiseFrequency,
    (currentPos.z + guidance.noiseOffset + time) * config.noiseFrequency
  );
  const noiseFactor = 1 + noiseValue * config.noiseAmplitude;

  // Calculate force magnitude
  let forceMag = config.baseStrength * falloff * noiseFactor;

  // Clamp to prevent teleportation
  forceMag = Math.min(forceMag, config.forceClamp);

  // Output to workVec
  workVec.copy(_workDir).multiplyScalar(forceMag);

  return workVec;
}

// ─────────────────────────────────────────────────────────────────────────────
// Torque Calculation (for dice orientation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate torque to align object rotation with target.
 * Returns axis-angle representation: [axisX, axisY, axisZ, angle]
 */
export function calculateAlignmentTorque(
  currentQuat: { x: number; y: number; z: number; w: number },
  targetQuat: { x: number; y: number; z: number; w: number },
  strength: number
): { axis: Vector3; angle: number } {
  // Compute rotation difference: diff = target * inverse(current)
  const cw = currentQuat.w,
    cx = currentQuat.x,
    cy = currentQuat.y,
    cz = currentQuat.z;
  const tw = targetQuat.w,
    tx = targetQuat.x,
    ty = targetQuat.y,
    tz = targetQuat.z;

  // Inverse of current (conjugate for unit quaternion)
  const iw = cw,
    ix = -cx,
    iy = -cy,
    iz = -cz;

  // Multiply: target * inverse(current)
  const dw = tw * iw - tx * ix - ty * iy - tz * iz;
  const dx = tw * ix + tx * iw + ty * iz - tz * iy;
  const dy = tw * iy - tx * iz + ty * iw + tz * ix;
  const dz = tw * iz + tx * iy - ty * ix + tz * iw;

  // Convert to axis-angle
  const angle = 2 * Math.acos(Math.min(1, Math.abs(dw)));
  const sinHalf = Math.sqrt(1 - dw * dw);

  if (sinHalf < 0.001) {
    // No rotation needed
    return { axis: new Vector3(0, 1, 0), angle: 0 };
  }

  const axis = new Vector3(dx / sinHalf, dy / sinHalf, dz / sinHalf);
  return { axis, angle: angle * strength };
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics Constants
// ─────────────────────────────────────────────────────────────────────────────

export const ROULETTE_GEOMETRY = {
  BOWL_RADIUS: 2.8,
  BOWL_DEPTH: 0.4,
  ROTOR_RADIUS: 2.4,
  DEFLECTOR_COUNT: 8,
  DEFLECTOR_HEIGHT: 0.15,
  FRET_HEIGHT: 0.09,
  BALL_RADIUS: 0.06,
  BALL_MASS: 0.02, // kg (realistic ivory ball)
  RIM_HEIGHT: 0.32, // Height gate threshold
};

export const ROULETTE_PHYSICS = {
  GRAVITY: -9.81,
  BALL_RESTITUTION: 0.85,
  BALL_FRICTION: 0.15,
  DEFLECTOR_RESTITUTION: 0.6,
  ROTOR_RESTITUTION: 0.3,
  BOWL_FRICTION: 0.25,
};

export const DICE_PHYSICS = {
  MASS: 0.0045, // kg (4.5 grams for 16mm die)
  SIZE: 0.016, // meters (16mm standard)
  RESTITUTION: 0.3, // Energy retention on bounce
  STATIC_FRICTION: 0.25,
  DYNAMIC_FRICTION: 0.2,
  LINEAR_DAMPING: 0.45,
  ANGULAR_DAMPING: 0.5,
  MIN_THROW_VELOCITY: 2.5, // m/s
  MAX_THROW_VELOCITY: 8.0, // m/s
  TYPICAL_ANGULAR_VEL: 15, // rad/s
};

export const CARD_PHYSICS = {
  MASS: 0.001, // kg (1 gram)
  WIDTH: 0.063, // meters (63mm poker card)
  HEIGHT: 0.088, // meters (88mm)
  THICKNESS: 0.0003, // meters (0.3mm)
  AIR_RESISTANCE: 0.1,
  DEAL_ARC_HEIGHT: 0.15, // meters
  DEAL_DURATION: 0.45, // seconds
};

// ─────────────────────────────────────────────────────────────────────────────
// Dice Face Orientation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Target quaternions for each dice face (1-6) pointing up.
 * Standard die: opposite faces sum to 7.
 */
export const DICE_FACE_ROTATIONS: Record<number, { x: number; y: number; z: number; w: number }> = {
  1: { x: 0, y: 0, z: 0, w: 1 }, // 1 up (6 down)
  2: { x: 0.5, y: 0, z: 0, w: 0.866 }, // 2 up, 60 degree rotation
  3: { x: 0, y: 0, z: 0.5, w: 0.866 }, // 3 up
  4: { x: 0, y: 0, z: -0.5, w: 0.866 }, // 4 up
  5: { x: -0.5, y: 0, z: 0, w: 0.866 }, // 5 up
  6: { x: 1, y: 0, z: 0, w: 0 }, // 6 up (1 down), 180 degree
};

/**
 * Get target rotation for a dice face value
 */
export function getDiceFaceRotation(
  faceValue: number
): { x: number; y: number; z: number; w: number } {
  return DICE_FACE_ROTATIONS[faceValue] ?? DICE_FACE_ROTATIONS[1];
}
