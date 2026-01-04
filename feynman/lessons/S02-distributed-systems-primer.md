# S02 - Distributed systems primer (mempool, blocks, execution) (textbook-style deep dive)

Focus: concepts, with concrete mapping to our codebase

Goal: teach distributed systems concepts at a university level and tie them directly to our mempool, block, and execution pipeline. This should read like a foundational chapter in a textbook.

---

## 0) Big idea (Feynman summary)

A blockchain is just a distributed system that must agree on one history. The mempool is a waiting room, blocks are the agreed steps in the history, and execution is the deterministic machine that turns a block into state changes. If any of those three are misunderstood, the entire system becomes unreliable. You can think of it like a group of accountants: the mempool is the inbox, blocks are the ledgers they all sign, and execution is the calculator that must produce the same totals for everyone.

---

## 1) Distributed systems basics: what problems we are solving

### 1.1 The communication problem

In a distributed system, nodes communicate over a network. Networks are:

- **slow** (latency),
- **unreliable** (packet loss),
- **variable** (jitter),
- **adversarial** (Byzantine behavior is possible).

This means:

- you cannot assume messages arrive on time,
- you cannot assume messages are unique or in order,
- you cannot assume peers are honest.

### 1.2 Failure models

A failure model defines which kinds of failures your system must tolerate.

- **Crash-fault**: nodes can stop but do not lie. (Raft, Paxos)
- **Byzantine-fault**: nodes can act arbitrarily, including lying. (BFT consensus)
- **Omission-fault**: nodes fail to send or receive messages.

Blockchains generally assume Byzantine faults, because nodes are incentivized and may be malicious. That implies stronger requirements for consensus and larger quorums.

### 1.3 Safety vs liveness

Two core properties define correct distributed systems:

- **Safety**: nothing bad happens (no two nodes commit conflicting histories).
- **Liveness**: something good eventually happens (progress continues).

Most algorithms prioritize safety. It is better to pause than to finalize a conflicting state.

---

## 2) Time, ordering, and the limits of certainty

### 2.1 Clocks are not synchronized

Each machine has its own clock. Even with NTP, clocks drift. You cannot rely on timestamps alone to order events across machines.

### 2.2 Logical clocks

Lamport clocks and vector clocks provide a way to represent causal ordering. A message that is sent must be "after" the send event. This partial order is useful for reasoning about dependencies even when real time is unreliable.

In blockchains, the total order is established by consensus, not by wall-clock time.

### 2.3 FLP impossibility (why consensus is hard)

The FLP result says: in a purely asynchronous system where one node can fail, you cannot guarantee both safety and liveness. That is why real systems assume partial synchrony or make probabilistic guarantees.

This is why blockchains often define timeouts and rounds. Timeouts are not about time being correct; they are about forcing progress in a world where time can be delayed.

---

## 3) Replication and state machine replication

### 3.1 Replication basics

Replication means multiple nodes store the same data. It provides fault tolerance: if one node fails, another can serve requests.

But replication raises a question: how do we keep replicas consistent?

### 3.2 State machine replication (SMR)

SMR is the core idea behind most blockchains. If all nodes run the same deterministic state machine and process the same ordered log of commands, they will end in the same state.

So the whole problem reduces to: agree on a single ordered log of commands.

In blockchains:

- The ordered log is the **blockchain**.
- The commands are **transactions**.
- The deterministic state machine is the **execution engine**.

---

## 4) Consensus: agreeing on a single history

### 4.1 Consensus goals

Consensus protocols aim to provide:

- **Agreement**: all honest nodes decide the same value.
- **Validity**: decided values were proposed by honest nodes.
- **Termination**: a decision is eventually made.

### 4.2 Crash-fault vs Byzantine-fault consensus

Crash-fault consensus (Raft, Paxos) assumes nodes do not lie. Byzantine-fault consensus (PBFT and descendants) assumes up to `f` nodes may be malicious.

In Byzantine consensus, the classic bound is **3f + 1** total nodes to tolerate `f` faulty nodes. This ensures quorums intersect with enough honest nodes.

### 4.3 Quorum intersection intuition

