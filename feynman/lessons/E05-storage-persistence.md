# E05 - Storage, proofs, and persistence (from scratch, full walkthrough)

Focus files: `docs/persistence.md`, `simulator/src/main.rs`, `simulator/src/explorer_persistence.rs`, `simulator/src/explorer.rs`, and related metrics endpoints.

Goal: understand which services own which data, how explorer persistence works, why backpressure exists, how retention is enforced, and how backups and recovery are planned. This chapter ties the persistence plan to actual code paths.

---

## Learning map

If you want the fastest practical understanding:

1) Read Sections 1 to 3 for data ownership and persistence scope.
2) Read Sections 4 to 7 for explorer persistence implementation details.
3) Read Sections 8 to 12 for migration, backup, and recovery strategy.

If you only read one section, read Section 6 (backpressure and persistence queue behavior). That is the most operationally important part of explorer persistence.

---

## 1) Storage in a blockchain stack: what must persist

A blockchain system produces a lot of state, but not all state is equal. In this stack, we separate data into categories:

- **Consensus-critical state**: chain state, blocks, proofs. Owned by validators.
- **Explorer/indexer state**: derived data for UI and analytics. Owned by the simulator/indexer.
- **Auth/billing state**: users, entitlements, Stripe events. Owned by Convex and the auth service.
- **Client state**: ephemeral UI state, cached data. Owned by the website/mobile clients.

This separation is deliberate. Each category has different durability and performance requirements. If you treat all data the same, you either overpay for storage or risk losing critical data.

---

## 2) Data ownership boundaries (the most important table)

The persistence plan defines a clear ownership boundary:

| Service | Writes | Reads | Notes |
| --- | --- | --- | --- |
| Validators | Chain state, blocks | Chain state | Consensus source of truth. |
| Simulator/indexer | Explorer persistence (optional Postgres/SQLite) | Chain state + explorer | Read-heavy HTTP/WS API. |
| Auth service | Convex (users, entitlements, Stripe events) | Convex | Uses service token + admin key for on-chain sync. |
| Website | None | Simulator + Auth + Convex | Read-only; no direct writes to chain. |

Why this matters:

- If a component writes outside its boundary, data can be corrupted or become inconsistent.
- Clear ownership reduces the risk of accidental writes and simplifies backups.

This is a design principle: each service owns the data it writes. Everyone else reads.

---

## 3) Chain state vs explorer state

Validators store chain state using Commonware storage primitives (QMDB + MMR). This is the authoritative source of truth.

Explorer state is a derived, query-optimized view. It is not consensus-critical. It can be rebuilt by replaying the chain. That is why explorer persistence is optional.

This distinction is critical for backups:

- Losing chain state is catastrophic.
- Losing explorer state is painful but recoverable.

That is why backups prioritize validator data and Convex, while explorer persistence can be rebuilt if needed.

### 3.1 Proofs and consensus-critical storage

Validators store not just account balances but also proof data used to verify history (MMR proofs, certificates, and journals). This data is essential for clients and indexers to verify chain history.

Even though explorer persistence is rebuildable, the chain's proof data is not. If you lose it, you lose the ability to generate historical proofs. That is why validator storage snapshots are part of the backup plan.

---

## 4) Explorer persistence modes

The simulator/indexer supports three persistence modes (from `docs/persistence.md` and `simulator/src/main.rs`):

1) **In-memory** (default): fastest, no persistence. Good for dev or ephemeral environments.
2) **SQLite**: file-based persistence for single-node setups.
3) **Postgres**: shared persistence for multi-node setups.

CLI flags in `simulator/src/main.rs` control these modes:

- `--explorer-persistence-path` (SQLite)
- `--explorer-persistence-url` (Postgres, overrides SQLite)

The Postgres option is recommended for testnet/production because it allows multiple indexers to share the same explorer state.

---

## 5) Explorer retention controls

Explorer data can grow quickly. To bound growth, the simulator exposes retention flags:

- `--explorer-max-blocks`
- `--explorer-max-account-entries`
- `--explorer-max-accounts`
- `--explorer-max-game-event-accounts`

These values are loaded into the explorer state and enforced on each indexing update.

Setting them too low will drop history; setting them too high risks unbounded growth. This is a tradeoff between storage and historical depth. In production, you should tune these values based on storage budgets and user requirements.

---

## 6) Explorer persistence pipeline (in code)

The simulator creates an `ExplorerPersistence` worker if persistence is configured. The pipeline is:

