import { DICE_FACES, getDieFace, getDiceTotal } from '../dice';

describe('dice utils', () => {
  it('returns die faces for valid values', () => {
    expect(getDieFace(1)).toBe(DICE_FACES[1]);
    expect(getDieFace(6)).toBe(DICE_FACES[6]);
  });

  it('returns fallback for invalid values', () => {
    expect(getDieFace(0)).toBe('?');
    expect(getDieFace(7)).toBe('?');
  });

  it('sums dice totals', () => {
    expect(getDiceTotal([1, 2, 3])).toBe(6);
    expect(getDiceTotal([])).toBe(0);
  });
});
