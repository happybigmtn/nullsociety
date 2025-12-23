import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const CasinoEnvironment: React.FC = () => {
  const { gl, scene } = useThree();

  const envTarget = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = new RoomEnvironment();
    const renderTarget = pmrem.fromScene(environment, 0.04);
    environment.dispose();
    pmrem.dispose();
    return renderTarget;
  }, [gl]);

  useEffect(() => {
    const previous = scene.environment;
    scene.environment = envTarget.texture;
    return () => {
      scene.environment = previous ?? null;
      envTarget.dispose();
    };
  }, [envTarget, scene]);

  return null;
};

export default CasinoEnvironment;
