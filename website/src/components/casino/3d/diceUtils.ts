/**
 * Dice utilities for mapping face values to 3D rotations.
 *
 * Standard die layout (opposite faces sum to 7):
 *   1 ↔ 6
 *   2 ↔ 5
 *   3 ↔ 4
 *
 * Our coordinate system:
 *   +Y = up, +X = right, +Z = toward camera
 *   Face 1 is on +Y when rotation is [0, 0, 0]
 */
import * as THREE from 'three';

// Euler rotations (in radians) that place each face on top (+Y)
// Starting layout per DiceModel: +X=3, -X=4, +Y=1, -Y=6, +Z=2, -Z=5
export const FACE_ROTATIONS: Record<number, [number, number, number]> = {
  1: [0, 0, 0],                           // Face 1 on +Y - already on top
  6: [Math.PI, 0, 0],                     // Face 6 on -Y - flip 180° around X
  2: [-Math.PI / 2, 0, 0],                // Face 2 on +Z - rotate -90° around X
  5: [Math.PI / 2, 0, 0],                 // Face 5 on -Z - rotate 90° around X
  3: [0, 0, Math.PI / 2],                 // Face 3 on +X - rotate 90° around Z
  4: [0, 0, -Math.PI / 2],                // Face 4 on -X - rotate -90° around Z
};

/**
 * Get quaternion for a target dice face
 */
export function getTargetQuaternion(faceValue: number): THREE.Quaternion {
  const euler = FACE_ROTATIONS[faceValue] || FACE_ROTATIONS[1];
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(euler[0], euler[1], euler[2], 'XYZ')
  );
}

/**
 * Determine which face is currently on top based on current rotation
 */
export function getCurrentTopFace(rotation: THREE.Euler): number {
  // Create up vector and transform by inverse rotation to see which original axis points up
  const upWorld = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromEuler(rotation);
  const quatInv = quat.clone().invert();
  const localUp = upWorld.clone().applyQuaternion(quatInv);

  // Find which axis is most aligned with local up
  const absX = Math.abs(localUp.x);
  const absY = Math.abs(localUp.y);
  const absZ = Math.abs(localUp.z);

  if (absY >= absX && absY >= absZ) {
    return localUp.y > 0 ? 1 : 6;
  } else if (absX >= absZ) {
    // +X face = 3, -X face = 4 (per DiceModel FACE_VALUES)
    return localUp.x > 0 ? 3 : 4;
  } else {
    return localUp.z > 0 ? 2 : 5;
  }
}

/**
 * Calculate throw impulse based on power (0-1) and direction
 * Moderate throws that keep dice visible on table
 */
export function calculateThrowImpulse(
  power: number,
  direction: { x: number; z: number }
): { linear: THREE.Vector3; angular: THREE.Vector3 } {
  // Slightly stronger throw for extra momentum while keeping dice contained
  const basePower = 10 + power * 6; // Range: 10.0-16.0 units
  const upwardPower = 1.8 + power * 1.4; // Range: 1.8-3.2 units

  // Normalize direction
  const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z) || 1;
  const normX = direction.x / len;
  const normZ = direction.z / len;

  // Add slight randomness for natural feel
  const randX = (Math.random() - 0.5) * 0.12;
  const randZ = (Math.random() - 0.5) * 0.12;

  return {
    linear: new THREE.Vector3(
      normX * basePower + randX,
      upwardPower,
      normZ * basePower + randZ
    ),
    // Good angular velocity for tumbling
    angular: new THREE.Vector3(
      (Math.random() - 0.5) * 16 * power,
      (Math.random() - 0.5) * 16 * power,
      (Math.random() - 0.5) * 16 * power
    ),
  };
}

/**
 * Check if a dice body is at rest (low velocity)
 */
export function isDiceAtRest(
  linearVel: THREE.Vector3,
  angularVel: THREE.Vector3,
  threshold = 0.1
): boolean {
  return (
    linearVel.length() < threshold &&
    angularVel.length() < threshold
  );
}

/**
 * Pip positions for each face (for rendering pips on dice faces)
 * Returns array of [x, y] positions (normalized -0.3 to 0.3 range)
 */
export const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.2, 0.2], [0.2, -0.2]],
  3: [[-0.2, 0.2], [0, 0], [0.2, -0.2]],
  4: [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]],
  5: [[-0.2, 0.2], [0.2, 0.2], [0, 0], [-0.2, -0.2], [0.2, -0.2]],
  6: [[-0.2, 0.25], [0.2, 0.25], [-0.2, 0], [0.2, 0], [-0.2, -0.25], [0.2, -0.25]],
};
