# E04 - Consensus pipeline + seeding (from scratch, full walkthrough)

Focus files: `node/src/aggregator/actor.rs`, `node/src/aggregator/ingress.rs`, `node/src/seeder/actor.rs`, `node/src/seeder/ingress.rs`

Goal: understand how consensus outputs (certificates, proofs, seeds) are aggregated, stored, and distributed. This chapter explains the aggregator and seeder actors, how they use Commonware primitives, and how they keep the node consistent even under network loss.

---

## Learning map

If you want the fastest practical understanding:

1) Read Sections 1 to 3 for the big picture: what the aggregator and seeder do.
2) Read Sections 4 to 8 for aggregator internals and proof handling.
3) Read Sections 9 to 12 for seeder internals and seed distribution.

If you only read one section, read Section 8 (summary upload pipeline). It shows how execution output becomes indexer data with proofs.

---

## 1) Why aggregation and seeding exist

Consensus produces decisions (blocks, results, events). But to make those decisions verifiable and useful, the node must:

- Collect signatures into certificates.
- Persist state and event proofs.
- Distribute randomness seeds used by execution.
- Backfill missing data when the network drops packets.

The aggregator and seeder are specialized actors that handle these jobs. They are not part of the core consensus algorithm itself; they are part of the **consensus pipeline** that makes outputs durable and verifiable.

Think of them as "post-consensus" and "side-channel" components:

- Aggregator: takes executed results and consensus certificates, builds proof bundles, and uploads summaries to the indexer.
- Seeder: takes consensus activity, extracts seeds, persists them, and makes them fetchable by peers.

---

## 2) Core concepts you need

### 2.1 Certificates

A certificate is a compact proof that a quorum of validators agreed on something. In this codebase, certificates are BLS threshold signatures over block digests.

### 2.2 Proof bundles

A proof bundle includes:

- A state proof (MMR or similar) and ops to reconstruct updates.
- An events proof and ops to reconstruct events.

These bundles let clients and indexers verify that a state or event came from a valid block without storing full chain state.

### 2.3 Seeds

Seeds are randomness values derived from consensus. They are deterministic and shared across nodes, so they can drive deterministic RNG in the execution layer.

Seeds must be persisted, backfilled, and made available to clients or nodes that fall behind.

### 2.4 Backfill and resolvers

Backfill is the process of requesting missing data. Both aggregator and seeder use `commonware_resolver::p2p::Engine` to fetch missing certificates or seeds.

This is the recovery mechanism for network loss. The resolver is configured with retries and timeouts, which means the system can recover from partial failures.

---

## 3) The high-level pipeline

Here is the consensus pipeline in one pass:

1) Consensus reaches a decision (notarization or finalization).
2) Execution produces results (state updates, events).
3) Aggregator stores proofs and results.
4) Aggregator stores certificates (consensus signatures).
5) Aggregator assembles and uploads summaries to the indexer.
6) Seeder extracts seeds from consensus activity and stores them.
7) Seeder uploads seeds to the indexer.
8) Both components use resolvers to backfill missing data if needed.

This pipeline provides two things the chain needs:

- **Durability**: results and seeds survive restarts.
- **Verifiability**: proofs are stored and can be served to clients.

---

## 4) Aggregator: role and data structures

### 4.1 The `Proofs` bundle

`node/src/aggregator/actor.rs` defines a `Proofs` struct containing:

- `state_proof` and `state_proof_ops`
- `events_proof` and `events_proof_ops`

The `Read` implementation enforces size limits:

- `MAX_STATE_PROOF_NODES` / `MAX_STATE_PROOF_OPS`
- `MAX_EVENTS_PROOF_NODES` / `MAX_EVENTS_PROOF_OPS`

These limits are non-negotiable. They prevent oversized proofs from exhausting memory or CPU. This is a core security control.

### 4.2 Fixed-size certificates for storage

Certificates are stored in an `Ordinal` (append-only sequence). To do that efficiently, the code defines `FixedCertificate`, a fixed-size representation of:

- Index
- Digest
- Signature

This allows storage in fixed-size blobs, improving performance and predictability.

### 4.3 Metrics in the aggregator

The aggregator registers multiple metrics:

- Summary upload attempts and failures.
- Outstanding uploads and upload lag.
- Proof bundle cache hits/misses and sizes.

These metrics are important because the aggregator is a potential bottleneck: it does disk IO, network IO, and proof handling. The metrics help detect when it falls behind.

---

## 5) Aggregator storage layout

