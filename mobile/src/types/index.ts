/**
 * Shared type definitions for the mobile app
 */

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
export type RouletteBetType =
  | 'RED'
  | 'BLACK'
  | 'ODD'
  | 'EVEN'
  | '1-18'
  | '19-36'
  | 'FIRST_12'
  | 'SECOND_12'
  | 'THIRD_12'
  | 'COLUMN_1'
  | 'COLUMN_2'
  | 'COLUMN_3'
  | 'STRAIGHT';

// Craps bet types
export type CrapsBetType =
  | 'PASS'
  | 'DONT_PASS'
  | 'COME'
  | 'DONT_COME'
  | 'FIELD'
  | 'PLACE_4'
  | 'PLACE_5'
  | 'PLACE_6'
  | 'PLACE_8'
  | 'PLACE_9'
  | 'PLACE_10'
  | 'HARD_4'
  | 'HARD_6'
  | 'HARD_8'
  | 'HARD_10'
  | 'ANY_7'
  | 'ANY_CRAPS'
  | 'YO_11'
  | 'SNAKE_EYES'
  | 'BOXCARS';

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
export type BaccaratBetType = 'PLAYER' | 'BANKER' | 'TIE';

// Sic Bo bet types
export type SicBoBetType =
  | 'SMALL'
  | 'BIG'
  | 'TOTAL_4'
  | 'TOTAL_5'
  | 'TOTAL_6'
  | 'TOTAL_7'
  | 'TOTAL_8'
  | 'TOTAL_9'
  | 'TOTAL_10'
  | 'TOTAL_11'
  | 'TOTAL_12'
  | 'TOTAL_13'
  | 'TOTAL_14'
  | 'TOTAL_15'
  | 'TOTAL_16'
  | 'TOTAL_17'
  | 'ANY_TRIPLE'
  | 'SPECIFIC_TRIPLE'
  | 'SINGLE';

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
