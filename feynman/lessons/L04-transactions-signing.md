# L04 - Transaction building + signing (from scratch)

Focus file: `gateway/src/codec/transactions.ts`

Goal: explain how raw instructions become signed transactions and how they are wrapped for submission. For every excerpt, you’ll see **why it matters** and a **plain description of what the code does**.

Supporting references:
- `gateway/src/codec/constants.ts` (TRANSACTION_NAMESPACE, SubmissionTag)
- `types/src/execution.rs` (Transaction layout in Rust)

---

## Concepts from scratch (expanded)

### 1) What is a transaction?
A transaction is a byte package that says:
- **who** is sending it (public key),
- **what** they want to do (instruction bytes),
- **in what order** (nonce),
- and a **signature** proving it was authorized.

### 2) Why sign?
A signature is a tamper‑proof stamp. If anyone changes the bytes, the signature becomes invalid. This prevents forgery.

### 3) What is Ed25519?
Ed25519 is a fast signature scheme:
- Private key signs.
- Public key verifies.
- Keys and signatures have fixed sizes (32‑byte public key, 64‑byte signature).

### 4) Namespacing signatures
A namespace (e.g., `_NULLSPACE_TX`) is prefixed when signing. It prevents a signature from being reused in a different protocol or context.

### 5) Submission envelope
The backend expects **Submission** objects. Even a single transaction must be wrapped in a “transactions” submission with a length prefix.

---

## Limits & management callouts (important)

1) **Nonce is u64**
- This caps the maximum number of transactions per account. It’s practically huge but still finite.

2) **No size caps here**
- `wrapSubmission` does not enforce a max request size. The server must enforce payload limits elsewhere.

3) **Namespace is fixed**
- Changing `_NULLSPACE_TX` would invalidate all existing signatures. This is a network‑wide breaking change.

---

## Walkthrough with code excerpts

### 1) Varint encoding
```ts
export function encodeVarint(value: number): Uint8Array {
  if (value < 0) throw new Error('Varint cannot encode negative numbers');

  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);  // 7 data bits + continuation bit
    value >>>= 7;
  }
  bytes.push(value & 0x7f);

  return new Uint8Array(bytes);
}
```

Why this matters:
- Submission vectors need compact length encoding. Varints save space for small lengths.

What this code does:
- Encodes a number into 1–N bytes, using 7 data bits per byte and a continuation bit.
- Iteratively takes the lowest 7 bits, sets the continuation bit if more bytes follow, and shifts the value down.
- Returns the resulting byte array in the same order the Rust decoder expects.

---

### 2) Varint size helper
```ts
export function varintSize(value: number): number {
  if (value === 0) return 1;
  let size = 0;
  while (value > 0) {
    size++;
    value >>>= 7;
  }
  return size;
}
```

Why this matters:
- Used to pre‑allocate buffers correctly for performance.

What this code does:
- Calculates how many bytes the varint encoding will use.
- Handles zero as a special case (1 byte) and otherwise counts how many 7‑bit chunks are needed.

---

### 3) Namespace signing format
```ts
function unionUnique(namespace: Uint8Array, message: Uint8Array): Uint8Array {
  const lenVarint = encodeVarint(namespace.length);
  const result = new Uint8Array(lenVarint.length + namespace.length + message.length);
  result.set(lenVarint, 0);
  result.set(namespace, lenVarint.length);
  result.set(message, lenVarint.length + namespace.length);
  return result;
}
```

Why this matters:
- This is the exact byte layout that Rust expects when verifying signatures.

What this code does:
- Builds the signed message as: `[len(namespace)][namespace][payload]`.
- Prefixes the namespace length as a varint so the decoder can parse unambiguously.
- Returns a single concatenated byte array for signing.

---

### 4) Build a signed transaction
```ts
export function buildTransaction(
  nonce: bigint,
  instruction: Uint8Array,
  privateKey: Uint8Array
): Uint8Array {
  const publicKey = ed25519.getPublicKey(privateKey);

  // Build payload: nonce (8 bytes BE) + instruction
  const payload = new Uint8Array(8 + instruction.length);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);  // BE
  payload.set(instruction, 8);

  // Sign with namespace
  const toSign = unionUnique(TRANSACTION_NAMESPACE, payload);
  const signature = ed25519.sign(toSign, privateKey);

  // Build final transaction
  const tx = new Uint8Array(payload.length + 32 + 64);
  tx.set(payload, 0);
  tx.set(publicKey, payload.length);
  tx.set(signature, payload.length + 32);

  return tx;
}
```

Why this matters:
- This is the **core of transaction creation**. Every on‑chain action uses this format.

