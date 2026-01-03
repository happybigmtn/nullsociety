# E23 - Commonware broadcast + stream (textbook‑style deep dive)

Focus files: `node/src/engine.rs`, `Cargo.toml`

Goal: understand how the broadcast buffer is configured, started, and wired into the consensus pipeline, and why this matters for near‑tip propagation.

---

## 0) Big idea (Feynman summary)

Broadcast buffering is the “near‑tip cache” of a validator network:
- Consensus produces blocks.
- Broadcast buffers keep those blocks in memory.
- Peers can fetch from memory instead of disk, reducing latency.

This is a small subsystem, but it has a huge effect on network responsiveness.

---

## 1) Background: broadcast vs fetch

### 1.1 Gossip vs pull
- **Broadcast (gossip)** pushes data out to peers quickly.
- **Pull (fetch)** asks for data on demand.

Broadcast buffers sit between them:
- They are populated by broadcast.
- They serve fast pull requests for near‑tip data.

### 1.2 Why buffers exist
Without a buffer, every peer lag would trigger disk reads. That is expensive and slow.

Buffers trade memory for latency.

---

## 2) Buffer configuration (`node/src/engine.rs`)

### 2.1 Engine construction

Excerpt:
```rust
let (buffer, buffer_mailbox) = buffered::Engine::new(
    context.with_label("buffer"),
    buffered::Config {
        public_key: public_key.clone(),
        mailbox_size: cfg.consensus.mailbox_size,
        deque_size: cfg.consensus.deque_size,
        priority: true,
        codec_config: (),
    },
);
```

What each field means:
- **public_key**: used for peer identification.
- **mailbox_size**: how many incoming items the buffer can queue.
- **deque_size**: how many items each peer can be behind and still be served from memory.
- **priority**: prioritizes near‑tip peers when buffer pressure occurs.

### 2.2 Why `deque_size` matters
- Large `deque_size` = better catch‑up for lagging peers, higher memory.
- Small `deque_size` = lower memory, more disk reads for lagging peers.

---

## 3) Buffer startup (`engine.rs`)

### 3.1 Buffer is its own actor

Excerpt:
```rust
let buffer_handle = self.buffer.start(broadcast_network);
```

Meaning:
- The buffer runs as a standalone actor.
- It consumes the broadcast network channel and serves data.

### 3.2 Wiring into marshal
Marshal receives the buffer mailbox in its start call:

Excerpt:
```rust
let marshal_handle = self.marshal.start(
    self.application_mailbox,
    self.buffer_mailbox,
    marshal_resolver,
);
```

Interpretation:
- Marshal can publish finalized blocks directly to the buffer.
- This ensures newly finalized data is immediately available to peers.

---

## 4) The stream crate (availability)

In `Cargo.toml`, `commonware-stream` is included:
```toml
commonware-stream = { version = "0.0.64" }
```

We do not use it directly today. The significance is:
- It is available for future backpressure‑aware pipelines.
- If we add streaming‑heavy workloads, this is the natural tool.

---

## 5) Operational tradeoffs

- **Priority on**: keeps near‑tip peers synchronized, may starve laggards.
- **Mailbox size**: too small → buffer stalls; too large → memory spikes.
- **Deque size**: the key lever for near‑tip catch‑up performance.

---

## 6) Exercises

1) In `engine.rs`, trace every place the buffer mailbox is passed.
2) Identify which subsystem inserts blocks into the buffer.
3) Decide what deque size would be appropriate for a 1‑second block time.

---

## Next lesson
E24 - Commonware deployer + host discovery: `feynman/lessons/E24-commonware-deployer.md`
