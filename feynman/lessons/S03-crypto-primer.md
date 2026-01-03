# S03 - Cryptography primer: keys, signatures, hashes, nonces (from scratch)

Focus: cryptographic primitives that appear everywhere (transactions, auth, storage, wallets).

Goal: build a mental model for how keys, signatures, hashes, and nonces work in this codebase, and walk through the exact places they are implemented so you can trace the full security story from UI to chain.

---

## Learning map

This is a long chapter. You can read it in passes:

1) First pass: Sections 1 to 4 to get the basic vocabulary.
2) Second pass: Sections 5 to 9 to see how the repo uses those primitives.
3) Third pass: Sections 10 to 12 for deeper code walkthroughs and failure modes.

If you only read one section, read Section 8 (transaction signing) and Section 9 (nonce correctness). That is the core of the system's security.

---

## 1) Cryptography as a toolkit, not a magic box

A blockchain system is a big distributed state machine. Cryptography is the set of tools that let this machine work in an adversarial environment. The tools are not all the same. Each primitive does a very specific job.

Think of the toolkit like this:

- Hashes: fingerprints for bytes. Easy to compute, hard to forge.
- Signatures: public proof that a private key holder approved specific bytes.
- Nonces: counters that enforce ordering and prevent replay.
- Symmetric encryption: keeps a secret secret, when you already share a key.
- Key derivation: stretches or derives keys from weaker secrets (passwords).

In this repo we use all of these, but for different layers:

- Hashes and signatures are consensus critical. They appear in `types/src/execution.rs`, `types/src/api.rs`, and the WASM API.
- Nonces appear in both on-chain logic and client-side logic, especially in `gateway` and `website`.
- Symmetric encryption and key derivation appear in the vaults (web and mobile), for protecting private keys at rest.

The important idea is: these primitives must agree across all components. If the web client signs the wrong bytes, or hashes in a different order, it will generate transactions that the chain rejects. That is why this repo uses shared Rust code via WASM, and why we emphasize canonical encoding.

---

## 2) Hashes: what they are, and why we use them

### 2.1 The mental model

A hash function takes arbitrary bytes and returns a fixed-length output. For SHA-256, the output is 32 bytes.

The key properties we rely on:

- Preimage resistance: given a hash, you cannot find an input that produces it.
- Second-preimage resistance: given one input, you cannot find another that produces the same hash.
- Collision resistance: you cannot find any two inputs with the same hash.

Why these matter:

- When we hash a transaction, we want the digest to uniquely identify that transaction. If collisions were easy, a malicious actor could create two different transactions with the same digest.
- When we hash a state key, we want a stable mapping into the storage layer that is independent of encoding details.

### 2.2 Where hashes appear in this repo

Hashes appear in several places. Key examples:

- Transaction digests: `types/src/execution.rs` implements `Digestible for Transaction` and computes `sha256(nonce || instruction || public_key)`.
- Storage keys: `execution/src/state.rs` and `client/src/client.rs` hash encoded keys before querying state.
- RNG chains for casino games: `execution/src/casino/mod.rs` uses a SHA-256 hash chain to generate deterministic random numbers.
- MMR proofs in the API layer: `types/src/api.rs` uses SHA-256 with a standard hasher for inclusion proofs.

The takeaway: SHA-256 is the canonical hash for data structures and proofs in this system. If you see a hash, assume SHA-256 unless a file explicitly says otherwise.

---

## 3) Digital signatures: ownership of bytes

### 3.1 The mental model

A signature is a stamp that says: "the holder of this private key approved exactly these bytes".

A signature system has three functions:

- Key generation: produce a private key and its corresponding public key.
- Sign: produce a signature over a message using the private key.
- Verify: check that a signature is valid for the message and public key.

If any byte changes, the signature check fails.

### 3.2 Ed25519 in this repo

We use Ed25519 for account-level signatures. You will see it on both the Rust side and the JS side:

- Rust: `commonware_cryptography::ed25519` is used in `types/src/execution.rs` and in clients.
- Web: `@noble/curves/ed25519` is used in `website` and `mobile` for local signing.

Ed25519 is chosen because it is fast, modern, and has fixed-size keys and signatures:

- Public key: 32 bytes
- Signature: 64 bytes

These sizes are baked into the on-chain encoding. When you look at a transaction layout, you can count the bytes: `nonce (8) + instruction + public key (32) + signature (64)`.

### 3.3 Domain separation (namespace)

