import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getGoldLeafTexture } from './goldLeafTexture';

export type GoldTrailHandle = {
  emit: (position: THREE.Vector3, intensity: number) => void;
};

interface GoldTrailProps {
  maxParticles?: number;
}

type Particle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  scale: number;
  rotation: number;
};

export const GoldTrail = forwardRef<GoldTrailHandle, GoldTrailProps>(
  ({ maxParticles = 120 }, ref) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const particles = useRef<Particle[]>(
      Array.from({ length: maxParticles }, () => ({
        position: new THREE.Vector3(9999, 9999, 9999),
        velocity: new THREE.Vector3(),
        age: 0,
        life: 0,
        scale: 0,
        rotation: 0,
      }))
    );
    const cursorRef = useRef(0);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const baseColor = useMemo(() => new THREE.Color('#facc15'), []);
    const tempColor = useMemo(() => new THREE.Color(), []);

    useImperativeHandle(ref, () => ({
      emit: (position: THREE.Vector3, intensity: number) => {
        const count = Math.min(6, Math.max(1, Math.round(intensity * 4)));
        for (let i = 0; i < count; i += 1) {
          const idx = cursorRef.current % maxParticles;
          cursorRef.current += 1;
          const particle = particles.current[idx];
          particle.position.copy(position);
          particle.velocity.set(
            (Math.random() - 0.5) * 0.35,
            0.35 + Math.random() * 0.6,
            (Math.random() - 0.5) * 0.35
          );
          particle.age = 0;
          particle.life = 0.45 + Math.random() * 0.2;
          particle.scale = 0.24 + Math.random() * 0.18;
          particle.rotation = Math.random() * Math.PI * 2;
        }
      },
    }));

    useEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      particles.current.forEach((particle, idx) => {
        dummy.position.copy(particle.position);
        dummy.rotation.set(Math.PI / 2, 0, particle.rotation);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        tempColor.copy(baseColor).multiplyScalar(0);
        mesh.setColorAt(idx, tempColor);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }, [baseColor, dummy, tempColor]);

    useFrame((_, delta) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      let needsUpdate = false;
      particles.current.forEach((particle, idx) => {
        if (particle.life <= 0) return;
        particle.age += delta;
        if (particle.age >= particle.life) {
          particle.life = 0;
          particle.position.set(9999, 9999, 9999);
          particle.scale = 0;
          dummy.position.copy(particle.position);
          dummy.rotation.set(Math.PI / 2, 0, particle.rotation);
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
          needsUpdate = true;
          return;
        }
        const fade = 1 - particle.age / particle.life;
        particle.velocity.y -= 1.4 * delta;
        particle.position.addScaledVector(particle.velocity, delta);
        const scale = particle.scale * fade;
        dummy.position.copy(particle.position);
        dummy.rotation.set(Math.PI / 2, 0, particle.rotation);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        tempColor.copy(baseColor).multiplyScalar(0.5 + fade * 0.5);
        mesh.setColorAt(idx, tempColor);
        needsUpdate = true;
      });
      if (needsUpdate) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    });

    const texture = useMemo(() => getGoldLeafTexture(), []);

    return (
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, maxParticles]}
        frustumCulled={false}
      >
        <planeGeometry args={[0.3, 0.3]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.85}
          depthWrite={false}
          vertexColors
        />
      </instancedMesh>
    );
  }
);

GoldTrail.displayName = 'GoldTrail';

export default GoldTrail;
