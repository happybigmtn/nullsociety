# E03 - Node entrypoint + network wiring (from scratch, full walkthrough)

Focus file: `node/src/main.rs`

Goal: understand exactly how a validator node boots: from CLI flags, to config validation, to telemetry, to P2P network channels, to engine startup. This chapter is a guided tour of the node entrypoint and why each step exists.

---

## Learning map

If you want the quickest practical understanding:

1) Read Sections 1 to 3 for the big picture of the node boot process.
2) Read Sections 4 to 8 for config, peers, dry-run, and metrics.
3) Read Sections 9 to 12 for P2P wiring and engine startup.

If you only read one section, read Section 10 (P2P channel wiring). It is the clearest map of how network traffic is separated and why that matters.

---

## 1) What is the node entrypoint?

The node entrypoint is the main binary for validators. It is responsible for:

- Parsing CLI arguments.
- Loading and validating configuration.
- Starting telemetry and metrics.
- Wiring network channels and quotas.
- Starting the consensus engine.

This file is the first place that executes when you run the node. If the node fails to start, it is almost always because something in this file failed: config, network setup, metrics bind, or engine startup.

One important design fact: there is no separate production "dev-executor" in the node flow. The node itself runs the execution engine. That is why this file is so central.

---

## 2) Commonware primitives in this file

This entrypoint uses several Commonware crates. Understanding them at a high level helps you understand the rest of the system:

- `commonware-runtime`: provides the `tokio::Runner`, metrics context, and quotas.
- `commonware-p2p`: provides authenticated networking and channel registration.
- `commonware-utils`: small helpers (`union_unique`, hex parsing).
- `commonware-deployer`: used for hosts file parsing.

The node code is not only application logic; it is also a runtime configuration layer that stitches these primitives together.

---

## 3) High-level boot sequence

At a high level, `node/src/main.rs` does the following in order:

1) Parse CLI arguments (`--config`, `--hosts` or `--peers`, `--dry-run`).
2) Load configuration file.
3) If `--dry-run`: validate config, peers, and indexer connectivity, then exit.
4) Enforce metrics auth token requirements.
5) Create a Tokio runtime via `commonware_runtime::tokio::Runner`.
6) Inside the runtime:
   - Initialize telemetry and tracing.
   - Start metrics server.
   - Load peers and validate config.
   - Create authenticated P2P network.
   - Register channels with rate limits.
   - Build engine configuration.
   - Start engine and P2P tasks.
   - Wait until tasks finish or error.

This sequence is not accidental. Each step depends on the previous one. If the config is invalid, the node stops before any network activity. If metrics cannot be bound, the node still starts but logs the error (depending on which step fails). The key idea is: we fail fast on critical config errors and we start telemetry early so failures are visible.

---

## 4) CLI arguments and file inputs

The CLI is defined using `clap`. The important flags are:

- `--config <file>`: required, YAML config file.
- `--hosts <file>` or `--peers <file>`: required, one of them must be provided.
- `--dry-run`: validate configuration and exit.

Why we require hosts or peers:

- The node must know who its peers are to set up the P2P network.
- The hosts file is often used with the Commonware deployer (EC2), while the peers file is a manual list.

The code enforces this early:

```rust
if hosts_file.is_none() && peers_file.is_none() {
    anyhow::bail!("Either --hosts or --peers must be provided");
}
```

This is a simple but critical guard. Without it, the node might start without a peer list, which would create confusing network failures later.

---

## 5) Loading and validating config

The config file is parsed as YAML into a `Config` struct (from `nullspace_node`). This config includes:

- Network ports
- Identity and signer settings
- Storage parameters
- Consensus timeouts and fetch limits
- P2P rate limits
- Execution concurrency

After parsing, the config is validated using `validate_with_signer`. This method checks things like:

- Key correctness
- Derived public key and identity consistency
- Limits being sane (e.g., positive, within bounds)

Validation also depends on peer count. That is why we load peers before validating: some consensus parameters depend on the number of participants.

---

## 6) Dry-run mode: safety before joining the network

Dry-run mode is a startup option that verifies config and environment without starting the node. It is a crucial operational tool.

When `--dry-run` is set:

1) The config file is parsed and printed with sensitive fields redacted.
2) The signer is parsed to validate the private key.
3) The peer list is loaded and validated.
4) `validate_with_signer` is called with peer count.
5) The indexer client is created to ensure the indexer endpoint is reachable.
6) A report is printed with key values (ports, storage, buffer pool size, consensus timeouts).
7) The process exits with "config ok".

