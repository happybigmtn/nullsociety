# S08 - Blockchain + distributed systems primer (Commonware fit)

Goal: provide a university‑level primer on distributed systems and blockchains, then map Commonware’s design choices to that landscape (with appchain + bridge suitability, scalability, and concurrency tradeoffs).

---

## Part 1: Distributed systems fundamentals (university‑level)

### 1) Failure models and timing assumptions
- **Crash fault**: a node stops responding but does not lie.
- **Byzantine fault**: a node can lie, equivocate, or behave arbitrarily.
- **Synchronous**: network delays are bounded and known.
- **Asynchronous**: no timing bounds; a slow node is indistinguishable from a failed node.
- **Partially synchronous**: after some unknown time, bounds hold (the most common assumption for blockchains).

**Core tradeoff**: stronger timing assumptions allow faster consensus, but reduce safety during network turbulence.

### 2) Safety vs liveness
- **Safety**: nothing bad happens (e.g., no two finalized blocks at the same height).
- **Liveness**: something good eventually happens (e.g., the chain keeps finalizing blocks).

Most consensus protocols are designed to preserve safety at the cost of liveness under stress. This is the right tradeoff for financial systems.

### 3) FLP and impossibility results
The FLP result shows that deterministic consensus is impossible in a fully asynchronous system with even one crash failure. Practical systems escape this by:
- Adding randomness.
- Assuming partial synchrony.
- Imposing leader‑based structure.

### 4) Quorums and threshold signatures
- A **quorum** is a set of nodes large enough to guarantee overlap with any other quorum (e.g., >2/3 in BFT).
- **Threshold signatures** let a quorum produce a single compact certificate (one signature) that proves consensus.

### 5) Consensus patterns
- **PBFT‑style**: explicit prepare/commit phases; strong finality but message heavy.
- **HotStuff‑style**: pipelined leader proposals with QC (quorum certificates); good latency and modularity.
- **Tendermint**: round‑based voting with locked values; fast finality for small validator sets.
- **Nakamoto (PoW)**: probabilistic finality; high latency but robust liveness.

### 6) Ordering vs execution
- **Ordering** defines a total order of transactions.
- **Execution** applies transactions deterministically to state.

Separating ordering from execution enables parallelism, clearer fault isolation, and modular designs.

### 7) State, storage, and proofs
- **State** is the full ledger view (accounts, balances, game sessions, etc.).
- **Proofs** allow verification without full state (Merkle proofs, MMR proofs).
- **Pruning** and **archival** manage storage growth.

### 8) Mempools, gossip, and backpressure
- **Mempool**: unconfirmed transactions waiting to be ordered.
- **Gossip**: probabilistic propagation; fast but noisy.
- **Backpressure**: rate limiting to protect nodes from overload.

### 9) Network partitions and reorgs
- Under partition, some nodes cannot communicate. BFT protocols prioritize safety; liveness may pause.
- Reorgs occur in probabilistic‑finality chains; BFT‑finality chains avoid reorgs after finalization.

### 10) Scalability dimensions
- **Throughput** (tx/sec) vs **latency** (time to finality).
- **Validator count** vs **communication complexity** (often O(n^2)).
- **State size** vs **proof size**.

---

## Part 2: Blockchain landscape and design tradeoffs

### 1) General‑purpose L1s
- **Pros**: large ecosystem, broad liquidity, composability.
- **Cons**: shared throughput, expensive execution, unpredictable congestion.

### 2) L2s / rollups
- **Pros**: inherit L1 security, high throughput, flexible execution environments.
- **Cons**: additional latency for L1 settlement, bridge complexity, operator risk.

### 3) Appchains
- **Pros**: isolated throughput, predictable latency, tailored execution model.
- **Cons**: smaller validator set, separate security budget, bridge requirements.

### 4) Finality model comparison
- **Probabilistic (PoW)**: finality improves over time; reorgs possible.
- **Deterministic (BFT)**: once finalized, blocks are final; faster verification.

### 5) Execution models
- **Sequential VM** (EVM): simplest but limited throughput.
- **Parallel/external execution**: higher throughput but complex state contention management.
- **Deterministic game logic**: well suited to appchain settings with strong finality.

---

## Part 3: Commonware stack — what it is, and why those choices

### 1) Commonware’s guiding philosophy
- Modular primitives for **networking**, **consensus**, **crypto**, **storage**, and **runtime**.
- Clean separation between **ordering** and **execution**.
- Deterministic execution as a first‑class requirement.

### 2) Consensus model (simplex + aggregation)
- **simplex** consensus provides BFT finality with a leader‑based pipeline.
- **aggregation** produces compact certificates that summarize the execution results.

