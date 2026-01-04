import { parseVideoPokerState } from '../videoPoker';
import { parseVideoPokerState as parseVideoPokerStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseVideoPokerStateBlob as jest.Mock;

describe('parseVideoPokerState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseVideoPokerState(new Uint8Array())).toBeNull();
  });

  it('maps stage and cards', () => {
    mockParse.mockReturnValueOnce({ stage: 1, cards: [0, 1, 52] });
    expect(parseVideoPokerState(new Uint8Array([1]))).toEqual({
      stage: 'draw',
      cards: [
        { suit: 'spades', rank: 'A' },
        { suit: 'spades', rank: '2' },
      ],
    });
  });
});
