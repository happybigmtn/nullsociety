import { parseHiLoState } from '../hilo';
import { parseHiLoState as parseHiLoStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseHiLoStateBlob as jest.Mock;

describe('parseHiLoState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseHiLoState(new Uint8Array())).toBeNull();
  });

  it('maps card and accumulator', () => {
    mockParse.mockReturnValueOnce({ cardId: 0, accumulatorBasisPoints: 1250 });
    expect(parseHiLoState(new Uint8Array([1]))).toEqual({
      currentCard: { suit: 'spades', rank: 'A' },
      accumulator: 1250,
    });

    mockParse.mockReturnValueOnce({ cardId: 0, accumulatorBasisPoints: 'bad' });
    expect(parseHiLoState(new Uint8Array([2]))).toEqual({
      currentCard: { suit: 'spades', rank: 'A' },
      accumulator: null,
    });
  });
});
