# E19 - Commonware consensus + marshal (textbook-style deep dive)

Focus files: `node/src/engine.rs`, `node/src/application/ingress.rs`, `node/src/aggregator/actor.rs`

Goal: read this like a consensus chapter. We cover the theory (views, rounds, finality), then walk through how Commonware wires consensus, marshal persistence, and aggregation certificates. This is not a 10,000 foot overview; it is a line-of-code level explanation of how the node reaches agreement and keeps that agreement durable.

---

## 0) Big idea (Feynman summary)

Consensus is the system that turns a flood of transactions into one ordered history. In our stack:

1) **Consensus (simplex)** decides which block is next.
2) **Application** builds and verifies blocks.
3) **Marshal** persists finalized blocks and supports backfill.
4) **Aggregation** produces compact certificates for client verification.

Each is isolated as an actor with its own mailbox. That separation is the main design choice: it keeps consensus, execution, and persistence loosely coupled but strictly ordered.

---

## 1) Consensus basics (distributed systems primer)

### 1.1 Views and rounds

BFT protocols progress through views or rounds. A view corresponds to a leader attempt. If the leader fails or is slow, the protocol moves to the next view with a new leader.

The key reason for views is liveness: you want to make progress even if some leaders are faulty. The protocol uses timeouts to detect when a leader is not making progress and to trigger a view change.

### 1.2 Propose, vote, and commit

A typical BFT flow looks like this:

1) A leader proposes a block.
2) Validators verify the proposal and send votes.
3) Votes are aggregated into a certificate.
4) Once the certificate reaches a quorum, the block is final.

The exact naming varies (prepare/commit, pre-vote/pre-commit), but the core logic is: collect enough votes to prove that a quorum agreed.

### 1.3 Deterministic finality

Deterministic finality means: once a block is finalized, it is never reverted. This is stronger than probabilistic finality and dramatically simplifies application logic. There is no need to handle reorgs.

In a game or financial system, deterministic finality is essential. You cannot pay out a bet and then roll it back later.

---

## 2) How Commonware structures consensus

Commonware splits consensus into multiple components:

- **simplex::Engine**: the BFT consensus state machine.
- **Automaton**: the application interface for proposing and verifying blocks.
- **Relay**: the broadcast interface for sharing digests.
- **Reporter**: the interface for delivering finalized blocks.
- **Marshal**: storage and backfill for finalized data.
- **Aggregation**: certificate generation and proof packaging.

This is a compositional design. Each piece has a clear API and can be tested independently.

---

## 3) Application ingress: how consensus talks to the app

File: `node/src/application/ingress.rs`

This file defines the adapter between consensus and the application actor. It implements Commonware consensus traits by translating consensus requests into mailbox messages.

### 3.1 The Message enum

The `Message` enum defines the commands that consensus can send to the application:

- `Genesis`: ask for the genesis digest.
- `Propose`: ask for a new proposal.
- `Ancestry`: ask to validate or compute ancestry.
- `Broadcast`: announce a digest to peers.
- `Verify`: validate a proposed digest.
- `Finalized`: deliver a finalized block.
- `Seeded`: notify the app of a seed update.

Each variant carries a `oneshot::Sender` so the application can respond asynchronously. This is the core mailbox pattern: requests in, responses out.

### 3.2 Mailbox and shutdown safety

The `Mailbox` wraps an `mpsc::Sender` plus a stop signal. Two helper methods are central:

- `send`: uses a `select!` to either send the message or return `ShuttingDown` if the node is stopping.
- `receive`: uses a `select!` to either receive the response or abort if stopping.

This is not just boilerplate. It prevents deadlocks during shutdown. If the runtime is stopping, the mailbox does not block waiting on a response that will never come.

### 3.3 Automaton implementation

The `Automaton` trait defines three key methods:

- `genesis`: return the genesis digest.
- `propose`: create a new payload for the current round.
- `verify`: verify a received payload.

The ingress implementation does the following:

1) Create a oneshot channel for the response.
2) Send a mailbox message.
3) If sending fails, return a fallback (parent digest or false).
4) Return the oneshot receiver to consensus.