Tradeoff:
- Strong finality and compact proofs, but requires a validator set that can communicate reliably (BFT cost grows with N).

### 3) Cryptography choices
- **ed25519** for user tx signatures.
- **BLS threshold** for consensus and aggregation certificates.

Tradeoff:
- Threshold signatures are compact and verifiable, but require key ceremony and careful share management.

### 4) Storage model (QMDB + MMR + archives)
- **QMDB** provides ordered operation logs with verifiable proofs.
- **MMR proofs** let clients verify without full history.
- **Immutable + prunable archives** keep finalized data manageable.

Tradeoff:
- Strong proof semantics and compact verification, at the cost of more complex storage pipelines.

### 5) Networking + backpressure
- Authenticated P2P with **per‑channel quotas**.
- Resolver engines fetch missing data with retries.

Tradeoff:
- Good protection against overload and spam, but mis‑tuned quotas can stall progress.

### 6) Runtime + actor model
- Commonware runtime gives a structured **context**, **metrics**, and **spawner**.
- Actors (application, seeder, aggregator, marshal) run independently with mailboxes.

Tradeoff:
- Clear concurrency boundaries and fault isolation, but requires careful mailbox sizing and backpressure tuning.

---

## Part 4: Commonware vs other blockchain stacks (tradeoff view)

### Compared to Ethereum (EVM L1)
- **Commonware**: deterministic app‑specific execution, BFT finality, compact certificates.
- **Ethereum L1**: general‑purpose VM, probabilistic finality (historically), massive decentralization.
- **Tradeoff**: Commonware gains performance and determinism; Ethereum gains ecosystem and large security budget.

### Compared to Tendermint/Cosmos‑SDK
- **Commonware**: similar BFT finality, but deeper integration of proof‑centric storage (QMDB/MMR).
- **Cosmos**: strong appchain model, but storage/proof layers are more app‑defined.
- **Tradeoff**: Commonware provides a more prescriptive verifiability stack; Cosmos provides broader tooling and ecosystem.

### Compared to HotStuff‑style chains
- **Commonware**: simplex offers HotStuff‑like pipeline properties plus modular resolver + aggregation.
- **Tradeoff**: similar consensus properties; Commonware emphasizes certificates + proof pipelines as first‑class citizens.

### Compared to Solana‑style throughput chains
- **Commonware**: safer modular design, explicit quotas and proofs, BFT finality with smaller validator sets.
- **Solana**: very high throughput but complex runtime assumptions and heavier hardware requirements.
- **Tradeoff**: Commonware prioritizes correctness and verifiability over raw throughput.

---

## Part 5: Appchain + bridge suitability

### Why Commonware fits appchains
- Deterministic execution and BFT finality are ideal for game‑style or finance‑style logic.
- Proof‑centric storage makes it easy to provide verifiable summaries to external systems.

### Bridge‑related considerations
- **Outbound proofs**: aggregation certificates + summaries can be exported to bridge relayers.
- **Inbound verification**: bridge logic must verify source chain finality and authenticity.
- **Security**: bridges are usually the weakest link; finality helps but does not replace rigorous bridge design.

### Practical model
- Run a small, highly‑reliable validator set for the appchain.
- Use bridge relayers to move assets/claims between the appchain and larger ecosystems.

---

## Part 6: Scalability and concurrency in Commonware‑based systems

### Throughput levers
- **Block size caps**: `MAX_BLOCK_TRANSACTIONS` limits per‑block execution cost.
- **Consensus timeouts**: `leader_timeout`, `notarization_timeout`, `skip_timeout` control cadence.
- **Quotas**: per‑channel rate limits enforce fairness.

### Latency levers
- Smaller quorum size + stable network = faster finality.
- Heavy signature aggregation can add verification latency, but reduces proof size.

### Concurrency model
- **Actor pipelines**: application, seeder, aggregator, marshal, and buffer run concurrently.
- **Mailboxes**: isolate queues and allow backpressure.
- **Resolver engines**: fetch missing data without blocking consensus.

### Storage scalability
- **MMR proofs** allow verification without full state.
- **Pruning** caps growth in finalized archives.
- **Replay buffers** manage recovery time vs disk usage.

---

## Key takeaways
- Commonware chooses strong finality, explicit proofs, and modular primitives over maximal throughput.
- These choices align well with appchains that need predictable latency and deterministic execution.
- Bridges are feasible because proof‑centric design makes cross‑chain verification simpler, but bridge security still dominates overall risk.

## Where to go next
- E17–E25 for Commonware primitives
- E19 + E20 for consensus + storage deep dives
- E04 for seeding and aggregation in practice
