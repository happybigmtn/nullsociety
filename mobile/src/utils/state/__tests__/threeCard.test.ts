import { parseThreeCardState } from '../threeCard';
import { parseThreeCardState as parseThreeCardStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseThreeCardStateBlob as jest.Mock;

describe('parseThreeCardState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseThreeCardState(new Uint8Array())).toBeNull();
  });

  it('maps stage, cards, and bets', () => {
    mockParse.mockReturnValueOnce({
      stage: 2,
      playerCards: [0, 0xff],
      dealerCards: [1, 2],
      pairPlusBet: 5,
      sixCardBonusBet: Number.NaN,
      progressiveBet: 10,
    });

    expect(parseThreeCardState(new Uint8Array([1]))).toEqual({
      stage: 'awaiting',
      playerCards: [{ suit: 'spades', rank: 'A' }],
      dealerCards: [
        { suit: 'spades', rank: '2' },
        { suit: 'spades', rank: '3' },
      ],
      pairPlusBet: 5,
      sixCardBonusBet: 0,
      progressiveBet: 10,
    });
  });
});
