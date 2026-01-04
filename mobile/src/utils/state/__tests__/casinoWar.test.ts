import { parseCasinoWarState } from '../casinoWar';
import { parseCasinoWarState as parseCasinoWarStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseCasinoWarStateBlob as jest.Mock;

describe('parseCasinoWarState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseCasinoWarState(new Uint8Array())).toBeNull();
  });

  it('maps stages, cards, and tie bets', () => {
    mockParse.mockReturnValueOnce({
      playerCard: 0xff,
      dealerCard: 10,
      stage: 1,
      tieBet: BigInt(50),
    });

    expect(parseCasinoWarState(new Uint8Array([1]))).toEqual({
      playerCard: null,
      dealerCard: { suit: 'spades', rank: 'J' },
      stage: 'war',
      tieBet: 50,
    });

    mockParse.mockReturnValueOnce({
      playerCard: 5,
      dealerCard: 6,
      stage: 2,
      tieBet: Number.NaN,
    });

    expect(parseCasinoWarState(new Uint8Array([2]))).toEqual({
      playerCard: { suit: 'spades', rank: '6' },
      dealerCard: { suit: 'spades', rank: '7' },
      stage: 'complete',
      tieBet: 0,
    });
  });
});
