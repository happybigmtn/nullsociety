# S02 - Distributed systems primer (mempool, blocks, execution) (textbook-style deep dive)

Focus: concepts, with concrete mapping to our codebase

Goal: teach distributed systems concepts at a university level and tie them directly to our mempool, block, and execution pipeline. This should read like a foundational chapter in a textbook.

---

## 0) Big idea (Feynman summary)

A blockchain is just a distributed system that must agree on one history. The mempool is a waiting room, blocks are the agreed steps in the history, and execution is the deterministic machine that turns a block into state changes. If any of those three are misunderstood, the entire system becomes unreliable.

---

## 1) Distributed systems basics: what problems we are solving

### 1.1 The communication problem
In a distributed system, nodes communicate over a network. Networks are:
- **slow** (latency),
- **unreliable** (packet loss),
- **variable** (jitter),
- and **adversarial** (Byzantine behavior is possible).

This means:
- you cannot assume messages arrive on time,
- you cannot assume messages are unique or in order,
- you cannot assume peers are honest.

### 1.2 Failure models
A failure model defines what “bad behavior” the system must tolerate.

- **Crash fault**: a node stops responding.
- **Byzantine fault**: a node lies, equivocation, or sends contradictory data.

Blockchain consensus is designed for Byzantine faults, which is strictly harder than crash faults.

### 1.3 The consistency problem
Distributed systems must choose between:
- **safety** (no wrong states),
- **liveness** (system keeps making progress).

For blockchains, safety is almost always prioritized: an inconsistent ledger is catastrophic.

---

## 2) Mempool fundamentals

### 2.1 What a mempool is
A **mempool** is a temporary staging area for unconfirmed transactions.

Properties:
- It is not authoritative.
- Its contents are **best effort**, not guaranteed.
- Transactions can be dropped or replaced.

In our system, the mempool is effectively the “intake buffer” before consensus.

### 2.2 Why a mempool exists
Without a mempool, every transaction would have to be processed immediately by consensus. That would be:
- too slow,
- too fragile under load,
- and too easy to DoS.

Mempools smooth bursty traffic and decouple user submission from consensus ordering.

### 2.3 Mempool design constraints
A real mempool must handle:
- **bounded memory** (avoid being flooded),
- **nonce correctness** (reject invalid sequences),
- **duplicate detection**,
- **rate limiting** per account.

Our mempool limits appear in the node application config:
- `mempool_max_backlog`
- `mempool_max_transactions`
- `nonce_cache_*`

---

## 3) Blocks: the canonical history unit

### 3.1 What a block represents
A block is a container that commits to:
- a parent digest,
- a view/round,
- a height,
- a list of transactions.

The block digest binds all of this together, making it a single atomic commitment.

### 3.2 Why blocks exist
Blocks provide:
- a batching unit for consensus,
- a single object that can be notarized and finalized,
- a checkpoint for state transitions.

Without blocks, consensus would have to decide on every transaction individually.

### 3.3 Block production vs block verification
In the consensus pipeline:
- **propose**: a leader builds a block candidate.
- **verify**: validators ensure it is valid before voting.

Both are implemented through the application’s Automaton in `node/src/application/ingress.rs` and `node/src/application/actor.rs`.

---

## 4) Deterministic execution

### 4.1 Why determinism is required
If two validators execute the same block and get different results, consensus collapses. Deterministic execution is non-negotiable.

This means:
- no dependence on local time,
- no dependence on random system entropy,
- no dependence on external state.

### 4.2 Deterministic randomness
Randomness must be derived from shared seeds, not local RNGs. The system uses consensus seeds to drive RNG for games.

### 4.3 Execution in our system
Execution happens in `execution/src/state_transition.rs` and is orchestrated by the application actor in `node/src/application/actor.rs`.

The key invariant is:
- **same inputs + same order + same seeds = same outputs**.

---

## 5) Consensus: ordering transactions into blocks

### 5.1 The ordering problem
Consensus decides **which block comes next**.

Given a set of mempool transactions, different nodes may have different views. Consensus provides a single ordered history.

### 5.2 Views, rounds, and leaders
Consensus protocols proceed in rounds:
- Each round has a leader.
- The leader proposes a block.
- Validators vote.
- The block becomes notarized/finalized if enough votes are collected.

Our system uses Commonware’s `simplex` consensus, wired in `node/src/engine.rs`.

### 5.3 Finality
Finality means the block is permanent. Deterministic finality is essential for:
- settlement,
- bridges,
- user trust.

---

## 6) End-to-end pipeline (mempool → block → execution)

### 6.1 Pipeline overview

```
client submit → gateway → simulator/submit → node mempool
→ consensus propose → block built → verify → finalize → execution → proofs
```

This is the heart of the system. Each step has its own failure modes, and each layer adds structure that protects the next.

### 6.2 Where this lives in code
- **Submission and mempool**: `simulator/src/submission.rs`, `node/src/application/mempool.rs`.
- **Block building**: `node/src/application/actor.rs`.
- **Consensus**: `node/src/engine.rs` + `node/src/application/ingress.rs`.
- **Execution**: `execution/src/state_transition.rs`.
- **Proofs**: `types/src/api.rs`, `simulator/src/state.rs`.

---

## 7) Failure modes in the pipeline

### 7.1 Mempool overload
If mempool bounds are too large:
- memory spikes,
- latency grows,
- nodes can crash.

### 7.2 Block verification delays
If verification is slow:
- consensus liveness suffers,
- view timeouts trigger,
- throughput drops.

### 7.3 Execution divergence
If execution is nondeterministic:
- validators disagree on state roots,
- finality certificates become invalid,
- the chain halts or forks.

---

## 8) Mapping to our architecture (practical understanding)

### 8.1 Gateway and simulator
Gateways validate incoming messages and forward them. The simulator/indexer provides the read-only API for state and proofs.

### 8.2 Validators and consensus
Validators run consensus and execution. They are the only authoritative writers to chain state.

### 8.3 Proofs and clients
Clients never need the full database. They can verify summary proofs from the simulator/indexer.

---

## 9) Scalability implications

### 9.1 Mempool as a throttle
By bounding the mempool, we bound the maximum work consensus must handle at once.

### 9.2 Block size as throughput limit
Block size defines max transactions per block. This is a fundamental throughput ceiling.

### 9.3 Execution cost
Execution determines the per-block compute cost. For games, this includes RNG and state updates.

---

## 10) Exercises

1) Draw the full pipeline from client submit to finalization, labeling each subsystem.
2) Explain why the mempool is not authoritative and how consensus provides finality.
3) Describe a scenario where deterministic execution could fail, and how to prevent it.
4) Identify the code files where each pipeline stage is implemented.

---

## Next primer
S03 - Cryptography primer: `feynman/lessons/S03-crypto-primer.md`
