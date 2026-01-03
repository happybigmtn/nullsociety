# E17 - Commonware runtime + scheduling (textbook‑style deep dive)

Focus files: `node/src/main.rs`, `node/src/application/actor.rs`, `node/src/aggregator/actor.rs`

Goal: read this like a chapter in a distributed systems textbook. We will explain the runtime model first (Feynman style), then walk through the exact code that boots and schedules our node.

---

## 0) Big idea (Feynman summary)

Think of Commonware’s runtime as a tiny operating system for the node:
- It **boots** a runtime with a structured `context`.
- It **schedules** long‑lived actors by spawning them with that context.
- It **measures** everything (metrics/telemetry) through the same context.
- It **throttles** work through quotas and mailboxes so one subsystem can’t starve the rest.

If you understand how the runtime and context are created, you understand *how every other subsystem is allowed to run*.

---

## 1) Distributed systems background: why a runtime matters

### 1.1 Concurrency is not optional
A validator is not a single loop. It must:
- accept P2P messages,
- produce blocks,
- verify blocks from peers,
- persist data,
- expose metrics,
- and recover missing data.

Those tasks must progress *concurrently*, or the node stalls.

### 1.2 Actors + mailboxes
An actor model gives each subsystem:
- its own mailbox (input queue),
- its own task (event loop),
- and a clear concurrency boundary.

Commonware’s runtime is the glue that keeps all actors running *and* lets them share instrumentation and storage safely.

---

## 2) The runtime boot sequence (`node/src/main.rs`)

We walk in the same order the code executes.

### 2.1 CLI + config gates
The node is started from `main_result` with explicit CLI flags.

Excerpt:
```rust
.arg(Arg::new("config").long("config").required(true))
```

Why this matters:
- The runtime is not allowed to boot without a config file.
- `--hosts` or `--peers` is required so the node knows the validator set.

### 2.2 Metrics auth gate
Before the runtime starts, we enforce metrics auth in production.

Excerpt:
```rust
ensure_metrics_auth_token()?;
```

Feynman explanation:
- Metrics are powerful: they can leak system topology or performance.
- So in production, the node refuses to start unless a token is configured.

### 2.3 Runner config and creation
The runtime is built with explicit configuration: thread count, storage dir, panic handling.

Excerpt:
```rust
let cfg = tokio::Config::default()
    .with_worker_threads(config.worker_threads)
    .with_storage_directory(PathBuf::from(&config.directory))
    .with_catch_panics(true);
let executor = tokio::Runner::new(cfg);
```

Interpretation:
- **worker_threads** controls CPU parallelism.
- **storage_directory** is used by Commonware storage components.
- **catch_panics** prevents the whole node from crashing on a task panic.

### 2.4 Runtime start closure = the boot script
This closure is the true entrypoint for the node’s subsystems.

Excerpt:
```rust
executor.start(|context| async move {
    let context = context.with_label("nullspace");
    // telemetry, metrics, p2p, engine...
});
```

Important idea:
- The runtime gives us a **context** object.
- That context is passed down to every subsystem.
- If a task doesn’t use this context, it is “outside the system” (no metrics, no tracing, no managed shutdown).

### 2.5 Metrics server is just another task
The metrics HTTP server is spawned *inside* the Commonware runtime.

Excerpt:
```rust
context.with_label("metrics").spawn(move |_context| async move {
    let listener = ::tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service()).await?;
});
```

Key idea:
- Even “side services” like metrics live inside the same runtime.
- This ensures consistent shutdown and instrumentation.

### 2.6 The engine config is the runtime contract
Later, the runtime closure builds `engine::Config` and calls `Engine::new`.

Excerpt:
```rust
let engine = engine::Engine::new(context.with_label("engine"), config).await;
```

Why it matters:
- This single config freezes **timeouts, buffers, quotas, and concurrency** for the entire node.
- If the runtime is the OS, the engine config is the process table.

---

## 3) Actor scheduling model (`node/src/application/actor.rs`)

### 3.1 The core pattern: spawn with context
Actors don’t spawn themselves with raw tokio. They use the Commonware context.

Excerpt:
```rust
context.spawn(move |context| async move {
    let mut actor = self;
    actor.context = context;
    actor.run(marshal, seeder, aggregator).await;
})
```

Feynman explanation:
- The actor is “reborn” with a new context that is owned by the runtime.
- This context will report metrics, logs, and handle shutdown.

### 3.2 Mailbox as the control plane
The application actor’s loop always waits on its mailbox.

Excerpt:
```rust
message = self.mailbox.next() => { /* handle */ }
```

Why this matters:
- The mailbox provides backpressure and ordering.
- It turns asynchronous events into a deterministic sequence of actions.

### 3.3 Actor scheduling and concurrency boundaries
Notice what *is not* happening:
- The actor does **not** spawn one task per incoming message.
- Instead, it stays in a single loop with carefully chosen async boundaries.

This keeps state transitions and proof generation consistent.

---

## 4) Aggregator scheduling model (`node/src/aggregator/actor.rs`)

The aggregator actor uses the same runtime pattern as the application actor.

Key pieces to read:
- `Actor::new` creates mailbox + metrics.
- `Actor::start` spawns on the runtime context.
- `run` initializes storage and resolver before entering the loop.

This is a recurring pattern across the stack:
- **All long‑running subsystems are actors.**
- **All actors are spawned by the Commonware context.**

---

## 5) Runtime guarantees and tradeoffs

### 5.1 Deterministic shutdown
Because every task is spawned from a context, the runtime can propagate shutdown signals in a controlled way.

### 5.2 Performance isolation
Mailboxes and quotas create pressure boundaries. If one subsystem slows down, it does not necessarily stall the others.

### 5.3 Debuggability
Every actor and subsystem can be traced through metrics + logs because they share the same context.

---

## 6) Exercises (serious understanding)

1) In `main.rs`, list every place the runtime context is cloned or labeled. Explain why each label exists.
2) In `application/actor.rs`, find the mailbox size and explain how it relates to backpressure.
3) In `aggregator/actor.rs`, find where metrics are registered and explain what they measure.

---

## Next lesson
E18 - Commonware P2P + resolver + broadcast: `feynman/lessons/E18-commonware-p2p-resolver.md`
