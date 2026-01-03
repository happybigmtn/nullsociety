# E18 - Commonware P2P + resolver + broadcast (textbook‑style deep dive)

Focus files: `node/src/main.rs`, `node/src/engine.rs`, `node/src/aggregator/actor.rs`

Goal: explain authenticated P2P networking, channelization, resolver/backfill, and broadcast buffering with concrete code walk‑throughs.

---

## 0) Big idea (Feynman summary)

The P2P layer is not “one socket.” It is a **traffic control system**:
- **Authentication** keeps strangers out.
- **Channels** split traffic into lanes so one message type can’t jam everything.
- **Quotas** cap how fast each lane can run.
- **Resolvers** fetch missing data with retries.
- **Broadcast buffers** deliver near‑tip data efficiently.

---

## 1) Distributed systems background: membership and P2P

### 1.1 Why authenticate peers?
Consensus is only safe if you know who is participating. Anonymous peers would allow:
- Sybil attacks (many fake peers).
- Resource exhaustion.
- Invalid consensus participation.

Authenticated P2P makes the validator set the security boundary.

### 1.2 Why channels?
Messages in a blockchain are not equal:
- Mempool submissions can be huge.
- Block broadcasts are time‑critical.
- Backfill requests can be slow and heavy.

Channels isolate these classes so heavy backfill doesn’t block new blocks.

### 1.3 Why quotas?
Without quotas, a single peer can saturate your CPU and memory. Quotas give explicit, tunable backpressure.

---

## 2) Boot path for P2P (`node/src/main.rs`)

### 2.1 Namespace isolation

Excerpt:
```rust
let p2p_namespace = union_unique(NAMESPACE, b"_P2P");
```

Explanation:
- Commonware uses namespaces to separate signature domains.
- P2P traffic is isolated from transaction or consensus signatures.

### 2.2 Recommended network configuration

Excerpt:
```rust
let mut p2p_cfg = authenticated::Config::recommended(
    config.signer.clone(),
    &p2p_namespace,
    SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), config.port),
    SocketAddr::new(ip, config.port),
    bootstrappers,
    max_message_size,
);
```

Key pieces:
- **signer**: your identity on the network.
- **bind address**: what you listen on.
- **advertised address**: what other peers connect to.
- **bootstrappers**: seed peers for discovery.
- **max_message_size**: guardrail against oversized messages.

### 2.3 Starting the network and oracle

Excerpt:
```rust
let (mut network, mut oracle) = authenticated::Network::new(context.with_label("network"), p2p_cfg);
```

Interpretation:
- `network` = channel registration + message router.
- `oracle` = “who is allowed to talk” list.

### 2.4 Registering authorized peers

Excerpt:
```rust
let peers_set = commonware_utils::ordered::Set::try_from(peers.clone())?;
oracle.update(0, peers_set).await;
```

Why it matters:
- Peer lists must be **sorted and unique**.
- The node refuses to start otherwise, because ordering is part of consensus identity.

---

## 3) Channelization + quotas (`node/src/main.rs`)

For each traffic class, the node registers a channel:

Excerpt:
```rust
let pending_limit = Quota::per_second(config.pending_rate_per_second);
let pending = network.register(PENDING_CHANNEL, pending_limit, config.message_backlog);
```

Channels in this node:
- **PENDING**: incoming mempool transactions.
- **RECOVERED**: recovered messages.
- **RESOLVER**: consensus resolver requests.
- **BROADCASTER**: near‑tip propagation.
- **BACKFILL**: requests by digest.
- **SEEDER**: randomness seeds.
- **AGGREGATOR / AGGREGATION**: aggregation proofs and certificates.

Each channel has:
- a **quota** (`Quota::per_second`),
- a **backlog size** (`config.message_backlog`).

Tradeoff:
- Large backlog absorbs spikes but increases memory.
- Small backlog provides fast pressure but can drop data during spikes.

---

## 4) Resolver engines (missing data recovery)

### 4.1 Aggregator resolver (`node/src/aggregator/actor.rs`)

Excerpt:
```rust
let (resolver_engine, mut resolver) = p2p::Engine::new(
    self.context.with_label("resolver"),
    p2p::Config {
        manager: self.config.supervisor.clone(),
        blocker: self.config.supervisor.clone(),
        consumer: self.inbound.clone(),
        producer: self.inbound.clone(),
        mailbox_size: self.config.mailbox_size,
        me: Some(self.config.public_key.clone()),
        initial: Duration::from_secs(1),
        timeout: Duration::from_secs(2),
        fetch_retry_timeout: Duration::from_secs(10),
        priority_requests: false,
        priority_responses: false,
    },
);
```

Explanation:
- **manager/blocker**: who is in the peer set and who can be blocked.
- **consumer/producer**: the mailbox endpoints for requests and responses.
- **timeouts**: how aggressive retries are.

### 4.2 Marshal resolver (`node/src/engine.rs`)

Excerpt:
```rust
let marshal_resolver = marshal::resolver::p2p::init(
    &self.context,
    marshal::resolver::p2p::Config { /* ... */ },
    backfill_network,
);
```

Why it matters:
- Marshal must recover historical blocks and finalizations for late joiners.
- This uses a **dedicated backfill channel** so it doesn’t interfere with new blocks.

---

## 5) Broadcast buffering (`node/src/engine.rs`)

Broadcast buffering sits between block production and peer delivery.

Excerpt:
```rust
let (buffer, buffer_mailbox) = buffered::Engine::new(...);
```

Key properties:
- **deque_size** controls how far behind a peer can be and still catch up quickly.
- **priority** favors near‑tip peers.

The buffer is started as its own actor in `Engine::run`:
- `let buffer_handle = self.buffer.start(broadcast_network);`

---

## 6) Engine wiring: where channels go (`engine.rs`)

The engine receives all channels and hands them to the right actors:
- `consensus.start(pending, recovered, resolver)`
- `buffer.start(broadcast)`
- `marshal.start(..., buffer_mailbox, marshal_resolver)`

This wiring is the **map** of how data flows through the node.

---

## 7) Operational tradeoffs

- **Quota tuning** is a performance knob: too low stalls, too high overloads.
- **Resolver timeouts** determine recovery speed under packet loss.
- **Channel backlog** is the system’s memory safety net.

---

## 8) Exercises

1) List every channel and its purpose.
2) For each channel, identify its quota source in config.
3) Compare resolver timeout settings with production latency expectations.

---

## Next lesson
E19 - Commonware consensus + marshal: `feynman/lessons/E19-commonware-consensus-marshal.md`