What this code does:
- Creates the payload `[nonce][instruction]` in big‑endian order.
- Computes the public key from the private key so the signature can be verified later.
- Prepends the namespace for domain separation and signs the payload bytes.
- Appends the public key (32 bytes) and signature (64 bytes) to form the final transaction.

---

### 5) Wrap a single transaction into a submission
```ts
export function wrapSubmission(tx: Uint8Array): Uint8Array {
  const lenVarint = encodeVarint(1);  // Vec length = 1
  const result = new Uint8Array(1 + lenVarint.length + tx.length);

  result[0] = SubmissionTag.Transactions;  // tag 1
  result.set(lenVarint, 1);
  result.set(tx, 1 + lenVarint.length);

  return result;
}
```

Why this matters:
- The backend expects `Submission::Transactions`, not raw transaction bytes.

What this code does:
- Creates `[tag][vec_length][tx_bytes]` with tag = 1 for transactions.
- Encodes the vector length as a varint, then copies the raw transaction bytes after it.

---

### 6) Wrap multiple transactions
```ts
export function wrapMultipleSubmission(txs: Uint8Array[]): Uint8Array {
  const totalLen = txs.reduce((acc, tx) => acc + tx.length, 0);
  const lenVarint = encodeVarint(txs.length);
  const result = new Uint8Array(1 + lenVarint.length + totalLen);

  result[0] = SubmissionTag.Transactions;
  result.set(lenVarint, 1);

  let offset = 1 + lenVarint.length;
  for (const tx of txs) {
    result.set(tx, offset);
    offset += tx.length;
  }

  return result;
}
```

Why this matters:
- Bundling multiple transactions reduces overhead and is useful for batch operations.

What this code does:
- Builds a single submission with a vector of transactions.
- Computes total payload length, writes the tag and varint count, then copies each tx in order.

---

### 7) Generate a session ID
```ts
export function generateSessionId(publicKey: Uint8Array, counter: bigint): bigint {
  const data = new Uint8Array(32 + 8);
  data.set(publicKey, 0);
  new DataView(data.buffer).setBigUint64(32, counter, false);

  const hash = sha256(data);
  return new DataView(hash.buffer).getBigUint64(0, false);
}
```

Why this matters:
- Session IDs must be unique and deterministic. This ensures uniqueness across a player’s sessions.

What this code does:
- Hashes the public key + counter and takes the first 8 bytes as the session ID.
- Uses big‑endian when writing the counter so the hash input matches Rust.
- Produces a deterministic ID: same key + counter yields the same session id.

---

### 8) Verify a transaction signature (testing helper)
```ts
export function verifyTransaction(tx: Uint8Array, instructionLen: number): boolean {
  const nonce = new DataView(tx.buffer, tx.byteOffset).getBigUint64(0, false);
  const instruction = tx.slice(8, 8 + instructionLen);
  const publicKey = tx.slice(8 + instructionLen, 8 + instructionLen + 32);
  const signature = tx.slice(8 + instructionLen + 32, 8 + instructionLen + 32 + 64);

  const payload = new Uint8Array(8 + instructionLen);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);
  payload.set(instruction, 8);

  const toSign = unionUnique(TRANSACTION_NAMESPACE, payload);
  return ed25519.verify(signature, toSign, publicKey);
}
```

Why this matters:
- This is a sanity check for developers; it confirms encoding and signing are correct.

What this code does:
- Rebuilds the signed payload (nonce + instruction) exactly as signing did.
- Extracts the public key and signature from the transaction bytes.
- Verifies the signature against the namespaced payload and returns true/false.

---

## Extended deep dive: transaction lifecycle and byte layout

The snippets above explain "how," but they do not explain "why this layout matters." The rest of this lesson fills in the missing mental model.

### 9) The exact byte layout and how parsing works

The transaction is a flat byte array, not a struct with field offsets stored inside. That means every parser must rely on known, fixed sizes:

- nonce: always 8 bytes
- public key: always 32 bytes
- signature: always 64 bytes
- instruction: variable, but its length is known by context

The backend can parse this because it decodes the instruction tag and knows the instruction format, which implies the instruction length. That is the critical coupling between instruction encoding and transaction decoding.

If you ever add a new instruction format, you must update the backend decoder to understand its length. Otherwise, the backend cannot find where the public key and signature begin.

### 10) Why the nonce is part of the signed payload

The nonce must be signed with the instruction. If you signed only the instruction, an attacker could replay the same signed instruction with a different nonce. That would allow duplicate actions.

By signing `[nonce + instruction]`, the signature binds the intent to a specific transaction order. This is the fundamental replay protection mechanism of account-based chains.

