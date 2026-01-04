# E20 - Commonware storage (QMDB + MMR + archives) (textbook-style deep dive)

Focus files: `execution/src/state.rs`, `node/src/application/actor.rs`, `types/src/api.rs`, `simulator/src/state.rs`

Goal: understand the storage model deeply enough to reason about proofs, pruning, and persistence. This is a storage + proofs chapter, not a summary.

---

## 0) Big idea (Feynman summary)

Storage is not just "a database." In a blockchain, storage must be provable:

- We must show which operations happened.
- We must prove those operations are part of chain history.
- We must do this without giving the client the whole database.

Commonware's answer is a layered model:

- **QMDB** for ordered operation logs.
- **MMR** for proofs over those logs.
- **Archives** for long-term retention and pruning.

If you understand those three layers, you can reason about every state proof and every query response in this system.

---

## 1) State vs log: the foundational distinction

### 1.1 State is a snapshot

State is the current value of every key: balances, sessions, progress, and so on. State is easy to use, but hard to prove. If you only store state, you cannot prove how you got there.

### 1.2 Log is a history

A log is an ordered list of operations: update, delete, append. Logs are append-only and therefore easy to commit to with hash-based proofs. The log is what gives you verifiability.

### 1.3 Why proofs rely on logs

Proofs typically show that a specific operation was included in the log at a given position. If you can prove the log, you can reconstruct state or verify an update without revealing all other state.

This is why Commonware centers QMDB and MMR: QMDB produces an ordered log of operations, and MMR provides efficient proofs over that log.

---

## 2) QMDB: the operation log

QMDB ("Queued Merkle Database") is Commonware's append-only operation store. It records operations and exposes proof generation.

The code in `execution/src/state.rs` shows how our execution layer uses QMDB as the state backend.

### 2.1 The `Adb` alias

```
pub type Adb<E, T> = AnyDb<E, Digest, Value, Sha256, T>;
```

This alias defines a QMDB database with:

- keys hashed by SHA-256 (`Digest`),
- values of type `Value`,
- a translator `T` that can map keys to storage-friendly forms,
- a runtime context `E` providing Storage, Clock, Metrics, and Spawner.

The important takeaway: QMDB stores hashed keys, not raw keys. This makes keys uniform in size and protects against unbounded key sizes.

### 2.2 Insert and delete: hashed keys

The helper functions `adb_insert_inner` and `adb_delete_inner` show the pattern:

1) Encode the logical key.
2) Hash it with SHA-256.
3) Update or delete the hashed key in QMDB.

This is a common pattern in provable storage systems. The hash acts as the key in the log, and the log is the source of truth.

### 2.3 The `State` trait

The `State` trait abstracts get/insert/delete operations and includes a default `apply` that applies a list of changes:

```
async fn apply(&mut self, changes: Vec<(Key, Status)>)
```

This is critical for execution: a block produces many state changes, and the engine applies them in a batch. The trait makes it possible to swap in different backends (real QMDB vs in-memory for tests).

### 2.4 The `Status` type

`Status` is an enum with two variants:

- `Update(Value)`
- `Delete`

It implements `Write`, `Read`, and `EncodeSize`. This matters for proofs and persistence. Each operation must be encoded consistently so all nodes produce identical logs and therefore identical proofs.

### 2.5 Nonce handling as a state overlay

The `Noncer` struct in `execution/src/state.rs` is a small but important abstraction. It acts as a temporary overlay over the underlying state, letting the engine validate and increment nonces before committing changes.

Key behavior:

- It reads the current account nonce.
- It checks that the provided nonce matches.
- It increments and stores the updated nonce in a local pending map.
- Reads first check the pending map, then fall back to the underlying state.

This is essentially a mini transaction buffer. It lets the engine validate nonces without mutating the real state until the transaction is accepted.

### 2.6 Why keys are hashed before storage

Notice that every insert or delete hashes the encoded `Key` with SHA-256 before calling QMDB. This serves three practical goals:

