/**
 * Protocol constants matching the Rust backend
 * See: types/src/execution.rs
 */

// Transaction signing namespace - used for Ed25519 signatures
// CRITICAL: Must match TRANSACTION_NAMESPACE in Rust (b"_NULLSPACE_TX")
export const TRANSACTION_NAMESPACE = new TextEncoder().encode('_NULLSPACE_TX');

// Instruction tags (matching types/src/execution.rs)
export const InstructionTag = {
  CasinoRegister: 10,
  CasinoDeposit: 11,
  CasinoStartGame: 12,
  CasinoGameMove: 13,
  CasinoPlayerAction: 14,
  CasinoSetTournamentLimit: 15,
  CasinoJoinTournament: 16,
  CasinoStartTournament: 17,
} as const;

// Submission tags (matching types/src/api.rs)
export const SubmissionTag = {
  Seed: 0,
  Transactions: 1,  // CRITICAL: Use this for /submit, NOT 0
  Summary: 2,
} as const;

// Game types (matching types/src/casino/game.rs)
export const GameType = {
  Baccarat: 0,
  Blackjack: 1,
  CasinoWar: 2,
  Craps: 3,
  VideoPoker: 4,
  HiLo: 5,
  Roulette: 6,
  SicBo: 7,
  ThreeCard: 8,
  UltimateHoldem: 9,
} as const;

export type GameType = typeof GameType[keyof typeof GameType];

// Player actions (matching types/src/casino/game.rs)
export const PlayerAction = {
  Hit: 0,
  Stand: 1,
  Double: 2,
  Split: 3,
  ToggleShield: 10,
  ToggleDouble: 11,
  ActivateSuper: 12,
  CashOut: 20,
} as const;

export type PlayerAction = typeof PlayerAction[keyof typeof PlayerAction];

// Blackjack move types (payload for CasinoGameMove)
export const BlackjackMove = {
  Hit: 0,
  Stand: 1,
  Double: 2,
  Split: 3,
} as const;

// Hi-Lo guess types
export const HiLoGuess = {
  Higher: 0,
  Lower: 1,
  Same: 2,
} as const;

// Baccarat bet types
export const BaccaratBet = {
  Player: 0,
  Banker: 1,
  Tie: 2,
} as const;
