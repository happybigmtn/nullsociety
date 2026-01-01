/**
 * WebSocket message types for mobile <-> gateway communication.
 * The gateway relays these to/from the chain on behalf of mobile clients.
 */

import { z } from 'zod';
import { gameTypeSchema, sessionIdSchema } from './base.js';
import type {
  clientMessageSchema,
  startGameSchema,
  gameMoveSchema,
} from './gateway.js';
import type {
  blackjackMoveSchema,
  rouletteMoveSchema,
  crapsMoveSchema,
  roulettePlaceBetSchema,
  rouletteActionSchema,
  crapsPlaceBetSchema,
  crapsAddOddsSchema,
  crapsRollSchema,
  crapsClearBetsSchema,
} from '../games/index.js';

// Client -> Gateway messages
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type StartGameMessage = z.infer<typeof startGameSchema>;
export type BlackjackMoveMessage = z.infer<typeof blackjackMoveSchema>;
export type RoulettePlaceBetMessage = z.infer<typeof roulettePlaceBetSchema>;
export type RouletteActionMessage = z.infer<typeof rouletteActionSchema>;
export type RouletteMoveMessage = z.infer<typeof rouletteMoveSchema>;
export type CrapsPlaceBetMessage = z.infer<typeof crapsPlaceBetSchema>;
export type CrapsAddOddsMessage = z.infer<typeof crapsAddOddsSchema>;
export type CrapsRollMessage = z.infer<typeof crapsRollSchema>;
export type CrapsClearBetsMessage = z.infer<typeof crapsClearBetsSchema>;
export type CrapsMoveMessage = z.infer<typeof crapsMoveSchema>;
export type GameMoveMessage = z.infer<typeof gameMoveSchema>;

// Gateway -> Client messages
export const GameStartedMessageSchema = z.object({
  type: z.literal('game_started'),
  sessionId: sessionIdSchema,
  gameType: gameTypeSchema,
  initialState: z.string(), // base64 encoded state
});

export const GameStateMessageSchema = z.object({
  type: z.literal('game_state'),
  sessionId: sessionIdSchema,
  state: z.string(), // base64 encoded state from chain
});

export const GameResultMessageSchema = z.object({
  type: z.literal('game_result'),
  sessionId: sessionIdSchema,
  won: z.boolean(),
  payout: z.string(),
  message: z.string(),
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  GameStartedMessageSchema,
  GameStateMessageSchema,
  GameResultMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type GameStartedMessage = z.infer<typeof GameStartedMessageSchema>;
export type GameStateMessage = z.infer<typeof GameStateMessageSchema>;
export type GameResultMessage = z.infer<typeof GameResultMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export type AnyClientMessage = StartGameMessage | GameMoveMessage;
export type AnyServerMessage = ServerMessage;
