import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ResultPulseProps {
  trigger: number;
  position?: [number, number, number];
  positionRef?: React.MutableRefObject<THREE.Vector3>;
  color?: string;
  duration?: number;
  radius?: number;
  thickness?: number;
  maxScale?: number;
  yOffset?: number;
}

export const ResultPulse: React.FC<ResultPulseProps> = ({
  trigger,
  position = [0, 0, 0],
  positionRef,
  color = '#00ff88',
  duration = 0.8,
  radius = 0.25,
  thickness = 0.12,
  maxScale = 3.2,
  yOffset = 0.02,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startRef = useRef<number | null>(null);
  const baseColor = useMemo(() => new THREE.Color(color), [color]);

  useEffect(() => {
    startRef.current = performance.now();
    if (meshRef.current) {
      meshRef.current.visible = true;
      meshRef.current.scale.set(1, 1, 1);
    }
  }, [trigger]);

  useFrame(() => {
    if (!meshRef.current || !materialRef.current) return;
    if (startRef.current === null) return;
    const elapsed = (performance.now() - startRef.current) / 1000;
    const t = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = 1 + eased * (maxScale - 1);
    meshRef.current.scale.set(scale, scale, scale);
    materialRef.current.opacity = 0.8 * (1 - eased);
    if (positionRef) {
      meshRef.current.position.copy(positionRef.current);
    } else {
      meshRef.current.position.set(position[0], position[1], position[2]);
    }
    meshRef.current.position.y += yOffset;
    materialRef.current.color.copy(baseColor);
    if (t >= 1) {
      meshRef.current.visible = false;
      startRef.current = null;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[radius, radius + thickness, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color={baseColor}
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
};

export default ResultPulse;
