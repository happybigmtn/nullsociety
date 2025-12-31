import { describe, it, expect } from 'vitest';
import { SafeReader } from '../src/index.js';

describe('SafeReader', () => {
  it('reads sequential values and tracks offset', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const reader = new SafeReader(data);

    expect(reader.remaining()).toBe(5);
    expect(reader.readU8('first')).toBe(1);
    expect(reader.readU8('second')).toBe(2);
    expect(reader.remaining()).toBe(3);

    const bytes = reader.readBytes(2, 'chunk');
    expect(Array.from(bytes)).toEqual([3, 4]);
    expect(reader.remaining()).toBe(1);
    expect(reader.readU8('last')).toBe(5);
    expect(reader.remaining()).toBe(0);
  });

  it('reads fixed-width values without advancing offset', () => {
    const data = new Uint8Array([10, 20, 30]);
    const reader = new SafeReader(data);

    expect(reader.readU8At(1, 'peek')).toBe(20);
    expect(reader.readU8('next')).toBe(10);
  });

  it('reads big-endian integers', () => {
    const data = new Uint8Array(16);
    const view = new DataView(data.buffer);
    view.setBigUint64(0, 500n, false);
    view.setBigInt64(8, -12n, false);

    const reader = new SafeReader(data);
    expect(reader.readU64BE('u64')).toBe(500n);
    expect(reader.readI64BE('i64')).toBe(-12n);
  });

  it('throws on insufficient data', () => {
    const reader = new SafeReader(new Uint8Array([1]));

    expect(() => reader.readBytes(2, 'bytes')).toThrow(/insufficient data/i);
    expect(() => reader.readU64BE('u64')).toThrow(/insufficient data/i);
    expect(() => reader.readU8At(2, 'peek')).toThrow(/insufficient data/i);
    expect(() => reader.skip(2, 'skip')).toThrow(/insufficient data/i);
  });
});
