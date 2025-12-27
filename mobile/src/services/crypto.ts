/**
 * Ed25519 cryptographic signing service
 * Uses @noble/curves for pure JS implementation (no WASM dependency)
 *
 * Security: Private keys are kept internal and never exposed.
 * Only signing operations and public key access are exported.
 */
import { ed25519 } from '@noble/curves/ed25519';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_KEY = 'nullspace_private_key';

/**
 * Convert bytes to hex string (React Native doesn't have Buffer)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Internal: Get or create the Ed25519 key pair
 * Private key is never exposed outside this module
 */
async function getOrCreateKeyPairInternal(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  let privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);

  if (!privateKeyHex) {
    const privateKey = ed25519.utils.randomPrivateKey();
    privateKeyHex = bytesToHex(privateKey);
    await SecureStore.setItemAsync(PRIVATE_KEY_KEY, privateKeyHex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  const privateKey = hexToBytes(privateKeyHex);
  const publicKey = ed25519.getPublicKey(privateKey);

  return { publicKey, privateKey };
}

/**
 * Get the public key (creates key pair if none exists)
 * Only the public key is returned - private key stays internal
 */
export async function getPublicKey(): Promise<Uint8Array> {
  const { publicKey } = await getOrCreateKeyPairInternal();
  return publicKey;
}

/**
 * Sign a message with Ed25519
 * Private key is used internally and never exposed
 */
export async function signMessage(message: Uint8Array): Promise<Uint8Array> {
  const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  if (!privateKeyHex) {
    throw new Error('No key pair exists. Call getPublicKey() first to create one.');
  }
  const privateKey = hexToBytes(privateKeyHex);
  return ed25519.sign(message, privateKey);
}

/**
 * Verify an Ed25519 signature
 */
export function verifySignature(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return ed25519.verify(signature, message, publicKey);
}

/**
 * Delete the stored key pair (for account reset)
 */
export async function deleteKeyPair(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY_KEY);
}

/**
 * Check if a key pair exists
 */
export async function hasKeyPair(): Promise<boolean> {
  const key = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);
  return key !== null;
}
