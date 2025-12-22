import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type ImpactParticlesHandle = {
  emit: (position: THREE.Vector3, intensity?: number) => void;
};

interface ImpactParticlesProps {
  color?: string;
  maxParticles?: number;
}

const HIDDEN_POS = 9999;

export const ImpactParticles = forwardRef<ImpactParticlesHandle, ImpactParticlesProps>(
  ({ color = '#00ff88', maxParticles = 48 }, ref) => {
    const pointsRef = useRef<THREE.Points>(null);
    const positions = useMemo(() => new Float32Array(maxParticles * 3), [maxParticles]);
    const colors = useMemo(() => new Float32Array(maxParticles * 3), [maxParticles]);
    const velocities = useRef(
      Array.from({ length: maxParticles }, () => new THREE.Vector3())
    );
    const agesRef = useRef(new Float32Array(maxParticles));
    const lifetimesRef = useRef(new Float32Array(maxParticles));
    const cursorRef = useRef(0);
    const baseColor = useMemo(() => new THREE.Color(color), [color]);
    const tempColor = useRef(new THREE.Color());

    const geometry = useMemo(() => {
      const geo = new THREE.BufferGeometry();
      const positionAttr = new THREE.BufferAttribute(positions, 3);
      positionAttr.setUsage(THREE.DynamicDrawUsage);
      const colorAttr = new THREE.BufferAttribute(colors, 3);
      colorAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', positionAttr);
      geo.setAttribute('color', colorAttr);
      for (let i = 0; i < maxParticles; i += 1) {
        positions[i * 3] = HIDDEN_POS;
        positions[i * 3 + 1] = HIDDEN_POS;
        positions[i * 3 + 2] = HIDDEN_POS;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
      }
      return geo;
    }, [colors, maxParticles, positions]);

    useImperativeHandle(ref, () => ({
      emit: (position: THREE.Vector3, intensity = 1) => {
        const clamped = Math.min(1, Math.max(0.2, intensity));
        const count = Math.round(6 + clamped * 6);
        for (let i = 0; i < count; i += 1) {
          const idx = cursorRef.current % maxParticles;
          cursorRef.current += 1;
          agesRef.current[idx] = 0;
          lifetimesRef.current[idx] = 0.32 + Math.random() * 0.24;

          const offset = idx * 3;
          positions[offset] = position.x;
          positions[offset + 1] = position.y;
          positions[offset + 2] = position.z;

          const speed = 0.35 + clamped * 1.4;
          velocities.current[idx].set(
            (Math.random() - 0.5) * speed,
            Math.random() * speed * 1.6,
            (Math.random() - 0.5) * speed
          );

          const colorJitter = 0.85 + Math.random() * 0.25;
          tempColor.current.copy(baseColor).multiplyScalar(colorJitter);
          colors[offset] = tempColor.current.r;
          colors[offset + 1] = tempColor.current.g;
          colors[offset + 2] = tempColor.current.b;
        }

        const geo = pointsRef.current?.geometry as THREE.BufferGeometry | undefined;
        if (geo) {
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
        }
      },
    }));

    useFrame((_, delta) => {
      const geo = pointsRef.current?.geometry as THREE.BufferGeometry | undefined;
      if (!geo) return;

      let needsUpdate = false;
      for (let i = 0; i < maxParticles; i += 1) {
        const life = lifetimesRef.current[i];
        if (life <= 0) continue;

        const age = agesRef.current[i] + delta;
        agesRef.current[i] = age;
        const offset = i * 3;
        if (age >= life) {
          lifetimesRef.current[i] = 0;
          positions[offset] = HIDDEN_POS;
          positions[offset + 1] = HIDDEN_POS;
          positions[offset + 2] = HIDDEN_POS;
          colors[offset] = 0;
          colors[offset + 1] = 0;
          colors[offset + 2] = 0;
          needsUpdate = true;
          continue;
        }

        const fade = 1 - age / life;
        const vel = velocities.current[i];
        vel.y -= 2.4 * delta;
        positions[offset] += vel.x * delta;
        positions[offset + 1] += vel.y * delta;
        positions[offset + 2] += vel.z * delta;
        colors[offset] = baseColor.r * fade;
        colors[offset + 1] = baseColor.g * fade;
        colors[offset + 2] = baseColor.b * fade;
        needsUpdate = true;
      }

      if (needsUpdate) {
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      }
    });

    return (
      <points ref={pointsRef} frustumCulled={false}>
        <primitive object={geometry} attach="geometry" />
        <pointsMaterial
          vertexColors
          transparent
          opacity={0.85}
          size={0.06}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    );
  }
);

ImpactParticles.displayName = 'ImpactParticles';

export default ImpactParticles;
