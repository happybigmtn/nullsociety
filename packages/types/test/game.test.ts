import { describe, it, expect } from 'vitest';
import { GameType } from '../src/game.js';
import { SUIT_COLORS, SUIT_SYMBOLS } from '../src/cards.js';

describe('types runtime exports', () => {
  it('keeps GameType discriminants stable', () => {
    expect(GameType.Baccarat).toBe(0);
    expect(GameType.Blackjack).toBe(1);
    expect(GameType.Craps).toBe(3);
    expect(GameType.UltimateHoldem).toBe(9);
  });

  it('defines suit symbols and colors', () => {
    expect(SUIT_SYMBOLS.hearts).toBeDefined();
    expect(SUIT_SYMBOLS.spades).toBeDefined();
    expect(SUIT_COLORS.hearts).toBe('red');
    expect(SUIT_COLORS.spades).toBe('black');
  });
});