### 11) Namespacing and domain separation (commonware-style)

The `TRANSACTION_NAMESPACE` is added using `unionUnique`. This yields:

```
[varint(namespace_length)] [namespace bytes] [payload]
```

The namespace is not a comment; it is part of the signed bytes. If the namespace changes, all existing signatures become invalid. This is by design. The namespace ensures that a valid signature in this protocol cannot be reused in another protocol that happens to share the same signing algorithm.

Think of it as stamping every signature with a domain label.

### 12) Varints and why they matter here

Varints are used in two places:

1) To prefix the namespace length.
2) To encode the number of transactions in a submission.

Varints are compact for small values, which is useful because these lengths are almost always small. But they also carry complexity: the encoder and decoder must match exactly.

If you change the varint encoding here, you must change the backend decoder. There is no flexibility.

### 13) Submission envelopes: subtle but essential

The submission envelope is not just a wrapper. It is the "type tag" that tells the backend how to interpret the payload.

In this system:

- Tag 1 means `Transactions`.
- Tag 0 is reserved for a different submission type (seed).

If you accidentally used tag 0, the backend would attempt to parse the bytes as a seed, which would almost certainly fail.

This is why the comment in the code is so emphatic about tag selection.

### 14) Batching transactions without per-tx lengths

The `wrapMultipleSubmission` method concatenates transactions with no per-transaction length fields. This is space efficient, but it means the backend must parse each transaction based on instruction decoding.

This design is intentional because transactions are already structured and length can be inferred once you parse the instruction. It also keeps the wire format compact, which matters if you batch many transactions.

The tradeoff is that transaction parsing is context-sensitive. That is acceptable here because the backend already understands all instruction formats.

### 15) Session IDs and how they relate to transactions

`generateSessionId` uses `SHA-256(pubkey || counter)` and then takes the first 8 bytes. This gives a deterministic session ID.

This is not directly part of the transaction format, but it is part of the higher-level protocol. When a user starts a new game, the session ID is included in the instruction, which means it is also covered by the signature.

That makes session IDs tamper-proof: they are derived deterministically, and they are included in signed bytes.

### 16) The testing helper as a debugging tool

`verifyTransaction` is not used in production, but it is extremely important for debugging.

If a backend reports "invalid signature," you can do the following:

1) Extract the instruction length from the instruction encoder you used.
2) Call `verifyTransaction` on the exact bytes you are sending.
3) If it returns true, then the gateway encoding is correct and the backend issue is elsewhere.

This saves hours of debugging when dealing with binary formats.

### 17) End-to-end pseudo-flow

Here is a simplified end-to-end sequence, not literal code:

```
instruction = encodeCasinoStartGame(...)
nonce = nonceManager.getCurrentNonce(...)
tx = buildTransaction(nonce, instruction, privateKey)
submission = wrapSubmission(tx)
submitClient.submit(submission)
```

Everything else in the gateway is built around this pipeline. Once you understand this flow, you understand how user actions become signed, valid on-chain transactions.

### 18) Common mistakes and how to avoid them

1) **Using little-endian instead of big-endian.**  
   This is the most common source of "invalid transaction" errors. All multi-byte integers in this module are big-endian.

2) **Forgetting to increment nonce after a successful submission.**  
   If nonce does not advance, the next transaction will be rejected. The session manager handles this, but you must respect it.

3) **Mixing instruction formats between gateway and backend.**  
   The gateway encoders must match the Rust decoders exactly.

4) **Assuming varint size equals byte length.**  
   The varint length is the number of items, not the total byte size of the items.

5) **Changing TRANSACTION_NAMESPACE casually.**  
   This would invalidate every existing signature and should be treated as a protocol-breaking change.

### 19) Feynman explanation: the signed envelope analogy

Imagine writing a letter (instruction), putting a serial number on the envelope (nonce), and then sealing it with wax (signature).

- The serial number prevents replay.
- The wax seal prevents tampering.
- The namespace is the stamp that says which postal system the envelope belongs to.

If you move the letter to a different postal system without changing the stamp, it will be rejected. That is exactly what namespace signing prevents.

---

### 20) Worked example: sizes and offsets

Suppose you are building a `CasinoStartGame` instruction. From the instruction encoder, you know:

- tag (1 byte)
- game type (1 byte)
- bet (8 bytes)
- session id (8 bytes)

That means instruction length = 18 bytes.

Now compute the transaction length:

- nonce: 8 bytes
- instruction: 18 bytes
- public key: 32 bytes
- signature: 64 bytes