That fallback behavior is important. If the application actor is unavailable, the consensus engine does not crash; it returns a safe fallback (for example, re-proposing the parent digest). This preserves safety even under partial failure.

### 3.4 Relay implementation

The `Relay` trait has a `broadcast` method. The ingress implementation simply sends a `Broadcast` message to the application actor. If it fails, the broadcast is dropped and a warning is logged.

This is a deliberate choice: if the application cannot broadcast, the network may slow, but the node should not crash. Broadcast is best-effort, not a safety requirement.

### 3.5 Reporter implementation

The `Reporter` trait is used to deliver finalized blocks. In the code:

- The update is matched.
- On `Update::Block`, a `Finalized` message is sent to the application.
- The response is awaited, then an acknowledgement is sent.

This ack matters. It tells the consensus engine that the application has processed the finalized block, which can be used to advance internal save points. It is a clean handshake between consensus and persistence.

---

## 4) Marshal: persistence and backfill

The marshal actor is responsible for storing finalized blocks and serving them for backfill. It sits between consensus and storage.

### 4.1 Marshal storage in `engine.rs`

In `engine.rs`, marshal storage is created with two archives:

- `finalizations_by_height`: an immutable archive keyed by height.
- `finalized_blocks`: a prunable archive keyed by digest.

The configuration includes:

- freezer table sizes,
- compression settings,
- buffer pools,
- replay buffers.

This is the durability layer. Once a block is finalized, marshal persists it in a way that is stable across restarts and supports queries by height or digest.

### 4.2 Why marshal is separate

Marshal is not part of the consensus engine because consensus should not be tied to any particular storage backend. By separating marshal, Commonware allows different storage strategies without changing consensus logic.

It also enables backfill. If a node is missing finalized blocks, marshal can serve them to peers through the resolver and backfill channels.

---

## 5) Consensus wiring in `engine.rs`

The engine is where everything is connected. The key wiring steps are:

1) Create application, seeder, aggregator actors.
2) Create the broadcast buffer.
3) Create marshal storage and marshal actor.
4) Create the simplex consensus engine.
5) Create the aggregation engine.
6) Start tasks in the correct order.

### 5.1 Application as automaton and relay

The simplex consensus engine is created with:

- `automaton: application_mailbox.clone()`
- `relay: application_mailbox.clone()`
- `reporter: (marshal_mailbox, seeder_mailbox)`

This means the application mailbox implements both the `Automaton` and `Relay` traits, and marshal/seeder receive reports. Consensus is therefore decoupled from the concrete application; it speaks to a mailbox interface.

### 5.2 Timeouts and activity windows

The consensus config includes:

- `leader_timeout`
- `notarization_timeout`
- `nullify_retry`
- `activity_timeout`
- `skip_timeout`
- `fetch_timeout`
- `fetch_concurrent`

These values control liveness. They are not part of safety, but they determine how quickly the protocol moves on from a faulty leader. If they are too small, you get thrashing. If they are too large, you get sluggishness.

The engine also uses a `SYNCER_ACTIVITY_TIMEOUT_MULTIPLIER` to extend activity timeouts for near-tip peers. This is a pragmatic decision: it gives more leeway for nodes that are slightly behind to catch up.

### 5.3 Consensus config as a safety budget

Each timeout in the config is a tradeoff between speed and stability:

- `leader_timeout`: how long to wait for a proposal before assuming the leader is slow.
- `notarization_timeout`: how long to wait for votes to aggregate.
- `nullify_retry`: how long to wait before retrying a nullified view.
- `activity_timeout`: how long before declaring a peer inactive.
- `skip_timeout`: how quickly to skip a leader that is unresponsive.
- `fetch_timeout`: how long to wait for a block or proof fetch.

In production, these timeouts define the liveness envelope. If the network latency spikes above these values, the protocol will cycle through views quickly. That can be good (avoid waiting on a dead leader) or bad (thrash when the network is just slow). This is why the defaults are conservative and why any change requires load testing.

The `fetch_concurrent` value is another budget: it caps how many fetches can be in flight. Too high, and you saturate bandwidth; too low, and recovery is slow. This is a classic backpressure knob.

### 5.4 FixedEpocher and epoch boundaries