This mode is ideal for CI and deployment pipelines. It prevents you from launching a node that will crash immediately or misbehave.

### 6.1 Dry-run report fields

The dry-run report prints details that are easy to miss when reading YAML. Examples:

- Buffer pool page size and total capacity, shown in human-readable units.
- Freezer table initial sizes (block and finalized tables).
- Consensus timeouts and fetch parameters.
- Mempool backlog sizes and transaction limits.
- Nonce cache capacity and TTL.

This report is a quick sanity check: it tells you whether the config values are reasonable for your hardware. If a value is wildly wrong (for example, a buffer pool of 0 or 1 GiB when you expected 64 MiB), you will see it before joining the network.

### 6.2 Formatting helpers in the entrypoint

The entrypoint includes a small helper `format_bytes` to produce human-friendly output. This is not critical to consensus, but it is critical to operator usability. A config value of `67108864` is not easy to parse; `64 MiB` is.

This is a recurring theme: the entrypoint is designed not only for correctness, but also for operator clarity.

---

## 7) Metrics authentication: fail fast in production

Before starting the runtime, the node enforces metrics auth token requirements:

```rust
fn ensure_metrics_auth_token() -> Result<()> {
    let require_token = is_production()
        || matches!(std::env::var("NODE_REQUIRE_METRICS_AUTH").as_deref(), Ok("1") | Ok("true") | Ok("yes"));
    if require_token && metrics_auth_token().is_none() {
        anyhow::bail!("METRICS_AUTH_TOKEN must be set when metrics auth is required");
    }
    Ok(())
}
```

Why this matters:

- Metrics reveal internal state and performance.
- Exposing them without authentication is a security risk.
- The code forces you to set a token when running in production.

This is a small but important production hardening step.

---

## 8) Runtime setup: commonware tokio runner

The node uses `commonware_runtime::tokio::Runner` rather than raw Tokio. This gives a structured runtime with built-in metrics and labels.

The configuration includes:

- TCP nodelay
- Worker thread count
- Storage directory
- Panic catching

This is a production-grade runtime configuration. It is not just about performance; it is also about visibility and safe shutdowns.

Once the runtime starts, the rest of the initialization happens inside `executor.start`.

---

## 9) Telemetry and tracing

Inside the runtime, telemetry is initialized before any major work is done:

