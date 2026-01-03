# E19 - Commonware consensus + marshal (textbook‑style deep dive)

Focus files: `node/src/engine.rs`, `node/src/application/ingress.rs`, `node/src/aggregator/actor.rs`

Goal: read this like a consensus chapter. We cover the theory (views/rounds/finality), then walk through how Commonware wires consensus, marshal persistence, and aggregation certificates.

---

## 0) Big idea (Feynman summary)

Consensus is the system that turns a flood of transactions into *one* ordered history. In our stack:
1) **Consensus (simplex)** decides which block is next.
2) **Application** builds and verifies blocks.
3) **Marshal** persists finalized blocks and supports backfill.
4) **Aggregation** produces compact certificates for client verification.

Each is isolated as an actor with its own mailbox. That separation is the main design choice.

---

## 1) Distributed systems background: BFT consensus basics

### 1.1 Views and rounds
BFT protocols progress through **views** (leader epochs) or **rounds** (view+epoch). A view corresponds to one leader attempt.

### 1.2 Leaders, proposals, and voting
Typical BFT flow:
- Leader proposes a block.
- Validators verify and vote.
- Votes aggregate into a certificate (notarization/finalization).

### 1.3 Finality
Unlike probabilistic chains, BFT chains give **deterministic finality**: once finalized, a block is permanent.

### 1.4 Separation of concerns
Commonware emphasizes:
- **Ordering**: consensus decides block order.
- **Execution**: application applies transactions.
- **Persistence**: marshal stores final history.

---

## 2) Engine wiring overview (`node/src/engine.rs`)

The engine builds all actors, then wires them together.

Key high‑level flow:
1) Build **application**, **seeder**, **aggregator**.
2) Build **broadcast buffer**.
3) Build **marshal** stores and actor.
4) Build **consensus** engine.
5) Build **aggregation** engine.
6) Start all actors in a safe order.

This is the physical “pipeline” of consensus.

---

## 3) Consensus engine configuration (`engine.rs`)

### 3.1 Scheme + elector + automaton

Excerpt:
```rust
let consensus = simplex::Engine::new(
    context.with_label("consensus"),
    simplex::Config {
        scheme: epoch_supervisor.scheme(),
        elector: simplex::elector::Random::default(),
        blocker: cfg.blocker.clone(),
        automaton: application_mailbox.clone(),
        relay: application_mailbox.clone(),
        reporter,
        // ... timeouts + buffers ...
    },
);
```

Explanation:
- **scheme**: BLS threshold scheme for notarization/finalization.
- **elector**: leader selection strategy.
- **automaton**: application mailbox implements `Automaton` (propose/verify).
- **relay**: same mailbox handles broadcast of proposals.
- **reporter**: delivers finalization events to marshal + seeder.

### 3.2 Timeouts and view deltas
Timeouts are expressed as `ViewDelta`:

Excerpt:
```rust
activity_timeout: ViewDelta::new(cfg.consensus.activity_timeout)
```

Interpretation:
- Consensus moves on when activity stalls.
- View timeouts are a critical liveness knob.

### 3.3 Storage partitions
Consensus has its own partition:

Excerpt:
```rust
partition: format!("{}-consensus", cfg.storage.partition_prefix)
```

Why it matters:
- Consensus stores metadata separate from execution state.

---

## 4) Marshal persistence (final history)

Marshal is responsible for storing finalizations and blocks.

### 4.1 Archives for finalizations and blocks

Excerpt:
```rust
let finalizations_by_height = immutable::Archive::init(...).await?;
let finalized_blocks = prunable::Archive::init(...).await?;
```

Explanation:
- **immutable archive** stores finalization metadata indexed by height.
- **prunable archive** stores blocks and can drop old ones after retention.

### 4.2 Marshal actor initialization

Excerpt:
```rust
let (marshal, marshal_mailbox, _last_processed_height) = marshal::Actor::init(...).await;
```

What it does:
- Bootstraps marshal with the archives and config.
- Recovers the last processed height on restart.

---

## 5) Application as the consensus automaton (`application/ingress.rs`)

The application mailbox implements the `Automaton` trait.

### 5.1 Genesis

Excerpt:
```rust
async fn genesis(&mut self, _epoch: Epoch) -> Self::Digest
```

The application returns the genesis digest for consensus to anchor the chain.

### 5.2 Propose

Excerpt:
```rust
async fn propose(&mut self, context: Self::Context) -> oneshot::Receiver<Self::Digest>
```

What happens:
- Consensus provides the parent digest + round.
- The application builds a candidate block and returns its digest.

### 5.3 Verify

Excerpt:
```rust
async fn verify(&mut self, context: Self::Context, payload: Digest) -> oneshot::Receiver<bool>
```

What happens:
- The application fetches missing ancestry via marshal.
- It verifies the candidate block and persists it.

---

## 6) Finalization updates (`Reporter` in `ingress.rs`)

Finality signals arrive as `Update<Block>`.

Excerpt:
```rust
type Activity = Update<Block>;
```

What happens:
- `Update::Block(block, ack)` means a block is finalized.
- The application persists it, then acknowledges via `ack.acknowledge()`.

Why it matters:
- Marshal must persist before ack, or the chain could acknowledge a block that isn’t durable.

---

## 7) Aggregation certificates (`aggregator/actor.rs`)

Aggregation produces and verifies certificates that clients use for proofs.

Key steps in the actor:
- Receive `Message::Executed` with proofs and results.
- Store proofs in a cache and persist results in ordinal storage.
- Verify and store aggregation certificates.

Code anchor:
```rust
let certificate = AggregationCertificate::decode(...)
```

Then:
- Verify with the aggregation scheme.
- Store as `FixedCertificate` for compact persistence.

---

## 8) Putting the pipeline together

**Propose path**:
1) Consensus calls `propose`.
2) Application builds a block.
3) Buffer + broadcast handle dissemination.

**Verify path**:
1) Consensus calls `verify`.
2) Application fetches ancestry if missing.
3) Application persists the verified block.

**Finalize path**:
1) Consensus finalizes block.
2) Reporter sends `Update::Block`.
3) Application persists, marshal stores, ack is returned.

**Aggregate path**:
1) Execution results + proofs are sent to aggregator.
2) Aggregation certificates are produced and stored.

---

## 9) Invariants and tradeoffs

- **Safety first**: marshal persistence must precede finalization ack.
- **Deterministic execution**: proposals are built from consistent state and ordered transactions.
- **Performance**: consensus timeouts balance throughput and liveness under bad networks.

---

## 10) Exercises

1) In `engine.rs`, list every actor created and explain its responsibility.
2) Trace how `Update::Block` flows from consensus to marshal.
3) In `aggregator/actor.rs`, find where certificates are verified and stored.

---

## Next lesson
E20 - Commonware storage (QMDB + MMR + archives): `feynman/lessons/E20-commonware-storage.md`
