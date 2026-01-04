# S08 - Blockchain + distributed systems primer (Commonware fit)

Goal: provide a university-level primer on distributed systems and blockchains, then map Commonware's design choices to that landscape (with appchain + bridge suitability, scalability, and concurrency tradeoffs).

---

## 0) Feynman summary (big picture)

A blockchain is a distributed log plus a deterministic computer. The log is agreed by consensus. The computer applies each log entry to produce state. Everything else in the ecosystem exists to keep that log safe, fast, and usable: networking spreads messages, cryptography proves identity and integrity, storage keeps history, and execution defines what a transaction means. Commonware is a toolbox that gives you these building blocks without forcing a single chain design. Our system chooses a particular arrangement: BFT-style finality, a deterministic game execution engine, and a network layout that keeps validators authoritative while gateways scale the edge.

---

## Part 1: Distributed systems and blockchain fundamentals

### 1) Failure models and timing assumptions

Distributed systems must pick a failure model. This is not academic; it decides what you can guarantee.

- **Crash fault**: a node can stop responding but does not lie.
- **Byzantine fault**: a node can lie, equivocate, or behave arbitrarily.
- **Synchronous**: the network has known, bounded delays.
- **Asynchronous**: delays can be unbounded.
- **Partially synchronous**: after some unknown time, delays become bounded.

Most blockchains assume Byzantine faults and partial synchrony. That means they preserve safety under adversarial behavior and make progress when the network is behaving reasonably.

### 2) Safety vs liveness

- **Safety** means the system never finalizes conflicting histories.
- **Liveness** means the system eventually finalizes a new block.

Safety is non-negotiable for money and state. Liveness is a performance property. Most protocols choose to halt or slow down under extreme network issues rather than risk conflicting states.

### 3) Consensus as the core problem

Consensus is the act of agreeing on a single ordered log. When you achieve consensus, state machine replication becomes possible. Every node can replay the same log and end up in the same state.

There are two broad families:

- **Crash-fault consensus** (Raft, Paxos) uses majority quorums and assumes no lies.
- **Byzantine-fault consensus** (PBFT, Tendermint, HotStuff) uses 2f + 1 quorums out of 3f + 1 and assumes f faulty nodes.

The extra quorums in BFT are the price you pay for safety under adversarial conditions.

### 4) Deterministic execution

Consensus only orders bytes; it does not interpret them. Execution is the deterministic function that maps `(state, block)` to `state'`.

If the execution is not deterministic, the system can diverge even with perfect consensus. Determinism requires:

- stable iteration order,
- no dependency on local time,
- carefully defined randomness,
- consistent serialization.

### 5) Mempools and ordering

A mempool is a per-node staging area. It is not a source of truth. Nodes gossip transactions, validate them, and store them until they are included in a block. Different nodes may see different mempool contents at any time.

This is normal. Consensus provides the final ordering.

### 6) Finality models

- **Probabilistic finality**: blocks become more stable as more blocks build on them (common in proof-of-work chains).
- **Deterministic finality**: once a block is committed by consensus, it is final (common in BFT chains).

Deterministic finality simplifies application design. It reduces the need to handle reorganizations and rollback logic.

---

## Part 2: The blockchain landscape

### 7) Monolithic vs modular chains

- **Monolithic chains**: consensus, execution, and data availability all happen in one system (classic L1s).
- **Modular stacks**: separate consensus, execution, and data availability into layers (rollups, DA layers).

Monolithic systems are simpler and have clearer security boundaries. Modular systems scale better but introduce more cross-layer complexity and trust assumptions.

### 8) Appchains vs shared chains

- **Shared chains** (general-purpose L1s) host many applications on a single chain. They provide strong shared security but limited customization.
- **Appchains** are dedicated chains for a single application. They offer control over throughput, fees, and execution rules, but must solve their own security and availability problems.

Appchains make sense when:

- you need custom execution logic,
- you want predictable performance,
- your application has specialized state and workflow.

Our system fits this model: a game-focused chain with deterministic rules and strict fairness requirements.

### 9) Bridging and cross-chain communication

Bridges connect separate chains. They are difficult because they must establish a shared notion of finality across different consensus models.