1) Indexer processes a block.
2) Explorer state is updated in memory.
3) Persistence worker enqueues a block for storage.
4) A background thread writes the block and ops into SQLite/Postgres.

The persistence queue is an async channel with a bounded capacity. That is where backpressure comes in.

### 6.1 The persistence worker thread

`ExplorerPersistence` spawns a dedicated thread (`persistence_worker`) that performs all database writes. This isolates database latency from the async runtime that serves HTTP requests.

Why this matters:

- Database writes can block for milliseconds or seconds.
- The async runtime should stay responsive to HTTP and P2P traffic.
By moving persistence writes to a dedicated thread, the simulator avoids blocking the main event loop. This is a classic pattern: use a bounded queue and a worker thread for IO-heavy tasks.

### 6.2 SQLite/Postgres schema layout

The persistence code stores two tables:

- `explorer_blocks`: one row per block, including height, encoded progress, and timestamp.
- `explorer_ops`: operations for each block, stored as raw bytes keyed by height and op index.
This schema is deliberately minimal. It stores just enough to reconstruct explorer state without duplicating full chain state.

For SQLite, the schema is created with `CREATE TABLE IF NOT EXISTS`. For Postgres, the same schema is created using `CREATE TABLE IF NOT EXISTS` and indexed on height. The indexing is important because explorer queries almost always start with a height range.

### 6.3 Loading persisted state at startup

When persistence is enabled, the simulator loads existing records into memory on startup:

- It finds the maximum stored height.
- It replays blocks from the database into the in-memory explorer state.
- It applies retention rules to ensure bounds are respected.
This means that persistence is not just about writing; it is also about rebuilding in-memory state quickly. If startup loading is slow, the explorer API will lag. That is why the schema is designed for efficient replay.

### 6.4 Explorer indexing and in-memory state

The in-memory explorer state is managed in `simulator/src/explorer.rs`. It stores:

- Blocks by height and digest.
- Transactions by hash.
- Account activity and game events.
- LRU caches for accounts and game events.
When a new block is indexed, the simulator:

1) Checks if the height is already indexed.
2) Inserts block and transaction records.
3) Updates account and game event activity.
4) Applies retention rules (LRU eviction).
This in-memory state is what the explorer API queries. Persistence is used to rebuild it on startup, but the live queries read from memory. That is why retention policies directly affect user-visible history.

---

## 7) Backpressure: block vs drop

The persistence plan introduces a backpressure policy (`explorer_persistence_backpressure`). It has two options:

- **block** (default): if the persistence queue is full, the system blocks and waits.
- **drop**: if the queue is full, updates are dropped and the system keeps moving.

This is a tradeoff:

- `block` keeps explorer data complete but can slow indexing when the database is slow.
- `drop` preserves indexing speed but sacrifices explorer completeness.

The code in `simulator/src/explorer_persistence.rs` reflects this:

- It tries `try_send` first.
- If the queue is full:
  - `block`: awaits send.
  - `drop`: logs a warning and increments a dropped counter.

For production, the plan recommends `block` so explorer data remains complete. `drop` is only recommended for dev or short-lived load tests.

### 7.1 Backpressure metrics

The simulator tracks backpressure and queue metrics in `ExplorerMetrics`. These include:

- Queue depth and high-water mark.
- Backpressure count (how often the queue was full).
- Dropped count (how many updates were dropped in `drop` mode).
- Write and prune errors.
These metrics tell you whether the persistence layer is healthy. A rising backpressure count means the database is too slow relative to incoming indexing load. A rising dropped count means explorer data is being lost.

If you run in `block` mode and see high backpressure but no drops, the indexing pipeline is slowing down to preserve data integrity. That is usually the right tradeoff for production.
---

## 8) Persistence buffers and batch size

Two additional tuning knobs are exposed:

- `explorer_persistence_buffer`: queue depth.
- `explorer_persistence_batch_size`: how many updates are written per batch.

These affect performance and memory:

- A larger buffer absorbs bursts but consumes memory.
- A larger batch size improves write efficiency but increases latency.

The simulator provides defaults (see `simulator/src/state.rs`) but allows overrides via CLI. Tuning should be based on database performance and expected block rates.

### 8.1 Batching and transactional integrity

Explorer persistence writes are typically batched. In SQLite and Postgres implementations, a block and its operations are written together inside a transaction:

- Insert or replace `explorer_blocks` row.
- Delete existing ops for that height.
- Insert all ops for the height.
This ensures that a block is either fully stored or not stored at all. Partial writes would corrupt the explorer state. The explicit transaction boundaries are a key correctness measure.

