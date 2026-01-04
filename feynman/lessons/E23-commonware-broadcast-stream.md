# E23 - Commonware broadcast + stream (textbook-style deep dive)

Focus files: `node/src/engine.rs`, `Cargo.toml`

Goal: understand how the broadcast buffer is configured, started, and wired into the consensus pipeline, and why this matters for near-tip propagation. This chapter expands a small subsystem into a full design rationale.

---

## 0) Big idea (Feynman summary)

Broadcast buffering is the near-tip cache of a validator network:

- Consensus produces blocks.
- Broadcast buffers keep those blocks in memory.
- Peers can fetch from memory instead of disk, reducing latency.

This is a small subsystem, but it has a huge effect on network responsiveness and liveness.

---

## 1) Background: broadcast vs fetch

### 1.1 Gossip vs pull

- **Broadcast (gossip)** pushes data out to peers quickly.
- **Pull (fetch)** asks for data on demand.

Broadcast buffers sit between them:

- They are populated by broadcast.
- They serve fast pull requests for near-tip data.

### 1.2 Why buffers exist

Without a buffer, every peer lag would trigger disk reads. Disk is slow and variable. If you rely on disk for near-tip data, you increase latency and risk consensus timeouts.

Buffers trade memory for speed. That tradeoff is almost always worth it at the tip.

### 1.3 Broadcast as a liveness tool

In many BFT protocols, liveness is determined by how quickly proposals and votes propagate. A slow network causes missed timeouts and view changes. A fast broadcast path reduces those failures. The buffer is therefore part of the liveness mechanism, not just a cache.

This framing matters operationally: if your chain is sluggish, you often fix it by tuning broadcast, not by tuning consensus logic directly.

---

## 2) Broadcast buffer configuration (`node/src/engine.rs`)

### 2.1 Engine construction

The buffer is created in the engine constructor:

