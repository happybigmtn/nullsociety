/**
 * Trace the exact bytes being signed to debug mismatch
 */
import { ed25519 } from '@noble/curves/ed25519';
import {
  encodeCasinoDeposit,
  buildTransaction,
  wrapSubmission,
  encodeVarint,
} from '../../src/codec/index.js';
import { TRANSACTION_NAMESPACE } from '../../src/codec/constants.js';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

async function main() {
  // Use a fixed key for reproducibility
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);

  console.log('=== TRANSACTION SIGNING TRACE ===\n');

  console.log('Public Key (32 bytes):');
  console.log(toHex(publicKey));
  console.log();

  // Create a simple instruction
  const instruction = encodeCasinoDeposit(1000n);
  console.log('Instruction (CasinoDeposit 1000):');
  console.log(`  Hex: ${toHex(instruction)}`);
  console.log();

  // Build payload: nonce (8 bytes BE) + instruction
  const nonce = 1n;
  const payload = new Uint8Array(8 + instruction.length);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);  // BE
  payload.set(instruction, 8);

  console.log('Payload (nonce + instruction):');
  console.log(`  Hex: ${toHex(payload)}`);
  console.log();

  // Build union_unique format: [varint(namespace.len)] [namespace] [payload]
  console.log('TRANSACTION_NAMESPACE:');
  console.log(`  Length: ${TRANSACTION_NAMESPACE.length}`);
  console.log(`  Hex: ${toHex(TRANSACTION_NAMESPACE)}`);
  console.log(`  Text: "${new TextDecoder().decode(TRANSACTION_NAMESPACE)}"`);
  console.log();

  const lenVarint = encodeVarint(TRANSACTION_NAMESPACE.length);
  console.log('Varint of namespace length:');
  console.log(`  Value: ${TRANSACTION_NAMESPACE.length}`);
  console.log(`  Hex: ${toHex(lenVarint)}`);
  console.log();

  // Build union_unique manually
  const unionUnique = new Uint8Array(lenVarint.length + TRANSACTION_NAMESPACE.length + payload.length);
  unionUnique.set(lenVarint, 0);
  unionUnique.set(TRANSACTION_NAMESPACE, lenVarint.length);
  unionUnique.set(payload, lenVarint.length + TRANSACTION_NAMESPACE.length);

  console.log('union_unique (message to sign):');
  console.log(`  Length: ${unionUnique.length} bytes`);
  console.log(`  Format: [varint(${TRANSACTION_NAMESPACE.length})] [namespace] [payload]`);
  console.log(`  Hex: ${toHex(unionUnique)}`);
  console.log();

  // Sign it
  const signature = ed25519.sign(unionUnique, privateKey);
  console.log('Signature (64 bytes):');
  console.log(`  Hex: ${toHex(signature)}`);
  console.log();

  // Verify locally
  const verified = ed25519.verify(signature, unionUnique, publicKey);
  console.log(`Local verification: ${verified ? 'PASS' : 'FAIL'}`);
  console.log();

  // Now build the full transaction using buildTransaction
  const tx = buildTransaction(nonce, instruction, privateKey);
  console.log('Full transaction from buildTransaction:');
  console.log(`  Length: ${tx.length} bytes`);
  console.log(`  Hex: ${toHex(tx)}`);
  console.log();

  // Expected for Rust:
  // write_payload: nonce.write() + instruction.write()
  // Since nonce uses put_u64 (big-endian) and instruction uses its own encoding
  console.log('Expected Rust format:');
  console.log('  write_payload = [nonce:u64 BE] [instruction bytes]');
  console.log('  union_unique(namespace, payload) = [varint(13)] [_NULLSPACE_TX] [payload]');
  console.log();

  // Wrap and submit
  const submission = wrapSubmission(tx);
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
