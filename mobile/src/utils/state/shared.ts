export function readU64BE(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, false);
}

export function readI64BE(view: DataView, offset: number): bigint {
  return view.getBigInt64(offset, false);
}

export function safeSlice(bytes: Uint8Array, offset: number, length: number): Uint8Array | null {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    return null;
  }
  return bytes.slice(offset, offset + length);
}

