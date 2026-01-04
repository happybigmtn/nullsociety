# L16 - Transaction building (register + deposit) (from scratch)

Focus file: `gateway/src/codec/transactions.ts`

Goal: explain how register/deposit instructions are turned into signed transactions and wrapped into submissions. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Transactions are signed envelopes
A transaction is:
- nonce (u64),
- instruction bytes,
- public key,
- signature.

### 2) Submissions wrap transactions
The backend expects a **Submission** with a tag and length prefix, not raw transaction bytes.

---

## Limits & management callouts (important)

1) **Nonce must strictly increase**
- If you reuse a nonce, the backend rejects the transaction.

2) **Namespace signing is fixed**
- The `TRANSACTION_NAMESPACE` is a protocol constant. Changing it invalidates all signatures.

---

## Walkthrough with code excerpts

### 1) Build a signed transaction
```ts
export function buildTransaction(
  nonce: bigint,
  instruction: Uint8Array,
  privateKey: Uint8Array
): Uint8Array {
  const publicKey = ed25519.getPublicKey(privateKey);

  const payload = new Uint8Array(8 + instruction.length);
  new DataView(payload.buffer).setBigUint64(0, nonce, false);  // BE
  payload.set(instruction, 8);

  const toSign = unionUnique(TRANSACTION_NAMESPACE, payload);
  const signature = ed25519.sign(toSign, privateKey);

  const tx = new Uint8Array(payload.length + 32 + 64);
  tx.set(payload, 0);
  tx.set(publicKey, payload.length);
  tx.set(signature, payload.length + 32);

  return tx;
}
```

Why this matters:
- Register and deposit only work if the signature and layout are correct.

What this code does:
- Builds `[nonce][instruction]` as the payload.
- Signs the payload with a namespaced hash.
- Appends the public key and signature to produce the final transaction bytes.

---

### 2) Wrap a transaction into a submission
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
- The backend accepts `Submission::Transactions`, not raw transactions.

What this code does:
- Prefixes the submission with a tag and a varint length.
- Copies the transaction bytes after the header.

---

## Extended deep dive: from instruction bytes to signed submission

This lesson focuses on register and deposit, but the transaction pipeline is shared by every instruction. Understanding it here means you understand it everywhere.

### 3) The full transaction layout

A transaction produced by `buildTransaction` is:

```
[nonce:8 bytes BE][instruction bytes][public key:32][signature:64]
```

There is no length prefix for the instruction. The decoder infers instruction length by parsing the instruction tag and its fields. That is why instruction encoding must be correct before signing.

### 4) Namespacing with `TRANSACTION_NAMESPACE`

The signature is computed over:

```
[varint(namespace length)][namespace bytes][payload]
```

This is a form of domain separation. It prevents a signature from being valid in a different protocol. The same private key can be used for multiple protocols without cross‑protocol replay risk, as long as the namespaces differ.

### 5) Why nonce comes first

Nonce is part of the signed payload. That ensures:

- Nonce cannot be altered without invalidating the signature.
- Transactions cannot be replayed with a different nonce.

It also makes parsing easier: the backend can read the nonce first without knowing the instruction length.

### 6) Register and deposit are just different instruction bytes

The transaction builder does not care which instruction you provide. For register:

```
payload = [nonce][register instruction]
```

For deposit:

```
payload = [nonce][deposit instruction]
```

Everything else (public key, signature) is identical. This is why the system is composable: one transaction builder supports every instruction type.

### 7) The submission envelope: why tag + vec length

The backend expects a `Submission::Transactions` envelope, which includes:

```
[tag:u8][vec_len:varint][tx bytes...]
```

Even if there is only one transaction, the vector length must be included. This keeps the submission format consistent and allows batching in the future.

### 8) BigInt conversion and precision

The nonce is a `bigint`. That avoids precision loss. The transaction builder writes the nonce as a 64‑bit integer:

```ts
new DataView(payload.buffer).setBigUint64(0, nonce, false);
```

If you accidentally used a JS `number` for the nonce, values above `2^53` would lose precision and produce incorrect bytes. That would invalidate the signature and lead to rejection.

