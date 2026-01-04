import { bytesToHex, hexToBytes } from '../hex';

describe('hex utils', () => {
  it('encodes bytes to hex with leading zeros', () => {
    const bytes = new Uint8Array([0, 1, 15, 255]);
    expect(bytesToHex(bytes)).toBe('00010fff');
  });

  it('decodes hex strings to bytes', () => {
    const bytes = hexToBytes('00010fff');
    expect(Array.from(bytes)).toEqual([0, 1, 15, 255]);
  });

  it('round-trips byte arrays', () => {
    const original = new Uint8Array([10, 20, 30, 40]);
    const hex = bytesToHex(original);
    expect(Array.from(hexToBytes(hex))).toEqual(Array.from(original));
  });
});