A subtle but critical idea: you should never sign raw application bytes directly. You should sign a domain-separated payload. Otherwise a signature can be replayed in a different context.

In this repo, the namespace is `_NULLSPACE_TX` for transactions. You can see it in:

- Rust: `TRANSACTION_NAMESPACE` (in `types/src/execution.rs`, via constants)
- JS: `gateway/src/codec/constants.ts` defines `TRANSACTION_NAMESPACE` to match the Rust constant

The signing function adds a namespace prefix before signing. That means a signature created for a transaction cannot be reused as an auth signature or some other proof.

---

## 4) Nonces: ordering and replay protection

### 4.1 The mental model

A nonce is a per-account counter. Every transaction from an account must have a nonce that is exactly one higher than the last accepted nonce.

This is both a safety and liveness mechanism:

- Safety: prevents replay (you cannot reuse an old transaction).
- Ordering: forces a total order of transactions from a single account.

### 4.2 Why a nonce, not a timestamp

People sometimes ask: why not use timestamps? Because timestamps are not deterministic and not strictly increasing. Nonces are deterministic, and they give us a simple rule for acceptance.

In short: if the chain accepted nonce 17, the next valid transaction for that account must have nonce 18. Nothing else is valid.

### 4.3 Where nonces are enforced

Nonces are enforced in two places:

1) On-chain: the execution logic checks the nonce inside the transaction against the account state.
2) Off-chain: clients track nonces to avoid wasting transactions.

You can see off-chain nonce tracking in:

- `gateway/src/nonceManager.ts` (gateway) or `website/src/api/nonceManager.js` (web)
- `client` binaries and examples that increment a nonce manually

The key idea: even if the client gets it wrong, the chain will still reject the transaction. But wrong nonce handling in the client causes UX issues and failed submissions, so we treat nonce management as a core feature.

---

## 5) A quick cryptography vocabulary

This section is a mini glossary. You can skim, but it helps to interpret code comments later.

- Public key: the identity that can be shared. It is also the account identifier.
- Private key: the secret that signs transactions. If leaked, the account is compromised.
- Signature: proof that the private key approved a message.
- Digest: a hash of a message. In code you may see `Digest` types or `digest()` methods.
- Domain separation: adding a prefix or namespace to avoid cross-protocol misuse.
- Deterministic signature: Ed25519 signatures are deterministic for a given key and message.
- KDF: key derivation function. Used to derive keys from passwords (PBKDF2, etc.).
- Symmetric encryption: encryption where the same key encrypts and decrypts.

---

## 6) Hashes in the code: concrete walkthrough

### 6.1 Transaction digest in Rust

Open `types/src/execution.rs` and find `impl Digestible for Transaction`. The digest is computed as:

- nonce as big-endian bytes
- instruction encoding bytes
- public key bytes

The signature is intentionally excluded. That means two different valid signatures for the same transaction (which can happen with different signing schemes) produce the same digest. For Ed25519, signatures are deterministic, but the design still ignores signatures to keep the digest representation focused on the actual transaction intent.

This is important because transaction digests are used as identifiers in indexers, explorers, and MMR proofs. We want the digest to represent the action, not the specific signature bytes.

### 6.2 Hashing keys for state

Open `execution/src/state.rs` and `client/src/client.rs`. You will see a pattern:

- Encode a key (for example an account key or a vault key).
- Hash the encoded bytes with SHA-256.
- Use that hash as the actual key in the database.

This is common in Merkleized or hashed storage systems. The hashed key produces a fixed length, which simplifies storage and helps with proof generation.

### 6.3 Hashing for deterministic RNG

In `execution/src/casino/mod.rs` you will find a simple hash chain. The idea is:

- Start with a seed.
- For each move, hash `seed || session_id || move_number`.
- Use the hash output to produce random numbers.

This gives deterministic randomness: every node generates the same sequence of outcomes for the same inputs, which is required for consensus.

---

## 7) Signatures in the code: concrete walkthrough

### 7.1 Rust signing in `Transaction::sign`

In `types/src/execution.rs` you can read the signing flow:

- Build a payload from nonce and instruction (`write_payload`).
- Sign the payload with the transaction namespace.
- Store the public key derived from the private key.

The key methods are:

- `Transaction::sign` for normal signing.
- `Transaction::sign_with_scratch` for reusing a buffer and reducing allocations.

This is a good example of how the codebase prioritizes performance for consensus-critical paths. The scratch buffer is not a cryptographic requirement, but it prevents repeated allocations under load.

