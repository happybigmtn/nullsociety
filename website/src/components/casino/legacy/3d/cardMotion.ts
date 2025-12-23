import * as THREE from 'three';

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const getBezierControlPoint = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  minHeight = 2,
  maxHeight = 3
) => {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const distance = start.distanceTo(end);
  const arcHeight = THREE.MathUtils.clamp(1.5 + distance * 0.22, minHeight, maxHeight);
  mid.y += arcHeight;
  return mid;
};

export const getQuadraticBezierPoint = (
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
  target: THREE.Vector3
) => {
  const inv = 1 - t;
  target.set(
    inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
    inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
    inv * inv * start.z + 2 * inv * t * control.z + t * t * end.z
  );
  return target;
};

export const getFlightQuaternion = (
  startQuat: THREE.Quaternion,
  endQuat: THREE.Quaternion,
  t: number,
  flipAxis: THREE.Vector3,
  target: THREE.Quaternion
) => {
  target.copy(startQuat).slerp(endQuat, t);
  const flip = new THREE.Quaternion().setFromAxisAngle(flipAxis, Math.PI * t);
  target.multiply(flip);
  return target;
};
