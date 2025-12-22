import * as THREE from 'three';
import { Easing } from '../engine';

export interface DealAnimationConfig {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startRot: THREE.Euler;
  endRot: THREE.Euler;
  arcHeight: number;
  durationMs: number;
}

export class CardDealAnimator {
  private config: DealAnimationConfig;
  private control1 = new THREE.Vector3();
  private control2 = new THREE.Vector3();
  private startQuat = new THREE.Quaternion();
  private endQuat = new THREE.Quaternion();
  private workQuat = new THREE.Quaternion();
  private workVec = new THREE.Vector3();

  constructor(config: DealAnimationConfig) {
    this.config = config;
    this.update(config);
  }

  update(config: DealAnimationConfig): void {
    this.config = config;
    this.startQuat.setFromEuler(config.startRot);
    this.endQuat.setFromEuler(config.endRot);
    this.control1.copy(config.startPos).add(this.workVec.set(0, config.arcHeight, 0));
    this.control2.copy(config.endPos).add(this.workVec.set(0, config.arcHeight, 0));
  }

  getPose(
    elapsedMs: number,
    outPos: THREE.Vector3,
    outRot: THREE.Euler
  ): number {
    const t = this.config.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / this.config.durationMs));
    const eased = Easing.easeOutCubic(t);
    this.computeBezier(eased, outPos);
    this.workQuat.copy(this.startQuat).slerp(this.endQuat, eased);
    outRot.setFromQuaternion(this.workQuat);
    return t;
  }

  private computeBezier(t: number, out: THREE.Vector3): void {
    const oneMinus = 1 - t;
    const oneMinus2 = oneMinus * oneMinus;
    const oneMinus3 = oneMinus2 * oneMinus;
    const t2 = t * t;
    const t3 = t2 * t;
    out.copy(this.config.startPos).multiplyScalar(oneMinus3);
    out.add(this.workVec.copy(this.control1).multiplyScalar(3 * oneMinus2 * t));
    out.add(this.workVec.copy(this.control2).multiplyScalar(3 * oneMinus * t2));
    out.add(this.workVec.copy(this.config.endPos).multiplyScalar(t3));
  }
}