- Log level is parsed from config.
- Logging is optionally structured JSON if a hosts file is used (deployer workflow).
- An OpenTelemetry trace config is created if `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

This means:

- Logs are available from the start of boot.
- Traces can be exported if configured.

The trace configuration uses a sampling rate from `OTEL_SAMPLING_RATE` and a service name from `OTEL_SERVICE_NAME`. If you set these env vars, the node will emit traces; if you do not, tracing is disabled. This is a safe default.

### 9.1 Trace configuration details

The trace config is built by `resolve_trace_config`:

- It checks `OTEL_EXPORTER_OTLP_ENDPOINT`.
- If missing or empty, tracing is disabled.
- If present, it clamps the sampling rate between 0.0 and 1.0.

This is important because tracing can be expensive. The sampling rate lets you trade off observability and overhead. In production, a sampling rate like 0.1 or 0.01 might be sufficient for performance-sensitive environments.

---

## 10) Metrics server: axum + commonware metrics

The node starts a metrics server with Axum. The handler does three jobs:

1) Checks auth token (if configured) in either `Authorization` or `x-metrics-token` header.
2) Encodes metrics from the runtime context (`context.encode()`).
3) Returns Prometheus text format.

The server binds to `0.0.0.0:<metrics_port>`. If it fails to bind, it logs an error but does not crash the node. This is an intentional tradeoff: metrics are important, but they are not worth stopping the node in some deployments.

This server is a concrete example of how Commonware runtime metrics are surfaced to the outside world.

### 10.1 The metrics handler: how auth works

The metrics handler reads headers and checks two possible auth formats:
- `Authorization: Bearer <token>`- `x-metrics-token: <token>`
If neither matches, it returns `401 Unauthorized`. This mirrors the auth pattern used in other services (`services/auth` and `services/ops`).

Why two headers? It gives flexibility for different scrapers. Some Prometheus setups can inject custom headers; others are easier with bearer tokens. Supporting both makes the system easier to deploy without changing the code.

### 10.2 Error handling in the metrics path

If building the response fails, the handler logs an error and returns `500`. If binding the listener fails, the metrics server logs the error and returns. It does not crash the node.
This is a conscious decision: metrics are critical, but they are not more important than the node itself. If metrics fail to bind due to a port conflict, the node can still participate in consensus.

---

## 11) Loading peers and bootstrappers

Peers can be loaded from two sources:

- **Hosts file** (`commonware_deployer::ec2::Hosts`): typically produced by deployment tooling.
- **Peers file** (`nullspace_node::Peers`): a YAML list of public key to socket address mappings.

The code is careful to:

- Parse public keys with `parse_peer_public_key`.
- Skip entries that are not valid peers.
- Build a `HashMap<PublicKey, SocketAddr>`.

Bootstrappers are then resolved by matching a list of public key strings to addresses in the peers map.

Finally, the node determines its own IP by finding its public key in the peers map. If it cannot find itself, it fails early.

This is critical: a node must know its own external address for P2P networking.

### 11.1 Bootstrappers: the first contact points

Bootstrappers are peers that help nodes find the rest of the network. The code resolves bootstrappers by looking up their public keys in the peers map. This ensures that bootstrappers are not arbitrary endpoints; they are part of the authorized peer set.

This reduces the risk of misconfiguration: you cannot accidentally bootstrap to an unknown or untrusted node unless it is in your peers list. It also ensures that bootstrappers and peers remain consistent across deployments.

### 11.2 Peer list normalization

The node constructs a `HashMap<PublicKey, SocketAddr>` and then derives a `Vec<PublicKey>` from the keys. Later, this vector is converted into an ordered set. That conversion enforces a strict ordering and uniqueness constraint, which is essential for deterministic behavior in consensus.

If the peer list is not sorted or has duplicates, the node fails early. This is one of the subtle but critical correctness checks.

---

## 12) P2P network configuration

Once the peers are loaded, the P2P network is configured. The key steps are:

1) Create a P2P namespace using `union_unique(NAMESPACE, b"_P2P")`.
2) Build the authenticated network config using `authenticated::Config::recommended`.
3) Set mailbox size and max message size.
4) Start the network and get the `network` and `oracle` handles.

The `oracle` is used to update the authorized peer set. This is important: the network is authenticated, so only peers in the authorized set can communicate.

The code builds an ordered set of peers (`commonware_utils::ordered::Set`) and updates the oracle. If peers are not sorted and unique, it fails. That enforces deterministic peer ordering, which is important for consensus and reproducibility.

### 12.1 Namespace separation for P2P traffic

The P2P namespace is created by `union_unique(NAMESPACE, b\"_P2P\")`. This is domain separation. It ensures that the P2P network is cryptographically separate from other protocol namespaces.
This matters because the same cryptographic keys could be used for multiple protocols. Namespacing prevents cross-protocol signature reuse, similar to the transaction namespace in the execution layer.

---

## 13) Channel registration and quotas

This is one of the most important sections of the file. The node registers multiple network channels, each with its own rate limit and backlog. The channels are:

- `PENDING_CHANNEL`: pending transactions.
- `RECOVERED_CHANNEL`: recovered or backfilled data.
- `RESOLVER_CHANNEL`: resolution requests.
- `BROADCASTER_CHANNEL`: broadcast messages.
- `BACKFILL_BY_DIGEST_CHANNEL`: backfill by digest.
- `SEEDER_CHANNEL`: seed-related traffic.
- `AGGREGATOR_CHANNEL`: aggregation requests.
- `AGGREGATION_CHANNEL`: aggregation results.

Why this matters:

- Each channel is a separate queue with its own quota.
- Heavy traffic in one category cannot starve the others.
- It is a form of flow control for the network.

For example, if backfill traffic spikes, it does not prevent pending transactions from being received. This separation is a core reliability mechanism.

Each channel uses `Quota::per_second(...)` and a shared `message_backlog` to handle bursts. These values come from the config, which means operators can tune them per environment.

### 13.1 Backfill and aggregation channels

Notice that backfill-related channels (backfill, seeder, aggregator) share the same quota. This is an intentional grouping: these channels often deal with large data transfers and should be rate-limited together. The aggregation channel has its own quota because aggregation traffic is more sensitive to latency and less tolerant of backfill spikes.

This is a subtle design choice. It shows how the system encodes operational priorities into network configuration.

---

## 14) Engine configuration: the heart of the node

After networking is configured, the node builds an `engine::Config` with several nested configs:

### 14.1 Identity config

Includes:

- Signer
- Sharing and share values
- Participant list

This tells the consensus engine who we are and who we are running with.

### 14.2 Storage config

Includes:

- Partition prefix
- Freezer table sizes
- Buffer pool sizes
- MMR and log section sizes
- Cache sizes
- Replay and write buffers

These settings control storage performance and durability. They are the knobs you tune for disk throughput and memory usage.

### 14.3 Consensus config

Includes:

- Mailbox size
- Backfill quota
- Timeouts (leader, notarization, fetch)
- Fetch limits and concurrency
- Per-peer fetch rate limit

These settings control the consensus protocol's timing behavior and network load. Misconfiguring them can lead to stalls or excessive network chatter.

### 14.4 Application config

Includes:

- Indexer client
- Execution concurrency
- Mempool limits
- Seed listener limits
- Nonce cache settings
- Proof queue size

This bridges consensus with application logic (execution and indexer integration). It ensures the engine has the resources it needs to process transactions and produce outputs.

### 14.5 Indexer client: why it is created here

The entrypoint creates an indexer client (`nullspace_client::Client`) before building the engine. This is not just a convenience. It ensures that the indexer endpoint is reachable and that the engine has a valid client for state queries and indexing.
If the indexer is unreachable, the node fails early, which is preferable to running in a degraded state where indexing silently fails.


---

## 15) Starting the engine and the network

Once the config is built:

1) `engine::Engine::new` is called to construct the engine.
2) `engine.start` is called with all the network channels.
3) `network.start()` returns a task handle for the P2P subsystem.
4) The code waits for both tasks (`p2p` and `engine`) using `try_join_all`.

