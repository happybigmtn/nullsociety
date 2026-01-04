/**
 * Binary instruction encoders matching Rust types/src/execution.rs
 * All multi-byte integers are Big Endian
 *
 * Note: This module encodes higher-level casino instructions (CasinoStartGame, CasinoGameMove).
 * Game-specific payloads should defer to @nullspace/protocol where possible.
 */
import { InstructionTag, GameType, PlayerAction } from './constants.js';
import {
  CASINO_MAX_NAME_LENGTH,
  CASINO_MAX_PAYLOAD_LENGTH,
  GLOBAL_TABLE_MAX_BETS_PER_ROUND,
} from '@nullspace/constants/limits';
import { encodeVarint } from './transactions.js';

/**
 * CasinoRegister - Register a new casino player
 * Binary: [10] [nameLen:u32 BE] [nameBytes...]
 */
export function encodeCasinoRegister(name: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  if (nameBytes.length > CASINO_MAX_NAME_LENGTH) {
    throw new Error(
      `CasinoRegister name exceeds ${CASINO_MAX_NAME_LENGTH} bytes`
    );
  }
  const result = new Uint8Array(1 + 4 + nameBytes.length);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoRegister;
  view.setUint32(1, nameBytes.length, false);  // BE
  result.set(nameBytes, 5);

  return result;
}

/**
 * CasinoDeposit - Deposit chips (testing/faucet)
 * Binary: [11] [amount:u64 BE]
 */
export function encodeCasinoDeposit(amount: bigint): Uint8Array {
  const result = new Uint8Array(9);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoDeposit;
  view.setBigUint64(1, amount, false);  // BE

  return result;
}

/**
 * CasinoStartGame - Start a new casino game session
 * Binary: [12] [gameType:u8] [bet:u64 BE] [sessionId:u64 BE]
 */
export function encodeCasinoStartGame(
  gameType: GameType,
  bet: bigint,
  sessionId: bigint
): Uint8Array {
  const result = new Uint8Array(18);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoStartGame;
  result[1] = gameType;
  view.setBigUint64(2, bet, false);  // BE
  view.setBigUint64(10, sessionId, false);  // BE

  return result;
}

/**
 * CasinoGameMove - Make a move in an active game
 * Binary: [13] [sessionId:u64 BE] [payloadLen:u32 BE] [payload...]
 */
export function encodeCasinoGameMove(
  sessionId: bigint,
  payload: Uint8Array
): Uint8Array {
  if (payload.length > CASINO_MAX_PAYLOAD_LENGTH) {
    throw new Error(
      `CasinoGameMove payload exceeds ${CASINO_MAX_PAYLOAD_LENGTH} bytes`
    );
  }
  const result = new Uint8Array(1 + 8 + 4 + payload.length);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoGameMove;
  view.setBigUint64(1, sessionId, false);  // BE
  view.setUint32(9, payload.length, false);  // BE
  result.set(payload, 13);

  return result;
}

/**
 * CasinoPlayerAction - Toggle modifiers (shield, double, super)
 * Binary: [14] [action:u8]
 */
export function encodeCasinoPlayerAction(action: PlayerAction): Uint8Array {
  const result = new Uint8Array(2);

  result[0] = InstructionTag.CasinoPlayerAction;
  result[1] = action;

  return result;
}

/**
 * CasinoJoinTournament - Join a tournament
 * Binary: [16] [tournamentId:u64 BE]
 */
export function encodeCasinoJoinTournament(tournamentId: bigint): Uint8Array {
  const result = new Uint8Array(9);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.CasinoJoinTournament;
  view.setBigUint64(1, tournamentId, false);  // BE

  return result;
}

// ============================================================
// Global table instruction encoders
// ============================================================

export interface GlobalTableConfigInput {
  gameType: GameType;
  bettingMs: number;
  lockMs: number;
  payoutMs: number;
  cooldownMs: number;
  minBet: bigint;
  maxBet: bigint;
  maxBetsPerRound: number;
}

export interface GlobalTableBetInput {
  betType: number;
  target: number;
  amount: bigint;
}

export function encodeGlobalTableInit(config: GlobalTableConfigInput): Uint8Array {
  if (config.maxBetsPerRound > GLOBAL_TABLE_MAX_BETS_PER_ROUND) {
    throw new Error(
      `GlobalTable maxBetsPerRound exceeds ${GLOBAL_TABLE_MAX_BETS_PER_ROUND}`
    );
  }
  const result = new Uint8Array(1 + 1 + (8 * 6) + 1);
  const view = new DataView(result.buffer);

  result[0] = InstructionTag.GlobalTableInit;
  result[1] = config.gameType;
  view.setBigUint64(2, BigInt(config.bettingMs), false);
  view.setBigUint64(10, BigInt(config.lockMs), false);
  view.setBigUint64(18, BigInt(config.payoutMs), false);
  view.setBigUint64(26, BigInt(config.cooldownMs), false);
  view.setBigUint64(34, config.minBet, false);
  view.setBigUint64(42, config.maxBet, false);
  result[50] = config.maxBetsPerRound;

  return result;
}

export function encodeGlobalTableOpenRound(gameType: GameType): Uint8Array {
  const result = new Uint8Array(2);
  result[0] = InstructionTag.GlobalTableOpenRound;
  result[1] = gameType;
  return result;
}

export function encodeGlobalTableSubmitBets(
  gameType: GameType,
  roundId: bigint,
  bets: GlobalTableBetInput[]
): Uint8Array {
  const lenVarint = encodeVarint(bets.length);
  const result = new Uint8Array(1 + 1 + 8 + lenVarint.length + bets.length * 10);
  const view = new DataView(result.buffer);

  let offset = 0;
  result[offset] = InstructionTag.GlobalTableSubmitBets;
  offset += 1;
  result[offset] = gameType;
  offset += 1;
  view.setBigUint64(offset, roundId, false);
  offset += 8;
  result.set(lenVarint, offset);
  offset += lenVarint.length;

  for (const bet of bets) {
    result[offset] = bet.betType;
    result[offset + 1] = bet.target;
    view.setBigUint64(offset + 2, bet.amount, false);
    offset += 10;
  }

  return result;
}

export function encodeGlobalTableLock(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableLock;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}

export function encodeGlobalTableReveal(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableReveal;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}

export function encodeGlobalTableSettle(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableSettle;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}

export function encodeGlobalTableFinalize(gameType: GameType, roundId: bigint): Uint8Array {
  const result = new Uint8Array(10);
  const view = new DataView(result.buffer);
  result[0] = InstructionTag.GlobalTableFinalize;
  result[1] = gameType;
  view.setBigUint64(2, roundId, false);
  return result;
}
