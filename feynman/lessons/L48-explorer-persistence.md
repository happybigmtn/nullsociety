# L48 - Explorer persistence worker (from scratch)

Focus file: `simulator/src/explorer_persistence.rs`

Goal: explain how explorer data is persisted to SQLite/Postgres, how retention is enforced, and how backpressure is handled. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Explorer persistence
Explorer data is derived from the chain. Persisting it allows restarts without losing history.

### 2) Backpressure
Persistence runs in the background. If the queue is full, the system either blocks or drops updates.

### 3) Private database enforcement
For safety, Postgres must be on a private network unless explicitly overridden.

---

## Limits & management callouts (important)

1) **Backpressure policy matters**
- `ExplorerPersistenceBackpressure::Block` can stall indexing if the DB is slow.
- `Drop` avoids stalls but loses explorer data.

2) **Retention uses max blocks**
- `max_blocks` prunes old explorer data.
- If set too low, historical queries will be missing.

3) **Public Postgres is blocked by default**
- You must set `EXPLORER_PERSISTENCE_ALLOW_PUBLIC=1` to allow public hosts.

---

## The persistence pipeline (deep dive)

The explorer persistence system is a small, explicit data pipeline:

1) The simulator derives explorer updates from chain events.
2) Each block of explorer ops is wrapped as a `PersistedBlock`.
3) The block is enqueued on a bounded channel.
4) A background worker batches and writes to SQLite or Postgres.
5) On restart, the persisted blocks are replayed into memory.

This design is intentionally simple: it is not a streaming database, it is a
write behind cache for explorer state.

---

## Backend selection and startup (deep dive)

### 1) SQLite path
`load_and_start_sqlite` does three things in order:

1) Opens a local SQLite file and initializes the schema.
2) Applies retention (`max_blocks`) by pruning old rows.
3) Loads existing rows and replays them into `ExplorerState`.

After loading, it drops the connection and spawns a background worker thread
that re opens the database for ongoing writes.

### 2) Postgres path
`load_and_start_postgres` mirrors the SQLite flow but with a networked client.
It also validates the URL and enforces a private network requirement by
default (see security section below).

### 3) Why load before starting the worker?
The explorer uses in memory state for fast queries. The load phase rebuilds
that state before the simulator starts serving queries. If you started the
worker before loading, you would race initial data with replayed data.

---

## Schema design (SQLite and Postgres)

The schema is intentionally minimal:

### explorer_blocks
- `height` (primary key)
- `progress` blob (encoded `Progress`)
- `indexed_at_ms` (timestamp in ms)

### explorer_ops
- `height` (block height)
- `op_index` (operation index in block)
- `op_bytes` (encoded op)

Every `PersistedBlock` replaces all ops for its height. That is why the write
path does a delete on `explorer_ops` before inserting fresh ops.

SQLite and Postgres use the same conceptual schema, with minor syntax
differences:

- SQLite uses `INTEGER` and a WAL journal mode for durability.
- Postgres uses `BIGINT` and `BYTEA` for blob storage.

This symmetry keeps the logic simple and avoids two divergent code paths.

---

## Backpressure and batching (deep dive)

### 1) The channel is bounded
`start_worker` creates a channel of size `buffer_size`. Every block is sent
through this channel. If the channel is full, the producer must decide:

- `Block`: wait until the channel has space (backpressure).
- `Drop`: discard the update to avoid blocking.

This is an explicit tradeoff between correctness and availability.

### 2) try_send first, then a policy decision
`persist_block` first tries `try_send` to avoid blocking the caller. If the
channel is full, it checks `ExplorerPersistenceBackpressure`:

- `Block`: it awaits `send` and will block the caller.
- `Drop`: it logs and increments a drop metric.

This is the exact point where your policy matters. If you choose `Block`, slow
DB writes can slow the entire simulator. If you choose `Drop`, explorer data
may be missing after a restart.

### 3) Batch write loop
The worker thread uses `blocking_recv` to get the first item, then `try_recv`
to fill up to `batch_size`. This creates variable sized batches that are never
empty. Each batch is written in a single database transaction:

- SQLite: `BEGIN` transaction, then write all rows, then `COMMIT`.
- Postgres: `transaction()` and `commit()`.

Batching reduces write amplification and improves throughput for large chains.

---

## Retention logic (deep dive)

Retention is implemented by `max_blocks`. When set, the worker:

1) Tracks the latest height in the current batch.
2) Computes `min_height = latest - (max_blocks - 1)`.
3) Prunes rows with height below `min_height`.

