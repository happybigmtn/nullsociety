# E20 - Commonware storage (QMDB + MMR + archives) (textbook‑style deep dive)

Focus files: `execution/src/state.rs`, `node/src/application/actor.rs`, `types/src/api.rs`, `simulator/src/state.rs`

Goal: understand the storage model deeply enough to reason about proofs, pruning, and persistence. This is a storage + proofs chapter, not a summary.

---

## 0) Big idea (Feynman summary)

Storage is not just “a database.” In a blockchain, storage must be **provable**:
- We must show **which operations happened**.
- We must prove those operations are part of the chain history.
- We must do this **without giving the client the whole database**.

Commonware’s answer is:
- **QMDB** for ordered operation logs.
- **MMR** for proofs over those logs.
- **Archives** for long‑term retention.

---

## 1) Distributed systems background: state, logs, and proofs

### 1.1 State vs log
- **State** = the current values (balances, sessions, etc.).
- **Log** = a chronological record of updates (Update/Delete/Append).

Proofs usually speak about the log, not the entire state.

### 1.2 Merkle Mountain Range (MMR)
An MMR is a commitment structure over an append‑only sequence.
- Efficient append.
- Efficient range proofs.
- Natural for block‑indexed logs.

### 1.3 Proof‑carrying summaries
A summary combines:
- block metadata,
- roots of state/events logs,
- a certificate proving consensus.

Clients can validate without full state.

---

## 2) QMDB primitives (`execution/src/state.rs`)

### 2.1 QMDB database type

Excerpt:
```rust
pub type Adb<E, T> = AnyDb<E, Digest, Value, Sha256, T>;
```

Meaning:
- `AnyDb` stores `Value` keyed by hashed `Key`.
- `Digest` is the key hash type.
- `Sha256` is the hash function.

### 2.2 Key hashing is protocol‑critical

Excerpt:
```rust
let key_hash = Sha256::hash(&key.encode());
```

Why it matters:
- If the key hashing changes, proofs and state roots change.
- This is a **consensus‑critical** detail.

### 2.3 State trait and batch apply

Excerpt:
```rust
pub trait State: Send + Sync {
    async fn get(&self, key: Key) -> Result<Option<Value>>;
    async fn insert(&mut self, key: Key, value: Value) -> Result<()>;
    async fn delete(&mut self, key: Key) -> Result<()>;
}
```

Feynman explanation:
- The state trait abstracts away storage; it is the execution engine’s contract.
- It supports atomic batches through `apply`.

### 2.4 Noncer overlay

The `Noncer` wrapper stages nonce changes without committing them.

Key idea:
- It lets you pre‑validate transactions without mutating disk state.
- It overlays pending changes on top of a read‑only base.

---

## 3) State + events DB initialization (`application/actor.rs`)

### 3.1 State DB (QMDB variable)
The application actor initializes the state database with MMR + log parameters.

Look for:
- `VariableConfig` with partitions for MMR journal + metadata.
- Log partitions and buffer sizes.
- `buffer_pool` for I/O batching.

### 3.2 Events DB (QMDB keyless)
Events are append‑only logs and are stored separately.

Look for:
- `keyless::Keyless::init`.
- Config uses MMR + log partitions similar to state.

### 3.3 Sync and durability
After execution, the actor calls `sync()` on state and events.

Why it matters:
- This is the durability boundary for execution results.
- Without sync, finalized blocks could be lost on crash.

---

## 4) Proof generation (application actor)

### 4.1 Building historical proofs
After execution, the actor generates proofs for state and events.

Key pattern:
- Compute start/end ops.
- Call `historical_proof`.

### 4.2 Proof operation ranges
These ranges are exact. Proof verification depends on them.

If you get the range wrong:
- The MMR proof fails.
- Clients reject the summary.

### 4.3 Pruning
Proof data is pruned periodically to limit storage size.

This is a tradeoff:
- Smaller storage footprint.
- Potentially less historical data for debugging.

---

## 5) Proof containers (`types/src/api.rs`)

### 5.1 Summary

Excerpt:
```rust
pub struct Summary {
    pub progress: Progress,
    pub certificate: AggregationCertificate,
    pub state_proof: Proof<Digest>,
    pub state_proof_ops: Vec<StateOp>,
    pub events_proof: Proof<Digest>,
    pub events_proof_ops: Vec<EventOp>,
}
```

Explanation:
- `progress` contains block metadata and roots.
- Proof ops are the operations that actually occurred.

### 5.2 Verification flow
`Summary::verify` follows a strict sequence:
1) Verify certificate signature.
2) Verify state proof against `state_root`.
3) Verify events proof against `events_root`.
4) Ensure ops length matches roots.

Any mismatch is a cryptographic failure.

### 5.3 Lookup proofs
`Lookup` provides a proof for a single operation:
- It is used for on‑demand account queries.
- It verifies against the state root for a given height.

---

## 6) Indexer + explorer (`simulator/src/state.rs`)

The simulator/indexer consumes summaries to build queryable views.

Key flows:
- **submit_state**: stores proof ops keyed by height + location.
- **submit_events**: indexes events for account/session filters.
- **lookup**: builds a proof for a specific key by constructing the needed MMR nodes.

This is the light‑client experience applied to a local indexer.

---

## 7) Archives (finalized history)

Archives store finalized data separately:
- Immutable archive for finalization metadata.
- Prunable archive for finalized blocks.

This allows:
- Long‑term auditability.
- Storage bounds through pruning policies.

---

## 8) Invariants and failure modes

- **Key hashing is immutable**.
- **Proof ranges must be exact**.
- **Sync is the durability boundary**.
- **Pruning must not delete data required for active proofs**.

---

## 9) Exercises

1) Trace the exact order of proof generation in `application/actor.rs`.
2) Follow `Summary::verify` and list every error path.
3) In `simulator/src/state.rs`, trace how lookup proofs are built.

---

## Next lesson
E21 - Commonware cryptography + certificates: `feynman/lessons/E21-commonware-cryptography.md`