### 7.2 Verification and batch verification

The same file implements `verify` and `verify_batch`. The logic is symmetric:

- Rebuild the payload from nonce + instruction.
- Use the public key to verify the signature.

Batch verification is a performance feature. Instead of verifying each signature individually, the code collects them and verifies in a batch, which can be faster for Ed25519. This is important when processing a block with many transactions.

### 7.3 JS and WASM signing

On the web side, transaction construction happens in the WASM layer so that the bytes match Rust exactly. The signing can happen in two ways:

- A WASM `Signer` that holds a private key (dev/testing only).
- A JS or native signer using `@noble/curves/ed25519`.

The WASM exports functions like `createCasinoRegisterTransaction` and `createCasinoStartGameTransaction`. These return raw bytes that already include the signature if the Signer is used. For production, you generally want to sign in a secure vault and then feed the signed bytes into the submit flow.

You can see the JS side in `website/src/api/wasm.js` and the WASM exports in `website/wasm/pkg/nullspace_wasm.d.ts`.

---

## 8) Full transaction walkthrough: bytes to chain

This is the most important section. We will trace a transaction from UI to chain.

### 8.1 Step 1: create the instruction

In the UI, when a user starts a game or registers, we create an `Instruction`. For example, `CasinoRegister` or `CasinoStartGame`.

In Rust, the instruction encoding is defined in `types/src/execution.rs`. The layout is documented in comments. Example:

- `CasinoRegister`: `[10][nameLen:u32 BE][nameBytes...]`
- `CasinoStartGame`: `[12][gameType:u8][bet:u64 BE][sessionId:u64 BE]`

This encoding is canonical. It must match across all clients.

### 8.2 Step 2: add the nonce

The instruction is not signed alone. The payload is `nonce || instruction.encode()`.

The nonce is big-endian, 8 bytes. This is a consensus-critical detail. If you write it little-endian on the client, the signature will verify against the wrong bytes and be rejected.

### 8.3 Step 3: domain separation

The payload is not signed directly. It is signed as:

`signature = Sign(private_key, TRANSACTION_NAMESPACE || payload)`

This is implemented by `private.sign(TRANSACTION_NAMESPACE, payload)` in Rust and by the equivalent namespace in JS (`gateway/src/codec/constants.ts`).

### 8.4 Step 4: finalize the transaction bytes

The final transaction encoding is:

`[nonce][instruction][public_key][signature]`

This format is implemented in `Transaction::write` and in the JS WASM bindings.

### 8.5 Step 5: submission and validation

The transaction bytes are submitted via `/submit` to the gateway or directly to a node. The backend decodes the transaction and verifies the signature. If the signature is valid and the nonce matches, the transaction is eligible for inclusion.

### 8.6 Step 6: digest and indexing

After execution, the transaction digest is computed from nonce + instruction + public key (not signature). This digest is used for indexing and proofs.

---

## 9) Nonce management in practice

### 9.1 The problem

Nonce management is tricky because clients can have concurrent requests. Imagine a UI that submits two transactions quickly. If both use the same nonce, one will fail. If the client increments too far ahead and the chain does not accept previous ones, the later ones will fail as well.

### 9.2 Gateway nonce manager

In the gateway, there is a `NonceManager` that does several important things:

- Tracks current nonce per public key.
- Serializes requests with a per-key lock.
- Persists nonces to disk for crash recovery.
- Resyncs from the backend if a nonce mismatch is detected.

You can see this logic in `gateway/src/nonceManager.ts` or in the relevant class used by the gateway (search for `NonceManager` in the gateway and client code). The key concept is a lock: only one transaction at a time is allowed to allocate a nonce for a given public key.

### 9.3 Website nonce manager

In `website/src/api/nonceManager.js`, there is a client-side nonce manager with similar logic. It also stores pending transactions in local storage so that they can be retried after reload.

The workflow is roughly:

1) Load account nonce from chain.
2) Allocate a nonce locally for each new transaction.
3) If submission fails due to nonce mismatch, resync and retry.

### 9.4 Why this matters for UX

If nonce management is wrong, users will see cryptic failures. So the system over-invests in nonce tracking. The chain is the source of truth, but the clients must stay close to that truth.

---

## 10) Key generation and storage

### 10.1 Web and mobile key generation

In the web and mobile clients, key generation is done using `@noble/curves/ed25519`:

- `ed25519.utils.randomPrivateKey()` generates a 32-byte private key.
- `ed25519.getPublicKey(privateKey)` derives the public key.

