import React, { forwardRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Card } from '../../../types';
import { getCardBackTexture, getCardNormalMap, getCardRoughnessMap, getCardTexture } from './cardTextures';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type CardHand = 'player' | 'banker' | null;

interface Card3DProps {
  card: Card | null;
  size?: [number, number, number];
  hand?: CardHand;
  isSelected?: boolean; // When true, use green; when false, use red; when undefined, use hand-based default
}

// Selection-based colors - subtle, photorealistic accents
const SELECTED_COLOR = new THREE.Color('#d6b56f'); // Warm gold
const OPPONENT_COLOR = new THREE.Color('#7a2f2f'); // Deep wine
const NEUTRAL_COLOR = new THREE.Color('#e6dccb'); // Warm ivory edge

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
  const normalMap = useMemo(() => getCardNormalMap(), []);
  const roughnessMap = useMemo(() => getCardRoughnessMap(), []);

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
  const emissiveIntensity = isSelected !== undefined ? 0.18 : 0.05;

  const frontMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      map: frontTexture,
      roughness: 0.35,
      metalness: 0.0,
      envMapIntensity: 0.6,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      normalMap,
      roughnessMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
    });
  }, [frontTexture, normalMap, roughnessMap]);

  const backMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      map: backTexture,
      roughness: 0.5,
      metalness: 0.0,
      envMapIntensity: 0.55,
      clearcoat: 0.3,
      clearcoatRoughness: 0.25,
      normalMap,
      roughnessMap,
      normalScale: new THREE.Vector2(0.2, 0.2),
    });
  }, [backTexture, normalMap, roughnessMap]);

  // Glowing edge material based on hand
  const edgeMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: edgeColor,
      emissive: edgeColor,
      emissiveIntensity: emissiveIntensity,
      roughness: 0.55,
      metalness: 0.05,
      envMapIntensity: 0.4,
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