### 9) Why the public key is appended, not prepended

The public key is appended after the payload. That means the signed payload does not include the public key itself. This is intentional:

- The signature already implies the public key (verification uses it).
- Including the public key in the signed payload is redundant.

This layout keeps the transaction compact while still allowing verification.

### 10) Testing with `verifyTransaction`

The gateway includes a `verifyTransaction` helper. You can use it to confirm:

- the signature matches the payload,
- the public key is correct,
- the namespace encoding is correct.

This is invaluable when debugging “invalid signature” errors. You can test locally before blaming the backend.

### 11) Worked example: register transaction bytes (conceptual)

Let’s say:

- nonce = 0
- name = “Alice”

Instruction bytes (from L15) are:

```
0a 00 00 00 05 41 6c 69 63 65
```

Payload becomes:

```
00 00 00 00 00 00 00 00 0a 00 00 00 05 41 6c 69 63 65
```

Then the namespace is prefixed, the signature is computed, and the public key + signature are appended. You don’t need to compute the signature by hand to understand the layout; the important part is where each field appears.

### 12) Submission size reasoning

If the transaction is length `T`, the submission is:

```
1 (tag) + varint_len(1) + T
```

For a single transaction, the vec length is always `1`, which encodes as a single byte. So the envelope adds 2 bytes.

This small overhead is why batching can be efficient: the envelope cost is amortized across multiple transactions.

### 13) Common failure modes

1) **Nonce mismatch**: backend rejects because nonce is stale.  
2) **Invalid signature**: usually a namespace mismatch or payload encoding error.  
3) **Wrong submission tag**: backend treats it as a seed instead of transactions.  
4) **Instruction encoding mismatch**: transaction is well‑signed but payload is invalid.  

The transaction builder handles only #2; the others happen in surrounding layers.

### 14) Feynman analogy: signed envelopes in a bundle

Think of each transaction as a sealed envelope:

- The payload is the letter.
- The signature is the wax seal.
- The public key is the return address.

The submission is a bundle of envelopes with a label on top saying “there are N envelopes inside.” The backend opens the bundle, then checks each seal individually.

### 15) Why L16 exists separately from L04

L04 covers the transaction builder in general. This lesson is narrower: it ties transaction building directly to register and deposit flows.

That makes it easier to debug onboarding: you can reason about “register bytes → transaction → submission” without getting lost in game‑specific logic.

### 16) Varint encoding in the submission header

The submission wrapper encodes the number of transactions as a varint. For a single transaction, the varint is just `0x01`.

Why a varint?

- It keeps small lengths compact.
- It allows batching without changing the format.

If you ever wrap multiple transactions, the only difference is that the varint length changes and you append more transaction bytes. Everything else stays the same.

### 17) `union_unique` and why it is used

The signature is not computed over the raw payload alone. It is computed over:

```
[varint(len(namespace))][namespace][payload]
```

This is the `union_unique` format used throughout commonware. It is a way of ensuring that a signature produced for one namespace cannot be replayed in another namespace.

This matters if the same keys are used elsewhere (e.g., in other chains or off‑chain protocols). Without domain separation, a signature could be misused.

### 18) The transaction builder is intentionally pure

`buildTransaction` has no side effects. Given the same inputs, it produces the same output. That makes it:

- easy to test,
- easy to reason about,
- and safe to use in multiple contexts.

All stateful logic (nonce tracking, retries, cooldowns) lives outside this function. That separation keeps the transaction format stable and the business logic flexible.

### 19) Nonce handling: where it fits in the pipeline

Nonce handling is *not* inside the transaction builder. It is in the session manager and nonce manager.

The flow is:

1) Session manager acquires a nonce lock.
2) It reads the current nonce.
3) It passes the nonce into `buildTransaction`.
4) If the submission is accepted, it increments the stored nonce.

This is why transaction building is stateless: the nonce manager is the component that decides what nonce to use.

### 20) The difference between “accepted” and “confirmed”

`SubmitClient.submit` returns `{ accepted: true }` if the backend accepts the submission. This does not necessarily mean the transaction is finalized in a block yet. It just means the backend accepted it for processing.

