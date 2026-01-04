import { parseBaccaratState } from '../baccarat';
import { parseBaccaratState as parseBaccaratStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseBaccaratStateBlob as jest.Mock;

describe('parseBaccaratState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseBaccaratState(new Uint8Array())).toBeNull();
  });

  it('returns null when no cards are present', () => {
    mockParse.mockReturnValueOnce({ playerCards: [], bankerCards: [] });
    expect(parseBaccaratState(new Uint8Array())).toBeNull();
  });

  it('decodes cards and totals', () => {
    mockParse.mockReturnValueOnce({
      playerCards: [0, 12],
      bankerCards: [13, 40],
    });

    const result = parseBaccaratState(new Uint8Array([1]));
    expect(result).toEqual({
      playerCards: [
        { suit: 'spades', rank: 'A' },
        { suit: 'spades', rank: 'K' },
      ],
      bankerCards: [
        { suit: 'hearts', rank: 'A' },
        { suit: 'clubs', rank: '2' },
      ],
      playerTotal: 1,
      bankerTotal: 3,
    });
  });
});
