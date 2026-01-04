import { parseRouletteState } from '../roulette';
import { parseRouletteState as parseRouletteStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseRouletteStateBlob as jest.Mock;

describe('parseRouletteState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseRouletteState(new Uint8Array())).toBeNull();
  });

  it('maps result and prison flag', () => {
    mockParse.mockReturnValueOnce({ result: 17, phase: 1 });
    expect(parseRouletteState(new Uint8Array([1]))).toEqual({
      result: 17,
      isPrison: true,
    });

    mockParse.mockReturnValueOnce({ result: null, phase: 0 });
    expect(parseRouletteState(new Uint8Array([2]))).toEqual({
      result: null,
      isPrison: false,
    });
  });
});
