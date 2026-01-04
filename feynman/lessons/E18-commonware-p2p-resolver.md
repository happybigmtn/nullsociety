# E18 - Commonware P2P + resolver + broadcast (textbook-style deep dive)

Focus files: `node/src/main.rs`, `node/src/engine.rs`, `node/src/aggregator/actor.rs`

Goal: explain authenticated P2P networking, channelization, resolver/backfill, and broadcast buffering with concrete code walk-throughs. This chapter should read like a textbook: start with the network model, then map each concept to the real code used by the node.

---

## 0) Big idea (Feynman summary)

The P2P layer is not "one socket." It is a traffic control system:

- Authentication keeps strangers out.
- Channels split traffic into lanes so one message type cannot jam everything.
- Quotas cap how fast each lane can run.
- Resolvers fetch missing data with retries.
- Broadcast buffers deliver near-tip data efficiently.

If you can explain those five ideas, you can understand the P2P code in this repo.

---

## 1) Why authenticated P2P matters

### 1.1 The validator set as a security boundary

Consensus assumes a known validator set. If arbitrary peers can connect, they can:

- send spam messages,
- fake votes,
- waste bandwidth,
- and slow down consensus.

Authenticated P2P enforces that only known public keys can participate. That is the first line of defense.

### 1.2 The practical outcome

In our node, authenticated P2P means:

- Every connection is tied to a public key.
- Peers are admitted only if they are in the allowed set.
- The network namespace is unique per chain, so nodes on different networks do not collide.

---

## 2) Channels: splitting traffic into lanes

### 2.1 Why channels exist

Not all messages are equal. A validator handles:

- mempool transactions,
- block proposals,
- block recovery,
- backfill requests,
- aggregation certificates,
- proof exchange,
- seeds and summaries.

If these all share one queue, a flood of low-priority messages can block high-priority ones. That is how network stalls happen.

### 2.2 The channel design in our node

In `node/src/main.rs`, the node registers eight channels:

- pending
- recovered
- resolver
- broadcast
- backfill
- seeder
- aggregator
- aggregation

Each channel has its own quota and backlog cap. This is a fairness mechanism: heavy traffic in one channel does not starve the others.

---

## 3) Walkthrough: channel registration in `main.rs`

The `main.rs` boot sequence shows the full channel setup. The core pattern is repeated for each channel:

1) Build a `Quota` (rate limit per second).
2) Register the channel with a backlog size.
3) Keep the sender/receiver pair for later.

Example (conceptual):

- `pending_limit = Quota::per_second(config.pending_rate_per_second)`
- `pending = network.register(PENDING_CHANNEL, pending_limit, config.message_backlog)`

This is the exact moment where policy becomes code. The quotas and backlog sizes in `docs/limits.md` are applied here.

### 3.1 Backfill and aggregation channels

Notice that `backfill`, `seeder`, and `aggregator` channels are created with the same `backfill_quota`. This is deliberate: these channels are all related to synchronization and recovery. They should be allowed to run, but they should not overwhelm the system.

### 3.2 Broadcast channels

The broadcast channel is used for near-tip block propagation. It has its own quota because near-tip traffic is latency sensitive. You want broadcasts to move quickly, but you still need to cap them so a malicious peer cannot flood your buffer.

### 3.3 Quotas and backlogs as a queueing model

Quotas (`Quota::per_second`) define the maximum sustained rate for a channel. Backlogs define how much burst is tolerated. Together they implement a simple queueing system:

- If arrivals stay below the quota, the channel drains smoothly.
- If arrivals spike above the quota, messages accumulate in the backlog.
- If the backlog fills, new messages are rejected or delayed.

This is the key to predictable behavior. Without quotas and backlogs, a single peer could generate unbounded work. With them, every channel has a defined budget.

In practice, you tune backlogs for burst tolerance (for example, a leader can send a burst of broadcasts) and quotas for long-term fairness (for example, backfill should never exceed a steady rate). That is why these are separate values in config.

---

## 4) Authenticated P2P configuration

### 4.1 Namespace isolation

The node builds a P2P namespace using:

```
let p2p_namespace = union_unique(NAMESPACE, b"_P2P");
```

This prevents nodes from accidentally speaking to peers from other networks. The namespace is effectively a network ID.