1) **Uniform key size**: the storage engine operates on fixed-size digests rather than variable-length keys.
2) **Privacy hygiene**: raw account identifiers do not appear directly in the log; only their hashes do.
3) **Predictable performance**: hashing normalizes key distribution and avoids pathological cases where very large keys degrade performance.

The hash is deterministic, so every node derives the same storage key. That is what makes the proof system consistent across validators.

### 2.7 Translators and abstraction boundaries

QMDB uses a `Translator` trait to map raw bytes to key types. In our state database, the translator is trivial because we already use SHA-256 digests. But the abstraction matters. It allows different storage backends to apply their own key transformations without changing application code.

This is another example of Commonware's design philosophy: push system-level concerns (encoding, hashing, translation) into dedicated primitives so the application remains simple and deterministic.

### 2.8 Nonce validation as part of storage integrity

The `PrepareError::NonceMismatch` in `execution/src/state.rs` is not just a transaction validation error; it is a storage integrity guardrail. The nonce is effectively a per-account sequence number that enforces order. If a transaction arrives with a nonce that is not exactly the next expected value, it is rejected.

Why does this matter for storage? Because without strict nonce ordering, the log could contain conflicting updates for the same account in the same block or across blocks. That would make state reconstruction ambiguous. By requiring monotonic nonces, the storage log preserves a single valid history for each account.

The `validate_and_increment_nonce` function is the precise place where this rule is enforced. It reads the current nonce, checks the provided nonce, and increments the stored value. In other words, it turns a transaction into a state transition only if the sequence is correct. This is a determinism rule, not a performance optimization.

---

## 3) QMDB operations and proofs

QMDB supports two major operation types:

- **variable operations** (keyed state changes)
- **keyless operations** (append-only events)

The `simulator/src/state.rs` file shows both types in use. It uses:

- `variable::Operation<Digest, Value>` for state updates.
- `keyless::Operation<Output>` for events.

Keyless operations are ideal for event logs. They are naturally append-only and map cleanly onto an MMR.

### 3.1 Why separate state and events

State updates are keyed by account or session, so they must support updates and deletions. Events are append-only and do not need random access. By separating them, we can optimize proofs and storage for each type.

### 3.2 Creating proofs in the simulator

The simulator uses helper functions from QMDB:

- `create_proof`
- `create_multi_proof`
- `create_proof_store_from_digests`
- `digests_required_for_proof`

These functions generate proof objects that clients can verify. The simulator is effectively acting as a light client proof server. It produces the same kind of proofs a real node would, which is why it depends on QMDB utilities.

### 3.3 Update vs delete vs append (log semantics)

QMDB records operations rather than raw values. In practice, you will see three kinds of operations in the log:

- **Update**: set a key to a new value.
- **Delete**: remove a key.
- **Append**: add an event to an append-only list.

State updates (accounts, sessions) are modeled with updates and deletes. Events are modeled with keyless append operations. This matters because proofs are generated over the operation log, not over a snapshot. A proof for a state value is really a proof that a particular update or delete occurred at a particular location in the log.

This log-centric view is the core of verifiable storage. It allows clients to verify that a state transition happened without trusting the node that served the response.

---

## 4) MMR: proving append-only histories

### 4.1 MMR in one sentence

A Merkle Mountain Range is a data structure that commits to an append-only sequence while allowing efficient proofs of inclusion for any element.

### 4.2 Why MMR fits blockchains

Blockchains are append-only by design. MMR is optimized for append-only data, unlike Merkle trees that require recomputation for each append. This is why Commonware uses MMR for QMDB proof generation.

### 4.3 Locations and positions

Proofs in this system reference MMR `Location` and `Position` types. These encode where an operation sits in the append-only log. Clients use this metadata to verify that a given operation is included in the committed root.

The types are exposed in `types/src/api.rs` and used in simulator queries. This keeps the proof format consistent between server and client.

### 4.4 Anatomy of an MMR proof

An MMR proof typically contains:

- the leaf digest (the operation digest),
- a sequence of sibling hashes that allow recomputation of the root,
- the position information so the verifier knows which side each hash belongs on.

