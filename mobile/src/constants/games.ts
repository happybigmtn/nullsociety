/**
 * Centralized game ID constants and display names
 */

export const GAME_IDS = {
  HI_LO: 'hi_lo',
  BLACKJACK: 'blackjack',
  ROULETTE: 'roulette',
  CRAPS: 'craps',
  CASINO_WAR: 'casino_war',
  VIDEO_POKER: 'video_poker',
  BACCARAT: 'baccarat',
  SIC_BO: 'sic_bo',
  THREE_CARD_POKER: 'three_card_poker',
  ULTIMATE_TX_HOLDEM: 'ultimate_texas_holdem',
} as const;

export type GameId = typeof GAME_IDS[keyof typeof GAME_IDS];

export const GAME_NAMES: Record<GameId, string> = {
  hi_lo: 'Hi-Lo',
  blackjack: 'Blackjack',
  roulette: 'Roulette',
  craps: 'Craps',
  casino_war: 'Casino War',
  video_poker: 'Video Poker',
  baccarat: 'Baccarat',
  sic_bo: 'Sic Bo',
  three_card_poker: 'Three Card Poker',
  ultimate_texas_holdem: 'Ultimate Texas Hold\'em',
};

/**
 * Get display name for a game ID
 */
export function getGameName(gameId: GameId): string {
  return GAME_NAMES[gameId] ?? gameId;
}
