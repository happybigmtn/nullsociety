import { parseBlackjackState } from '../blackjack';
import { parseBlackjackState as parseBlackjackStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseBlackjackStateBlob as jest.Mock;

describe('parseBlackjackState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseBlackjackState(new Uint8Array())).toBeNull();
  });

  it('derives totals and action flags', () => {
    mockParse.mockReturnValueOnce({
      hands: [
        { betMult: 0, cards: [] },
        { betMult: 1, cards: [0, 8, 21] },
      ],
      dealerCards: [12],
      activeHandIndex: 99,
      stage: 1,
      actionMask: 0x0c,
    });

    const result = parseBlackjackState(new Uint8Array([1]));
    expect(result).toEqual({
      playerCards: [
        { suit: 'spades', rank: 'A' },
        { suit: 'spades', rank: '9' },
        { suit: 'hearts', rank: '9' },
      ],
      dealerCards: [{ suit: 'spades', rank: 'K' }],
      playerTotal: 19,
      dealerTotal: 10,
      phase: 'player_turn',
      canDouble: true,
      canSplit: true,
      dealerHidden: true,
    });
  });

  it('uses explicit totals and stage mapping', () => {
    mockParse.mockReturnValueOnce({
      hands: [{ betMult: 1, cards: [1] }],
      dealerCards: [2],
      activeHandIndex: 0,
      stage: 3,
      actionMask: 0,
      playerValue: 5,
      dealerValue: 7,
    });

    const result = parseBlackjackState(new Uint8Array([2]));
    expect(result).toEqual({
      playerCards: [{ suit: 'spades', rank: '2' }],
      dealerCards: [{ suit: 'spades', rank: '3' }],
      playerTotal: 5,
      dealerTotal: 7,
      phase: 'result',
      canDouble: false,
      canSplit: false,
      dealerHidden: false,
    });
  });
});