Imagine you need to sign a decision. If you require signatures from 2f + 1 nodes out of 3f + 1, then any two quorums of size 2f + 1 overlap in at least f + 1 nodes, and at least one of those overlapping nodes is honest. That overlapping honest node prevents two conflicting decisions.

That is the heart of safety in BFT consensus.

### 4.4 Determinism and execution

Consensus only orders transactions; it does not execute them. After consensus, every node runs the same deterministic execution. If the execution is not deterministic, safety is lost even if consensus is correct.

That is why deterministic encoding, deterministic randomness, and strict execution semantics are crucial.

---

## 5) Mempool: the transaction waiting room

### 5.1 What the mempool is

The mempool is a shared buffer of pending transactions that have been validated but not yet ordered by consensus.

Think of it as a mailbox that all validators check. The mempool is not itself the source of truth. It is just a staging area.

### 5.2 Why mempools are local

Each node has its own mempool. There is no single global mempool. Nodes gossip transactions to each other, but there is no guarantee that all nodes see the same set at the same time.

This implies:

- A transaction can appear in one mempool and not another.
- Mempools are eventually consistent, not strongly consistent.

### 5.3 Mempool admission rules

Nodes usually apply checks before accepting a transaction:

- Signature validity.
- Nonce or sequence number checks.
- Fee or cost checks.
- Basic syntactic validity.

These checks prevent spam and reduce wasted consensus bandwidth.

### 5.4 Mempool ordering vs block ordering

Some systems order transactions in the mempool (for example, by fee). But the final order is the order in blocks, not the mempool. The mempool order is just a local heuristic for choosing what to propose.

---

## 6) Blocks: the ordered log

### 6.1 What a block is

A block is a batch of transactions plus metadata (parent hash, timestamp, proposer id, etc.). The block is the unit of consensus.

### 6.2 Why batching matters

Batching transactions into blocks amortizes consensus overhead. Instead of running consensus for every transaction, you run it for a batch.

This is the main scalability lever in blockchain systems.

### 6.3 Finality and reorgs

Some systems have probabilistic finality (a block becomes more likely to be permanent as more blocks build on top). Others have deterministic finality (once committed, it is final).

Our architecture aims for deterministic safety: once the consensus layer decides a block, execution should commit it and never roll it back. This simplifies downstream logic and client expectations.

---

## 7) Execution: the deterministic machine

### 7.1 Deterministic execution

Determinism means: given the same inputs, every node produces the same output. There is no randomness, no dependence on local time, no floating-point non-determinism.

Common pitfalls:

- Using system time in business logic.
- Iterating over hash maps without stable ordering.
- Using non-deterministic random sources.

### 7.2 Execution as a state transition function

You can model execution as:

```
state_{t+1} = apply(state_t, block_t)
```

Every node runs this function. If any node diverges, consensus safety is violated because nodes now disagree on state.

### 7.3 Why execution and consensus are separate

Separating consensus and execution provides modularity. The consensus layer does not need to understand application semantics; it only orders bytes. The execution layer interprets those bytes as transactions and updates state.

This separation is a core design principle in the Commonware stack.

---

## 8) Consistency models and CAP tradeoffs

### 8.1 CAP theorem

The CAP theorem states that in the presence of a network partition, a distributed system can choose at most two of:

- **Consistency** (all nodes see the same data)
- **Availability** (system responds even if some nodes are down)
- **Partition tolerance** (system continues despite network partitions)

Blockchains prioritize **consistency** and **partition tolerance**, often sacrificing availability during partitions. This is why block production may halt under severe network splits.

### 8.2 Strong vs eventual consistency

Strong consistency means every read sees the latest committed write. Eventual consistency means reads converge over time. Blockchains typically offer strong consistency for finalized blocks and eventual consistency for unfinalized ones.

### 8.3 Client UX implications

Clients must understand this model. A transaction might be "accepted" (in mempool) but not yet final. The UI should communicate this clearly.

---

## 9) Byzantine behavior and incentives

### 9.1 Byzantine failures in practice

Byzantine behavior includes:

- Sending conflicting proposals.
- Withholding votes.
- Spamming invalid transactions.
- Trying to reorder transactions for profit.

Consensus protocols must tolerate these behaviors without sacrificing safety.

