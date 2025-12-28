/**
 * Shared type definitions for the mobile app
 */

import type { BaccaratBetName, CrapsBetName, RouletteBetName, SicBoBetName } from '../constants/betTypes';

// Re-export game ID constants and types from centralized location
export { GAME_IDS, GAME_NAMES, getGameName } from '../constants/games';
export type { GameId } from '../constants/games';

// Card types
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

// Game phases
export type GamePhase = 'betting' | 'playing' | 'waiting' | 'result';

// Bet types
export interface Bet {
  type: string;
  amount: number;
  position?: string | number;
}

// Game result
export interface GameResult {
  won: boolean;
  payout: number;
  message?: string;
}

// Player balance
export interface Balance {
  available: number;
  locked: number;
}

// WebSocket message types - re-exported from protocol.ts for convenience
export type {
  GameMessage,
  BlackjackMessage,
  RouletteMessage,
  HiLoMessage,
  BaccaratMessage,
  CrapsMessage,
  CasinoWarMessage,
  VideoPokerMessage,
  SicBoMessage,
  ThreeCardPokerMessage,
  UltimateTXMessage,
} from './protocol';

// Tutorial step
export interface TutorialStep {
  title: string;
  description: string;
  highlight?: string;
}

// Chip value type
export type ChipValue = 1 | 5 | 25 | 100 | 500 | 1000;

// Roulette bet types
export type RouletteBetType = RouletteBetName;

// Craps bet types
export type CrapsBetType = CrapsBetName;

// Video poker hand rankings
export type PokerHand =
  | 'ROYAL_FLUSH'
  | 'STRAIGHT_FLUSH'
  | 'FOUR_OF_A_KIND'
  | 'FULL_HOUSE'
  | 'FLUSH'
  | 'STRAIGHT'
  | 'THREE_OF_A_KIND'
  | 'TWO_PAIR'
  | 'JACKS_OR_BETTER'
  | 'NOTHING';

// Baccarat bet types
export type BaccaratBetType = BaccaratBetName;

// Sic Bo bet types
export type SicBoBetType = SicBoBetName;

// Three Card Poker hand rankings
export type ThreeCardPokerHand =
  | 'STRAIGHT_FLUSH'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'PAIR'
  | 'HIGH_CARD';

// Re-export all schemas and utilities from protocol for full access
export * from './protocol';