```
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

This tells you almost everything about the design:

- The buffer is an actor with a mailbox.
- It is bound to the node's public key.
- It has a bounded deque (limited memory).
- It prioritizes certain items.

### 2.2 Mailbox and deque size

The mailbox is the entry queue for broadcast requests. The deque is the internal buffer that stores recently broadcast items. Both are bounded by config. This is deliberate. A broadcast buffer must be finite or it becomes a memory leak.

The deque size is a policy decision: it defines how much near-tip history you keep in memory. A larger deque improves recovery for slightly behind peers, but uses more memory. A smaller deque is cheaper but forces more disk reads for lagging peers.

### 2.3 Priority mode

The `priority: true` flag means the buffer treats some items as more urgent than others. In practice, this usually means newer items are prioritized. When the buffer is full, older items are dropped or deprioritized. This preserves liveness by focusing on the tip.

### 2.4 Public key and codec configuration

The buffer is configured with the node's public key and a codec config. The public key is used to identify the originator when serving cached items to peers. The codec config ensures that serialized data matches the protocol's canonical encoding. This is a small but important detail: the buffer is not just a byte array; it is a protocol-aware component.

### 2.5 Deque eviction policy and fairness

Although the buffer does not expose its eviction policy directly in this file, the design implies a simple rule: when the deque is full, older items are dropped. This is the only policy that preserves near-tip freshness. If you tried to keep old items and drop new ones, you would harm liveness.

This is also a fairness mechanism. Every peer gets access to a window of recent items, but no peer can force the buffer to retain arbitrary history. That prevents a single lagging peer from imposing memory costs on the whole network.

---

## 3) Starting the buffer

In the engine `run` method, the buffer is started before consensus:

```
let buffer_handle = self.buffer.start(broadcast_network);
```

This is significant. If consensus starts broadcasting before the buffer is ready, messages could be dropped or stalled. Starting the buffer early ensures near-tip data is always available.

The buffer is connected directly to the broadcast P2P channel, which was registered in `main.rs`. That channel has its own quota and backlog, so broadcast traffic is isolated from other network traffic.

### 3.1 Start order prevents mailbox deadlocks

The engine starts the buffer before the consensus engine and before the marshal actor. This ordering avoids a class of startup bugs where upstream actors fill downstream mailboxes before they are listening. The comment in `engine.rs` calls this out explicitly: start downstream actors first to avoid blocking on mailboxes during initialization.

### 3.2 Backlog limits and burst control

The broadcast channel itself is rate-limited and has a backlog size. This means that even if the buffer produces a burst of messages, the network layer will apply backpressure. The combined effect is a two-stage throttle: the buffer limits memory, and the network limits throughput. This is deliberate defense-in-depth.

---

## 4) How broadcast fits into the pipeline

### 4.1 Marshal uses the buffer mailbox

The buffer mailbox is passed into the marshal actor when it starts:

```
let marshal_handle = self.marshal.start(
    self.application_mailbox,
    self.buffer_mailbox,
    marshal_resolver,
);
```

This means marshal can request and supply near-tip data through the buffer. In other words, the buffer is the fast path for both broadcast and retrieval of recent blocks.

### 4.2 Consensus relies on broadcast for liveness

Consensus liveness depends on fast dissemination of proposals and votes. The broadcast buffer is the mechanism that makes that dissemination fast and consistent. If the buffer is too small or too slow, consensus rounds will extend and timeouts will trigger.

That is why the buffer, though small, is critical for overall system health.

### 4.3 Buffer vs resolver: hot path and cold path

The buffer is the hot path. It serves recent items quickly. The resolver and backfill systems are the cold path: they fetch older items from disk or peers with retries. The buffer does not replace resolvers; it complements them. This two-path design is common in distributed systems because it optimizes for the common case (peers are slightly behind) without sacrificing correctness for the rare case (peers are far behind).

### 4.4 Step-by-step broadcast path

A concrete broadcast path looks like this:

1) The consensus engine produces a proposal or finalized block digest.
2) The application relay sends a broadcast request into the application mailbox.
3) The application actor forwards the broadcast into the buffer mailbox.
4) The buffer stores the item in its deque and publishes it to the broadcast network channel.
5) Peers receive the broadcast and update their local state.
6) If a peer needs the payload, it requests it; the buffer serves it from memory.

Notice that the buffer is not a passive cache. It actively participates in dissemination and in serving near-tip fetch requests. That is why it is placed directly on the broadcast channel rather than behind storage.

---

## 5) Stream semantics (why "broadcast + stream")

The broadcast buffer is not just a queue. It is effectively a streaming cache. Peers can request items by index or digest and receive them quickly from memory.

This is the "stream" aspect: the buffer allows peers to catch up by streaming recent items without going to disk. This is especially useful when a peer is only a few blocks behind.

In practice, the stream behavior reduces load on the storage subsystem and shortens recovery time. It is a classic design choice in distributed systems: keep the hot path in memory, keep the cold path on disk.

### 5.1 Backpressure in streams

Streaming also introduces backpressure. If peers consume data slower than it is produced, the buffer must decide whether to drop old items or slow down producers. The bounded deque is the backpressure mechanism. It defines how much slack the system tolerates before shedding load.

This is why deque size and broadcast quotas are linked. A large deque without sufficient quota can still lead to buildup. A high quota with a tiny deque can lead to frequent drops. The right balance is workload-specific.

### 5.2 Stream vs snapshot

The buffer provides a stream of near-tip items. This is different from a snapshot, which is a consistent point-in-time state. Streams are about moving data forward; snapshots are about pausing to inspect state. The broadcast buffer is optimized for streaming because consensus never pauses. It moves forward continuously.

This distinction matters because it affects how you handle catch-up. For a stream, you need sequential items and low latency. For a snapshot, you need consistency guarantees and possibly heavy storage access. The buffer focuses on the stream case.

### 5.3 Why not keep everything in the buffer

You might ask: why not keep a massive buffer and avoid disk entirely? There are two reasons:

1) Memory is finite, and other subsystems (mempool, caches, proof stores) also need memory.
2) The buffer is not meant to replace archival storage. It is a near-tip accelerator, not a full history store.

Keeping the buffer small and targeted makes the system predictable. It gives you a clear performance profile: recent data is fast, older data is still available but slower. That is a healthy tradeoff.

---

## 6) Why this matters for near-tip stability

### 6.1 Tip instability is expensive

If near-tip propagation is slow, validators will disagree on the latest block. That triggers view changes and reduces throughput. A slow tip is a consensus slowdown.

The broadcast buffer reduces this risk by keeping the most recent blocks in memory and serving them fast.

### 6.2 Buffer size as a liveness knob

A buffer that is too small forces frequent disk reads, which slows propagation. A buffer that is too large uses memory but improves liveness for slightly lagging peers. The correct size depends on expected network conditions and block rate.

In production, you tune this based on observed lag: if peers regularly fall a few blocks behind, increase the buffer. If peers are always current, you can reduce it to save memory.

### 6.3 A concrete lag scenario

Imagine a peer that disconnects for five seconds while blocks are produced every second. When it reconnects, it is five blocks behind. If the buffer holds at least five blocks, the peer can catch up entirely from memory. If the buffer only holds two blocks, the peer must fetch from disk or other peers, which is slower and may cause it to fall further behind. This is why buffer sizing should consider expected transient outages.

### 6.4 Latency budgets and jitter

Consensus timeouts are often on the order of seconds. That means the broadcast path must deliver proposals and votes in far less than a second. Jitter in the broadcast path eats into that budget. A buffer reduces jitter by smoothing bursts and serving from memory instead of disk.

Think of it as a latency stabilizer: it does not make the network faster in the average case, but it makes it more predictable in the worst case. Predictability is what keeps timeouts from firing unnecessarily.

### 6.5 View changes and broadcast backlog

During view changes, multiple leaders may propose in quick succession. This creates bursty broadcast traffic. The buffer's bounded deque and mailbox ensure that the burst is smoothed rather than exploding memory usage.

If the buffer is too small, view-change bursts can evict recent proposals before peers have a chance to fetch them. That leads to more resolver traffic and can slow convergence. This is another reason to size the buffer based on expected view-change behavior, not just on steady-state throughput.

---

## 7) Dependency management (`Cargo.toml`)

The broadcast buffer comes from the `commonware-broadcast` crate, which is pinned in `Cargo.toml`:

```
commonware-broadcast = { version = "0.0.64" }
```

This is a protocol dependency. Changes to the broadcast crate can affect message formats and behavior. That is why updates are coordinated carefully, and why the version is pinned rather than floating.

### 7.1 Versioning and compatibility

Because the broadcast buffer is part of the consensus data path, changes to the crate can affect interoperability. If one node runs a newer buffer implementation that encodes messages differently, it could fail to interoperate with older peers. This is why the dependency is pinned and why upgrades are coordinated with the rest of the Commonware stack.

---

## 8) Failure modes and recovery

### 8.1 Buffer overload

If broadcast traffic exceeds quotas or the buffer fills, new items will be dropped or delayed. This can lead to short-term liveness issues, but it is preferable to unbounded memory growth.

### 8.2 Disk fallback

When the buffer does not contain a requested item, the system falls back to disk via marshal and storage. This is slower but safe. The design ensures correctness even if the buffer is empty.

### 8.3 Restart behavior

Buffers are in-memory. After a restart, the buffer is empty and must be repopulated. This is why backfill and resolver logic still exist. The buffer is a speed optimization, not a correctness requirement.

### 8.4 Measuring buffer effectiveness

In an ideal world, most near-tip requests are served from the buffer. If you see frequent disk reads for recent blocks, the buffer is either too small or not wired correctly. Metrics around broadcast latency and request sources (buffer vs disk) are therefore critical.

Although the code in this repo does not yet expose explicit buffer hit metrics, you can infer buffer health from consensus latency and backfill rates. If backfill traffic spikes during normal operation, your buffer is likely undersized.

### 8.5 Buffer thrash and mitigation

Buffer thrash happens when the buffer is too small relative to the broadcast rate. Items are inserted and evicted so quickly that peers rarely find what they need. The symptoms are increased backfill traffic and longer consensus rounds. The fix is usually straightforward: increase the deque size and possibly the broadcast quota.

However, there is a tradeoff. A larger buffer uses more memory and may increase GC or allocator pressure. The right tuning requires observing both network latency and memory usage. This is why broadcast tuning is an operational responsibility, not a one-time configuration choice.

### 8.6 Testing buffer behavior

You can test buffer behavior by simulating peers that disconnect briefly and then rejoin. If they consistently need disk backfill for very recent blocks, the buffer is not doing its job. These tests can be run in deterministic simulations by controlling the broadcast rate and buffer size.

Treat the buffer like any other subsystem: test it under expected load and failure conditions, not just in a happy path.

### 8.7 Buffer correctness invariants

The buffer is not a source of truth. It is a cache. That means it must obey two invariants:

1) Items must be served exactly as they were broadcast.
2) Dropping an item must not corrupt any other item.

These invariants seem obvious, but they are worth stating because buffer bugs can be subtle. A corrupted buffer item can propagate quickly and cause widespread verification failures. This is why the buffer is implemented as a dedicated engine with explicit codec configuration.

---

## 9) Operational tuning checklist

- Increase `deque_size` if peers often need recent blocks after short disconnects.
- Increase broadcast channel quota if broadcasts are delayed.
- Monitor memory usage to ensure the buffer does not crowd out other critical caches.
- Use metrics to detect if the buffer is serving most near-tip requests; if not, you are falling back to disk too often.

### 9.1 CPU vs memory tradeoff

Buffers trade memory for CPU and IO savings. A larger buffer reduces disk reads and speeds up peers, but it increases memory usage. In practice, memory is often cheaper than consensus liveness, so you err on the side of a slightly larger buffer in production. The key is to ensure that the buffer does not starve other critical caches such as the mempool or proof cache.

### 9.2 Monitoring signals

Even without explicit buffer hit metrics, you can monitor broadcast latency and backfill rates. If broadcast latency grows or backfill traffic spikes during normal operation, the buffer is likely undersized or overloaded. These are the practical signals operators can use to tune the system.

### 9.3 A simple tuning example

Suppose your block time is 1 second and peers occasionally disconnect for 3 to 5 seconds. Start with a buffer size of 8 to 10 blocks so most reconnects can be served from memory. If you see backfill spikes after these transient disconnects, increase the buffer. If memory pressure becomes a problem, consider lowering the buffer or reducing broadcast rate by lowering block size.

The point is not to guess. Use observed lag and memory usage to drive tuning. The broadcast buffer is one of the few knobs that directly affects user-facing latency, so it is worth tuning carefully.

---

## 10) Feynman recap

The broadcast buffer is the near-tip cache of the network. It is configured in `engine.rs`, started early, and wired into marshal and consensus. It keeps recent data in memory so peers can fetch it quickly. The buffer is bounded and prioritized, trading memory for liveness.

If you can explain why the buffer exists and how it is configured, you understand a key part of the node's performance and stability story.

The broadcast buffer is a small component, but it shapes the entire system's feel. When it is tuned well, the chain feels snappy and stable. When it is tuned poorly, everything feels sluggish even if the consensus algorithm is correct.

Treat it as a performance primitive: measure it, stress it, and revisit its settings as your network grows. It is one of the easiest places to buy liveness with a small amount of memory.

That is why we treat it as part of the consensus pipeline.

It is small but decisive.
