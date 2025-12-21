import { Card } from '../../../types';

export interface CardSlotConfig {
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
}

export const CARD_SCENE_CONFIG = {
  table: { width: 8.8, depth: 6.4, y: -0.2 },
  cardSize: [1.4, 2.05, 0.04] as [number, number, number],
  spacing: 1.45,
  baseRotationX: -Math.PI / 2 + 0.42,
  slotLift: 0.07,
  fan: 0.08,
};

interface RowOptions {
  spacing?: number;
  y?: number;
  rotationX?: number;
  fan?: number;
  mirror?: boolean;
}

export const buildRowSlots = (
  prefix: string,
  count: number,
  z: number,
  options: RowOptions = {}
): CardSlotConfig[] => {
  const spacing = options.spacing ?? CARD_SCENE_CONFIG.spacing;
  const y = options.y ?? (CARD_SCENE_CONFIG.table.y + CARD_SCENE_CONFIG.cardSize[2] / 2 + CARD_SCENE_CONFIG.slotLift);
  const rotationX = options.rotationX ?? CARD_SCENE_CONFIG.baseRotationX;
  const fan = options.fan ?? CARD_SCENE_CONFIG.fan;
  const mirror = options.mirror ?? false;
  const offset = (count - 1) / 2;

  return Array.from({ length: count }, (_, i) => {
    const x = (i - offset) * spacing;
    const zRot = (i - offset) * fan * (mirror ? -1 : 1);
    return {
      id: `${prefix}-${i}`,
      position: [x, y, z],
      rotation: [rotationX, 0, zRot],
    };
  });
};

export const buildCardsById = (prefix: string, cards: Card[], maxCount: number) => {
  const entries: Record<string, Card | null> = {};
  for (let i = 0; i < maxCount; i += 1) {
    entries[`${prefix}-${i}`] = cards[i] ?? null;
  }
  return entries;
};
