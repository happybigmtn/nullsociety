/**
 * Animated 52-card deck for Baccarat
 *
 * Animation sequence:
 * 1. Cards start scattered/floating randomly
 * 2. Cards gather into a neat face-down pile in the corner
 * 3. Cards are removed from pile as they're dealt
 */
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getCardBackTexture } from './cardTextures';

interface DeckAnimationProps {
  deckPosition: [number, number, number];
  cardSize: [number, number, number];
  cardsDealt: number; // How many cards have been dealt (0-6)
  isGathering: boolean; // True during gather phase
  surfaceY: number;
  dealId?: number; // Changes to regenerate scattered positions
}

const DECK_SIZE = 52;
const GATHER_DURATION_MS = 800; // Time to gather cards into pile
const CARD_THICKNESS = 0.008; // Visual thickness per card in pile

// Generate random scattered positions for all cards
function generateScatteredPositions(count: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    positions.push(new THREE.Vector3(
      (Math.random() - 0.5) * 4,  // X spread
      1.5 + Math.random() * 2,    // Y height (floating)
      (Math.random() - 0.5) * 3   // Z spread
    ));
  }
  return positions;
}

// Generate random scattered rotations
function generateScatteredRotations(count: number): THREE.Euler[] {
  const rotations: THREE.Euler[] = [];
  for (let i = 0; i < count; i++) {
    rotations.push(new THREE.Euler(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    ));
  }
  return rotations;
}

export const DeckAnimation: React.FC<DeckAnimationProps> = ({
  deckPosition,
  cardSize,
  cardsDealt,
  isGathering,
  surfaceY,
  dealId = 0,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const gatherStartRef = useRef<number | null>(null);
  const gatherCompleteRef = useRef(false);

  // Memoize scattered positions/rotations - regenerate on new deal for fresh animation
  const scatteredPositions = useMemo(() => generateScatteredPositions(DECK_SIZE), [dealId]);
  const scatteredRotations = useMemo(() => generateScatteredRotations(DECK_SIZE), [dealId]);

  // Target pile positions (stacked neatly)
  const pilePositions = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < DECK_SIZE; i++) {
      positions.push(new THREE.Vector3(
        deckPosition[0],
        surfaceY + 0.02 + i * CARD_THICKNESS,
        deckPosition[2]
      ));
    }
    return positions;
  }, [deckPosition, surfaceY]);

  // Pile rotation (face down, flat)
  const pileRotation = useMemo(() => new THREE.Euler(-Math.PI / 2, 0, 0.05), []);

  // Card geometry and material
  const geometry = useMemo(() => {
    return new THREE.BoxGeometry(cardSize[0], cardSize[1], cardSize[2]);
  }, [cardSize]);

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: getCardBackTexture(),
    });
  }, []);

  // Temp objects for matrix calculations
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const tempEuler = useMemo(() => new THREE.Euler(), []);

  // Reset gather state on new deal
  useEffect(() => {
    gatherStartRef.current = null;
    gatherCompleteRef.current = false;
  }, [dealId]);

  // Start gather animation when isGathering becomes true
  useEffect(() => {
    if (isGathering) {
      gatherStartRef.current = performance.now();
      gatherCompleteRef.current = false;
    }
  }, [isGathering]);

  useFrame(() => {
    if (!meshRef.current) return;

    const now = performance.now();
    let gatherProgress = 0;

    if (gatherStartRef.current !== null) {
      const elapsed = now - gatherStartRef.current;
      gatherProgress = Math.min(1, elapsed / GATHER_DURATION_MS);
      // Ease out cubic
      gatherProgress = 1 - Math.pow(1 - gatherProgress, 3);

      if (gatherProgress >= 1) {
        gatherCompleteRef.current = true;
      }
    }

    // Update each card instance
    for (let i = 0; i < DECK_SIZE; i++) {
      // Cards that have been dealt are hidden (moved far away)
      const isDealt = gatherCompleteRef.current && i >= (DECK_SIZE - cardsDealt);

      if (isDealt) {
        // Hide dealt cards
        tempPosition.set(0, -100, 0);
        tempQuaternion.setFromEuler(pileRotation);
      } else {
        // Interpolate between scattered and pile position
        tempPosition.lerpVectors(
          scatteredPositions[i],
          pilePositions[i],
          gatherProgress
        );

        // Interpolate rotation
        const scatteredQuat = new THREE.Quaternion().setFromEuler(scatteredRotations[i]);
        const pileQuat = new THREE.Quaternion().setFromEuler(pileRotation);
        tempQuaternion.copy(scatteredQuat).slerp(pileQuat, gatherProgress);
      }

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, DECK_SIZE]}
      frustumCulled={false}
    />
  );
};

export default DeckAnimation;