The aggregator uses three different storage components, each for a different purpose:

1) **Cache** (`commonware_storage::cache::Cache<Proofs>`): stores proof bundles, prunable.
2) **Results journal** (`fixed::Journal`): stores `Progress` records (state roots, event roots).
3) **Certificates ordinal** (`Ordinal<FixedCertificate>`): stores certificates by height.

This layout reflects a key design principle: separate ephemeral data (proof bundles that can be pruned) from durable data (certificates and results). That makes storage management easier and prevents unbounded growth.

---

## 6) Aggregator resolver and backfill

The aggregator creates a resolver engine:

```rust
let (resolver_engine, mut resolver) = p2p::Engine::new(...);
resolver_engine.start(backfill);
```

This resolver is used to fetch missing certificates. At startup, the aggregator:

- Computes missing certificate indices (`certificates.missing_items(1, BATCH_ENQUEUE)`),
- Adds them to a waiting set,
- Requests them via `resolver.fetch`.

This is the backfill mechanism. It ensures that if the node starts without a contiguous certificate history, it can fetch missing certificates from peers.

---

## 7) Aggregator main loop: message handling

The aggregator is an actor. It receives `Message` values from its mailbox. The message types are defined in `node/src/aggregator/ingress.rs` and include:

- `Executed`: execution result and proofs for a height.
- `Certified`: a certificate for a height.
- `Propose` / `Verify`: consensus hooks to propose or verify digests.
- `Deliver` / `Produce`: resolver interfaces for certificate exchange.
- `Uploaded`: acknowledgements from summary uploads.

The main loop processes each message type. This is the heart of the aggregator.

### 7.1 Handling `Executed`

When a block is executed:

1) Proofs are assembled and stored in the cache.
2) A `Progress` record is created and appended to the results journal.
3) The result digest is computed.
4) Any pending propose/verify requests waiting for this height are resolved.

The code uses parallel async tasks (`join!`) to store proofs and results. This reduces latency. If either task fails, the actor stops.

This is a critical property: if you cannot persist results, you should not continue as if you did. Failing fast avoids corrupt state.

### 7.2 Handling `Certified`

When a certificate arrives:

- It is stored in the certificates ordinal.
- The resolver cancels requests below the current contiguous height.
- Missing certificates are enqueued for backfill.

The waiting set is updated to prevent duplicate fetches.

This provides a self-healing mechanism: if certificates are missing, they are fetched. If certificates are already present, they are skipped.

### 7.3 Handling `Propose` and `Verify`

These messages integrate with the consensus aggregation protocol:

- `Propose` asks for a digest at an index.
- `Verify` checks whether a digest matches stored results.

If the results are not yet stored for that index, the request is held in a map. When the corresponding `Executed` arrives, the request is fulfilled.

This allows consensus to proceed even if execution and storage are slightly behind. The aggregator acts as the bridge between execution results and consensus proposals.

### 7.4 Handling `Deliver` and `Produce`

These are the resolver interface:

- `Deliver`: a peer sent a certificate, which is decoded and verified.
- `Produce`: a peer requests a certificate, which is encoded and returned.

This is how certificate backfill works in practice. The resolver is essentially a request/response protocol layered on the P2P network.

### 7.5 Handling `Uploaded`

When the indexer confirms a summary upload, the aggregator:

- Decrements outstanding upload count.
- Advances the boundary for pruning proof bundles.
- Updates the upload lag metric.

This prevents proof cache growth and keeps memory bounded.

### 7.6 Aggregator ingress: Automaton, Producer, Consumer

The aggregator mailbox implements several traits to integrate with Commonware consensus and resolver flows:

- `Automaton`: supplies `genesis`, `propose`, and `verify` to the consensus aggregation protocol.
- `Producer`: answers requests for certificates (used by resolver).
- `Consumer`: accepts delivered certificates (used by resolver).
- `Reporter`: receives consensus activity and forwards certificates.

This means the aggregator is both a storage service and a consensus adapter. It can answer \"what is the digest for index X?\" and it can verify \"is this digest correct?\". At the same time, it can serve and accept certificates for backfill.

The `genesis` method is a particularly important edge case. If the mailbox is closed or the actor is shutting down, it returns the genesis digest as a fallback. That ensures consensus logic always has a valid digest for index 0, even during shutdown scenarios. This is defensive programming at the consensus boundary.

---

## 8) Summary upload pipeline

The aggregator eventually uploads summaries to the indexer. The pipeline is:

