import { decodeStateBytes } from '../stateBytes';

describe('stateBytes utils', () => {
  it('returns Uint8Array inputs as-is', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(decodeStateBytes(bytes)).toBe(bytes);
  });

  it('filters arrays down to numeric bytes', () => {
    const result = decodeStateBytes([1, 'nope', 2, Infinity, 3, null]);
    expect(Array.from(result ?? [])).toEqual([1, 2, 3]);
  });

  it('returns null for unsupported values', () => {
    expect(decodeStateBytes('abc')).toBeNull();
    expect(decodeStateBytes({})).toBeNull();
  });
});
