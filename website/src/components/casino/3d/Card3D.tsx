import React, { forwardRef, useMemo } from 'react';
import * as THREE from 'three';
import { Card } from '../../../types';
import { getCardBackTexture, getCardTexture } from './cardTextures';

interface Card3DProps {
  card: Card | null;
  size?: [number, number, number];
}

export const Card3D = forwardRef<THREE.Group, Card3DProps>(({ card, size = [1.1, 1.6, 0.03] }, ref) => {
  const [width, height, thickness] = size;

  const frontTexture = useMemo(() => {
    if (card?.isHidden) return getCardBackTexture();
    return getCardTexture(card);
  }, [card]);
  const backTexture = useMemo(() => getCardBackTexture(), []);

  return (
    <group ref={ref}>
      <mesh position={[0, 0, thickness / 2]} castShadow receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={frontTexture} roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, -thickness / 2]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={backTexture} roughness={0.6} metalness={0.05} />
      </mesh>
    </group>
  );
});

Card3D.displayName = 'Card3D';

export default Card3D;