The worker remembers the last prune height and only prunes when the min height
advances. This avoids redundant work on every batch.

If you set `max_blocks = None`, there is no retention and the explorer history
grows unbounded. That can be fine for short lived testnets, but not for long
running deployments.

---

## Security and network policy

The Postgres URL validator enforces a private network policy by default:

- It allows `localhost` and private IP ranges.
- It rejects public IPs unless `EXPLORER_PERSISTENCE_ALLOW_PUBLIC=1`.
- It rejects hostnames unless `EXPLORER_PERSISTENCE_ALLOW_HOSTNAME=1`.

This is a safety measure to prevent accidental exposure of the explorer
database to the public Internet. It does not encrypt data; it just blocks
obvious misconfiguration.

---

## What is actually persisted (data semantics)

Each `PersistedBlock` contains:

- `Progress`: the chain progress for that height.
- `ops`: a list of `keyless::Operation<Output>` items.
- `indexed_at_ms`: when the block was indexed.

The ops are derived from execution output. They represent the changes that the
explorer must apply to reconstruct account activity, game history, and block
metadata. Persisting ops rather than fully materialized explorer state keeps
the storage format stable and replayable.

This design is similar to an append only log. The explorer is the reducer, and
the ops are the input events.

---

## Why "keyless::Operation" matters

The explorer uses a keyless operation type because the explorer store is not
the canonical chain state. It is a derived index. That means the ops represent
index updates rather than state updates. The code treats these ops as opaque
binary blobs, which is a deliberate separation: the persistence layer should
not need to understand their semantics.

This reduces coupling. You can change explorer indexing logic without changing
the persistence schema, as long as the op encoding remains compatible.

---

## Threading model and blocking

The persistence worker runs on a dedicated thread, not a tokio task. It uses a
blocking receiver and blocking database clients (rusqlite, postgres). This is
important: it isolates the blocking I/O from the async runtime.

If you ever move this worker into async tasks, you must replace the database
clients or move the blocking calls onto a separate thread pool. Otherwise, you
will stall the async runtime.

---

## Crash safety and durability

SQLite is configured with:

- `journal_mode = WAL`
- `synchronous = NORMAL`

This is a balanced durability setting: it is safer than `OFF` but faster than
`FULL`. In practice, WAL mode is a good default for a single writer, multiple
reader workload like this explorer store.

Postgres durability is managed by the database itself. The persistence code
does not override server level settings.

---

## Load and replay path (deep dive)

On startup, `load_into_sqlite` or `load_into_postgres`:

1) Reads blocks (optionally limited to `max_blocks`).
2) Decodes `Progress` for each block.
3) Loads ops via `load_ops_*`.
4) Replays each block into the in memory explorer state using
   `apply_block_indexing`.

If a `max_blocks` limit is used, rows are read in descending order and then
sorted before replay. This keeps replay in the correct height order while
still enabling a fast "tail load" query.

---

## Failure modes and recovery

Common failure modes include:

- Database unreachable at startup.
- Database schema init failure.
- Write failure during persistence.

Each of these is logged and increments metrics (`write_error`, `prune_error`).
The worker exits if it cannot initialize the backend. This is a deliberate
choice: if persistence cannot be initialized, it is safer to run without it
than to pretend it is working.

Recovery is simple: fix the DB and restart. The explorer will rebuild its
state from the persisted blocks that are still available.

---

## SQLite vs Postgres (tradeoffs)

### SQLite
SQLite is the default for local development and small testnets:

- Single file storage, easy to back up.
- No network dependency.
- WAL mode improves concurrency for read heavy workloads.

The downside is that SQLite is still a single node store. If the simulator
node dies, the persistence file is on that node. That is fine for dev or a
single node testnet, but not for a production deployment that expects node
replacement.

### Postgres
Postgres is the multi node option:

- Centralized storage accessible from multiple nodes.
- Standard backup and HA options.
- Easier to inspect and query with external tools.

The downside is operational complexity and network dependencies. That is why
the code enforces private network usage by default.

---

## Consistency model (what is guaranteed)

Explorer persistence is an eventually consistent mirror of chain state:

- If the worker is healthy, every block is written in order.
- If the worker lags, new blocks still update in memory; disk catches up later.
- If the worker drops updates (Drop policy), disk may miss some blocks.

This means the explorer API is always live (reads use memory), but restart
recovery is only as good as the persisted history. That is a conscious tradeoff:
fast reads and low coupling over strong durability.

---

## Metrics and observability

The persistence layer updates several metrics:

- queue depth (enqueued blocks)
- backpressure events
- dropped updates
- write errors
- prune errors

These metrics are critical. If you see a rising queue depth and backpressure
events, your database is too slow for the chain pace. If you see dropped
updates, you should either increase the buffer size or switch to Block policy.

---

## Example tuning playbook

If the explorer lags in production, you have four primary knobs:

1) Increase `buffer_size` to smooth temporary spikes.
2) Increase `batch_size` to amortize per transaction overhead.
3) Move from SQLite to Postgres to improve throughput.
4) Switch from Drop to Block if correctness matters more than latency.

The right choice depends on the workload. For a small chain, SQLite with
moderate batching is often sufficient. For a large chain, Postgres with larger
batches and a tuned connection pool is required.

---

## Subtle correctness details

### 1) delete before insert
Both SQLite and Postgres delete existing ops for a height before inserting new
ops. This ensures a block re index does not leave stale operations behind.
It also implies idempotence: rewriting the same block produces the same state.

### 2) ordering of ops
Ops are stored with an explicit `op_index`. On replay they are loaded in order.
This is essential because the explorer apply function expects a stable order.

### 3) max_blocks and sort order
When loading with `max_blocks`, the query reads blocks in descending order for
efficiency, then sorts before replay. This avoids an accidental reverse apply.

---

## Security and tenancy considerations

Because this persistence layer stores derived data, it is not a source of
truth. That does not mean it is safe to expose publicly. It can still leak:

- transaction metadata
- account activity patterns
- game history

That is why the runbook insists on keeping the DB private. If you must expose
it, do so with read only credentials and network level protection.

---

## Migration and backup considerations

Because the explorer store is derived, backups are optional but helpful. A
backup can save time on restart, especially for long chains. However, a backup
is never required for correctness because the chain can always be re indexed.

If you migrate from SQLite to Postgres:

1) Stop the simulator to avoid writes.
2) Copy the SQLite file and optionally keep it as a rollback.
3) Start a simulator with Postgres configured and allow it to re index from
   chain state. There is no automatic SQLite -> Postgres migration in this
   code.

This may take time, but it is deterministic and safe.

---

## Queue sizing heuristics

There is no single best buffer size. A practical heuristic:

- buffer size should cover at least a few seconds of peak block rate
- batch size should be large enough to amortize DB overhead but small enough
  to avoid long blocking transactions

For example, if you expect 10 blocks per second, a buffer size of 100 provides
10 seconds of headroom. A batch size of 10 means you write once per second.

These are starting points. You should tune based on metrics and real traffic.

---

## Memory vs disk semantics (why both exist)

Explorer queries in the simulator read from in memory state, not from the
persistence database. This is by design: reads need to be fast and the explorer
state is already built in memory as blocks are indexed.

Persistence is there for restarts. If the process crashes, you can rebuild the
in memory state by replaying persisted blocks rather than re indexing the
entire chain from genesis. This can save hours on long chains.

This split has a subtle implication: if persistence falls behind or drops
updates, current queries are still correct, but future restarts will lose some
history. That is why the backpressure policy is such an important tradeoff.

---

## Handling re-index or rewrites

The persistence layer treats each block height as replaceable. Both backends
use "insert or replace" semantics for the `explorer_blocks` row and delete the
ops for that height before inserting new ones. This means:

- re-indexing a height is safe and idempotent
- a reorg or replay that changes the ops at the same height will overwrite
  the prior entries

There is no explicit "reorg" logic here. The persistence layer just mirrors
whatever the explorer indexing layer emits. This keeps the storage layer
simple and pushes correctness decisions to the indexing layer.

