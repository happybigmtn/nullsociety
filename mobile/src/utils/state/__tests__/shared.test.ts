import { readU64BE, readI64BE, safeSlice, SafeReader } from '../shared';

describe('state shared utils', () => {
  it('reads big endian integers', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 5, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe]);
    const view = new DataView(bytes.buffer);
    expect(readU64BE(view, 0)).toBe(BigInt(5));
    expect(readI64BE(view, 8)).toBe(BigInt(-2));
  });

  it('safely slices byte arrays', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(Array.from(safeSlice(bytes, 1, 2) ?? [])).toEqual([2, 3]);
    expect(safeSlice(bytes, -1, 2)).toBeNull();
    expect(safeSlice(bytes, 3, 2)).toBeNull();
  });

  it('reads values with SafeReader and enforces bounds', () => {
    const reader = new SafeReader(new Uint8Array([10, 20, 0, 0, 0, 0, 0, 0, 0, 7]));
    expect(reader.remaining()).toBe(10);
    expect(reader.readU8('first')).toBe(10);
    expect(reader.readU8At(1, 'second')).toBe(20);
    expect(Array.from(reader.readBytes(1, 'slice'))).toEqual([20]);

    reader.skip(8, 'skip');
    expect(reader.remaining()).toBe(0);

    expect(() => reader.readU8('missing')).toThrow('SafeReader: insufficient data');
  });

  it('reads 64-bit values via SafeReader', () => {
    const bytes = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]);
    const reader = new SafeReader(bytes);
    expect(reader.readU64BE('u64')).toBe(BigInt(1));
  });
});
