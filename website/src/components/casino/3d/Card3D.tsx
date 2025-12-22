import React, { forwardRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Card } from '../../../types';
import { getCardBackTexture, getCardTexture } from './cardTextures';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type CardHand = 'player' | 'banker' | null;

interface Card3DProps {
  card: Card | null;
  size?: [number, number, number];
  hand?: CardHand;
  isSelected?: boolean; // When true, use green; when false, use red; when undefined, use hand-based default
}

// Selection-based colors - matches nullspace logo green and opponent red
const SELECTED_COLOR = new THREE.Color('#22ff88'); // Neon green (nullspace logo color)
const OPPONENT_COLOR = new THREE.Color('#f87171'); // Bright red
const NEUTRAL_COLOR = new THREE.Color('#e5e7eb'); // Light gray/white edge

export const Card3D = forwardRef<THREE.Group, Card3DProps>(({ card, size = [1.1, 1.6, 0.03], hand = null, isSelected }, ref) => {
  const [width, height, thickness] = size;
  const depthForRadius = useMemo(() => Math.max(thickness, Math.min(width, height) * 0.22), [thickness, width, height]);
  const depthScale = thickness / depthForRadius;
  const cornerRadius = Math.min(width, height) * 0.08;

  const frontTexture = useMemo(() => {
    if (card?.isHidden) return getCardBackTexture();
    return getCardTexture(card);
  }, [card]);
  const backTexture = useMemo(() => getCardBackTexture(), []);

  const geometry = useMemo(() => {
    return new RoundedBoxGeometry(width, height, depthForRadius, 4, cornerRadius);
  }, [width, height, depthForRadius, cornerRadius]);

  // Edge color based on selection state
  // isSelected: true = green (user's pick), false = red (opponent), undefined = neutral
  const edgeColor = useMemo(() => {
    if (isSelected === true) return SELECTED_COLOR;
    if (isSelected === false) return OPPONENT_COLOR;
    return NEUTRAL_COLOR;
  }, [isSelected]);

  // Emissive glow for the edge - stronger for selected/opponent cards
  const emissiveIntensity = isSelected !== undefined ? 0.5 : 0.15;

  const frontMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: frontTexture,
      roughness: 0.45,
      metalness: 0.1,
      envMapIntensity: 0.4,
    });
  }, [frontTexture]);

  const backMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: backTexture,
      transparent: true,
      roughness: 0.4,
      metalness: 0.15,
      envMapIntensity: 0.3,
    });
  }, [backTexture]);

  // Glowing edge material based on hand
  const edgeMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: edgeColor,
      emissive: edgeColor,
      emissiveIntensity: emissiveIntensity,
      roughness: 0.3,
      metalness: 0.6,
      envMapIntensity: 0.5,
    });
  }, [edgeColor, emissiveIntensity]);

  const materials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, backMaterial],
    [edgeMaterial, frontMaterial, backMaterial]
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();
      edgeMaterial.dispose();
    };
  }, [geometry, frontMaterial, backMaterial, edgeMaterial]);

  return (
    <group ref={ref}>
      <mesh
        geometry={geometry}
        material={materials}
        scale={[1, 1, depthScale]}
        castShadow
        receiveShadow
      />
    </group>
  );
});

Card3D.displayName = 'Card3D';

export default Card3D;