Batch size controls how many blocks are processed in one batch. Larger batches reduce overhead but increase latency and memory usage. Smaller batches reduce latency but increase write amplification. This is another tuning knob that depends on your deployment environment.
---

## 9) Persistence security: Postgres host validation

`simulator/src/explorer_persistence.rs` validates Postgres URLs. By default, it rejects public hosts and requires private IPs or localhost. This is a security measure to avoid accidentally exposing explorer data to public databases.

There are override env vars:

- `EXPLORER_PERSISTENCE_ALLOW_PUBLIC=1`
- `EXPLORER_PERSISTENCE_ALLOW_HOSTNAME=1`

These should only be used intentionally. The default behavior protects you from misconfiguration.

### 9.1 Explorer response caching (Redis)

The simulator supports optional Redis caching for explorer responses (see `simulator/src/main.rs` flags like `--explorer-cache-redis-url` and `--explorer-cache-redis-prefix`). This cache sits above persistence:

- Persistence stores the authoritative explorer index.
- Redis caches hot query responses to reduce DB and CPU load.
This is useful for high-traffic explorer endpoints. It is optional, but in production it can reduce latency and smooth out load spikes.

Caching does not replace persistence. If persistence is disabled, Redis can still cache responses, but the underlying data must come from in-memory explorer state.
---

## 10) Explorer metrics: visibility into persistence

The simulator exposes explorer metrics via `/metrics/explorer`. The metrics include:

- Queue depth and high-water marks.
- Backpressure and dropped counts.
- Persistence write and prune errors.
- Explorer activity metrics (games started, completed, etc.).

These metrics are critical for diagnosing persistence issues. For example:

- If queue depth stays high and backpressure increases, the database is too slow.
- If dropped count increases in `drop` mode, you are losing explorer data.

Metrics turn persistence from a black box into an observable component.

### 10.1 Example metric names

In `simulator/src/api/http.rs`, the explorer metrics snapshot is exported as Prometheus metrics. Examples include:

- `nullspace_simulator_explorer_persistence_queue_depth`- `nullspace_simulator_explorer_persistence_queue_high_water`- `nullspace_simulator_explorer_persistence_queue_backpressure_total`- `nullspace_simulator_explorer_persistence_queue_dropped_total`- `nullspace_simulator_explorer_persistence_write_errors_total`- `nullspace_simulator_explorer_persistence_prune_errors_total`
These metrics are enough to build a dashboard that shows whether explorer persistence is healthy and whether data is being dropped.

---

## 11) Migration plan: SQLite -> Postgres

The persistence plan includes a migration strategy:

1) Provision Postgres and create a dedicated database/user.
2) Start a new indexer with `--explorer-persistence-url` and desired retention flags.
3) Let it replay the chain until it reaches the tip.
4) Switch reads (LB or service discovery) to the Postgres-backed indexer.
5) Retire the SQLite instance after verifying data parity.

This plan avoids downtime because you can run both indexers in parallel while the new one catches up. It also avoids risky in-place migrations.

---

## 12) Backups and recovery (RPO/RTO)

The persistence plan sets explicit targets:

- RPO (Recovery Point Objective): 15 minutes.
- RTO (Recovery Time Objective): 4 hours.

These targets are ambitious. They imply:

- Frequent backups (WAL archiving for Postgres).
- Automation for Convex snapshots.
- Regular restore drills.

### 12.1 Postgres backup strategy

- Daily base backup + WAL archiving to object storage.
- Retain 7-14 days of WAL for point-in-time recovery.
- Quarterly restore drills to staging.

### 12.2 Convex backup strategy

- Snapshot data + metadata volumes.
- Store snapshots in object storage with 14-30 day retention.
- Quarterly restore drill to a staging Convex deployment.

### 12.3 Chain state snapshots

- Snapshot validator data directories prior to upgrades.
- Store snapshots in durable storage.

The key idea: backups are not enough. Restore drills must be scheduled and measured. Without drills, you do not actually know your RPO/RTO.

### 12.4 Why RPO and RTO are explicit

RPO and RTO are not just abstract goals; they drive concrete engineering decisions.

- **RPO 15 minutes** means you must capture and store data changes at least every 15 minutes. That is why WAL archiving and frequent snapshots are required.
- **RTO 4 hours** means the system must be restorable within 4 hours. That forces you to automate restore procedures and rehearse them.
If you cannot meet these targets in drills, you either adjust the targets or invest in automation. The worst outcome is to claim targets you have never tested.

---

## 13) Data access boundaries (operational safety)

