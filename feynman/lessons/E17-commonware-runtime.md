# E17 - Commonware runtime + scheduling (textbook-style deep dive)

Focus files: `node/src/main.rs`, `node/src/application/actor.rs`, `node/src/aggregator/actor.rs`

Goal: read this like a chapter in a distributed systems textbook. We will explain the runtime model first (Feynman style), then walk through the exact code that boots and schedules our node, and finally zoom into the application and aggregator actors to show how they use the runtime to stay safe, observable, and fair.

---

## 0) Big idea (Feynman summary)

Think of Commonware's runtime as a tiny operating system for the node:

- It boots a runtime with a structured `context`.
- It schedules long-lived actors by spawning them with that context.
- It measures everything through the same context (metrics and telemetry).
- It throttles work through quotas and mailboxes so one subsystem cannot starve the rest.

If you understand how the runtime and context are created, you understand how every other subsystem is allowed to run.

---

## 1) Why a runtime matters in distributed systems

### 1.1 Concurrency is not optional

A validator is not a single loop. It must:

- accept P2P messages,
- produce blocks,
- verify blocks from peers,
- persist data,
- expose metrics,
- and recover missing data.

Those tasks must progress concurrently. A single-threaded event loop would quickly become a bottleneck or block on IO.

### 1.2 Determinism and testability

Commonware offers a deterministic runtime for tests and a Tokio runtime for production. The API is intentionally similar so that the same actor logic can run in both environments. This is crucial for correctness: if your test runtime behaves differently than production, you will miss bugs.

### 1.3 The context as the central handle

Every Commonware runtime provides a `context` object. The context is more than a handle; it is the mechanism by which code accesses:

- time (`Clock`),
- metrics (`Metrics`),
- storage (`Storage`),
- spawning (`Spawner`),
- cancellation signals,
- labels for tracing and metrics.

In other words, the context is the "capability object" for the runtime. It encodes what you are allowed to do, which makes auditing and testing easier.

---

## 2) How the node boots the runtime (`node/src/main.rs`)

This file is the main entry point for the validator process. It shows how the runtime is configured, how telemetry is wired, how the P2P network is constructed, and how the core engine is started.

### 2.1 CLI parsing and configuration

The node starts in `main_result` with clap argument parsing:

- `--hosts` or `--peers` must be provided to specify the peer list.
- `--config` is required for node configuration.
- `--dry-run` prints config, validates peers, and exits.

The design choice is deliberate: nodes should not start with ambiguous peer configuration. Either a structured hosts file (for deployer) or a peer list file is required.

### 2.2 Dry-run mode as a safety tool

In dry-run:

1) The config is parsed and printed with `redacted_debug` (secrets removed).
2) The signer is parsed to validate the private key.
3) Peers are loaded and validated.
4) The config is validated with the peer count.
5) The indexer client is created (to confirm it is reachable).
6) A dry-run report is printed.

This is a textbook example of a safe "preflight" check. It lets operators validate the node setup without actually starting network services.

### 2.3 Metrics auth enforcement

Before starting the runtime, `ensure_metrics_auth_token` enforces a rule: if `NODE_ENV=production` (or an explicit flag is set), then `METRICS_AUTH_TOKEN` must be present. This ensures metrics endpoints are not exposed without authentication in production.

This is a runtime security boundary, not a consensus rule. It is still critical because metrics often contain sensitive operational data.

---

## 3) Runtime configuration and startup

### 3.1 Building the Tokio runtime

The runtime is built using `commonware_runtime::tokio` with a config:

- `with_tcp_nodelay(Some(true))`: reduce latency for network traffic.
- `with_worker_threads(config.worker_threads)`: parallelism in the runtime.
- `with_storage_directory(PathBuf::from(&config.directory))`: where storage lives.
- `with_catch_panics(true)`: convert panics into errors instead of crashing.

This mirrors OS-level configuration: it defines how many threads exist, where disk state lives, and how failures are handled.

### 3.2 The `start` closure

The runtime starts with `executor.start(|context| async move { ... })`. Inside this closure, a new context is available. This is where the node's async world begins.

The code immediately attaches a label to the context:

```
let context = context.with_label("nullspace");
```

Labels are important because they namespace metrics and tracing. When you later inspect telemetry, labels let you identify which subsystem emitted the metric.

---

## 4) Telemetry and metrics server

### 4.1 Telemetry configuration

The node configures logging with `tokio::telemetry::init`:

- log level from config (`info`, `debug`, etc),
- JSON logging if the node is using the deployer (structured logs),
- optional OpenTelemetry tracing from env variables.