### 9.2 Incentives and slashing

Many blockchains use economic incentives to discourage Byzantine behavior. Slashing (penalizing misbehavior) and rewards (for honest participation) align incentives.

Even without explicit slashing, design decisions should assume adversarial behavior.

---

## 10) How this maps to our codebase

### 10.1 Transaction flow

A simplified flow in our system:

1) Client sends a transaction or action (via gateway or simulator).
2) Gateway validates and forwards to the validator or table engine.
3) Validators place the transaction into their mempool.
4) Consensus selects an ordering and creates a block.
5) Execution applies the block to update state.
6) State updates are broadcast to clients.

Every step corresponds to a distributed systems concept:

- Gateway validation is a form of admission control.
- Mempool gossip is eventual consistency.
- Consensus provides total ordering.
- Execution is deterministic state machine replication.

### 10.2 The importance of nonces

Nonces enforce ordering and uniqueness of client actions. They prevent replay attacks and make retries safe. In a distributed system with retries, a nonce is your proof that you already processed a request.

### 10.3 The role of the simulator and global table coordinator

The simulator or the on-chain global table coordinator can be seen as a deterministic execution engine for a specific game. It owns authoritative state and advances in rounds. Clients do not talk to each other; they talk to the authority. This centralizes correctness while still allowing scaling at the edges.

---

## 11) A deeper view: pipeline stages and bottlenecks

A blockchain pipeline is like a factory line:

- **Ingress**: clients submit transactions.
- **Validation**: nodes check signatures and format.
- **Mempool**: transactions wait.
- **Proposal**: a leader selects a batch.
- **Consensus**: peers agree on the batch.
- **Execution**: state transitions.
- **Broadcast**: updates to clients.

Bottlenecks can appear at any stage. For example:

- If validation is slow, mempool fills.
- If consensus is slow, block times increase.
- If execution is slow, state lags and clients see stale updates.

Understanding this pipeline lets you diagnose performance problems.

---

## 12) Deterministic randomness (a special topic)

Games often need randomness. But randomness is poison to determinism if used incorrectly. Solutions include:

- Commit-reveal schemes.
- Verifiable random functions (VRFs).
- Pre-agreed randomness beacons.

The key rule is: randomness must be derived from data agreed by consensus, not from local entropy. Otherwise different nodes will produce different results.

---

## 13) Consensus algorithm families

There are two big families of consensus protocols:

1) **Crash-fault consensus** (Paxos, Raft). These assume nodes do not lie, they only crash or disconnect.
2) **Byzantine-fault consensus** (PBFT, Tendermint, HotStuff). These assume nodes can be malicious.

### 13.1 Crash-fault consensus in one paragraph

Raft and Paxos are leader-based. A leader proposes log entries, followers replicate them, and a majority quorum acknowledges them. If the leader fails, a new leader is elected. This is good for internal services where the threat model is benign. It is not sufficient for open, adversarial environments because a malicious leader could fork or lie.

### 13.2 Byzantine consensus in one paragraph

PBFT-style protocols add extra voting phases and require 2f + 1 votes out of 3f + 1 nodes. They guarantee safety even if f nodes are malicious. The cost is more messages and more complex leader rotation. Tendermint and HotStuff are modern variants that simplify the phases and allow pipelining.

### 13.3 Phases and view changes (the common pattern)

Most BFT protocols follow a round-based structure:

1) A leader proposes a block.
2) Nodes vote to \"prepare\" or \"pre-vote.\"
3) Nodes vote to \"commit\" or \"pre-commit.\"
4) If enough votes appear, the block is finalized.
5) If not, the system moves to a new round with a new leader (view change).

Timeouts drive the system forward when a leader is faulty. Safety is preserved because honest nodes only vote in a way that preserves quorum intersection.

## 14) Gossip and peer-to-peer dissemination

Consensus is not just about voting. It also requires nodes to receive proposals and transactions. This is handled by a **gossip** or **broadcast** layer.

### 14.1 Push, pull, and hybrids

- **Push gossip**: nodes send new messages to peers immediately.
- **Pull gossip**: nodes ask peers for missing items.
- **Hybrid**: push for new data, pull for recovery.

