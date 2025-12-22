import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, RapierRigidBody, CollisionEnterPayload } from '@react-three/rapier';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RigidBodyType } from '@dimforge/rapier3d-compat';
import { Card } from '../../../types';
import { getCardBackTexture } from './cardTextures';
import { getCardAtlasFrame, getCardAtlasTexture } from './cardAtlas';
import { easeOutCubic, getBezierControlPoint, getFlightQuaternion, getQuadraticBezierPoint } from './cardMotion';
import GoldTrail, { GoldTrailHandle } from './GoldTrail';
import { playSfx } from '../../../services/sfx';

export type CardHand = 'player' | 'banker';

interface BaccaratCardProps {
  id: string;
  card: Card | null;
  hand: CardHand;
  size: [number, number, number];
  start: THREE.Vector3;
  end: THREE.Vector3;
  startRotation: THREE.Euler;
  endRotation: THREE.Euler;
  startMs: number | null;
  flightMs: number;
  isAnimating: boolean;
  skipRequested?: boolean;
  collisionGroups?: number;
  positionRef?: THREE.Vector3;
  onLanded?: (id: string) => void;
}

const TRAIL_SPEED_REF = 7;

export const BaccaratCard: React.FC<BaccaratCardProps> = ({
  id,
  card,
  hand,
  size,
  start,
  end,
  startRotation,
  endRotation,
  startMs,
  flightMs,
  isAnimating,
  skipRequested,
  collisionGroups,
  positionRef,
  onLanded,
}) => {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const trailRef = useRef<GoldTrailHandle>(null);
  const startedRef = useRef(false);
  const landedRef = useRef(false);
  const pendingLockRef = useRef(false);
  const lockAtMsRef = useRef(0);
  const impactPlayedRef = useRef(false);
  const prevPosRef = useRef(new THREE.Vector3());
  const workPosRef = useRef(new THREE.Vector3());
  const workQuatRef = useRef(new THREE.Quaternion());
  const flipAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  const [width, height, thickness] = size;
  const depthForRadius = Math.max(thickness, Math.min(width, height) * 0.18);
  const depthScale = thickness / depthForRadius;
  const cornerRadius = Math.min(width, height) * 0.06;

  const geometry = useMemo(() => {
    return new RoundedBoxGeometry(width, height, depthForRadius, 4, cornerRadius);
  }, [width, height, depthForRadius, cornerRadius]);

  const atlasTexture = useMemo(() => getCardAtlasTexture(), []);
  const frontMap = useMemo(() => {
    const map = atlasTexture.clone();
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
    return map;
  }, [atlasTexture]);
  const backMap = useMemo(() => getCardBackTexture(), []);

  const frontMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: frontMap,
      roughness: 0.4,
      metalness: 0.15,
      envMapIntensity: 0.4,
    });
  }, [frontMap]);

  const backMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: backMap,
      transparent: true,
      roughness: 0.4,
      metalness: 0.15,
      envMapIntensity: 0.3,
    });
  }, [backMap]);

  const edgeMaterial = useMemo(() => {
    // Bright edge colors for black background contrast
    const edgeColor = hand === 'player' ? '#4ade80' : '#f87171';
    return new THREE.MeshStandardMaterial({
      color: edgeColor,
      emissive: edgeColor,
      emissiveIntensity: 0.3,
      roughness: 0.35,
      metalness: 0.5,
      envMapIntensity: 0.4,
    });
  }, [hand]);

  const materials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, backMaterial],
    [edgeMaterial, frontMaterial, backMaterial]
  );

  const startQuat = useMemo(() => new THREE.Quaternion().setFromEuler(startRotation), [startRotation]);
  const endQuat = useMemo(() => new THREE.Quaternion().setFromEuler(endRotation), [endRotation]);
  const controlPoint = useMemo(() => getBezierControlPoint(start, end), [start, end]);

  useEffect(() => {
    if (!card || card.isHidden) {
      frontMaterial.map = backMap;
      frontMaterial.needsUpdate = true;
      return;
    }
    const { offset, repeat } = getCardAtlasFrame(card);
    frontMap.offset.copy(offset);
    frontMap.repeat.copy(repeat);
    frontMap.needsUpdate = true;
    frontMaterial.map = frontMap;
    frontMaterial.needsUpdate = true;
  }, [card, frontMap, frontMaterial, backMap]);

  useEffect(() => {
    startedRef.current = false;
    landedRef.current = false;
    pendingLockRef.current = false;
    impactPlayedRef.current = false;
    prevPosRef.current.copy(start);
    positionRef?.copy(start);

    const body = rigidBodyRef.current;
    if (body) {
      body.setBodyType(RigidBodyType.KinematicPosition, true);
      body.setTranslation({ x: start.x, y: start.y, z: start.z }, true);
      body.setRotation(startQuat, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, [start, startQuat, positionRef, startMs]);

  useFrame((_, delta) => {
    const body = rigidBodyRef.current;
    if (!body || !isAnimating || startMs === null) return;

    const now = performance.now();
    if (skipRequested && !landedRef.current) {
      body.setNextKinematicTranslation({ x: end.x, y: end.y, z: end.z });
      body.setNextKinematicRotation(endQuat);
      positionRef?.copy(end);
      landedRef.current = true;
      pendingLockRef.current = true;
      lockAtMsRef.current = now + 40;
      onLanded?.(id);
    }

    if (pendingLockRef.current && now >= lockAtMsRef.current) {
      body.setBodyType(RigidBodyType.Fixed, true);
      pendingLockRef.current = false;
    }

    if (now < startMs || landedRef.current) return;

    if (!startedRef.current) {
      startedRef.current = true;
      void playSfx('deal');
    }

    const elapsed = now - startMs;
    const rawT = Math.min(1, Math.max(0, elapsed / flightMs));
    const eased = easeOutCubic(rawT);

    const nextPos = getQuadraticBezierPoint(start, controlPoint, end, eased, workPosRef.current);
    body.setNextKinematicTranslation({ x: nextPos.x, y: nextPos.y, z: nextPos.z });
    getFlightQuaternion(startQuat, endQuat, eased, flipAxis, workQuatRef.current);
    body.setNextKinematicRotation(workQuatRef.current);
    positionRef?.copy(nextPos);

    const speed = nextPos.distanceTo(prevPosRef.current) / Math.max(0.0001, delta);
    const intensity = Math.min(1, speed / TRAIL_SPEED_REF);
    if (intensity > 0.1) {
      trailRef.current?.emit(nextPos, intensity);
    }
    prevPosRef.current.copy(nextPos);

    if (rawT >= 1 && !landedRef.current) {
      landedRef.current = true;
      pendingLockRef.current = true;
      lockAtMsRef.current = now + 60;
      onLanded?.(id);
    }
  });

  const handleCollisionEnter = (payload: CollisionEnterPayload) => {
    if (impactPlayedRef.current) return;
    const other = payload.other?.rigidBodyObject ?? payload.other?.colliderObject;
    if (other?.userData?.type !== 'table') return;
    impactPlayedRef.current = true;
    void playSfx('click');
  };

  useEffect(() => {
    return () => {
      geometry.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();
      edgeMaterial.dispose();
      frontMap.dispose();
    };
  }, [geometry, frontMaterial, backMaterial, edgeMaterial, frontMap]);

  return (
    <>
      <RigidBody
        ref={rigidBodyRef}
        type="kinematicPosition"
        colliders={false}
        collisionGroups={collisionGroups}
        onCollisionEnter={handleCollisionEnter}
      >
        <CuboidCollider
          args={[width / 2, thickness / 2, height / 2]}
          friction={1}
          restitution={0}
          collisionGroups={collisionGroups}
        />
        <mesh
          geometry={geometry}
          material={materials}
          scale={[1, 1, depthScale]}
          castShadow
          receiveShadow
        />
      </RigidBody>
      <GoldTrail ref={trailRef} />
    </>
  );
};

export default BaccaratCard;