That distinction matters:

- The session manager increments nonce on “accepted.”
- The UI treats “accepted” as success.

In practice, this is fine for testnet and low‑latency backends, but in production you may want to track confirmation events via the updates stream.

### 21) Transaction size and maximum payloads

The transaction builder itself does not enforce size caps. The gateway enforces a maximum submission size at the HTTP layer (`GATEWAY_SUBMIT_MAX_BYTES`).

This means:

- You can build large transactions, but they may be rejected before submission if the envelope exceeds the cap.
- Size limits are a deployment policy, not part of the transaction format.

When debugging “submission too large” errors, remember that the size cap lives outside the transaction builder.

### 22) Back‑end validation steps (mental model)

When the backend receives a transaction, it typically performs:

1) Signature verification.
2) Nonce validation.
3) Instruction decoding.
4) Business logic execution.

If any of these steps fail, the transaction is rejected. The gateway’s transaction builder only affects steps 1 and 3.

This helps you debug:

- If signature is invalid, the bug is in `buildTransaction`.
- If instruction decode fails, the bug is in the instruction encoder.
- If business logic fails, the bug is in the execution layer or policy.

### 23) Multi‑transaction submissions (future‑proofing)

Even if the gateway currently submits one transaction at a time, the envelope format supports batching. This is useful for:

- future optimizations,
- admin tools,
- or atomic multi‑step actions.

The transaction builder doesn’t change at all. You simply call `wrapMultipleSubmission` instead of `wrapSubmission`.

### 24) Feynman analogy: a notarized stack of papers

Each transaction is a notarized page:

- The payload is the content.
- The signature is the notary seal.
- The public key is the notary’s ID.

The submission is the folder containing N notarized pages, with a label on the front that says how many pages are inside.

The backend opens the folder and checks each seal independently.

### 25) Practical debugging workflow

When a register/deposit submission fails:

1) Use `verifyTransaction` locally to check the signature.
2) Compare the instruction bytes to a known test vector.
3) Check the nonce against backend `/account`.
4) Check backend logs for decode errors.

This sequence isolates whether the error is in encoding, signing, nonce selection, or backend logic.

### 26) Exercises

1) Build a register instruction and then build the transaction. Identify the byte offset where the public key starts.
2) Change the namespace and re‑sign. Explain why the old signature becomes invalid.
3) Wrap two transactions in a single submission. Compute the header bytes.

If you can do these exercises, you understand the full pipeline from bytes to submission.

### 27) Signature size and placement

Ed25519 signatures are always 64 bytes. That fixed size is why the transaction layout can omit explicit length fields. The backend knows:

- 32 bytes for the public key,
- 64 bytes for the signature,
- the rest is payload (nonce + instruction).

This makes parsing fast and deterministic. It also means you cannot switch signature schemes without a protocol upgrade, because the layout is fixed around these sizes.

### 28) Why the public key is included at all

The signature proves that the holder of the private key authorized the transaction, but the verifier still needs to know which public key to use.

Including the public key inside the transaction makes it self‑contained. The backend does not need to look up the public key elsewhere. That simplifies verification and avoids an extra database read.

### 29) Handling of zero and max nonces

The nonce is a u64, so it can range from 0 to `2^64 - 1`. In practice:

- New accounts start at nonce 0.
- Each accepted transaction increments the nonce by 1.

If an account ever reached `2^64 - 1`, it could no longer submit new transactions. That is theoretically possible but practically unreachable.

This is a common blockchain tradeoff: a finite nonce range that is effectively infinite for real workloads.

### 30) The role of `Buffer.from`

The `submit` method uses:

```ts
body: Buffer.from(submission)
```

This ensures the raw bytes are transmitted correctly over HTTP. Without this, Node’s `fetch` might treat the data as text or apply unintended encoding.

So even though it looks like a small detail, `Buffer.from` is part of the protocol correctness: it guarantees the bytes on the wire are exactly the bytes you built.

### 31) Why the transaction builder doesn’t check sizes

It might seem reasonable to add size checks inside `buildTransaction`, but that would duplicate policy. The gateway already enforces max submission size at the HTTP layer.