Push spreads data fast but can be wasteful. Pull is more bandwidth-efficient but introduces latency. Most real systems use a hybrid approach with deduplication.

### 14.2 Message complexity and scalability

If every node sends every message to every other node, the network cost is O(n^2). That does not scale. Gossip protocols reduce this by selecting a subset of peers for each message. The tradeoff is propagation delay and the risk of partitions.

### 14.3 Mapping to our stack

Our p2p layer is responsible for discovering peers, maintaining connections, and relaying transactions and blocks. If peer discovery or relay is unstable, the mempool becomes inconsistent and consensus slows. This is why peer scoring, timeouts, and retry logic matter in practice.

## 15) Forks, chain choice, and finality

### 15.1 Chain-based consensus

Proof-of-work and some proof-of-stake systems produce a chain where forks can occur. The \"longest chain\" or \"heaviest chain\" rule selects the winning history. Finality is probabilistic: the deeper a block is, the less likely it is to be reversed.

This is good for open systems but complicates UX. A transaction can be reversed if a fork happens.

### 15.2 BFT finality

BFT protocols provide deterministic finality: once a block is committed, it will never be reverted. This is simpler for application logic, especially for games or financial flows where reversals are unacceptable.

### 15.3 Why finality matters for bridges

If you bridge to another chain, you need to know when a state is final. Probabilistic finality requires waiting many confirmations; deterministic finality lets you bridge faster and with clearer risk bounds.

## 16) Performance, throughput, and scalability

### 16.1 Throughput vs latency

Throughput is how many transactions per second you can commit. Latency is how long a single transaction takes to finalize. They are related but not identical.

You can increase throughput by increasing block size or reducing validation cost, but larger blocks may increase latency and propagation time. You can reduce latency by shortening block intervals, but that increases consensus overhead.

### 16.2 Parallel execution and sharding

Execution is often the bottleneck. Parallel execution can help if transactions are independent, but detecting conflicts is hard. Sharding splits the state so that different shards process different transactions. This increases throughput but complicates cross-shard communication.

Our architecture avoids sharding by keeping a single authoritative table per game. This keeps correctness simple at the cost of vertical scaling requirements.

### 16.3 Backpressure and admission control

If mempools grow faster than blocks are produced, latency grows and clients suffer. Admission control, fee markets, and rate limits provide backpressure. The gateway and validator layers are the right place to apply these controls.

### 16.4 Latency budgets and batching

When you design block times, you are really designing a latency budget. A transaction must travel to a validator, wait in the mempool, be proposed, be voted on, and be executed. If any stage is slow, the user experience degrades. Batching more transactions per block increases throughput, but it also increases the time clients wait before their transaction is seen. Good systems expose these tradeoffs so product teams can choose a block interval that matches the UX they want.

This matters for realtime games. A five second block interval might be fine for settlement, but it can feel slow for in-game actions. Many architectures use off-chain fast paths and then settle on-chain. In our stack, we accept on-chain confirmations and use the gateway fanout layer to keep the UX responsive (countdowns, shared state updates) while preserving full auditability.

## 17) Exercises and mental models

### 13.1 The classroom analogy

Imagine a classroom where students are trying to keep identical notebooks. A student (leader) reads out a list of notes (block). The class votes to confirm they heard the same notes. Then everyone writes those notes in the same order. That is consensus and execution.

If one student writes notes in a different order, their notebook diverges, and they will fail the next quiz. That is exactly what happens if execution is non-deterministic.

### 13.2 The mailroom analogy

The mempool is the mailroom. Everyone can drop letters into it. The head clerk decides which letters to process in the next batch. The batch is recorded in the official log. If the mailroom burns down, the official log still exists. That is why the mempool is not a source of truth.

---

## 18) Feynman recap

Distributed systems are about agreeing on shared state in a world where messages are late or lost and some participants may lie. Blockchains solve this by separating the pipeline into mempool, consensus, and execution. Consensus gives an ordered log, execution applies it deterministically, and the mempool is just the waiting room. Once you have that model, you can reason about correctness and performance in any blockchain system.

When you can name the stage where a failure occurs, you can usually predict the fix. That is the practical power of this primer.
