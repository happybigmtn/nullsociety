/**
 * 3D Dice Model with pip faces
 *
 * Renders a casino-style die with proper pip layout.
 * Uses terminal-green color scheme to match NullSociety branding.
 */
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FACE_VALUES, getDiceFaceTexture, getDiceGeometry } from './diceAssets';

interface DiceModelProps {
  size?: number;
}

export const DiceModel: React.FC<DiceModelProps> = React.memo(({ size = 1 }) => {
  const materials = useMemo(() => {
    return FACE_VALUES.map((value) => {
      const texture = getDiceFaceTexture(value);
      return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.28,
        metalness: 0.18,
        envMapIntensity: 0.6,
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      materials.forEach((material) => material.dispose());
    };
  }, [materials]);

  const geometry = useMemo(() => {
    return getDiceGeometry(size);
  }, [size]);

  return (
    <mesh geometry={geometry} material={materials} castShadow receiveShadow>
      {/* The geometry and materials handle all 6 faces */}
    </mesh>
  );
});

DiceModel.displayName = 'DiceModel';

export default DiceModel;
