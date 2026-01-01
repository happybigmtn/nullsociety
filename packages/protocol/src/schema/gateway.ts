/**
 * Zod schemas for validating incoming data.
 * Used by gateway to validate client messages before relaying to chain.
 */

import { z } from 'zod';
import { GameType } from '@nullspace/types';
import { betAmountSchema, gameTypeSchema, positiveBetAmountSchema, sessionIdSchema } from './base.js';
import { GAME_MOVE_SCHEMAS, blackjackMoveSchema, rouletteMoveSchema, crapsMoveSchema } from '../games/index.js';

const ZERO_BET_GAME_TYPES = new Set<GameType>([
  GameType.Baccarat,
  GameType.Craps,
  GameType.Roulette,
  GameType.SicBo,
]);

export const startGameSchema = z.object({
  type: z.literal('start_game'),
  gameType: gameTypeSchema,
  bet: betAmountSchema,
  sideBets: z.array(z.object({
    type: z.number().int().min(0).max(255),
    amount: positiveBetAmountSchema,
  })).optional(),
  requestId: z.string().optional(),
}).superRefine((data, ctx) => {
  try {
    if (BigInt(data.bet) === 0n && !ZERO_BET_GAME_TYPES.has(data.gameType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bet must be greater than zero',
        path: ['bet'],
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Bet must be numeric string',
      path: ['bet'],
    });
  }
});

const gameMoveSchemas = GAME_MOVE_SCHEMAS as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]];

/**
 * Union of all game-specific move schemas
 * Note: Can't use discriminatedUnion since roulette/craps are already unions
 */
export const gameMoveSchema = z.union(gameMoveSchemas);

export const clientMessageSchema = z.union([
  startGameSchema,
  gameMoveSchema,
]);

// Export individual schemas for direct use
export { gameTypeSchema, betAmountSchema, sessionIdSchema };
export { blackjackMoveSchema, rouletteMoveSchema, crapsMoveSchema };

// Inferred types from schemas
export type ValidatedStartGame = z.infer<typeof startGameSchema>;
export type ValidatedBlackjackMove = z.infer<typeof blackjackMoveSchema>;
export type ValidatedRouletteMove = z.infer<typeof rouletteMoveSchema>;
export type ValidatedCrapsMove = z.infer<typeof crapsMoveSchema>;
export type ValidatedGameMove = z.infer<typeof gameMoveSchema>;
export type ValidatedClientMessage = z.infer<typeof clientMessageSchema>;
