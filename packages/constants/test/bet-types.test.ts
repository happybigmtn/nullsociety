import { describe, it, expect } from 'vitest';
import {
  BACCARAT_BET_TYPES,
  CRAPS_BET_TYPES,
  encodeBaccaratBet,
  encodeCrapsBet,
  encodeRouletteBet,
  encodeSicBoBet,
  crapsRequiresTarget,
  rouletteRequiresTarget,
  sicboRequiresTarget,
} from '../src/bet-types.js';

describe('bet type helpers', () => {
  it('encodes baccarat bets', () => {
    expect(encodeBaccaratBet('PLAYER')).toBe(BACCARAT_BET_TYPES.PLAYER);
    expect(encodeBaccaratBet('BANKER')).toBe(BACCARAT_BET_TYPES.BANKER);
  });

  it('encodes craps bets with target rules', () => {
    expect(crapsRequiresTarget('YES')).toBe(true);
    expect(crapsRequiresTarget('PASS')).toBe(false);

    const yesBet = encodeCrapsBet('YES', 6);
    expect(yesBet.betType).toBe(CRAPS_BET_TYPES.YES);
    expect(yesBet.target).toBe(6);

    const hardwayBet = encodeCrapsBet('HARDWAY', 8);
    expect(hardwayBet.betType).not.toBe(CRAPS_BET_TYPES.HARDWAY);
    expect(hardwayBet.target).toBe(0);
  });

  it('encodes roulette bets with target rules', () => {
    expect(rouletteRequiresTarget('STRAIGHT')).toBe(true);
    expect(rouletteRequiresTarget('RED')).toBe(false);

    expect(encodeRouletteBet('RED')).toEqual({ type: 1, value: 0 });
    expect(encodeRouletteBet('DOZEN_2')).toEqual({ type: 7, value: 1 });
    expect(encodeRouletteBet('SIX_LINE', 5)).toEqual({ type: 13, value: 5 });
  });

  it('encodes sic bo bets with target rules', () => {
    expect(sicboRequiresTarget('TRIPLE_SPECIFIC')).toBe(true);
    expect(sicboRequiresTarget('BIG')).toBe(false);

    expect(encodeSicBoBet('SMALL')).toEqual({ betType: 0, target: 0 });
    expect(encodeSicBoBet('TRIPLE_SPECIFIC', 3)).toEqual({ betType: 4, target: 3 });
  });
});
