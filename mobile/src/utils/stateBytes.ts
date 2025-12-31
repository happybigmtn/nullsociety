export function decodeStateBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    const bytes = value.filter((v) => typeof v === 'number' && Number.isFinite(v));
    return Uint8Array.from(bytes);
  }
  return null;
}

