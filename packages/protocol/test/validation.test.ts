import { describe, it, expect } from 'vitest';
import { GameType } from '@nullspace/types';
import {
  betAmountSchema,
  blackjackMoveSchema,
  clientMessageSchema,
  crapsMoveSchema,
  gameTypeSchema,
  rouletteMoveSchema,
  sessionIdSchema,
  startGameSchema,
} from '../src/validation.js';

const expectValid = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => {
  expect(schema.safeParse(value).success).toBe(true);
};

const expectInvalid = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => {
  expect(schema.safeParse(value).success).toBe(false);
};

describe('protocol validation schemas', () => {
  it('validates game types and session ids', () => {
    for (let i = 0; i <= 9; i += 1) {
      expectValid(gameTypeSchema, i);
    }
    expectInvalid(gameTypeSchema, -1);
    expectInvalid(gameTypeSchema, 10);
    expectInvalid(gameTypeSchema, '1');

    expectValid(sessionIdSchema, '123');
    expectInvalid(sessionIdSchema, 'abc');
    expectInvalid(sessionIdSchema, '-1');
  });

  it('validates bet amount bounds', () => {
    expectValid(betAmountSchema, '0');
    expectValid(betAmountSchema, '42');
    expectInvalid(betAmountSchema, '1.5');
    expectInvalid(betAmountSchema, '-1');
    expectInvalid(betAmountSchema, 'abc');
    const tooLarge = (2n ** 64n).toString();
    expectInvalid(betAmountSchema, tooLarge);
  });

  it('accepts zero bets only for allowed games', () => {
    const zeroBetGames = [
      GameType.Baccarat,
      GameType.Craps,
      GameType.Roulette,
      GameType.SicBo,
    ];

    for (const gameType of zeroBetGames) {
      expectValid(startGameSchema, { type: 'start_game', gameType, bet: '0' });
    }

    const nonZeroGames = [
      GameType.Blackjack,
      GameType.CasinoWar,
      GameType.VideoPoker,
      GameType.HiLo,
      GameType.ThreeCard,
      GameType.UltimateHoldem,
    ];

    for (const gameType of nonZeroGames) {
      expectInvalid(startGameSchema, { type: 'start_game', gameType, bet: '0' });
    }
  });

  it('validates start_game side bets', () => {
    expectValid(startGameSchema, {
      type: 'start_game',
      gameType: GameType.Blackjack,
      bet: '10',
      sideBets: [{ type: 1, amount: '5' }],
    });

    expectInvalid(startGameSchema, {
      type: 'start_game',
      gameType: GameType.Blackjack,
      bet: '10',
      sideBets: [{ type: 1, amount: '0' }],
    });
  });

  it('validates blackjack moves', () => {
    expectValid(blackjackMoveSchema, {
      type: 'game_move',
      sessionId: '1',
      game: 'blackjack',
      move: 'hit',
    });

    expectInvalid(blackjackMoveSchema, {
      type: 'game_move',
      sessionId: 'abc',
      game: 'blackjack',
      move: 'hit',
    });
  });

  it('validates roulette moves', () => {
    expectValid(rouletteMoveSchema, {
      type: 'game_move',
      sessionId: '2',
      game: 'roulette',
      move: 'spin',
    });

    expectValid(rouletteMoveSchema, {
      type: 'game_move',
      sessionId: '2',
      game: 'roulette',
      move: 'place_bet',
      betType: 1,
      number: 7,
      amount: '25',
    });

    expectInvalid(rouletteMoveSchema, {
      type: 'game_move',
      sessionId: '2',
      game: 'roulette',
      move: 'place_bet',
      betType: 1,
      number: 7,
    });
  });

  it('validates craps moves', () => {
    expectValid(crapsMoveSchema, {
      type: 'game_move',
      sessionId: '3',
      game: 'craps',
      move: 'roll',
    });

    expectValid(crapsMoveSchema, {
      type: 'game_move',
      sessionId: '3',
      game: 'craps',
      move: 'place_bet',
      betType: 1,
      amount: '10',
    });

    expectInvalid(crapsMoveSchema, {
      type: 'game_move',
      sessionId: '3',
      game: 'craps',
      move: 'place_bet',
      betType: 1,
    });
  });

  it('validates client message unions', () => {
    expectValid(clientMessageSchema, {
      type: 'start_game',
      gameType: GameType.Baccarat,
      bet: '0',
    });

    expectValid(clientMessageSchema, {
      type: 'game_move',
      sessionId: '4',
      game: 'blackjack',
      move: 'stand',
    });

    expectInvalid(clientMessageSchema, { type: 'unknown' });
  });
});