The marshal config uses `FixedEpocher::new(NZU64!(u64::MAX))`. In plain words, this means the node treats the epoch as effectively infinite for now. That simplifies the consensus logic because the validator set does not change during normal operation. If you later introduce validator rotations, the epocher can become dynamic. Commonware makes this a distinct component so that epoch management can evolve without rewriting consensus or application logic.

---

## 6) Aggregation: certificates and proofs

The aggregation engine is created with:

- a monitor and provider (supervisors),
- the aggregator mailbox as automaton and reporter,
- a namespace and rebroadcast timeout,
- a journal for aggregation data.

The aggregation engine produces certificates and manages their dissemination. These certificates are used for client verification and cross-system proofs.

In `aggregator/actor.rs`, you can see the concrete handling:

- Certificates are verified and stored.
- Proof bundles are cached.
- Summaries are uploaded to the indexer with retries.

This is the last mile of consensus: it packages finalized results into forms that external systems can consume.

### 6.1 Certificate anatomy

An aggregation certificate typically includes:

- the block index or height,
- the digest of the block or result,
- a threshold signature over that digest.

The signature proves that a quorum of validators agreed. This is what makes the certificate useful to external clients. A client does not need to download the whole block history; it can verify the certificate against the known validator set and trust the result.

In `aggregator/actor.rs`, the `FixedCertificate` struct encodes this compact representation. The actor converts between the fixed format and the full certificate type for storage and transmission. This is a small but important optimization: storage and network costs scale with certificate size.

### 6.2 Proof bundles and client verification

Alongside certificates, the aggregator stores proof bundles: state proofs and event proofs. These proofs allow clients to verify that a particular state root or event set is consistent with the finalized block. Without proofs, clients must trust the node. With proofs, clients can verify independently.

The aggregator caches these proofs and uploads them as part of summaries. This is why it sits at the boundary between consensus and external consumers. The aggregator is not just a convenience; it is a cryptographic gateway for clients.

---

## 7) End-to-end flow: from proposal to finalized block

Putting it all together:

1) Consensus calls `propose` on the automaton (application ingress).
2) Application actor builds a candidate block and returns its digest.
3) Consensus broadcasts the digest using the relay.
4) Peers verify and vote.
5) Consensus aggregates votes and finalizes a block.
6) Reporter delivers the block to the application and marshal.
7) Marshal persists finalized blocks.
8) Aggregator stores proofs and uploads summaries.

This is the full path. Every step is a separate actor with a mailbox. That makes failures local and recovery possible without restarting the entire process.

### 7.1 A deeper trace of a single height

To make this concrete, imagine the network is about to finalize height H:

1) The consensus engine asks the application ingress to `propose` for round R.
2) The application actor selects transactions from the mempool and builds a block candidate.
3) The digest of that block is returned to consensus; consensus treats the digest as the payload.
4) Consensus broadcasts the digest through the relay path, which the application converts into a broadcast message.
5) Validators verify the block (using `verify`) and vote.
6) Once quorum votes are collected, a certificate is produced and the block is finalized.
7) The reporter path delivers the block to the application for execution and to marshal for persistence.
8) The aggregator stores proofs and the certificate, then uploads a summary for external clients.

Notice how the block itself is never sent directly by consensus. Consensus handles digests and certificates. The application and marshal handle the actual block content and execution. That separation makes the consensus engine small and easier to reason about.

### 7.2 Why digests are enough for consensus

Consensus only needs to agree on a digest because the digest is a commitment to the block content. If every validator has the same digest and the same block data, they are guaranteed to agree. The heavy payload is exchanged through backfill and broadcast channels, not inside the consensus state machine itself. This keeps the consensus logic lightweight and reduces the risk of denial-of-service attacks on the consensus loop.

In other words, consensus is about agreement on identifiers; the rest of the system is responsible for ensuring the identifiers correspond to real, well-formed blocks.

---

## 8) Application ingress details that matter

### 8.1 Fallback behavior is safety-critical

Notice how `propose` and `verify` return safe fallbacks if the mailbox send fails. This prevents consensus from panicking. In a distributed system, the node must always prefer a safe fallback over a crash.