Total transaction size = 8 + 18 + 32 + 64 = 122 bytes.

Offsets:

- nonce is bytes 0..7
- instruction is bytes 8..25
- public key is bytes 26..57
- signature is bytes 58..121

This is why having a known instruction length is essential: without it you cannot calculate where the public key begins.

Now wrap it in a submission:

- tag: 1 byte
- vec length: 1 byte (varint of 1)
- transaction: 122 bytes

Total submission size = 1 + 1 + 122 = 124 bytes.

This kind of mental arithmetic is how you debug "invalid transaction size" errors.

---

### 21) Interop with Rust: why the order must match exactly

In Rust, the transaction struct is decoded in a strict order: nonce, instruction bytes, public key, signature. There is no schema registry here; the order *is* the schema.

That means the TypeScript builder must match the Rust decoder exactly. If you ever reorder fields in the gateway, you must also reorder fields in Rust, which would be a breaking protocol change.

This is why the gateway code comments explicitly say "matches Rust types/src/execution.rs." It is not an implementation detail; it is a protocol guarantee.

Think of the gateway and backend as two independent parsers of the same binary protocol. They can be written in different languages, but they must remain bit-identical.

---

### 22) Performance notes: preallocation and copy strategy

Notice the code always pre-allocates a `Uint8Array` of the exact final size. Then it uses `set` to copy bytes into place.

This is deliberate:

- It avoids repeated array growth.
- It keeps memory usage predictable.
- It reduces garbage collector pressure.

The code also uses `DataView` directly on the buffer to write integer fields. That avoids creating intermediate buffers for each numeric field.

This is not micro-optimization; it is standard practice for binary encoding libraries. It makes the code both faster and easier to reason about because every byte is written exactly once.

---

### 23) How nonce management ties into transaction building

The transaction builder itself does not know about nonces; it just accepts a nonce value. The responsibility for choosing the correct nonce lives in the session layer (see `SessionManager` and `NonceManager`).

The typical flow is:

1) Session manager acquires a nonce lock for a public key.
2) It reads the current nonce from the nonce manager.
3) It builds the transaction with that nonce.
4) It submits the transaction.
5) On success, it increments the nonce in the nonce manager.

This is important because the transaction builder is **pure**: given the same inputs, it outputs the same bytes. That makes it easy to test, and it keeps nonce policy centralized in one place.

If you ever see nonce bugs, they are almost always in the calling code (the session manager), not in the transaction builder. The builder is just a deterministic serializer.

---

### 24) Backwards compatibility and protocol stability

Because the transaction format is a protocol boundary, changing it is expensive. Consider what would happen if you:

- changed the namespace,
- reordered the fields,
- introduced a length prefix in the transaction.

These would all break compatibility with existing validators, and they would invalidate every signature that clients have ever produced.

That is why this code tends to be conservative. It avoids "cleanups" that seem harmless in local code but are breaking at the protocol level.

When you need a change, the correct path is a coordinated protocol upgrade, not a casual refactor.

This mindset is part of building production-grade systems: treat byte layouts as APIs, not as implementation details.

---

### 25) Security and correctness checklist (practical)

Use this checklist any time you touch transaction encoding or signing:

1) **BigInt conversion sanity**  
   All chain values use `bigint` in TypeScript and `u64` in Rust. Make sure conversions are explicit and never pass floating point numbers into transaction builders.

2) **Endianness**  
   Every multi-byte integer here is big-endian. A single `true` instead of `false` in `setBigUint64` will corrupt the wire format.

3) **Namespace stability**  
   The namespace is part of the signed payload. Changing it is a protocol migration, not a refactor.

4) **Instruction length**  
   The backend must be able to infer instruction length from the tag. If you add a new instruction, document its exact byte layout and update decoders accordingly.

5) **Public key derivation**  
   The public key is derived from the private key at build time. If you ever pass a mismatched private key, the signature will verify against the wrong public key and the backend will reject the transaction.

6) **Submission tag**  
   Tag 1 is Transactions. Using tag 0 is not just "another format"; it is a different submission type entirely.

7) **Testing helpers**  
   Use `verifyTransaction` in development to confirm that signatures match expectations before you suspect backend failures.

The overall theme: small byte-level errors produce large system-level failures. The checklist keeps you focused on the few places where one bit can break everything.

---

## Key takeaways
- Every transaction is `[nonce][instruction][pubkey][signature]`.
- Namespaced signing prevents cross‑protocol replay.
- Submissions wrap transactions in an envelope with a tag and length prefix.

## Next lesson
L05 - Submit client and HTTP submission: `feynman/lessons/L05-submit-client.md`