If you need stronger guarantees (for example, "never expose a block until it
is final"), that logic should live in the explorer indexing layer, not the
persistence layer. Persistence is a storage concern, not a consensus concern.
Keeping those responsibilities separate prevents subtle bugs where storage
policy accidentally changes consensus behavior.

In short: storage should be dumb, and indexing should be smart.

That separation also makes testing easier. You can unit test indexing logic
with in memory data, and you can integration test persistence with fixed
blocks without having to reason about consensus edge cases at the storage
layer. Simpler layers are easier to reason about and harder to break.

If tests start failing after a schema change, you know the bug is in storage,
not in the indexing logic. That clarity is valuable when debugging production
incidents.
It also shortens the on-call loop because you know which team owns the fix.
Keep storage boring; boring storage survives nights and weekends consistently too.

---

## Walkthrough with code excerpts

### 1) Enforcing private Postgres
```rust
fn validate_postgres_url(url: &str) -> anyhow::Result<()> {
    if allow_public_postgres() {
        return Ok(());
    }

    let parsed = Url::parse(url).context("parse postgres url")?;
    let scheme = parsed.scheme();
    if scheme != "postgres" && scheme != "postgresql" {
        bail!("postgres url must start with postgres:// or postgresql://");
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("postgres url missing host"))?;
    if host.eq_ignore_ascii_case("localhost") {
        return Ok(());
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_ip(ip) {
            return Ok(());
        }
        bail!("postgres host is public; set EXPLORER_PERSISTENCE_ALLOW_PUBLIC=1 to override");
    }

    if allow_postgres_hostname() {
        return Ok(());
    }

    bail!("postgres host must be a private IP; set EXPLORER_PERSISTENCE_ALLOW_HOSTNAME=1 to allow hostnames");
}
```

Why this matters:
- Explorer persistence should not be reachable on the public internet by default.

What this code does:
- Validates the URL scheme.
- Rejects public IPs unless explicitly allowed.
- Allows private IPs and localhost by default.

---

### 2) Persisting blocks with backpressure
```rust
pub async fn persist_block(
    &self,
    progress: Progress,
    ops: Vec<keyless::Operation<Output>>,
    indexed_at_ms: u64,
) {
    let request = PersistRequest::Block(PersistedBlock {
        progress,
        ops,
        indexed_at_ms,
    });
    match self.sender.try_send(request) {
        Ok(()) => {
            self.metrics.inc_queue_depth();
        }
        Err(mpsc::error::TrySendError::Full(request)) => {
            self.metrics.inc_queue_backpressure();
            match self.backpressure {
                ExplorerPersistenceBackpressure::Block => match self.sender.send(request).await {
                    Ok(()) => self.metrics.inc_queue_depth(),
                    Err(err) => {
                        self.metrics.inc_queue_dropped();
                        warn!("Failed to enqueue explorer persistence update: {err}");
                    }
                },
                ExplorerPersistenceBackpressure::Drop => {
                    self.metrics.inc_queue_dropped();
                    warn!(
                        "Dropping explorer persistence update due to backpressure (buffer full)"
                    );
                }
            }
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            self.metrics.inc_queue_dropped();
            warn!("Explorer persistence channel closed");
        }
    }
}
```

Why this matters:
- This is where the system decides to block or drop when persistence falls behind.

What this code does:
- Tries to enqueue a persistence request without blocking.
- If the queue is full, either blocks or drops based on the configured policy.
- Tracks metrics for depth, backpressure, and drops.

---

### 3) Loading persisted data into memory
```rust
fn load_into_sqlite(
    conn: &Connection,
    explorer: &mut ExplorerState,
    max_blocks: Option<usize>,
    metrics: &ExplorerMetrics,
) -> anyhow::Result<()> {
    let query = if max_blocks.is_some() {
        "SELECT height, progress, indexed_at_ms FROM explorer_blocks ORDER BY height DESC LIMIT ?"
    } else {
        "SELECT height, progress, indexed_at_ms FROM explorer_blocks ORDER BY height ASC"
    };
    let mut stmt = conn.prepare(query)?;
    let rows = if let Some(limit) = max_blocks {
        stmt.query_map([limit as u64], map_row)?
    } else {
        stmt.query_map([], map_row)?
    };

    let mut blocks = Vec::new();
    for row in rows {
        let (height, progress_bytes, indexed_at_ms) = row?;
        let progress = Progress::decode(&mut progress_bytes.as_slice())
            .context("decode progress for explorer persistence")?;
        let ops = load_ops_sqlite(conn, height)?;
        blocks.push(PersistedBlock { progress, ops, indexed_at_ms });
    }

    if max_blocks.is_some() {
        blocks.sort_by_key(|block| block.progress.height);
    }

    for block in blocks {
        apply_block_indexing(
            explorer,
            &block.progress,
            &block.ops,
            block.indexed_at_ms,
            metrics,
        );
    }

    Ok(())
}
```

Why this matters:
- On startup, explorer state must be rebuilt from disk.

What this code does:
- Reads persisted blocks from SQLite.
- Reconstructs in-memory explorer state by replaying indexed blocks.

---

## Key takeaways
- Explorer persistence is optional but crucial for multi-node setups.
- Backpressure policy controls correctness vs availability tradeoffs.
- Postgres URLs are validated to avoid public exposure.

## Next lesson
L49 - Simulator passkey dev endpoints: `feynman/lessons/L49-simulator-passkeys.md`