### 8.2 Timers and latency metrics

Some messages include `histogram::Timer`. These are started when a request is issued and stopped when processing finishes. This gives you precise latency metrics for each phase of the consensus pipeline.

Latency is a correctness signal: if propose or verify latency spikes, consensus liveness will degrade. By instrumenting these timers, the runtime makes it observable.

### 8.3 Acknowledgements and save points

The `Reporter` implementation sends an acknowledgement after the finalized block is processed. This is how consensus knows it is safe to advance its internal save point. Without acknowledgements, consensus could race ahead of persistence and lose durability guarantees.

### 8.4 Backpressure from persistence

The acknowledgement mechanism also provides backpressure. If the application or marshal is slow to persist a block, the ack is delayed. That delay tells consensus to slow down, preventing the system from finalizing more blocks than it can store. This is a subtle but powerful safety feature: persistence speed limits consensus speed.

This is the right ordering for a production system. You always want durable storage to be the bottleneck, not the other way around.

---

## 9) Marshal and aggregation as durability boundaries

Consensus decides, but marshal and aggregation make the decision durable and externally verifiable. This separation is the essence of production systems:

- Consensus is about agreement.
- Marshal is about persistence.
- Aggregation is about proofs and consumption.

If you merge these concerns, you increase complexity and reduce testability. Commonware's separation is a deliberate design for safety.

### 9.1 Marshal backfill, repair, and retention

Marshal is configured with a `view_retention_timeout` and a `max_repair` budget. These two knobs define how aggressively the node repairs missing data and how long it retains view metadata for backfill. In `engine.rs`, the view retention timeout is derived from `activity_timeout` and multiplied to help near-tip peers. This means the node keeps enough recent data to help slow peers catch up without storing infinite history in memory.

The `max_repair` limit is a guardrail against runaway repair loops. If a node detects missing pieces, it can attempt repair up to a bounded limit. Beyond that, it should stop and surface an error. This prevents a corrupted or adversarial input from driving unbounded IO.

Together, these settings reflect a core production principle: durability and repair must be bounded by explicit limits, not by hope.

---

## 10) Failure scenarios and recovery paths

### 10.1 Application failure

If the application actor is down, consensus receives fallback responses and continues safely. Liveness may degrade, but safety is preserved.

### 10.2 Storage failure

If marshal storage fails to initialize, the node aborts. This is correct: without durable storage, a validator should not participate.

### 10.3 Network partitions

If a node is partitioned, consensus may pause or move to new views. When connectivity returns, marshal and resolver help backfill missing blocks.

### 10.4 Aggregator delays

If the aggregator is slow, summaries to the indexer will lag. This does not break consensus, but it impacts clients. The retry logic and caching minimize this impact.

### 10.5 Engine task supervision

The engine uses a `select_all` over a list of named tasks (consensus, marshal, application, aggregator, buffer, and system metrics). The logic is simple but important: if any core actor exits or fails, the engine aborts the rest and stops the node. This prevents a partially alive system where some actors are running on stale state while others are dead.

In distributed systems, partial failure is the normal case. But a validator should fail fast when its core consensus pipeline is broken. The `NamedTask` wrapper and `abort` calls implement that policy.

This is a runtime-level safety feature that complements consensus safety. It keeps the process in a known, inspectable state rather than limping forward unpredictably.

---

## 11) How this maps to Commonware primitives

- **commonware-consensus** provides simplex, marshal, and aggregation engines.
- **commonware-runtime** provides the async context, timers, and spawn behavior.
- **commonware-storage** provides archives and journals for durability.
- **commonware-cryptography** provides signature schemes and digests.

The code in this repo is the glue that wires these primitives together into a working validator.

---

## 12) Feynman recap

Consensus is the mechanism that produces one ordered history. The application ingress translates consensus requests into real application work, with safe fallbacks and explicit shutdown behavior. Marshal persists finalized blocks and supports backfill. Aggregation produces certificates and proof bundles for external verification.

If you can trace the path from a `propose` call in the consensus engine to a `Finalized` message in the application and a stored block in marshal, you understand how this node reaches and preserves agreement.

That is the heart of a production-grade consensus system.

Decisive.
