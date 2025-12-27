/**
 * Transaction building and signing
 * Matches Rust types/src/execution.rs Transaction struct
 */
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { TRANSACTION_NAMESPACE, SubmissionTag } from './constants.js';

/**
 * Build a signed transaction
 *
 * Transaction format:
 * [nonce:u64 BE] [instruction bytes] [pubkey:32] [signature:64]
 *
 * Signature covers: TRANSACTION_NAMESPACE + nonce + instruction
 */
export function buildTransaction(
  nonce: bigint,
  instruction: Uint8Array,
  privateKey: Uint8Array
): Uint8Array {
  const publicKey = ed25519.getPublicKey(privateKey);

  // Build payload for signing: nonce (8 bytes BE) + instruction
  const payload = new Uint8Array(8 + instruction.length);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);  // BE
  payload.set(instruction, 8);

  // Sign with namespace prefix: TRANSACTION_NAMESPACE + payload
  const toSign = new Uint8Array(TRANSACTION_NAMESPACE.length + payload.length);
  toSign.set(TRANSACTION_NAMESPACE, 0);
  toSign.set(payload, TRANSACTION_NAMESPACE.length);
  const signature = ed25519.sign(toSign, privateKey);

  // Build transaction: payload + pubkey + signature
  const tx = new Uint8Array(payload.length + 32 + 64);
  tx.set(payload, 0);
  tx.set(publicKey, payload.length);
  tx.set(signature, payload.length + 32);

  return tx;
}

/**
 * Wrap transaction(s) in Submission::Transactions format for /submit endpoint
 *
 * Format:
 * [tag:u8 = 1] [vec_length:u32 BE] [tx1 bytes]...
 *
 * CRITICAL: Tag 1 is Transactions, NOT tag 0 (that's Seed)
 */
export function wrapSubmission(tx: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + 4 + tx.length);
  result[0] = SubmissionTag.Transactions;  // tag 1
  new DataView(result.buffer).setUint32(1, 1, false);  // Vec length = 1, BE
  result.set(tx, 5);
  return result;
}

/**
 * Wrap multiple transactions in a single submission
 */
export function wrapMultipleSubmission(txs: Uint8Array[]): Uint8Array {
  const totalLen = txs.reduce((acc, tx) => acc + tx.length, 0);
  const result = new Uint8Array(1 + 4 + totalLen);

  result[0] = SubmissionTag.Transactions;
  new DataView(result.buffer).setUint32(1, txs.length, false);  // Vec length, BE

  let offset = 5;
  for (const tx of txs) {
    result.set(tx, offset);
    offset += tx.length;
  }

  return result;
}

/**
 * Generate a unique session ID from public key and counter
 * Uses SHA256 hash to avoid collisions
 */
export function generateSessionId(publicKey: Uint8Array, counter: bigint): bigint {
  const data = new Uint8Array(32 + 8);
  data.set(publicKey, 0);
  new DataView(data.buffer).setBigUint64(32, counter, false);

  const hash = sha256(data);
  // Use first 8 bytes of hash as session ID
  return new DataView(hash.buffer).getBigUint64(0, false);
}

/**
 * Verify a transaction signature (for testing)
 */
export function verifyTransaction(tx: Uint8Array, instructionLen: number): boolean {
  // Extract components
  const nonce = new DataView(tx.buffer, tx.byteOffset).getBigUint64(0, false);
  const instruction = tx.slice(8, 8 + instructionLen);
  const publicKey = tx.slice(8 + instructionLen, 8 + instructionLen + 32);
  const signature = tx.slice(8 + instructionLen + 32, 8 + instructionLen + 32 + 64);

  // Rebuild the signed message
  const payload = new Uint8Array(8 + instructionLen);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);
  payload.set(instruction, 8);

  const toSign = new Uint8Array(TRANSACTION_NAMESPACE.length + payload.length);
  toSign.set(TRANSACTION_NAMESPACE, 0);
  toSign.set(payload, TRANSACTION_NAMESPACE.length);

  try {
    return ed25519.verify(signature, toSign, publicKey);
  } catch {
    return false;
  }
}

// Re-export for convenience
export { ed25519 };
