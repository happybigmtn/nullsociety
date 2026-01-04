# L20 - Mempool broadcast (register + deposit) (from scratch)

Focus file: `simulator/src/state.rs`

Goal: explain how submitted register/deposit transactions are broadcast on the mempool channel. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Mempool is a broadcast stream
Once transactions are accepted, they are broadcast so validators can build blocks.

### 2) Register and deposit are just transactions
At this stage, there is no difference between register and deposit — they are all pending txs.

---

## Walkthrough with code excerpts

### 1) Broadcast pending transactions
```rust
pub fn submit_transactions(&self, transactions: Vec<Transaction>) {
    if let Err(e) = self.mempool_tx.send(Pending { transactions }) {
        tracing::warn!("Failed to broadcast transactions (no subscribers): {}", e);
    }
}
```

Why this matters:
- If this broadcast fails, validators never see new transactions.

What this code does:
- Wraps the transaction list in a `Pending` struct.
- Sends it on the mempool broadcast channel.

---

## Extended deep dive: mempool broadcast as the execution handoff

The mempool broadcast is the exact point where register and deposit move from “submitted” to “pending execution.” Understanding it is essential for diagnosing onboarding issues.

### 2) What the mempool channel actually is

The mempool is a `broadcast::Sender<Pending>`. That means:

- every subscriber receives each `Pending` batch,
- each subscriber has its own buffer,
- if a subscriber lags, it can miss messages without affecting others.

This is different from a queue (mpsc). It is a fan‑out channel, not a single consumer pipeline.

### 3) Why a broadcast channel fits this architecture

The simulator may have multiple consumers of pending transactions:

- an executor that applies them to state,
- a metrics collector,
- a test harness or debugger.

Broadcast allows all of these consumers to observe the same pending transactions without interfering with each other.

### 4) The `Pending` struct as a batch wrapper

`Pending` is a simple struct that wraps a vector of transactions. That wrapper makes it easier to:

- handle batches uniformly,
- add metadata in the future (e.g., arrival time),
- keep the channel type stable.

For register/deposit, batching usually means a small vector, but the code is batch‑friendly.

### 5) What happens when there are no subscribers

If no one is listening, `mempool_tx.send(...)` returns an error and logs a warning. This is not just noise:

- It means onboarding transactions will never execute.
- It explains “accepted but no effect” failures.

So the warning “no subscribers” should be treated as critical in production.

### 6) Configuring mempool broadcast capacity

In simulator config, you will see something like:

```
pub mempool_broadcast_buffer: Option<usize>
```

That buffer controls how many pending messages each subscriber can hold before it starts dropping.

If this is too small:

- slow executors miss transactions,
- onboarding becomes flaky.

If this is too large:

- memory usage grows under load.

You should tune it based on expected traffic and executor performance.

### 7) Mempool subscriber API

The simulator exposes:

```rust
pub fn mempool_subscriber(&self) -> broadcast::Receiver<Pending> {
    self.mempool_tx.subscribe()
}
```

This is how the executor receives pending transactions. It also means that *anything* that needs to observe mempool traffic can subscribe independently.

### 8) Register/deposit are the first mempool tests

For a new user, register and deposit are the first transactions to enter the mempool. That means any mempool issues will appear as onboarding issues first.

In production, if you see onboarding failures, check:

- whether mempool subscribers are running,
- whether mempool buffers are overflowing,
- whether the executor is alive.

### 9) The difference between mempool and updates

The mempool is about *pending* transactions. Updates are about *executed* events.

Register/deposit must pass through both:

1) broadcast to mempool,
2) execution,
3) update event emission.

If a user sees “registration pending forever,” the mempool path is suspect.

### 10) Backpressure and lag

Broadcast channels do not apply backpressure to the sender. If a subscriber lags, it misses messages. That is a feature, not a bug: the sender stays fast.

But it also means you need monitoring on the subscriber side. If the executor falls behind, it may silently miss pending transactions.

### 11) Feynman analogy: radio broadcast

Imagine the mempool as a radio broadcast:

- The simulator transmits pending transactions.
- Any listener tuned to the frequency hears them.
- If a listener is asleep, it misses the broadcast.

This is why the executor must always be listening.

### 12) Testing the mempool path

To test this layer:

1) Create a mempool subscriber.
2) Call `submit_transactions` with a dummy register transaction.
3) Assert the subscriber receives the `Pending` batch.

Then disconnect the subscriber and confirm the warning log appears. This ensures the warning behavior is functioning correctly.

### 13) When to change this code

You would modify this code only if:

- you change the channel type (e.g., to mpsc for backpressure),
- you add metadata to `Pending`,
- or you introduce multiple mempool partitions.

Otherwise, keep it stable. It is a core pipeline component.

### 14) Practical troubleshooting checklist

If register/deposit appears to “vanish,” check:

1) `/submit` returned 200 (HTTP layer).
2) `apply_submission` forwarded to mempool (router layer).
3) `submit_transactions` did not log “no subscribers.”
4) the executor is subscribed and alive.

This layered check follows the actual data path and narrows the issue quickly.

---

### 15) The mempool is not a “pool” of validated transactions

Despite the name, this mempool is simply a broadcast channel for pending transactions. It does not validate or store transactions on its own.

Validation happens later, in the execution layer. That means:

- a malformed transaction can still appear in the mempool,
- it will be rejected by execution,
- it may still be visible to any subscriber that listens to mempool traffic.

For register and deposit, this means mempool visibility does not imply success. It only implies “arrived.”

### 16) Why a broadcast channel is chosen over a queue

Queues (mpsc) provide backpressure: the sender waits if receivers are slow. Broadcast channels do not. The simulator uses broadcast because:

- it keeps `/submit` fast,
- it avoids blocking on execution,
- it allows multiple independent consumers.

The tradeoff is potential message loss for slow subscribers. That is accepted here because the executor should be fast enough, and the system prioritizes throughput over guaranteed delivery.

### 17) Mempool buffer sizing and memory usage

Each subscriber has its own buffer. If the buffer size is N and the average pending batch is size B, the memory cost per subscriber is roughly N * B.

If you have multiple subscribers, memory usage multiplies. This is why buffer sizing should be conservative. For onboarding, you rarely need large buffers because traffic is low.

### 18) Relation to deterministic runtime tests

In deterministic tests, the mempool channel behaves the same way, but time is controlled. This helps catch race conditions:

- If a subscriber registers after a submission, it will miss the broadcast.
- This is deterministic and repeatable in tests.

So the mempool layer is a good place to test ordering assumptions.

### 19) Broadcast semantics and ordering guarantees

Within a single sender, broadcast preserves message order. If you submit register then deposit, subscribers will receive register then deposit.

However, if multiple tasks submit concurrently, ordering depends on scheduling. The broadcast channel preserves the order of sends as they occur, but concurrent sends can interleave.

This is important if you ever submit multiple transactions for the same account concurrently. It is another reason the gateway serializes nonce usage.

### 20) Register/deposit and nonce dependency

Register is typically the first transaction for a new account. Deposit may follow immediately.

If those two are submitted in the same batch, the executor will process them in order and the nonce will increment correctly.

If they are submitted in separate batches but near‑simultaneously, ordering depends on mempool broadcast ordering. This is why the gateway’s nonce lock is critical: it prevents concurrent submissions that could violate ordering.

### 21) “No subscribers” is a configuration bug

If you ever see “Failed to broadcast transactions (no subscribers),” it means:

- no executor has called `mempool_subscriber`,
- or the executor died.

In production, treat this as a fatal configuration bug. It means the system is accepting submissions but dropping them immediately. That is worse than an outright failure because it is silent to clients.

### 22) Execution layer expectations

The execution layer expects to receive pending transactions from the mempool. If it doesn’t, it will not advance state, and updates will stall.

This is why mempool health is a leading indicator for overall system health.

### 23) How to instrument mempool health

You can instrument mempool health by:

- tracking subscriber count,
- tracking broadcast failures,
- sampling lag metrics (if available).