### 4.2 Bootstrappers and peers

The authenticated network is created with a set of bootstrappers (known peers) and an explicit peer set. The `oracle.update` call pushes the allowed peer set into the network's admission rules.

This means:

- A node can only talk to peers in the allowed list.
- If a peer key is missing or unsorted, the node fails fast.

This is not just defensive programming. It is part of the consensus trust model.

### 4.3 Listening vs advertised addresses

The P2P config specifies both a listen address (where the node binds) and an advertised address (what peers should dial). In `main.rs` these are built as:

- listen: `0.0.0.0:port` (accept connections on all interfaces)
- advertise: `ip:port` (the node's public or private address)

This distinction matters in real deployments where the node may be behind NAT or have multiple interfaces. If the advertised address is wrong, peers cannot reach you even though you are listening locally. The explicit configuration prevents that subtle failure.

---

## 5) Broadcast buffering (`node/src/engine.rs`)

The engine uses Commonware's `commonware_broadcast::buffered` primitive. This is a broadcast buffer that sits between consensus and the P2P network.

### 5.1 Why a broadcast buffer

Broadcast traffic has two tricky properties:

1) It is time-sensitive (near-tip blocks must propagate quickly).
2) It can be bursty (a leader may broadcast multiple blocks or votes in quick succession).

A buffer smooths bursts and enforces ordering and priority rules. It prevents the network from being overwhelmed and provides a consistent API to the consensus engine.

### 5.2 Buffer configuration

In `engine.rs`:

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

Key details:

- **mailbox_size** controls how many broadcast requests can queue.
- **deque_size** limits the internal buffer length.
- **priority: true** means urgent messages are promoted.

This is a concrete example of how the runtime enforces fairness. The buffer is a bounded queue with explicit priority behavior.

### 5.3 Why priority matters

The `priority: true` flag means the buffer will prefer more urgent items. In practice, that usually means items closer to the chain tip are forwarded first. This reduces the chance of a node falling behind because it is stuck relaying old blocks.

Priority also interacts with backpressure: if the buffer is full, low-priority items are dropped or delayed in favor of high-priority ones. This is a deliberate tradeoff. In a distributed system, you almost always prefer fresh data over stale data.

---

## 6) Resolver and backfill: getting missing data

### 6.1 The resolver concept

A resolver is a subsystem that fetches missing items from peers. It is used in multiple places:

- To backfill missing blocks or certificates.
- To respond to on-demand proof requests.

Resolvers are not one-off RPC calls. They are stateful: they track which items are missing, retry with backoff, and manage timeouts.

### 6.2 Marshal resolver in `engine.rs`

The marshal actor is responsible for block storage and finalization. If it detects missing items, it uses a P2P resolver to fetch them. The resolver is initialized with:

- a manager (peer supervisor),
- a blocker (authorization),
- mailbox size,
- initial and retry timeouts,
- whether requests are prioritized.

This resolver uses the backfill network channel, which is separate from broadcast. That isolation is important: backfill traffic should not delay live broadcasts.

### 6.3 Aggregator resolver in `aggregator/actor.rs`

The aggregator actor uses `commonware_resolver::p2p` to fetch missing aggregation certificates. The actor:

- tracks missing certificates in a set,
- enqueues fetch requests,
- keeps a waiting set to avoid duplicates,
- updates metrics as certificates arrive.

This is exactly what "resolver" means in practice: a loop that keeps asking peers until missing items are filled.

### 6.4 Timeouts and retry behavior

Resolvers are configured with three time-related values that matter operationally:

- **initial**: how quickly to start trying to fetch after startup.
- **timeout**: how long to wait for a response before considering the attempt failed.
- **fetch_retry_timeout**: how long to wait before trying again.

These control the rhythm of recovery. If timeouts are too short, the resolver will spam peers and waste bandwidth. If timeouts are too long, recovery will be sluggish and the node will lag. The values in `engine.rs` (1s initial, 2s timeout, 10s retry) are a reasonable compromise for a private validator network.

The key point: recovery is not free. It must be paced just like live traffic. Resolvers are the pacing mechanism.

---

## 7) Backfill as a recovery path

Backfill is the recovery path for nodes that are behind. It is not part of the hot path for live consensus. That is why it has its own channel and quotas.