Key risks:

- **Finality mismatch**: bridging from probabilistic to deterministic finality requires waiting for confirmations.
- **Light client security**: verifying remote state without trusting a centralized oracle.
- **Message ordering and replay protection**.

A clean bridge design demands clear finality guarantees. This is one reason BFT-style deterministic finality is attractive for appchains that expect to bridge to other ecosystems.

### 10) Scalability and throughput

Scalability is limited by:

- **Network bandwidth** (propagating blocks).
- **CPU** (validation and execution).
- **Storage I/O** (persisting state and logs).

Levers to scale:

- Increase block size.
- Decrease block interval.
- Parallelize execution.
- Shard state.

Each lever has tradeoffs. Larger blocks increase propagation time. Shorter intervals increase consensus overhead. Parallel execution introduces conflict detection. Sharding complicates cross-shard transactions.

### 10.1 Data availability and state growth

Every blockchain must decide who stores what and for how long. Full nodes store the entire chain history and state. Light clients store only headers and rely on proofs to verify state. Archive nodes keep everything for analytics and compliance. These choices matter because storage growth is relentless: every transaction adds data, and every block adds headers, signatures, and metadata.

If state grows faster than hardware improves, new validators are pushed out, which weakens decentralization. Many chains introduce pruning (discarding old state) and snapshots (periodic checkpoints) to keep startup times reasonable. Others separate data availability into specialized layers so execution nodes do not carry the full data burden. The key tradeoff is between trust and cost: the more you prune, the more you rely on someone else to provide historical data.

For an appchain like ours, the state footprint is more predictable, which makes it easier to plan storage and retention policies. You can keep full history for auditing without the extreme scale pressures of global L1s, but you still need a disciplined snapshot and backup strategy.

### 10.2 Cryptography and data structures

Cryptography is the glue that turns distributed logs into trustable systems. The core primitives are simple but powerful:

- **Hash functions** create fixed-size fingerprints of data. Any change produces a different hash.
- **Digital signatures** prove that a transaction was authorized by a key holder.
- **Merkle trees** allow compact proofs that a transaction is included in a block.

These primitives enable light clients, bridges, and audit tools. They also enable deterministic serialization: if every node hashes the same bytes, they must agree on encoding. This is why strict codecs and canonical formats are critical.

Commonware exposes cryptography and codec utilities explicitly, which makes the security boundary visible. You can audit exactly where signatures are checked, how hashes are computed, and how data is serialized. This visibility is valuable for a production chain that must pass security review.

### 11) Concurrency and conflict management

In a deterministic system, concurrency must be controlled. Two transactions that touch the same state cannot be executed in parallel without careful ordering. Common strategies:

- **Static partitioning** (assign state to shards).
- **Optimistic parallelism** (execute in parallel, roll back conflicts).
- **Sequential execution** (simpler but slower).

For a global game table, sequential execution with careful batching often provides the clearest correctness model. The goal is predictable fairness, not maximal throughput.

### 11.1 Ordering fairness and MEV

Transaction ordering is not neutral. If a block producer can reorder transactions, they can extract value (MEV) or disadvantage certain users. In financial systems, this can lead to frontrunning and unfair outcomes.

Mitigations include:

- ordering rules that are deterministic (for example, by nonce or timestamp buckets),
- commit-reveal schemes that hide intent until ordering is fixed,
- batch auctions that clear all orders at once.

In a game context, ordering fairness matters because players should not be able to exploit timing to gain an edge. Deterministic ordering and strict validation at the gateway are part of the fairness story.

---

## Part 3: Where Commonware fits

### 12) Commonware as a primitives library

Commonware is not a full blockchain; it is a collection of primitives. It provides reusable building blocks for consensus, networking, storage, cryptography, encoding, and runtime orchestration. This lets teams assemble a chain that fits their product rather than forcing an opinionated stack.

Core primitives we use include:

- **commonware-runtime**: task orchestration, timers, and async execution.
- **commonware-consensus**: consensus engine and message handling.
- **commonware-p2p / commonware-resolver**: peer discovery and transport.
- **commonware-storage**: log and state persistence.
- **commonware-cryptography**: signing, verification, hashing.
- **commonware-codec / stream / broadcast**: deterministic encoding and message fan-out.
- **commonware-utils / math / macros**: supporting utilities.

The key design choice is modularity. You can replace or extend each piece while keeping the rest.

### 13) Design principles visible in the stack

From our usage, several principles are clear:

1) **Determinism over ambiguity**: encoding and execution rules must be stable.
2) **Separation of concerns**: consensus orders bytes, execution interprets them.
3) **P2P and consensus are explicit**: not hidden behind a magic "node".
4) **State persistence is first-class**: storage primitives are part of the core, not an afterthought.
5) **Runtime as infrastructure**: the runtime drives everything, making concurrency explicit and testable.

These principles align with the needs of a game-focused chain, where correctness, auditability, and operator control matter more than raw experimentation.

### 14) Consensus choice and finality

Our configuration uses BFT-style consensus via Commonware consensus primitives. The key properties we rely on:

- **Deterministic finality**: once a block is committed, it is final.
- **Explicit rounds and timeouts**: progress is driven by timeouts, not probabilistic mining.
- **Quorum-based safety**: safety holds as long as the number of faulty validators is below a threshold.

This aligns with appchain needs. Games and financial flows cannot tolerate probabilistic rollbacks. Deterministic finality simplifies UI and settlement logic.

### 14.1 Validator set management and upgrades

Finality is only as strong as the validator set that enforces it. In a permissioned or semi-permissioned appchain, validator operations are a core part of security. You must manage:

- key generation and storage (prefer hardware-backed keys),
- rotation schedules and incident response plans,
- explicit policies for adding or removing validators.

Upgrades are another critical surface. Consensus protocols are sensitive to version skew. A safe upgrade process includes staged rollouts, clear activation heights, and rollback plans if a bug appears. Commonware's modular design helps here because you can reason about which component is changing: consensus, networking, runtime, or execution. That clarity makes operational playbooks easier to write and audit.

### 15) Networking and propagation

Commonware's p2p and broadcast layers provide:

- Peer discovery and address resolution.
- Message propagation (transactions, blocks, votes).
- Stream abstractions for backpressure and flow control.

This is crucial because consensus is only as fast as message propagation. If the p2p layer is slow or unstable, consensus rounds stretch and block times grow.

### 16) Storage and replay

Storage primitives keep the ordered log and state. In a BFT system, every node must be able to replay blocks and arrive at the same state after a crash.

A clean storage interface enables:

- fast startup (snapshots or checkpoints),
- deterministic replay,
- auditability and debugging.

For an appchain, storage correctness is as important as consensus correctness.

### 17) Runtime and concurrency

The runtime orchestrates tasks: network IO, consensus rounds, block execution, and broadcasting. A good runtime abstraction ensures:

- tasks are cancellable,
- timeouts are explicit,
- failure isolation is possible,
- deterministic tests are easier to write.

This is especially important for validators, which must run continuously and recover cleanly.

---

## Part 4: Tradeoffs relative to other blockchains

### 18) Versus proof-of-work chains

Proof-of-work chains offer open participation and probabilistic finality. They are robust but wasteful and slow. Commonware-based BFT appchains trade openness for efficiency and fast finality. They require an explicit validator set, which fits a controlled appchain but not a fully permissionless network.

### 19) Versus large monolithic proof-of-stake chains

Large monolithic PoS chains often target maximum throughput and global composability. They can achieve impressive scale but often require high-performance hardware and complex execution models. Our stack favors predictability and control, which is more appropriate for a game-focused appchain.

### 20) Versus Cosmos-style appchains

Cosmos appchains use Tendermint-style BFT consensus with deterministic finality, similar in spirit to our design. The main difference is that Commonware provides smaller primitives rather than a full node. This gives us more freedom but also more responsibility to build correct glue code and operational tooling.

### 21) Versus rollups

Rollups execute off-chain and post data or proofs to a base layer. They inherit security from the base layer but rely on the base layer for finality and data availability. Our appchain approach puts finality and data availability inside the chain itself, which simplifies app logic but increases operational responsibility.

