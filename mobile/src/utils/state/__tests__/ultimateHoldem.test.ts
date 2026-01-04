import { parseUltimateHoldemState } from '../ultimateHoldem';
import { parseUltimateHoldemState as parseUltimateHoldemStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseUltimateHoldemStateBlob as jest.Mock;

describe('parseUltimateHoldemState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseUltimateHoldemState(new Uint8Array())).toBeNull();
  });

  it('maps stage, cards, and bets', () => {
    mockParse.mockReturnValueOnce({
      stage: 4,
      playerCards: [0, 1],
      communityCards: [2, 0xff],
      dealerCards: [3],
      tripsBet: 5,
      sixCardBonusBet: Number.NaN,
      progressiveBet: 9,
    });

    expect(parseUltimateHoldemState(new Uint8Array([1]))).toEqual({
      stage: 'showdown',
      playerCards: [
        { suit: 'spades', rank: 'A' },
        { suit: 'spades', rank: '2' },
      ],
      communityCards: [{ suit: 'spades', rank: '3' }],
      dealerCards: [{ suit: 'spades', rank: '4' }],
      tripsBet: 5,
      sixCardBonusBet: 0,
      progressiveBet: 9,
    });
  });
});
