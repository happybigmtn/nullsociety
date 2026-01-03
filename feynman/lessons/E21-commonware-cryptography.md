# E21 - Commonware cryptography + certificates (textbook‑style deep dive)

Focus files: `types/src/execution.rs`, `node/src/supervisor.rs`, `types/src/api.rs`

Goal: treat this as a cryptography chapter. We explain signatures and threshold schemes conceptually, then walk through the exact code that signs, verifies, and certifies data in our stack.

---

## 0) Big idea (Feynman summary)

Cryptography is the “trust engine” of the chain:
- Users prove ownership with **ed25519** signatures.
- Validators prove quorum with **BLS threshold certificates**.
- Namespaces prevent signatures from being reused in the wrong context.

If you understand how signatures are built and verified, you understand the security boundary of the chain.

---

## 1) Background: signatures and threshold certificates

### 1.1 ed25519 signatures
- Fast, deterministic signatures for user transactions.
- Public key verifies the signature over a message.

### 1.2 BLS threshold signatures
- Each validator holds a share of a master secret.
- A quorum of shares can be combined into a single compact signature.
- The resulting certificate proves consensus with a *single* signature.

### 1.3 Namespaces
- A namespace is a domain separator for signatures.
- It prevents the same signature from being valid in multiple contexts.

---

## 2) User transaction signatures (`types/src/execution.rs`)

### 2.1 Transaction payload construction
The transaction payload is built deterministically from fields.

You should trace the code path:
- `Transaction::write_payload` (payload bytes).
- `sign_with_scratch` (signs payload).

### 2.2 Signing with namespace

Excerpt:
```rust
let signature = private.sign(TRANSACTION_NAMESPACE, scratch.as_slice());
```

Why it matters:
- The namespace ensures tx signatures can’t be replayed as other message types.

### 2.3 Verification with namespace

Excerpt:
```rust
self.public.verify(TRANSACTION_NAMESPACE, scratch.as_slice(), &self.signature)
```

What happens:
- The signature is validated against the public key.
- Verification is deterministic because payload bytes are deterministic.

### 2.4 Batch verification
Batch verification is used for throughput:
- `verify_batch` collects signature checks.
- One batch can verify many txs efficiently.

---

## 3) Block digests and view encoding (`types/src/execution.rs`)

### 3.1 Block digest definition
The block digest is derived from:
- parent digest,
- view (typed wrapper),
- height,
- transactions.

Excerpt:
```rust
hasher.update(&view.get().to_be_bytes());
```

Why it matters:
- `View` is typed; you must use `.get()` when hashing.
- Any mismatch in encoding breaks consensus.

### 3.2 Encoding order must match digest order
The `Write` implementation for `Block` mirrors the digest order.

This is non‑negotiable:
- Encoding order defines the bytes that are hashed and signed.

---

## 4) Threshold schemes (`node/src/supervisor.rs`)

### 4.1 Building the signer scheme

Excerpt:
```rust
let scheme = bls12381_threshold::Scheme::signer(participants_set.clone(), sharing, share)?;
```

Feynman explanation:
- `participants_set` defines *who counts as a validator*.
- `sharing` contains the public polynomial.
- `share` is this validator’s private share.

### 4.2 Building verifier schemes

Excerpt:
```rust
let certificate_verifier = bls12381_threshold::Scheme::certificate_verifier(identity.clone());
```

Meaning:
- Anyone can verify a certificate using only the public identity.

### 4.3 Aggregation scheme
Aggregation uses a distinct scheme instance (same identity, different certificate type).

Why it matters:
- It keeps consensus finalization certificates distinct from aggregation certificates.

---

## 5) Certificate verification in the API (`types/src/api.rs`)

### 5.1 Summary verification

`Summary::verify` does three things:
1) Build verifier scheme from `identity`.
2) Verify aggregation certificate under the chain namespace.
3) Verify MMR proofs against state/events roots.

Excerpt:
```rust
let scheme = AggregationScheme::certificate_verifier(identity.clone());
let mut rng = rand::thread_rng();
if !self.certificate.verify(&mut rng, &scheme, NAMESPACE) { ... }
```

Why a RNG?
- The threshold verification API expects a randomness source.

### 5.2 Events and lookup proofs
- `Events::verify` checks event proof only.
- `Lookup::verify` checks a single state operation.

These are the building blocks for light clients and bridges.

---

## 6) Invariants and failure modes

- **Namespace mismatch** → all signatures fail verification.
- **Participant set mismatch** → threshold certificates fail globally.
- **Sharing mismatch** → the validator cannot produce valid shares.

These are catastrophic; treat them as consensus configuration errors.

---

## 7) Exercises

1) Trace `Transaction::sign_with_scratch` and verify the exact payload bytes.
2) Trace `Block::compute_digest` and confirm it matches the codec order.
3) Read `Supervisor::new` and list all schemes created.
4) Step through `Summary::verify` and list all reasons it can fail.

---

## Next lesson
E22 - Commonware codec + utils + math: `feynman/lessons/E22-commonware-codec-utils-math.md`
