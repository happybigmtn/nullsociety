import { parseSicBoState } from '../sicbo';
import { parseSicBoState as parseSicBoStateBlob } from '@nullspace/game-state';

jest.mock('@nullspace/game-state');

const mockParse = parseSicBoStateBlob as jest.Mock;

describe('parseSicBoState', () => {
  it('returns null when parser yields null', () => {
    mockParse.mockReturnValueOnce(null);
    expect(parseSicBoState(new Uint8Array())).toBeNull();
  });

  it('maps dice values', () => {
    mockParse.mockReturnValueOnce({ dice: [1, 2, 3] });
    expect(parseSicBoState(new Uint8Array([1]))).toEqual({
      dice: [1, 2, 3],
    });
  });
});