---

## Part 5: Appchain + bridge suitability

### 22) Why an appchain is a good fit here

The application has a single global table per game variant, strict fairness requirements, and predictable user flows. This favors a dedicated chain with custom execution logic rather than a generalized VM.

Benefits:

- predictable block times,
- custom transaction formats,
- deterministic execution rules tuned to game logic,
- easier integration with live services.

### 23) Bridging strategy implications

When bridging to external ecosystems, deterministic finality is an asset. It lets you define a clean handshake: "after block N is committed, state X is final." That reduces bridging delays and simplifies proofs.

However, you must still define:

- how bridge messages are authenticated,
- how you handle chain upgrades,
- how you manage failures (bridge halts, validator set changes).

Commonware's modular primitives make it possible to implement a robust bridge, but the bridge logic itself is not automatic. It requires careful protocol design.

### 23.1 Bridge trust models and proofs

There are three common bridge trust models:

1) **Multisig or federation**: a set of signers attests to events on the source chain. This is simple but trust-heavy.
2) **Light client verification**: the destination chain verifies the source chain's consensus and headers. This is stronger but more complex.
3) **Optimistic bridges**: messages are accepted with a challenge window, where fraud proofs can reverse incorrect claims.

For a production appchain, the long-term goal is usually light-client style verification, because it minimizes trusted intermediaries. But it requires a well-defined header format, signature scheme, and finality rule. Commonware's explicit cryptography and consensus primitives make those components visible, which is a good foundation for implementing provable bridges.

---

## Part 6: Scalability and concurrency in our context

### 24) Where we scale and where we do not

Our architecture intentionally keeps the core game logic centralized and deterministic. Scaling happens at the edges (gateways, clients), not in the execution core. This is similar to a high-performance game server: the authority is centralized, but the fan-out is distributed.

This model works because:

- the game state is small enough to keep in memory,
- the table logic is sequential by nature,
- fairness requires a single authoritative clock.

### 25) Concurrency design choices

We trade off horizontal scaling of execution for correctness and simplicity. Instead of sharding the game state, we batch actions into rounds and execute them in order. Concurrency exists in networking and IO, but not in the core state transitions.

The benefit is transparency: every player sees the same sequence of events and the same outcome, and there is no risk of cross-shard inconsistency.

### 25.1 Operational capacity planning

Because execution is centralized, operational limits show up quickly. The most important capacity metrics are:

- peak concurrent WebSocket connections at the gateways,
- validator CPU utilization during block execution,
- block propagation time between validators,
- size and churn of the mempool.

If any of these saturate, the system becomes sluggish. A production plan should define target budgets for each metric and alert when they are exceeded. This is where deterministic systems shine: you can predict the load per round and build playbooks for overload conditions. For example, if the mempool grows faster than blocks are committed, you can temporarily tighten admission rules or increase block sizes within safe limits. The key is to protect fairness and deterministic behavior while shedding load in a controlled way.

### 26) Practical limits and mitigation

Even with a single authority, throughput can be high if the authority is efficient. If load grows, you can:

- increase gateway capacity to handle connections,
- optimize serialization and validation,
- increase hardware for validators,
- batch more actions per round.

The key is to preserve determinism while scaling the edges.

---

## Part 7: Feynman recap (Commonware fit)

Commonware gives us the primitives to build a BFT appchain with deterministic finality. That choice is not just technical, it matches the product requirements: fairness, predictable timing, and strong auditability. We accept the tradeoff that we must manage our own validator set and operations, because we gain control over execution rules and performance.

If you understand this mapping, you can explain why we chose an appchain, why deterministic finality matters for bridges, and why our runtime and consensus design emphasize safety over raw throughput.

The takeaway is not that Commonware is the only path, but that it is a flexible one. It gives you the knobs that other stacks hide. That means more engineering work, but also the ability to tune the chain for a specific product like a global game table. That tradeoff is the core of the design.

With a clear model of consensus, execution, and networking, you can justify every architectural choice to auditors, engineers, and product teams.

That clarity is what turns a blockchain from a research project into a dependable production system.

It is the difference between theory and engineering reality.
