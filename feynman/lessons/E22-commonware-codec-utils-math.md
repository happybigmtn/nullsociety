# E22 - Commonware codec + utils + math (textbook‑style deep dive)

Focus files: `types/src/execution.rs`, `types/src/api.rs`, `execution/src/mocks.rs`

Goal: understand how low‑level primitives (encoding, helpers, randomness) make the protocol deterministic. This is the “format and mechanics” chapter.

---

## 0) Big idea (Feynman summary)

Consensus depends on *bit‑exact* agreement. Codec + utils + math are the tools that make that possible:
- Codec defines how data becomes bytes.
- Utils ensure consistent namespaces and ordering.
- Math/random provides deterministic randomness in cryptographic contexts.

---

## 1) Background: canonical encoding and determinism

### 1.1 Canonical encoding
If two nodes encode the same data differently, they compute different hashes and signatures. That breaks consensus.

Canonical encoding requirements:
- Fixed ordering of fields.
- Consistent integer encodings (varints).
- Explicit bounds on collections.

### 1.2 Range‑bounded decoding
Decoding must enforce size limits:
- Protects against memory‑DoS.
- Ensures block size invariants are enforced at the codec layer.

---

## 2) Codec in execution types (`types/src/execution.rs`)

### 2.1 Block encoding order

Excerpt:
```rust
self.parent.write(writer);
UInt(self.view.get()).write(writer);
UInt(self.height).write(writer);
self.transactions.write(writer);
```

Explanation:
- This order is **the canonical byte layout**.
- Any deviation invalidates hashes and signatures.

### 2.2 Block decoding with bounds

Look for:
```rust
Vec::<Transaction>::read_cfg(reader, &(RangeCfg::from(0..=MAX_BLOCK_TRANSACTIONS), ()))?
```

Meaning:
- Decoding enforces the block transaction limit.
- Oversized blocks are rejected during decoding.

### 2.3 EncodeSize
`EncodeSize` ensures we can precompute sizes for network buffers.

Why it matters:
- Protocol layers can reject oversized messages early.

---

## 3) Codec in API proofs (`types/src/api.rs`)

### 3.1 Proof containers encode with bounds
Proof decoding uses `MAX_*` constants to limit memory.

Why this matters:
- Proofs are attacker‑supplied.
- Bound checks prevent unbounded allocations.

### 3.2 Custom equality for certificate‑carrying types
`Summary` and `Events` implement `PartialEq` by comparing encoded certificates.

Why:
- Certificate types don’t implement standard equality.
- Encoding is the canonical representation.

This is a codec‑driven equality guarantee.

---

## 4) Utils: namespaces and ordering (`execution/src/mocks.rs`)

### 4.1 Namespace construction

Excerpt:
```rust
union(namespace, b"_SEED")
```

Meaning:
- `union` creates a derived namespace without ambiguity.
- Prevents signature reuse across message types.

### 4.2 Ordered sets
In peer lists (see E18), ordered sets guarantee deterministic validator order.

Why it matters:
- Threshold schemes and consensus depend on a stable ordering.

---

## 5) Math/random: deterministic randomness

### 5.1 Random trait usage
Commonware uses a `Random` trait for cryptographic randomness.

Example:
```rust
let private = PrivateKey::random(&mut rng);
```

Why it matters:
- Tests use seeded RNGs for reproducibility.
- Production uses OS randomness for security.

### 5.2 Deterministic tests
Mocks and tests often use `StdRng::seed_from_u64` to build deterministic keypairs.

This makes simulations reproducible in CI.

---

## 6) Invariants and failure modes

- **Encoding order is consensus‑critical**.
- **Range limits are part of the protocol** (they enforce block size and proof size).
- **Namespaces must be unique** or signatures can be replayed.

---

## 7) Exercises

1) In `types/src/execution.rs`, verify that digest order matches encoding order.
2) Find every `RangeCfg` usage in types and list the limits.
3) In `types/src/api.rs`, trace proof decode and identify all size checks.

---

## Next lesson
E23 - Commonware broadcast + stream: `feynman/lessons/E23-commonware-broadcast-stream.md`
