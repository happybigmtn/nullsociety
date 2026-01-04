import { parseCrapsState } from '../craps';
import { parseCrapsState as parseCrapsStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseCrapsStateBlob as jest.Mock;

describe('parseCrapsState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseCrapsState(new Uint8Array())).toBeNull();
  });

  it('maps dice, point, and phase', () => {
    mockParse.mockReturnValueOnce({ dice: [3, 4], mainPoint: 6, phase: 1 });
    expect(parseCrapsState(new Uint8Array([1]))).toEqual({
      dice: [3, 4],
      point: 6,
      phase: 'point',
    });

    mockParse.mockReturnValueOnce({ dice: [0, 2], mainPoint: 0, phase: 0 });
    expect(parseCrapsState(new Uint8Array([2]))).toEqual({
      dice: null,
      point: null,
      phase: 'comeout',
    });
  });
});