In the engine:

- Backfill traffic is rate-limited by `backfill_quota`.
- Backfill uses resolver logic with retries.

In the aggregator:

- Backfill is used for certificates and proofs.
- Missing items are fetched in batches (`BATCH_ENQUEUE`).

This design ensures recovery is consistent but controlled.

### 7.1 The difference between live and recovery traffic

Live traffic is latency-sensitive: block proposals, votes, and broadcasts must move quickly. Recovery traffic is throughput-sensitive: you want to fetch missing data efficiently without starving live work.

This is why backfill uses its own quota and channel. It allows the node to keep progressing even while it is recovering. In practice, this prevents a common failure mode: a recovering node consumes all bandwidth, causing the whole cluster to slow down.

---

## 8) P2P primitives in use

### 8.1 Sender/Receiver

Commonware P2P exposes `Sender` and `Receiver` traits. In the engine, these are wired into actors and consensus components. This allows each subsystem to send and receive only the message types it is supposed to handle.

### 8.2 Blocker

The `Blocker` trait is an authorization hook. It allows the engine to reject messages from unauthorized peers. This is the enforcement mechanism for the validator set.

### 8.3 Manager

The network manager handles peer membership and network status. The code uses the `oracle.update` call to push peer sets into the network. The result is a dynamic but controlled membership system.

### 8.4 What \"pending\" and \"recovered\" channels represent

These channels are used by the consensus engine to distinguish between new data and recovery data:

- **pending**: items that are new and should be processed quickly.
- **recovered**: items that were missing and have been fetched later.

This separation is subtle but useful. It lets consensus prioritize fresh proposals while still incorporating late-arriving information. It also allows operators to throttle recovery separately from live traffic.

---

## 9) Message flow overview

A simplified flow from the perspective of P2P channels:

1) A transaction arrives and goes into the pending channel.
2) Consensus proposes a block and broadcasts it through the broadcast buffer.
3) If a peer misses a block, it requests it via the resolver channel.
4) If a node is behind, it uses backfill and seeder channels to catch up.
5) Aggregation certificates flow through aggregator/aggregation channels and are uploaded to the indexer.

This is the layered network architecture: hot path (broadcast), recovery path (resolver/backfill), and external reporting (aggregation).

### 9.1 A concrete timeline example

Imagine a validator proposes a new block:

1) The consensus engine produces a proposal and hands it to the broadcast buffer.
2) The broadcast buffer sends it out through the broadcast channel.
3) Peers receive it and send votes.
4) If a peer missed the proposal (packet loss), it issues a resolver request on the resolver channel.
5) The proposer responds, and the peer catches up.
6) The block is finalized and stored; the aggregator stores proofs and eventually uploads a summary to the indexer.

This is the lifecycle of a single block in the P2P system. The important detail is that recovery (resolver) is parallel to live propagation (broadcast) and does not block it.

### 9.2 What happens when a node is far behind

If a node is many blocks behind, it does not request each missing block through the broadcast path. Instead, it uses backfill and seeder channels to pull larger chunks or seeds. This shifts the workload to the recovery lanes and avoids overwhelming the broadcast lane.

In practical terms, this is the difference between \"real time\" traffic and \"catch-up\" traffic. The architecture enforces that distinction.

---

## 10) Why this architecture is resilient

### 10.1 Preventing starvation

Because each channel is bounded and rate-limited, a flood on one lane does not starve the others. This is critical for Byzantine resilience. A malicious peer can attempt to spam, but the spam is contained by quotas.

### 10.2 Predictable recovery

Resolvers fetch missing items in bounded batches with explicit retry logic. This means recovery is steady and predictable rather than exponential chaos.

### 10.3 Clear operational knobs

Operators can tune:

- per-channel rate limits,
- backlog sizes,
- resolver timeouts,
- broadcast buffer sizes.

These knobs are in config and documented in `docs/limits.md`. That makes the system adjustable without code changes.

### 10.4 Attack and failure modes

This architecture is designed to contain common attack patterns:

- **Spam on one channel**: bounded by quota and backlog.
- **Slow peers**: cannot block fast peers because channels are per-peer and buffered.
- **Partitioned network**: recovery channels allow nodes to catch up once connectivity returns.
- **Misconfigured peer list**: the node fails fast instead of running with unknown peers.