Keeping the builder pure avoids coupling it to deployment-specific limits.

This is the design philosophy: **encoders are pure, validators are elsewhere**.

### 32) Visualizing the full pipeline

Here’s a high‑level pipeline diagram in text:

```
name/amount
   ↓ (encode instructions)
instruction bytes
   ↓ (buildTransaction + sign)
transaction bytes
   ↓ (wrapSubmission)
submission bytes
   ↓ (SubmitClient HTTP)
backend /submit
```

Each arrow is a boundary. Bugs are easiest to debug when you know which boundary failed.

### 33) Transaction determinism across languages

Because the transaction format is fixed, you can create the exact same transaction bytes in Rust, TypeScript, or any other language — as long as you follow the same steps.

This property is essential for reproducibility and audits. It means you can take a transaction hash and independently verify the bytes that produced it, regardless of which client created it.

### 34) Protocol upgrades and breaking changes

If you ever want to change transaction layout (for example, to include gas limits), you must introduce a new versioned format or a new submission type.

You cannot safely “just add fields” because older decoders would misinterpret the bytes. This is why transaction formats are treated as immutable in production networks.

### 35) Feynman summary: from intent to bytes

The transaction builder is the bridge between human intent (“register me”) and machine‑verifiable bytes. It doesn’t know anything about games or policies; it only knows how to produce a valid, signed package.

Once you internalize that, the rest of the stack becomes easier to reason about: validation and execution are separate concerns, layered on top of this deterministic byte package.

---

### 36) Edge cases and practical tips

Here are a few edge cases that are easy to overlook:

- **Nonce drift after restart**: if nonce persistence fails, transactions will be signed with stale nonces and rejected.
- **Clock skew**: timeouts in SubmitClient may fire too early on slow networks, which can look like rejections even when the backend later accepts the tx.
- **Instruction length assumptions**: if you add a new instruction type and forget to update decoders, the backend will mis-parse the transaction payload.

Practical tip: always check backend logs for decode errors before assuming a signature issue.

### 37) Suggested regression tests

Add a few focused tests to keep this pipeline stable:

1) **Signature round‑trip**: build a transaction in TS and verify it with `verifyTransaction`.
2) **Submission format**: ensure the first byte of the submission is the transactions tag and the second byte is `0x01`.
3) **Cross‑language parity**: encode a known instruction in TS and Rust, compare bytes.

These tests are small but high‑impact. They catch regressions before they hit production.

### 38) Integration with register/deposit flows

At runtime, the session manager wires everything together:

- It chooses the nonce.
- It builds the instruction bytes.
- It calls `buildTransaction`.
- It wraps the submission.
- It sends via SubmitClient.

Understanding L16 means you can debug any issue in that flow because each step maps directly to a function call.

---

### 39) Quick checklist before shipping changes

Before you ship any changes to transaction encoding or signing, verify:

- The namespace constant did not change.
- The instruction encoder outputs are unchanged for existing inputs.
- The transaction builder still produces the same byte layout.
- The submission wrapper tag is still `Transactions`.

If any of these change, you are in “protocol migration” territory. That requires coordination across gateway, backend, and clients.

### 40) One‑minute mental model

Here’s the fastest possible way to explain this file:

1) Build instruction bytes.
2) Prepend nonce.
3) Sign with namespace.
4) Append public key and signature.
5) Wrap in submission envelope.

If you can recite those five steps, you can reason about any register/deposit issue without opening the code.

---

One last practical tip: if you need to inspect a submission in logs, strip the first two bytes (tag + vec length) and you should see a transaction starting with an 8‑byte nonce. This quick heuristic often tells you whether the envelope is correct before you dig deeper. It saves time during incident response. If you are unsure whether a failure is in signing or in instruction encoding, compare the hex of the payload section alone; mismatches there point to the instruction encoder, while mismatches in the signature section point to signing and the namespace or key usage.

## Key takeaways
- Transactions are signed with a namespace and include nonce + instruction.
- Submissions are the outer envelope the backend expects.

## Next lesson
L17 - Register submit client: `feynman/lessons/L17-register-submit-client.md`