The persistence plan repeats strict boundaries:

- Simulator writes explorer persistence, nobody else does.
- Auth service writes Convex, nobody else does.
- Website is read-only, never writes directly to chain or Convex.
- Admin keys are held only by the auth service for on-chain sync.

These boundaries should be enforced culturally and technically. If you add a new service, decide explicitly which data stores it may write.

### 13.1 Service tokens and write authority

The auth service uses a Convex service token to write user and entitlement data. This token is effectively a root credential for the Convex backend. It should be stored securely and rotated like any other secret.

Write authority is intentional:

- The simulator/indexer does not hold the Convex service token.
- The website never writes directly to Convex.
- Only the auth service has the credential to create or update entitlements.
This segregation prevents accidental writes from public-facing services. It also simplifies audit trails: if Convex data changes, you know which service initiated it.

---

## 14) Failure modes and what they look like

### 14.1 Explorer DB slow

Symptoms:

- Persistence queue depth grows.
- Backpressure counters rise.
- Indexing slows or stalls (in block mode).

Response:

- Check DB performance.
- Increase batch size or buffer capacity if safe.
- Scale database resources.

### 14.2 Explorer data missing

Symptoms:

- Explorer queries return incomplete history.
- Dropped count increases (drop mode).

Response:

- Switch to block mode.
- Rebuild explorer by replaying chain.

### 14.3 Postgres unreachable

Symptoms:

- Persistence errors in logs.
- Queue fills and backpressure triggers.

Response:

- Restore DB connectivity.
- Restart indexer if needed.
- Validate that queue drains after recovery.

### 14.4 Data corruption or mismatch

Symptoms:

- Explorer queries return inconsistent results across nodes.
- Indexed block heights differ between instances.

Response:

- Compare explorer tip heights across nodes.
- If mismatch persists, rebuild explorer state by replaying the chain.
- Verify that persistence backpressure is not dropping data.
Because explorer state is derived, the safest recovery is often to reindex from chain state. This is slower than repairing individual rows, but it guarantees consistency.

---

## 15) Operational checklist

Before production:

1) Decide persistence mode (SQLite vs Postgres).
2) Set retention limits for explorer data.
3) Configure backpressure policy and buffers.
4) Ensure Postgres host validation passes or intentionally override.
5) Wire explorer metrics into dashboards.
6) Create backup pipelines for Postgres, Convex, and chain state.
7) Schedule restore drills.

This checklist is the practical translation of the persistence plan into actions.

### 15.1 Scaling explorer persistence in multi-node deployments

When you run multiple indexers, Postgres becomes the shared source of explorer persistence. There are two important patterns:

1) **Active-active indexers**: multiple indexers ingest the chain and write to the same Postgres database.
   - This gives redundancy but increases write contention.
   - Batch size and buffer tuning become critical to avoid lock contention.
2) **Active-passive indexers**: one indexer writes, others read from Postgres.
   - This reduces write contention but creates a single ingestion bottleneck.
   - Failover requires promoting a reader to writer.

In both cases, you must ensure that explorer persistence is idempotent. Replaying the same block should not create duplicate rows; the persistence code handles this by replacing or deleting existing rows for a height before inserting new ops.

If you observe high write latency in Postgres, consider:

- Increasing `explorer_persistence_batch_size` to reduce overhead.
- Adding indexes only where needed (height-based queries are most common).
- Offloading read-heavy queries to replicas while keeping writes on a primary.

Scaling is not just about throughput. It is also about consistency. A shared persistence store must be the single source of truth for explorer history to avoid divergence between nodes.

A practical rule of thumb: keep only one writer unless you have strong reasons and clear monitoring. Multi-writer setups can work, but they are harder to reason about and debug when data mismatches appear.

---

## 16) Feynman recap: explain it like I am five

- The chain keeps the real truth.
- The explorer keeps a fast copy for humans to read.
- We can store explorer data in memory, SQLite, or Postgres.
- Backpressure keeps us safe if the database is slow.
- Backups and drills make sure we can recover from disasters.

---

## 17) Exercises (to build mastery)

1) Locate the CLI flags in `simulator/src/main.rs` that control explorer persistence. Explain how each one affects storage.

2) Read `explorer_persistence.rs` and explain the difference between `block` and `drop` backpressure.

3) Explain why the Postgres URL validator rejects public IPs by default. What risk does it prevent?

4) Design a retention policy that balances storage cost and user needs for testnet.

---

## Next lesson

E06 - Execution engine internals (game logic): `feynman/lessons/E06-execution-engine.md`
