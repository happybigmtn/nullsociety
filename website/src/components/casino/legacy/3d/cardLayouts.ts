import { Card } from '../../../types';

export interface CardSlotConfig {
  id: string;
  position: [number, number, number];
  rotation?: [number, number, number];
}

export const CARD_SCENE_CONFIG = {
  table: { width: 6, depth: 4.5, y: -0.15 },
  cardSize: [1.2, 1.75, 0.035] as [number, number, number],
  spacing: 1.3,
  baseRotationX: -Math.PI / 2 + 0.25,
  slotLift: 0.06,
  fan: 0.06,
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

// Baccarat layout: 3 player cards (bottom) + 3 banker cards (top)
// Cards are dealt in alternating order: P1, B1, P2, B2, (P3), (B3)
// Increased z separation (1.4 / -1.4) to prevent overlap
export const BACCARAT_SLOTS: CardSlotConfig[] = [
  // Player cards (bottom row, closer to viewer)
  ...buildRowSlots('player', 3, 1.4, { spacing: 1.4, fan: 0.04 }),
  // Banker cards (top row, further from viewer)
  ...buildRowSlots('banker', 3, -1.4, { spacing: 1.4, fan: -0.04, mirror: true }),
];

export const BACCARAT_DEAL_ORDER = [
  'player-0', 'banker-0',  // First cards
  'player-1', 'banker-1',  // Second cards
  'player-2', 'banker-2',  // Third cards (optional)
];

export const buildBaccaratCardsById = (
  playerCards: Card[],
  bankerCards: Card[]
): Record<string, Card | null> => {
  return {
    ...buildCardsById('player', playerCards, 3),
    ...buildCardsById('banker', bankerCards, 3),
  };
};
