/**
 * Debug script to diagnose transaction signature verification issues
 * Run with: npx tsx tests/debug-signature.ts
 */
import { ed25519 } from '@noble/curves/ed25519';
import {
  encodeCasinoDeposit,
  buildTransaction,
  wrapSubmission,
  verifyTransaction
} from '../src/codec/index.js';
import { TRANSACTION_NAMESPACE } from '../src/codec/constants.js';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

async function main() {
  // Use a fixed key for reproducibility
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  console.log('=== DEBUG TRANSACTION SIGNATURE ===\n');

  console.log('Private Key (32 bytes):');
  console.log(toHex(privateKey));
  console.log();

  console.log('Public Key (32 bytes):');
  console.log(toHex(publicKey));
  console.log();

  // Create a simple instruction
  const instruction = encodeCasinoDeposit(1000n);
  console.log('Instruction (CasinoDeposit 1000):');
  console.log(`  Length: ${instruction.length} bytes`);
  console.log(`  Hex: ${toHex(instruction)}`);
  console.log();

  // Build the transaction
  const nonce = 1n;
  const tx = buildTransaction(nonce, instruction, privateKey);

  console.log('Transaction:');
  console.log(`  Total length: ${tx.length} bytes`);
  console.log();

  // Parse components
  const nonceBytes = tx.slice(0, 8);
  const instructionBytes = tx.slice(8, 8 + instruction.length);
  const pubkeyBytes = tx.slice(8 + instruction.length, 8 + instruction.length + 32);
  const signatureBytes = tx.slice(8 + instruction.length + 32);

  console.log('Components:');
  console.log(`  Nonce (8 bytes BE): ${toHex(nonceBytes)}`);
  console.log(`  Instruction (${instructionBytes.length} bytes): ${toHex(instructionBytes)}`);
  console.log(`  Public Key (32 bytes): ${toHex(pubkeyBytes)}`);
  console.log(`  Signature (64 bytes): ${toHex(signatureBytes)}`);
  console.log();

  // Show what we signed
  const payload = tx.slice(0, 8 + instruction.length);
  console.log('Signing data:');
  console.log(`  TRANSACTION_NAMESPACE: "${new TextDecoder().decode(TRANSACTION_NAMESPACE)}"`);
  console.log(`  TRANSACTION_NAMESPACE hex: ${toHex(TRANSACTION_NAMESPACE)}`);
  console.log(`  Payload (nonce + instruction): ${toHex(payload)}`);
  console.log();

  const toSign = new Uint8Array(TRANSACTION_NAMESPACE.length + payload.length);
  toSign.set(TRANSACTION_NAMESPACE, 0);
  toSign.set(payload, TRANSACTION_NAMESPACE.length);
  console.log(`  Full message to sign (${toSign.length} bytes): ${toHex(toSign)}`);
  console.log();

  // Verify locally
  const valid = verifyTransaction(tx, instruction.length);
  console.log(`Local verification: ${valid ? 'PASS' : 'FAIL'}`);

  // Also verify using ed25519 directly
  try {
    const directVerify = ed25519.verify(signatureBytes, toSign, pubkeyBytes);
    console.log(`Direct ed25519 verification: ${directVerify ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    console.log(`Direct verification error: ${e}`);
  }
  console.log();

  // Wrap in submission format
  const submission = wrapSubmission(tx);
  console.log('Submission (for /submit endpoint):');
  console.log(`  Length: ${submission.length} bytes`);
  console.log(`  Header: ${toHex(submission.slice(0, 2))} (tag=1, vec_len=1)`);
  console.log(`  Full hex: ${toHex(submission)}`);
  console.log();

  // Submit to simulator if running
  console.log('Submitting to http://localhost:8080/submit...');
  try {
    const response = await fetch('http://localhost:8080/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Origin': 'http://localhost:9010',
      },
      body: submission,
    });
    console.log(`Response: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const text = await response.text();
      console.log(`Body: ${text}`);
    }
  } catch (e) {
    console.log(`Request failed: ${e}`);
  }
}

main().catch(console.error);