You can see this in:

- `mobile/src/services/crypto.ts`
- `mobile/src/services/vault.ts`
- `website/src/security/keyVault.ts`

### 10.2 The vaults: storing secrets safely

The system offers vaults to keep private keys safe at rest. There are different implementations:

- Web passkey vault: uses WebAuthn and AES-GCM to encrypt the private key and stores the ciphertext in IndexedDB.
- Web password vault: uses PBKDF2 (SHA-256) to derive a symmetric key, then AES-GCM to encrypt the private key.
- Mobile vault: uses PBKDF2 + XChaCha20-Poly1305 to encrypt the private key, stored via SecureStore or local storage on web.

These are not consensus-critical, but they are user-critical. If the vault fails or leaks, user keys are compromised.

### 10.3 Important security note

The WASM signer is convenient for local development, but it holds the private key in browser memory. That is not a production-grade security model. In production, keys should live in secure storage or be managed by external wallets.

---

## 11) Authentication signatures vs transaction signatures

This repo also uses signatures for authentication. The key idea: auth signatures must be distinct from transaction signatures.

- Auth challenge signing is domain-separated with a prefix like `nullspace-auth:` (see `website/src/security/authSigning.ts` and `services/auth/src/server.ts`).
- Transaction signing is domain-separated with `_NULLSPACE_TX`.

Because these namespaces are different, a signature created for login cannot be reused to submit a transaction, and vice versa. This is a critical security line.

---

## 12) Common failure modes and how to recognize them

### 12.1 Signature mismatch

Symptoms:
- The backend returns `invalid signature` or rejects transactions.

Common causes:
- The payload encoding is wrong (endianness, wrong instruction layout).
- The namespace is missing or different between client and server.
- The wrong public key is attached to the transaction.

### 12.2 Nonce mismatch

Symptoms:
- Error mentions nonce mismatch or `InvalidNonce`.

Common causes:
- Concurrency: two transactions issued with same nonce.
- Client reset: local nonce out of sync with chain.
- Pending transactions: one transaction accepted, another lost, causing a gap.

### 12.3 Weak randomness

Symptoms:
- Duplicate keys, or repeatable randomness in places that should be unique.

Common causes:
- Using `Math.random` or non-crypto RNGs.
- Lack of Web Crypto or SecureStore fallback.

In this repo, we rely on `crypto.getRandomValues` or cryptographically secure RNGs from libraries. If those are unavailable, the code should fail rather than generate weak keys.

### 12.4 Storing private keys in logs

Symptoms:
- Private key appears in logs or telemetry.

This is catastrophic. Ensure code never prints private key bytes. The mobile signing service keeps keys internal and never exposes them. If you need debugging, log public keys only.

---

## 13) Feynman recap: explain it like I am five

- A hash is like a fingerprint. It is easy to compute, hard to fake.
- A signature is like a stamp only you can make. Everyone can check the stamp with your public key.
- A nonce is a counter. It forces your messages to arrive in order and stops replays.
- The transaction bytes are a strict recipe: nonce, instruction, public key, signature.
- If any of those are wrong, the chain says no.

---

## 14) Exercises (build intuition)

1) Take a known transaction and manually compute its digest using the formula in `types/src/execution.rs`. Verify that the digest does not change if you change only the signature.

2) Write a test that creates two transactions with the same nonce and confirm that only one can be accepted.

3) Modify the namespace on the client and observe how signatures become invalid. (Do this only in a local dev environment.)

4) Build a small script that signs an auth challenge and then tries to submit it as a transaction. Confirm that it is rejected because the namespace is different.

---

## 15) Advanced note: why Ed25519 and batch verification matter here

Ed25519 is not just fast; it is also predictable in performance, which matters for a system that wants to keep block production steady. In this codebase we often verify multiple transactions at once. That is why the `Transaction::verify_batch` method exists in `types/src/execution.rs`. Instead of verifying each signature in isolation, the code can accumulate them and verify in a batch. This reduces overhead when blocks are full or when the gateway is processing many submissions.

The other reason Ed25519 is a good fit is that it is deterministic. For a given key and message, the signature is always the same. That means there is no extra randomness to manage during signing, which reduces one more source of bugs or weak RNG in client code. Determinism also makes it easier to test. When you sign the same bytes twice in a test harness, you should get the same result, which is a quick sanity check that the payload and namespace are correct.

## Next primer

S04 - WASM pipeline: `feynman/lessons/S04-wasm-primer.md`
