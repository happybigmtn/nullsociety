import { SPRING } from '@nullspace/design-tokens';

type SpringPreset = keyof typeof SPRING;

export const springConfig = (preset: SpringPreset) => {
  const { mass, stiffness, damping } = SPRING[preset];
  return {
    mass,
    tension: stiffness,
    friction: damping,
  };
};