If you only have one metric, track broadcast failures. That gives the most direct signal that transactions are not being delivered.

### 24) Practical debugging: using a mempool tap

During debugging, you can add a temporary mempool subscriber that logs every pending batch. This is a “tap.” It allows you to see:

- whether submissions are reaching the simulator,
- whether batches are ordered,
- whether register/deposit are being enqueued.

Remember to remove it afterward, or you will add unnecessary overhead.

### 25) The mempool as a boundary between HTTP and execution

The mempool is the point where synchronous HTTP turns into asynchronous execution. Once a transaction enters the mempool, the HTTP request is over. Everything else is asynchronous.

This is why users can see a delay between “submission accepted” and “registration confirmed.” The mempool decouples those phases.

### 26) Feynman analogy: the town bulletin board

Imagine the simulator posts pending transactions on a public bulletin board. Anyone can read it, but no one is forced to. If you don’t check the board, you miss the notice.

That is exactly how the broadcast mempool works. The executor must check the board regularly or miss transactions.

### 27) Exercises

1) Explain why a broadcast channel can drop messages even if the sender succeeds.
2) Describe how nonce locking in the gateway interacts with mempool ordering.
3) Imagine you have two subscribers: one fast, one slow. Who misses messages and why?

If you can answer these, you understand the mempool layer.

---

### 28) The default buffer size and why it exists

In the simulator configuration, `mempool_broadcast_buffer` defaults to a reasonable number (see `DEFAULT_MEMPOOL_BROADCAST_BUFFER`). This default is tuned for low‑volume environments like local dev or testnets.

For onboarding, the default is usually enough. But if you run load tests or bursty traffic, you should re‑evaluate this value. A too‑small buffer leads to dropped transactions for slow subscribers. A too‑large buffer wastes memory.

### 29) Relationship to validator execution

Validators (or the simulator’s executor) subscribe to the mempool channel and build blocks from pending transactions. This means the mempool is the pipeline input for block production.

For register and deposit:

- they must reach the mempool,
- then be included in a block,
- then produce events.

If block production is paused, mempool traffic accumulates or is dropped, and onboarding stalls.

### 30) Mempool is not persistent

The mempool broadcast channel is in‑memory. If the simulator restarts, all pending transactions are lost. That means:

- register or deposit submissions that were “accepted” but not yet executed may vanish,
- clients will need to resubmit or rely on update confirmations.

This is another reason the gateway should not assume acceptance equals completion.

### 31) Why the simulator does not persist mempool

Persisting mempool transactions would require:

- durable storage,
- replay logic,
- careful handling of duplicates.

That complexity is not necessary for the simulator’s current role. Instead, the system relies on clients (gateway) to retry if needed. This keeps the simulator lightweight.

### 32) Interaction with the updates stream

The mempool broadcast is independent from the updates stream. A transaction can be in the mempool but not yet executed, so no update event exists.

From a UX standpoint:

- The user submits register.
- The mempool receives it.
- Execution happens later.
- An update event confirms registration.

This is why clients should not infer execution from mempool presence.

### 33) Observing mempool for debugging

If you subscribe to the mempool in a debug tool, you can watch pending transactions in real time. This is useful to determine whether:

- the gateway is actually submitting,
- the simulator is receiving submissions,
- batches are arriving in order.

It is also a good way to detect “silent” failures where HTTP returns 200 but execution never happens.

### 34) Mempool and block size limits

The mempool can contain many transactions, but only a subset will be included in each block. The executor applies block size limits elsewhere.

This means:

- bursts of registrations can take multiple blocks to process,
- deposits may be delayed if the mempool is saturated.

From the user’s perspective, this looks like “registration is slow.” It is not an error; it is throughput pressure.

### 35) Batch size and backpressure in practice

If the gateway submits a batch of many transactions, that batch appears as one mempool message. That can make a slow subscriber “miss” a large set of transactions all at once if its buffer overflows.

For onboarding, batches are typically small (one transaction), which reduces this risk.

### 36) Mempool subscriber lifecycle