The verifier reconstructs the root hash by folding the leaf with the siblings in the correct order. If the reconstructed root matches the committed root in the summary, the operation is proven to be part of the log.

The subtle part is ordering. If you use the wrong position metadata, you can combine hashes in the wrong order and still produce a hash, but it will not match the root. That is why `Location` and `Position` are explicit types rather than raw integers. They encode exactly how the proof should be interpreted.

---

## 5) Proof formats and limits (`types/src/api.rs`)

This file defines proof limits that are consensus-critical. The key constants are:

- `MAX_STATE_PROOF_OPS = MAX_BLOCK_TRANSACTIONS * 6`
- `MAX_EVENTS_PROOF_OPS = MAX_BLOCK_TRANSACTIONS * 4`
- `MAX_LOOKUP_PROOF_NODES = 500`

These limits ensure proofs stay within bounded sizes and are not used as denial-of-service vectors.

### 5.1 Why proof limits are consensus-critical

Proofs are part of the protocol. If one node generates proofs larger than another can decode, clients will diverge. That is a consensus bug, not just a performance issue.

That is why these limits live in the shared types crate and are enforced in all proof generation and verification.

### 5.2 Verification helpers

The API module includes helper functions like:

- `verify_proof`
- `verify_multi_proof`
- `verify_proof_and_extract_digests`

These functions let clients and simulators verify that proofs correspond to a committed root. The error enum `VerifyError` enumerates all failure cases: invalid signature, digest mismatch, proof range mismatch, and so on.

This explicit error taxonomy is important. It allows clients to distinguish between malformed proofs, invalid signatures, and out-of-range errors.

### 5.3 What proof verification actually checks

At a high level, proof verification does three things:

1) **Check signatures**: if the summary includes a certificate, verify the threshold signature against the validator set.
2) **Check digest linkage**: ensure the proof's root matches the progress or state root included in the summary.
3) **Check operation ranges**: confirm that the proof covers the claimed operation indices and that the ops length matches the claimed start/end range.

If any of these checks fail, the proof is invalid. This is why the `VerifyError` enum includes mismatched ranges and invalid proof errors. The verifier is not just checking cryptographic signatures; it is checking structural integrity of the log segment being proven.

The upshot: a client can verify a specific state or event response without downloading the full chain. That is the value of proofs in this system.

---

## 6) Storage in the application actor

The application actor (`node/src/application/actor.rs`) interacts with storage in several ways:

- It uses QMDB to apply state transitions.
- It generates proofs for state and event operations.
- It manages pruning and ancestry caches.

The exact details are spread across the actor, but the key idea is that application execution produces not only a new state root, but also a proof bundle that the aggregator can later serve.

### 6.1 Proof queue and concurrency

The application config includes `proof_queue_size` and `execution_concurrency`. These settings control how many proof-generation tasks can be in flight. Proof generation can be CPU-heavy, so this is a deliberate concurrency limit to protect the node.

### 6.2 Why the application produces proofs

In a blockchain, execution is not just about updating state; it must produce verifiable outputs. The proofs are what let external clients trust the results without replaying all execution.

By producing proofs at execution time, the node ensures that proofs are aligned with the exact operations that were committed. This prevents mismatches between state and proof.

---

## 7) Simulator state as a proof server

The simulator's state system in `simulator/src/state.rs` is a practical demonstration of proof generation and indexing. It manages:

- state updates and event logs,
- proof creation for queries,
- indexed lookups for explorer endpoints,
- caching and batching to reduce overhead.

### 7.1 Why the simulator matters

The simulator is not just a dev tool. It mirrors the proof generation logic of the node so developers can test proof correctness without a full validator stack. That is why it imports the same QMDB functions and proof types.

### 7.2 State and event proof flow

When the simulator answers a query (for example, a state lookup or events range), it:

1) Identifies the relevant operations in the log.
2) Builds a proof using QMDB helpers.
3) Packages the proof with the response.

Clients can then verify the response using the same `verify_proof` logic defined in `types/src/api.rs`.

### 7.3 Concurrency, batching, and rate limits in the simulator