1) Ensure proof bundle exists for height.
2) Ensure certificate exists for height.
3) Read `Progress` record for height.
4) Assemble `Summary` with progress, certificate, proofs.
5) Spawn an async task to submit summary to the indexer.
6) On success, send `Uploaded` message to the mailbox.

The upload task uses exponential backoff with jitter. It keeps retrying until success. This is important: indexer outages should not permanently drop summaries.

Because uploads can be retried after restarts, the cache is pruned conservatively. The code comments note that the same height may be re-uploaded after restart, which is safe because the indexer should treat summaries idempotently.

This pipeline is the bridge from consensus/execution to the explorer layer. Without it, clients would not have proofs or summaries.

### 8.1 Proof size observability

The aggregator tracks proof bundle sizes with a histogram. The bucket configuration spans from 1 KiB to 8 MiB. This is not just for curiosity; it is a diagnostic tool:

- If proof sizes suddenly spike, it may indicate a bug in proof construction or a malicious input.- Large proof bundles increase bandwidth and storage pressure.
By tracking proof sizes, operators can detect unusual patterns before they become outages.

### 8.2 Cache pruning and upload lag

After each successful summary upload, the aggregator prunes proof bundles up to a boundary. The boundary only advances when uploads are contiguous. This prevents pruning of proofs that have not yet been uploaded.

The `summary_upload_lag` gauge measures how far the upload cursor is ahead of the pruning boundary. If the lag grows, it means uploads are falling behind and the cache is growing. That is a direct signal of indexer bottlenecks or network issues.

---

## 9) Seeder: role and data structures

The seeder actor handles consensus seeds. Seeds are produced by the consensus protocol (simplex). The seeder:

- Stores seeds in an ordinal store.
- Provides them to peers on request.
- Uploads seeds to the indexer.

It uses two storage components:

- `Metadata` store for tracking the last uploaded seed.
- `Ordinal` store for seed blobs.

This is similar to the aggregator, but simpler: seeds are a single item per view, not a bundle of proofs.

### 9.1 Metadata and upload cursor

The seeder uses a metadata store with a fixed key (`LAST_UPLOADED_KEY`). This key tracks the last seed that was successfully uploaded to the indexer.

Why this matters:

- On restart, the seeder resumes from the last uploaded view instead of re-uploading everything.- It provides a stable notion of \"upload cursor\".
This is a small but important durability feature. Without it, the seeder could flood the indexer with redundant uploads after each restart.

---

## 10) Seeder metrics and counters

Seeder registers metrics that mirror its responsibilities:

- Upload attempts and failures.
- Outstanding uploads and upload lag.
- Pending listeners for missing seeds.
- Number of waiting views.

These metrics help detect if seed distribution is lagging. Seed lag is critical because RNG depends on it; if seeds are late or missing, execution may be delayed.

---

## 11) Seeder resolver and missing seeds

The seeder uses a resolver engine similar to the aggregator. At startup:

- It computes missing items from the seed store.
- It requests those seeds via resolver.

The resolver uses `view` as the key. Seeds are indexed by view, which is an `(epoch, view)` pair in consensus. The seeder stores them using a simple `u64` sequence.

It also tracks listeners: if a component requests a seed that is missing, the seeder stores a oneshot sender and fulfills it when the seed arrives.

This is how it handles missing seeds without blocking the entire system.

### 11.1 Seeder ingress: Producer, Consumer, Reporter

The seeder mailbox implements three interfaces:

- `Consumer` (for resolver deliveries)- `Producer` (for resolver requests)- `Reporter` (for consensus activity)
This is a clever design: a single mailbox can both receive seeds from peers, provide seeds to peers, and accept seeds from consensus activity. It keeps the plumbing centralized.

In `seeder/ingress.rs`, the `Reporter` implementation listens for `Activity::Notarization` and `Activity::Finalization`. Both activities contain a `seed()` method. The mailbox calls `put(seed)` for each of these events. This means seeds are inserted as soon as consensus produces them, without extra coupling between consensus and the seeder actor.

---

## 12) Seeder message handling

Seeder messages are defined in `node/src/seeder/ingress.rs`:

- `Put(Seed)`: store a seed.
- `Get`: request a seed by view.
- `Deliver`: resolver delivers a seed signature.
- `Produce`: resolver requests a seed signature to send to a peer.
- `Uploaded`: indexer upload confirmation.

The seeder's loop processes each message:

### 12.1 `Put`

A seed arrives from consensus activity. The seeder:

- Verifies and stores it.
- Wakes listeners waiting for that view.

### 12.2 `Get`

