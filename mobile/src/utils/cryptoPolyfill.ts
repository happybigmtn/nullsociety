import { getRandomValues as expoGetRandomValues } from 'expo-crypto';

const globalAny = globalThis as typeof globalThis & { crypto?: Crypto };

const getRandomValuesPolyfill: Crypto['getRandomValues'] = <T extends ArrayBufferView>(array: T): T => {
  const view = array instanceof Uint8Array
    ? array
    : new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  expoGetRandomValues(view);
  return array;
};

if (!globalAny.crypto) {
  globalAny.crypto = { getRandomValues: getRandomValuesPolyfill } as Crypto;
} else if (!globalAny.crypto.getRandomValues) {
  globalAny.crypto.getRandomValues = getRandomValuesPolyfill;
}