The simulator uses asynchronous batching to keep proof generation fast under load. It relies on structures like `FuturesUnordered`, semaphores, and bounded buffers to control concurrency. This is critical because proof creation can be CPU-heavy and memory-heavy.

Several constants define default limits, such as `DEFAULT_STATE_MAX_KEY_VERSIONS`, `DEFAULT_STATE_MAX_PROGRESS_ENTRIES`, and various history limits for submissions and seeds. These are not just conveniences. They prevent unbounded growth in in-memory indexes that back the simulator's explorer queries.

The simulator is therefore a microcosm of the production node: it uses explicit limits and concurrency caps to keep proof generation predictable. If you increase those limits, you must also increase available CPU and memory, otherwise you will see latency spikes or timeouts.

---

## 8) Archives, pruning, and durability

Commonware storage includes archive primitives (immutable and prunable). These are used by marshal and other subsystems to keep durable history while allowing pruning.

### 8.1 Immutable archives

Immutable archives are append-only. They are used for finalized blocks and finalization records. This is essential for safety: once a block is final, it should never be rewritten.

### 8.2 Prunable archives

Prunable archives allow old data to be discarded while keeping recent history. This is critical for storage growth. A node that never prunes will eventually become too large to operate.

### 8.3 Proofs and pruning

Pruning must be done carefully. If you prune data that clients still need for proofs, you break verification. That is why proof limits and retention policies are treated as protocol-level decisions.

### 8.4 Retention policies and explorer limits

In practice, retention is shaped by explicit limits. The simulator config includes values like `explorer_max_blocks`, `explorer_max_accounts`, and `state_max_key_versions`. These caps define how much historical data the system keeps readily accessible. They do not change consensus, but they do affect client UX. A query that asks for more than the cap will be rejected or truncated.

This is a key operational insight: proofs make data verifiable, but not necessarily available. Retention policies decide what you can actually serve. If you need long historical queries for audits or compliance, retention limits must be raised or archival nodes must be deployed.

---

## 9) Operational considerations: memory and IO

Storage performance is determined by configuration parameters:

- buffer pool size and page size
- freezer table sizes and resize frequency
- replay and write buffers
- items per section / blob

These parameters are tuned to balance memory usage, disk IO, and proof generation speed. In production, you monitor:

- IO latency
- proof generation time
- cache hit rate
- memory usage

Storage is not just a correctness component; it is a performance component.

### 9.1 Buffer pools and replay buffers

Two values show up repeatedly in config: the buffer pool and the replay buffer. The buffer pool is shared memory used by storage components to avoid repeated allocations and to smooth IO bursts. The replay buffer is used when replaying logs at startup or when catching up after a crash. If the replay buffer is too small, replay becomes slow and CPU-heavy. If it is too large, it can starve the rest of the process.

In production, you size these based on expected block size and transaction volume. The defaults are conservative for testnet. For higher throughput, you usually raise the buffer pool first, then observe whether replay time and proof generation latency improve. This is a practical tuning path that avoids guessing.

---

## 10) Common failure modes

### 10.1 Proof size mismatch

If proof limits are inconsistent across components, you will see verification failures. This is why proof limits are centralized and treated as consensus-critical.

### 10.2 Nonce mismatch

`PrepareError::NonceMismatch` is a safety feature. It prevents replay and double execution. If you see many nonce mismatches, it may indicate client retry bugs or mempool ordering issues.

### 10.3 Storage initialization failures

If QMDB or archive stores fail to initialize, the node must abort. Running with partial storage is worse than not running at all.

---

## 11) Feynman recap

Commonware storage is built on logs and proofs. QMDB records ordered operations, MMR provides proofs over those operations, and archives persist them with pruning. The execution layer wraps this in the `State` trait and the `Noncer` overlay for nonce safety. The simulator mirrors this behavior so proof logic can be tested without a full validator.

If you can trace a state update from `execution/src/state.rs` to a proof verified in `types/src/api.rs`, you understand how this system provides verifiable storage.

That is the storage backbone of the chain, explained.

It is rigorous, bounded, and verifiable by design.
