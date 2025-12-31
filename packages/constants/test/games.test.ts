import { describe, it, expect } from 'vitest';
import { GameType } from '@nullspace/types';
import { GAME_DISPLAY_NAMES, GAME_EMOJIS, GAME_TYPE_TO_ID } from '../src/games.js';

describe('game display constants', () => {
  it('maps every GameType to a GameId', () => {
    const gameTypes = Object.values(GameType).filter((value): value is number => typeof value === 'number');

    for (const gameType of gameTypes) {
      const gameId = GAME_TYPE_TO_ID[gameType];
      expect(gameId).toBeDefined();
      expect(GAME_DISPLAY_NAMES[gameId]).toBeDefined();
      expect(GAME_EMOJIS[gameId]).toBeDefined();
    }
  });
});