The function `resolve_trace_config` reads environment variables:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_SERVICE_NAME` (default `nullspace-node`)
- `OTEL_SAMPLING_RATE`

This design allows tracing to be enabled or disabled without code changes. For production, this is essential.

### 4.2 Metrics server

The node spawns a small Axum server to serve metrics at `/metrics`:

- It binds to `0.0.0.0:metrics_port`.
- It uses a `MetricsState` with the runtime context.
- It checks a bearer token or header token for authorization.
- It returns the encoded metrics as plaintext.

This is a classic Prometheus-style endpoint. The important detail is that metrics are pulled from the same runtime context that actors use. That ensures metrics are consistent and do not require separate state tracking.

---

## 5) Peer discovery and network initialization

### 5.1 Loading peers

The function `load_peers` builds the peer list. It supports two modes:

- **Hosts file mode** (for deployer): reads a structured list of host entries and extracts peer public keys from hostnames.
- **Peers file mode**: reads a YAML file of peer public keys and socket addresses.

After parsing, it returns:

- our own IP,
- the list of peer public keys,
- the list of bootstrap nodes.

This is important: the node must know its own IP as seen by peers to bind the right socket.

### 5.2 Namespace and authenticated P2P

The node uses `commonware_p2p::authenticated::discovery`. It builds a namespace:

```
let p2p_namespace = union_unique(NAMESPACE, b"_P2P");
```

This namespacing prevents cross-protocol pollution. Only nodes using the same namespace will communicate. This is a practical isolation boundary between networks.

### 5.3 Configuring the P2P network

The authenticated network is configured with:

- signer (our identity),
- namespace,
- listen and advertised addresses,
- bootstrappers,
- max message size.

The configuration is then adjusted to use the node's mailbox size. This matters because P2P messages are delivered through mailboxes, and mailbox size is a backpressure boundary.

### 5.4 Channels and quotas

The network registers multiple channels with quotas and backlog limits:

- pending
- recovered
- resolver
- broadcast
- backfill
- seeder
- aggregator
- aggregation

Each channel has its own rate limit and backlog size. This is a design for fairness: heavy traffic in one channel cannot starve others. For example, backfill traffic is constrained separately from broadcast traffic. This prevents recovery traffic from blocking live consensus.

These quotas are defined by configuration, which means operators can tune the flow without changing code.

---

## 6) Engine configuration and startup

After the network is ready, the node builds an `engine::Config` with three major sections:

1) **Identity**: signer, threshold sharing, share, participants.
2) **Storage**: freezer sizes, buffer pools, cache sizes, and partitions.
3) **Consensus and application**: timeouts, quotas, mempool sizes, execution concurrency.

This config is essentially the node's brain. It tells the engine how to verify signatures, how to store data, and how to schedule consensus work.

The engine is created with:

```
let engine = engine::Engine::new(context.with_label("engine"), config).await;
```

Then it is started with all eight network channels:

- pending
- recovered
- resolver
- broadcaster
- backfill
- seeder
- aggregator
- aggregation

Finally, the node waits for the P2P task and the engine task with `try_join_all`. If either fails, the node logs an error and exits.

This is the runtime view of the whole node: P2P and Engine are the two top-level tasks managed by the runtime.

---

## 7) The actor model in Commonware

Commonware uses actors as long-lived tasks with mailboxes. The pattern is visible in both `application::actor` and `aggregator::actor`:

- An actor has a `context` and a `mailbox`.
- It exposes a `start` method that spawns a task and runs an async loop.
- It handles messages with a match statement and performs IO or state updates.
- It registers metrics through the context.

This pattern is not accidental. It gives each subsystem clear boundaries and makes it easy to reason about concurrency and backpressure.

---

## 8) Application actor (`node/src/application/actor.rs`)

The application actor is responsible for:

- preparing proposals (selecting transactions),
- executing state transitions,
- verifying block results,
- interacting with the indexer,
- managing caches like nonces and ancestry.

It sits at the boundary between consensus and execution.

### 8.1 Actor construction

The `Actor::new` method returns:

- the actor itself,
- a view supervisor,
- an epoch supervisor,
- an aggregation supervisor,
- a mailbox handle.

These supervisors are part of the consensus protocol. The actor needs them to coordinate between rounds and views.

The constructor initializes:

- an mpsc channel for the mailbox,
- a `Mailbox` wrapper that integrates with the runtime's cancellation signals,
- identity and configuration fields,
- storage parameters and mempool limits.

This shows the pattern: actor state is mostly configuration and runtime handles, not business logic.

### 8.2 Start and run

`Actor::start` spawns the actor on the runtime:

- It clones the context,
- Spawns a task,
- Replaces the actor's context with the runtime-provided one,
- Calls `run`.

`run` is where the actor registers metrics and enters its main loop.

### 8.3 Metrics as first-class citizens

Inside `run`, the actor registers a long list of metrics:

- counters for transactions considered and executed,
- counters for read errors and state transition errors,
- histograms for latency across phases (propose, verify, execute, finalize).

This is important: the actor is built to be observable. In distributed systems, metrics are the only way to debug production issues. The runtime makes it easy by providing a `register` API on the context.

### 8.4 Nonce cache

The file defines a `NonceCache` with:

- capacity limits,
- TTLs,
- eviction logic.

The cache is used to avoid repeated expensive reads of account nonces. It is also a guardrail against replay attacks. The cache evicts on time and capacity, ensuring it does not grow unbounded.

This is a good example of how runtime scheduling meets business logic: a cache seems local, but its correctness affects consensus. If two nodes disagree on nonce handling, they will diverge. That is why the cache behavior is carefully controlled.

### 8.5 Ancestry cache

The `AncestryCache` stores block ancestry information. Consensus protocols often need to verify ancestry when dealing with forks or view changes. Caching this data avoids repeated storage fetches and reduces latency in the consensus path.

Again, the cache is bounded to keep memory predictable.

### 8.6 Execution pipeline (high level)

While the file is large, the essential pipeline is:

1) **Propose**: pull transactions from the mempool, build a candidate block.
2) **Verify**: validate proposed blocks and prepare for execution.
3) **Execute**: apply state transitions with `nullspace_execution::state_transition`.
4) **Finalize**: commit outputs, update caches, and notify other subsystems.

The actor coordinates these steps using supervisors, mailboxes, and concurrency primitives.

### 8.7 Mempool selection and bounded proposal size

The application actor relies on a mempool implementation to choose transactions for proposals. The key constraints are visible in the config:

- `mempool_max_backlog` and `mempool_max_transactions` cap how many transactions can be buffered.
- `mempool_stream_buffer_size` bounds streaming throughput.
- `MAX_BLOCK_TRANSACTIONS` (from `nullspace_types`) bounds how many transactions are allowed in a block.

The proposal step is therefore intentionally bounded. The actor does not attempt to stuff an unbounded number of transactions into a block. This is a consensus safety rule: every validator must be able to process proposals in a predictable time. If proposals were unbounded, a malicious leader could create a block that takes minutes to verify, stalling the network.

By enforcing a block transaction cap in the application actor, we ensure that the runtime has a predictable workload per block. This is part of why the runtime and application logic are so tightly coupled: the runtime cannot remain stable if the application allows unbounded work.

### 8.8 Nonce handling as replay defense

The actor includes explicit nonce tracking logic (`NonceCache`) and helper functions like `fetch_account_nonce` and `apply_transaction_nonce`. The idea is simple: each account action has a sequence number, and only the next valid sequence is accepted. This prevents replay attacks and makes retries safe.

The cache is bounded and time-based. That is important because it forces the system to reclaim memory and to re-fetch from storage when data is old. The runtime makes this safe because it provides stable time and cancelation primitives. A cache that never evicts is a memory leak; a cache that evicts too aggressively is a performance problem. The actor deliberately chooses a middle ground (capacity plus TTL).

### 8.9 State transitions and deterministic execution

When the actor executes a block, it calls into `nullspace_execution::state_transition`. That function takes the current state and a set of transactions and produces:

- a new state root,
- state and event proofs,
- an output summary with events and receipts.

The actor then forwards the results to the aggregator and indexer. This is the bridge between consensus and external observers. If the state transition logic were nondeterministic, two validators would produce different state roots and proofs, and the aggregator would upload conflicting summaries. The deterministic runtime and strict transaction ordering are what make this reliable.

### 8.10 Mailbox-driven orchestration

The `Mailbox` used by the actor is not just a channel. It integrates with the runtime's stop signal (`context.stopped()`). This means that when the runtime shuts down, the mailbox closes cleanly and the actor can exit without deadlocks.

This is subtle but critical. Many async systems leak tasks because there is no shared stop signal. The Commonware runtime makes shutdown explicit, which is essential for clean restarts and deterministic tests.

### 8.7 Why the runtime is essential here

The application actor relies on:

- `Clock` for timeouts,
- `Spawner` for concurrent tasks,
- `Storage` for state access,
- `Metrics` for observability.

Because these are traits on the context, the same actor code can run in deterministic tests or in production. This is exactly the design goal of Commonware.

---

## 9) Aggregator actor (`node/src/aggregator/actor.rs`)

The aggregator actor is responsible for:

- storing and verifying aggregation certificates,
- caching proof bundles per block,
- uploading summaries to the indexer,
- responding to consensus queries about block results.

It is a bridge between execution results and external consumers.

### 9.1 Mailbox and metrics

`Actor::new` creates a mailbox and registers a `certificates_processed` gauge. This gauge tracks how many contiguous certificates have been processed. It is a signal of node progress and health.

### 9.2 Storage initialization

The actor initializes three storage structures:

- a cache for proof bundles,
- a journal for results,
- an ordinal store for certificates.

Each is configured with partitions and buffer sizes from config. This ensures the aggregator's disk footprint is predictable and aligned with operator expectations.

### 9.3 Resolver engine

The actor starts a `p2p::Engine` resolver. This component fetches missing certificates over the network. The actor seeds the resolver with the first missing certificates and keeps a `waiting` set to avoid duplicate fetches.

This is the backfill mechanism for aggregation data.

### 9.4 Main loop

The actor's `run` method processes mailbox messages. Key message types include:

- `Executed`: produced by the execution engine when a block is executed.
- `Certified`: indicates a block has a certificate.
- `Propose` and `Verify`: requests from consensus for aggregation payloads.
- `Deliver` and `Produce`: P2P messages for certificate exchange.

For each message type, the actor performs a precise sequence of actions. For example, on `Executed`:

1) Store proofs in the cache.
2) Append a result record.
3) Update metrics.
4) Respond to any pending proposal or verify requests.

This ensures the aggregator is always aligned with the execution pipeline.

### 9.5 Summary uploads

After processing messages, the actor attempts to upload summaries to the indexer. It keeps a cursor and only uploads in order when proofs and certificates are available.

Uploads happen in spawned tasks with retry logic and jittered backoff. This is an important operational detail: indexer outages should not block the validator. The aggregator will retry while continuing to process other work.

### 9.6 Why the runtime matters here

The aggregator uses the runtime for:

- spawning upload tasks,
- timing retry backoffs,
- metrics registration,
- storage access.

If you remove the runtime abstraction, this actor becomes a tangled mix of threads, timers, and IO. Commonware's runtime keeps it disciplined and testable.

---

## 10) Mailboxes, quotas, and fairness

Across the node, there are two core backpressure mechanisms:

1) **Mailboxes**: each actor has a bounded channel for inbound messages.
2) **Quotas**: network channels are rate-limited independently.

This creates a layered defense:

- A burst of P2P traffic cannot starve internal application work.
- A flood of backfill requests cannot block broadcasts.
- A slow actor cannot unboundedly accumulate messages.

These mechanisms are as important as consensus correctness. They keep the node alive under load.

---

## 11) How this ties to Commonware primitives

The runtime and actor model tie together many Commonware primitives:

- **commonware-runtime** provides contexts, time, spawning, and metrics.
- **commonware-p2p** provides authenticated networking and channels.
- **commonware-consensus** provides marshaling and supervisor concepts.
- **commonware-storage** provides caches, journals, and proofs.
- **commonware-utils** provides ordered sets and helper utilities.

The runtime is the glue. It turns these libraries into a cohesive node.

---

## 12) Operational implications

A few practical takeaways for production:

- Adjust `worker_threads` to match CPU cores; too few threads bottleneck IO, too many can cause context switching overhead.
- Quotas should be tuned based on observed traffic patterns. If the node is consistently lagging in backfill, raise backfill rate limits.
- Metrics auth should always be enabled in production.
- When debugging, look at metrics first. If `certificates_processed` is stalled, the aggregator is behind. If `txs_considered` is low, mempool or application logic is failing.

---

## 13) Feynman recap

The Commonware runtime is the node's operating system. It provides context, time, metrics, and spawning in a single abstraction. The node boot sequence in `main.rs` shows how this runtime is configured, how P2P channels are registered with quotas, and how the engine is started. The application and aggregator actors show how long-lived subsystems are structured around mailboxes and metrics, with explicit backpressure and retry logic.

If you can explain the runtime, you can explain why the node does not deadlock, why it stays observable, and how it recovers under load. That is the essence of production-grade scheduling in a distributed system.