A subscriber receives messages starting from the moment it subscribes. It does not receive old messages that were already sent.

Therefore:

- If the executor subscribes late, it misses earlier submissions.
- This can happen on startup if submissions arrive before the executor is ready.

In production, you should ensure the executor subscribes before accepting user submissions.

### 37) Startup ordering matters

To avoid missing early transactions:

1) Start the simulator.
2) Start the executor and subscribe to mempool.
3) Start the gateway and begin accepting user submissions.

If you reverse this order, onboarding requests may be dropped.

### 38) Feynman analogy: live news broadcast

The mempool is like a live news broadcast:

- If you tune in after the announcement, you miss it.
- There is no replay unless someone recorded it.

This analogy reinforces why ordering and subscription timing matter.

### 39) Production hardening checklist

For a production‑grade setup:

- Ensure a mempool subscriber is always running.
- Monitor for “no subscribers” warnings.
- Tune buffer sizes based on observed throughput.
- Coordinate startup order so the subscriber comes up before the gateway.

These are operational steps, not code changes, but they are essential.

### 40) Summary

The mempool broadcast is the silent bridge between submissions and execution. It is easy to overlook because it is only a few lines of code. But in practice, it is one of the most important links in the onboarding chain.

If you remember nothing else from this lesson, remember this: **a transaction that never reaches the mempool is a transaction that never exists.**

---

### 41) Tying mempool to validator flow (production view)

In production, validators typically run a full node that subscribes to mempool transactions, selects a batch, and proposes them in a block. The mempool broadcast in the simulator mirrors this behavior.

This means that mempool health is directly tied to:

- block production rate,
- user onboarding latency,
- perceived system responsiveness.

If the validator loop stalls, the mempool will either accumulate or drop transactions. From the user’s perspective, this feels like “register is stuck.” The root cause is often downstream of the mempool, but the mempool is the earliest visible symptom.

### 42) Practical example: burst onboarding

Imagine 1,000 users register in a short burst:

- The gateway submits 1,000 register transactions.
- The simulator broadcasts them in small batches.
- The executor pulls them into blocks, perhaps 500 per block.

Result:

- The first 500 users register quickly.
- The next 500 wait for the next block.

This is normal. The mempool decouples intake from execution. It is the buffer that absorbs bursts.

The takeaway: onboarding latency depends on block throughput, not just HTTP speed.

### 43) Suggested monitoring alerts

If you want to catch mempool issues early, set alerts for:

- repeated “no subscribers” warnings,
- unusually high submit‑to‑event latency,
- mismatches between submission rate and execution rate.

These alerts are more useful than raw queue depth because the mempool is a broadcast channel, not a persistent queue.

---

### 44) Why you might choose a durable queue in the future

For a production‑grade system, you might eventually want a persistent mempool or a durable queue. That would give you:

- recovery after crashes,
- guaranteed delivery to the executor,
- the ability to replay pending transactions.

However, it comes with costs:

- complexity in deduplication,
- more storage overhead,
- more careful ordering rules.

The simulator’s broadcast mempool is intentionally simple. It is the right choice for current requirements, but if onboarding reliability becomes a top priority under heavy load, a durable queue could be the next architectural step.

---

Final reminder: mempool issues almost always surface as onboarding issues first. That is why these low‑level details matter even to product teams. If registration starts failing, check the mempool path before you blame UI or backend logic — it is the most common hidden failure. A single missing subscriber can look like a mysterious client bug, so always verify the executor is listening. Treat mempool health as a first‑class operational metric. In practice, this means alerting on broadcast failures and subscriber liveness. It is a small effort that prevents long outages. That’s the pragmatic takeaway. Keep these checks in your runbook, and review them after every incident. Make them muscle memory. Your future self will thank you. Seriously, it’s worth it. Don’t skip these basics. They are boring but essential. Always. Seriously.

## Key takeaways
- The mempool broadcast is the bridge between submission and execution.
- Register/deposit use the same mempool path as any other transaction.

## Next lesson
E03 - Node entrypoint + network wiring: `feynman/lessons/E03-node-entrypoint.md`