If the seed exists in storage, it is returned immediately. Otherwise, the request is queued and the resolver fetches it.

The seeder also enforces a limit on pending seed listeners (`max_pending_seed_listeners`). This protects memory: without a cap, a large number of missing seed requests could build up and exhaust memory. If the cap is exceeded, the seeder can reject or drop requests, depending on how the caller handles it.

### 12.3 `Deliver` and `Produce`

These handle the resolver protocol for fetching seeds. `Deliver` verifies the seed signature using the BLS verifier for the network identity. `Produce` returns a stored seed signature to a requester.

### 12.4 `Uploaded`

Used to track upload progress and update metadata about the last uploaded seed. This controls pruning and lag metrics.

---

## 13) Seed verification and BLS

Seeds are BLS signatures over consensus rounds. The seeder verifies them using a BLS scheme verifier created from the network identity:

```rust
let seed_verifier = bls12381_threshold::Scheme::certificate_verifier(self.config.identity.clone());
```

This ensures seeds are not forged. If a peer sends a fake seed, verification fails and the seed is rejected.

This is a key security guarantee: randomness must be derived from consensus, not from untrusted peers.

### 13.1 How a seed corresponds to a view

In the consensus code, a seed is tied to a `Round` (epoch + view). The seed signature is effectively a certificate for that round. The seeder stores seeds by view number (converted to `u64`) to keep indexing simple, but it still verifies them against the consensus identity. This is why the seeder can safely store seeds in an ordinal: the order is deterministic and tied to consensus progression.

If you ever see a seed stored for a view that does not exist in the consensus log, that is a bug. The seeder does not generate seeds; it only stores and verifies them.
---

## 14) Backoff and retry behavior

Both aggregator and seeder use a common backoff strategy (`jittered_backoff`). This prevents synchronized retry storms in the network.

- Initial retry intervals are small (hundreds of ms).
- Backoff doubles up to a maximum (`RETRY_DELAY`).
- Jitter randomizes retries to avoid thundering herds.

This is standard distributed systems hygiene. Without jittered backoff, a temporary failure could produce a network storm when all nodes retry simultaneously.

---

## 15) Reliability properties from this design

By combining storage, resolvers, and retries, the pipeline achieves:

- **Durability**: proofs, certificates, and seeds survive restarts.
- **Recoverability**: missing items are fetched from peers.
- **Verifiability**: proofs and seeds are cryptographically verifiable.
- **Bounded resource usage**: caches are pruned, uploads are capped.

This is a good example of building a reliable distributed pipeline out of small, focused components.

### 15.1 Common failure modes

Here are failure modes you can detect with the metrics in these actors:

- **Summary upload lag grows**: indexer is slow or unreachable.- **Proof cache misses**: cache corruption or unexpected pruning.- **Seed upload failures**: indexer outage or network errors.- **Waiting views grows**: resolver not fetching missing seeds fast enough.
These metrics turn the consensus pipeline from a black box into something you can operate. Without them, you would only notice problems once users complain.

### 15.2 Tuning knobs: batch size and retry delay

Both actors share two constants: `BATCH_ENQUEUE` and `RETRY_DELAY`. They look small, but they are real tuning knobs.

- `BATCH_ENQUEUE` controls how many missing items are fetched at once. If it is too low, backfill is slow. If it is too high, you can overload the network with fetch requests.- `RETRY_DELAY` caps exponential backoff. If it is too short, the system may hammer peers during outages. If it is too long, recovery after an outage is slow.
These values should be tuned based on network size and latency. In small testnets, you can afford larger batches and shorter retries. In larger networks, conservative values are safer. The important point is that these constants are not arbitrary; they encode operational tradeoffs.
---

## 16) Feynman recap: explain it like I am five

- The aggregator collects proof bundles and signatures so everyone can verify blocks.
- The seeder saves random seeds so everyone gets the same randomness.
- Both can ask peers for missing pieces if something is lost.
- Everything is stored and verified so the system is safe and deterministic.

---

## 17) Exercises (to build mastery)

1) In `aggregator/actor.rs`, find where proof bundles are stored. Explain why the cache is prunable.

2) In `aggregator/ingress.rs`, trace the `propose` flow and explain how missing results are handled.

3) In `seeder/ingress.rs`, trace a `Get` call when the seed is missing. What happens?

4) Explain why the seeder uses the network identity to verify seeds, not the sender's public key.

---

## Next lesson

E05 - Storage, proofs, and persistence: `feynman/lessons/E05-storage-persistence.md`