If any task fails, it logs an error. This is a simple supervision mechanism. It does not attempt automatic restarts, but it ensures failures are visible.

The key idea: the node is a composition of long-running tasks. The entrypoint's job is to wire them together and then wait.

### 15.1 Task supervision and failure strategy

The entrypoint uses `try_join_all` to wait on both the P2P task and the engine task. If either task errors, it logs the error. It does not attempt auto-restart.
This is a minimal supervision strategy. In production, you typically rely on an external process supervisor (systemd, Kubernetes) to restart the node if it exits. The entrypoint therefore focuses on clear logging rather than complex restart logic.

---

## 16) Error handling and failure visibility

Throughout the file, errors are handled in a consistent way:

- Use `anyhow::Context` to attach descriptive error messages.
- Log errors with `error!(?e, ...)` when inside the runtime.
- Fail fast before runtime start if config or environment is invalid.

This design gives two layers of safety:

- Operators get human-readable errors during startup (e.g., missing config).
- Runtime errors are logged with structured context.

This is good engineering hygiene and makes operations much easier.

### 16.1 Common startup failures

From experience, the most common startup failures are:
- Missing metrics auth token in production.- Invalid signer key or malformed config.- Peers list that does not include the node's own public key.- Port conflicts (metrics or P2P).- Indexer endpoint unreachable.
The entrypoint prints or logs helpful errors for each of these. The dry-run mode is the fastest way to catch most of them.


---

## 17) Why this entrypoint is a reliability boundary

This file is not just glue code. It is the boundary where configuration, runtime, and network meet. Small mistakes here can cause large failures:

- Wrong peer list: node cannot connect or may connect to wrong peers.
- Misconfigured quotas: can starve important traffic.
- Wrong identity: node may sign incorrectly or be rejected.
- Missing metrics token: node fails to start in production.

That is why the file includes dry-run mode, validation checks, and clear logging. These are not optional conveniences; they are reliability mechanisms.

### 17.1 Operational checklist for node startup

Before starting a node in production, verify:
- `--config` points to the correct environment file.- `--hosts` or `--peers` includes the node's public key.- `METRICS_AUTH_TOKEN` is set if production.- The metrics port and P2P port are open and not in use.- The storage directory has enough disk space.
These checks are the practical translation of the entrypoint's validation logic into an operator checklist.

---

## 18) Feynman recap: explain it like I am five

- The node starts by reading a config file.
- It checks that the config and peer list make sense.
- It starts logging and a metrics server.
- It creates a network with separate lanes for different messages.
- It starts the engine and waits for it to run.

---

## 19) Exercises (to build mastery)

1) Run the node in dry-run mode and compare the printed config report to the YAML file. Which fields are derived and which are direct?

2) Find where the P2P namespace is created and explain why `union_unique(NAMESPACE, b"_P2P")` is used instead of a raw string.

3) Identify all P2P channels and their quotas. Which channel would be most sensitive to misconfiguration and why?

4) Walk through the engine config and list which fields come from storage, consensus, and application.

---

## Next lesson

E04 - Consensus pipeline + seeding: `feynman/lessons/E04-consensus-seeding.md`