The goal is not to make the network immune to every attack; it is to make failures predictable and local rather than cascading.

---

## 11) Concrete code walkthrough: engine run order

The engine start sequence in `engine.rs` is instructive:

1) Start system metrics.
2) Start seeder.
3) Start aggregation engine.
4) Start aggregator.
5) Start broadcast buffer.
6) Start application actor.
7) Initialize marshal resolver.
8) Start marshal actor.
9) Start consensus engine.

This ordering is intentional. If upstream actors start before downstream ones, they might fill mailboxes before anyone is listening. The comment in the code calls this out explicitly. Ordering is part of correctness.

---

## 12) Aggregator message handling as a case study

In `aggregator/actor.rs`, the message handler shows how P2P data is handled safely:

- `Certified` messages are verified and stored.
- `Deliver` messages decode and verify certificates.
- Missing items trigger resolver fetches.
- Uploads to the indexer happen in background tasks with retries.

Each step is guarded by checks (index matching, signature verification, storage sync). This is the P2P story in practice: accept, verify, store, then propagate to higher layers.

### 12.1 Certificate verification and namespace binding

The aggregator explicitly verifies certificates using a threshold scheme and a namespace. The namespace binds the certificate to this chain. This prevents replaying a certificate from another network. It is another example of why namespaces matter: they are not just labels, they are cryptographic domains.

This verification step is not optional. If the aggregator stored certificates without verification, it could poison the local state and cause inconsistent summaries. The runtime does not magically solve correctness; explicit verification does.

### 12.2 Proof caching as a network optimization

The aggregator caches proof bundles per block. These proofs are needed when external clients request state or events. By caching, the node avoids re-computing proofs repeatedly and can serve them quickly. The cache is bounded and pruned as summaries are uploaded, which keeps disk usage under control.

This is another example of using storage primitives to turn network traffic into a predictable workload.

---

## 13) Operational and security takeaways

- P2P authentication is non-negotiable for validator security.
- Channel quotas and backlogs are the primary defense against message floods.
- Broadcast buffers protect near-tip propagation under bursty conditions.
- Resolvers provide deterministic recovery and ensure state convergence.

If you see a node falling behind, the first thing to check is whether backfill channels are saturated or whether resolver timeouts are too low.

### 13.1 Observability signals for P2P

Operators should watch metrics that indirectly reflect P2P health:

- rate of peers blocked or denied,
- backlog sizes for pending and broadcast channels,
- resolver retry counts or delays,
- time between summary uploads.

If these metrics drift, the issue is often network or quota related, not consensus logic. The fastest fix is usually adjusting quotas or resolving peer connectivity.

### 13.2 Practical tuning checklist

When tuning P2P behavior, work from the outside in:

1) **Confirm peer connectivity**: verify the advertised address and that bootstrappers are reachable.\n2) **Check channel backlogs**: if broadcast backlogs grow, increase broadcast quota or investigate peer slowness.\n3) **Inspect resolver retries**: frequent retries indicate packet loss or timeouts that are too aggressive.\n4) **Balance backfill**: raise backfill quota only after ensuring it does not starve live traffic.\n5) **Validate message size limits**: if peers drop messages, confirm `max_message_size` matches across nodes.\n\nThe safest change is a small adjustment followed by observation. Because quotas are per second, doubling a quota can have a large effect on bandwidth usage. Always measure before and after.

---

## 14) Feynman recap

Commonware's P2P stack is built around safety and fairness. Authenticated peers define the trust boundary. Channels and quotas enforce traffic isolation. Broadcast buffers smooth bursts and keep the tip alive. Resolvers fetch missing data with retry logic so nodes can recover without stalling the network.

If you can describe how a missing block gets fetched and how a broadcast message gets queued, you understand the P2P design of this node.

In production, this understanding is practical. It tells you which knob to turn when the network slows: increase broadcast quota, relax resolver timeouts, or raise backfill limits only after you confirm the live path is healthy. The architecture gives you levers; the responsibility is to use them carefully.

That is how you keep the node both fast and predictable under real traffic.

It is the difference between brittle networking and resilient networking.

Operationally.
