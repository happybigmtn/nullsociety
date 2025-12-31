import { describe, it, expect } from 'vitest';
import { calculateRouletteExposure, calculateCrapsExposure } from '../gameUtils';
import type { CrapsBet, RouletteBet } from '../../types';

describe('gameUtils local parity fixtures', () => {
  it('calculates roulette exposure from fixtures', () => {
    const bets: RouletteBet[] = [
      { type: 'RED', amount: 10 },
      { type: 'BLACK', amount: 5 },
      { type: 'STRAIGHT', target: 7, amount: 2 },
    ];

    expect(calculateRouletteExposure(7, bets)).toBe(10 - 5 + 2 * 35);
  });

  it('calculates craps exposure from fixtures', () => {
    const passBet: CrapsBet[] = [{ type: 'PASS', amount: 10 }];
    expect(calculateCrapsExposure(7, null, passBet)).toBe(10);

    const dontPassBet: CrapsBet[] = [{ type: 'DONT_PASS', amount: 10 }];
    expect(calculateCrapsExposure(2, null, dontPassBet)).toBe(10);

    const fieldBet: CrapsBet[] = [{ type: 'FIELD', amount: 10 }];
    expect(calculateCrapsExposure(2, null, fieldBet)).toBe(20);
  });
});
