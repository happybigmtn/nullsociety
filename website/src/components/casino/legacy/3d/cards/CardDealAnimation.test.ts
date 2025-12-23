import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CardDealAnimator } from './CardDealAnimation';

describe('CardDealAnimator', () => {
  it('interpolates from start to end over duration', () => {
    const startPos = new THREE.Vector3(0, 0, 0);
    const endPos = new THREE.Vector3(2, 0, 0);
    const animator = new CardDealAnimator({
      startPos,
      endPos,
      startRot: new THREE.Euler(0, 0, 0),
      endRot: new THREE.Euler(Math.PI / 2, 0, 0),
      arcHeight: 1,
      durationMs: 1000,
    });

    const pos = new THREE.Vector3();
    const rot = new THREE.Euler();

    animator.getPose(0, pos, rot);
    expect(pos.x).toBeCloseTo(0, 6);

    animator.getPose(1000, pos, rot);
    expect(pos.x).toBeCloseTo(2, 6);
    expect(rot.x).toBeCloseTo(Math.PI / 2, 3);
  });

  it('adds arc height during mid-flight', () => {
    const animator = new CardDealAnimator({
      startPos: new THREE.Vector3(0, 0, 0),
      endPos: new THREE.Vector3(1, 0, 0),
      startRot: new THREE.Euler(0, 0, 0),
      endRot: new THREE.Euler(0, 0, 0),
      arcHeight: 1,
      durationMs: 1000,
    });

    const pos = new THREE.Vector3();
    const rot = new THREE.Euler();
    animator.getPose(500, pos, rot);
    expect(pos.y).toBeGreaterThan(0);
  });
});
