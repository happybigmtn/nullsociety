# L19 - Submission -> mempool (register + deposit) (from scratch)

Focus file: `simulator/src/submission.rs`

Goal: explain how register/deposit submissions flow into the simulator’s transaction pipeline. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Transactions submission path
Register and deposit are both `Submission::Transactions`. The simulator does not care which instruction is inside — it routes all transactions the same way.

### 2) Mempool broadcast
When transactions are submitted, they are broadcast on the mempool channel so execution can process them.

---

## Walkthrough with code excerpts

### 1) Transactions submission branch
```rust
Submission::Transactions(txs) => {
    if log_admin {
        log_admin_transactions(&txs);
    }
    simulator.submit_transactions(txs);
    Ok(())
}
```

Why this matters:
- This is the exact path that register/deposit transactions take after decode.

What this code does:
- Optionally logs admin transactions for audit.
- Sends the transaction batch to the simulator’s mempool broadcaster.

---

## Extended deep dive: why the submission router matters for onboarding

At first glance this function looks trivial: it just forwards transactions. But this is the *bridge* between HTTP submissions and the internal transaction pipeline. The design choices here influence onboarding reliability and observability.

### 2) Transaction routing is intentionally uniform

The router does not inspect individual transactions. It does not check whether a transaction is a register or deposit. It treats all transactions identically.

Why?

- It keeps the routing layer independent of business logic.
- It avoids duplicated validation (the execution layer already validates).
- It makes the system resilient to new instruction types.

This is a common pattern in blockchain systems: the “mempool ingress” layer only validates coarse‑grained properties, then forwards to execution.

### 3) `log_admin` and its implications

The `log_admin` flag is passed from the HTTP handler. It determines whether admin transactions are audited.

Register and deposit are *not* admin instructions, so they are not logged by `log_admin_transactions`. But the flag still matters because:

- It adds overhead (hashing) for admin instructions.
- It is a switch you can use in test environments to silence audit logs.

This separation lets you control logging policy without touching routing logic.

### 4) Mempool submission is fire‑and‑forget

Notice that `submit_transactions` does not return a result here. The router does not wait for validation or execution.

This is a deliberate design:

- It keeps `/submit` fast and lightweight.
- It allows the simulator to handle transaction processing asynchronously.
- It avoids blocking the HTTP handler on execution logic.

The cost is that HTTP 200 only means “accepted into the pipeline,” not “executed.” That is why updates are essential for confirmation.

### 5) Why register is safe to treat like any other transaction

You might think registration should be special because it creates identity. But the execution layer already enforces:

- “player already registered” checks,
- state creation for new players,
- event emission.

So the router can remain generic. This is good design: it keeps responsibilities separate.

### 6) Failure cases: where rejection happens

The router only returns errors for two reasons:

- invalid seed,
- invalid summary.

Transaction failures do **not** surface here. They are handled later in execution.

That means:

- if a registration is invalid, the router still returns `Ok(())`,
- the rejection will show up as an error event later.

This is subtle but important for debugging. Do not expect a failed registration to produce an error here.

### 7) Why the router returns `Ok(())` for transactions

The router’s contract is “ingest the submission.” It does not promise to execute it. This is the reason it returns `Ok(())` as soon as transactions are handed to the simulator.

Think of it like a mail room:

- The mail room says “received” once it puts the letter in the internal mailbag.
- It does not guarantee the letter has been read.

That model is exactly what the router implements.

### 8) Interactions with mempool broadcast

`submit_transactions` sends the transactions to a broadcast channel. If no one is listening, the broadcast fails and a warning is logged.

This is a critical operational detail:

- If there are no subscribers, transactions will never be executed.
- Register and deposit will appear to “succeed” at the HTTP layer but never take effect.

So one of the first troubleshooting steps for onboarding failures is: “Is the mempool subscriber running?”

### 9) Why this layer is still worth testing

Even though it is small, you should test it:

- Submit a register transaction and verify it reaches the mempool.
- Submit a malformed summary and ensure it returns `InvalidSummary`.

These tests ensure the router continues to behave as expected when the protocol evolves.

### 10) Feynman analogy: conveyor belt

Imagine a factory conveyor belt:

- The router is the worker who places items on the belt.
- The belt moves items to the assembly line (execution).
- The worker does not inspect the item’s contents; the assembly line does.

If the belt is not running, items pile up. That’s what happens if the mempool subscriber is missing.

### 11) Practical debugging checklist

If register/deposit appears to be “accepted but not applied”:

1) Check that `/submit` returns 200.
2) Check for mempool broadcast warnings (“no subscribers”).
3) Check that the validator or simulator executor is subscribed to mempool updates.
4) Check updates stream for `CasinoPlayerRegistered` or `CasinoDeposited` events.

This checklist maps directly to the routing and broadcast path.

### 12) Summary: keep the router small

The router’s simplicity is a feature. It keeps onboarding stable even as the instruction set grows. If you ever feel tempted to add logic here, ask yourself:

- Should this be in execution instead?
- Will this make the router harder to reason about?

Usually the answer is “keep it in execution.” That preserves the clean separation of concerns.

---

### 13) Understanding `Submission::Seed` and `Submission::Summary` (context)

Even though this lesson focuses on transactions, it helps to know what the other submission types do:

- **Seed** submissions carry randomness seeds signed by a validator quorum.
- **Summary** submissions carry proofs and digests from consensus to keep the simulator in sync.

The router verifies seeds and summaries before accepting them. Transactions, by contrast, are accepted into the mempool without immediate verification.

This contrast explains why the router’s error type only includes `InvalidSeed` and `InvalidSummary`. Transactions are validated later.

### 14) Why transaction validation is deferred

There are three reasons transactions are not validated here:

1) The execution layer already knows how to validate transactions using current state.
2) Validation may be expensive (signature checks, state reads).
3) The router is meant to be fast and predictable.

Deferring validation also enables batching. The executor can validate transactions in a batch, which can be more efficient than validating each one at the HTTP boundary.

### 15) The mempool broadcast channel as a “fan‑out”

The `submit_transactions` method pushes `Pending { transactions }` into a broadcast channel. Broadcast means:

- multiple subscribers can receive the same batch,
- each subscriber gets its own copy,
- the sender does not block on any one subscriber.

This is a good fit for a simulator that may have:

- one subscriber for execution,
- another for metrics or logging,
- another for testing or debugging.

In production, you might have only one subscriber, but the broadcast design keeps the system flexible.

### 16) What happens if the broadcast channel is full

In a broadcast channel, each receiver has its own buffer. If a receiver falls behind, it will miss messages. The sender doesn’t block; it simply logs lag.

For register/deposit, that means:

- a slow subscriber could miss onboarding transactions,
- which would make those actions appear “lost.”

This is why the executor should keep up with mempool traffic. If it falls behind, users see missing updates.

### 17) Interaction with deterministic simulation

In tests, the simulator uses a deterministic runtime. The mempool broadcast still works, but time is simulated. This means:

- submissions are deterministic,
- mempool ordering is reproducible,
- tests can compare state outcomes across runs.

The router’s simplicity helps maintain this determinism. It doesn’t insert extra randomness or timing variability.

### 18) Register/deposit as “first transactions”

Because register/deposit are the earliest transactions for a user, they also serve as a test of the mempool path. If the mempool broadcast path is broken, onboarding is the first thing that will fail.

This is why L19 exists: it highlights the exact boundary where onboarding moves from HTTP into the internal transaction pipeline.

### 19) The role of `log_admin_transactions`

Admin transactions are logged for audit. The router calls `log_admin_transactions` before forwarding. This is the only place where admin logging can be guaranteed because:

- it sits before execution,
- it sees the full transaction batch.

Register and deposit are not admin instructions, but their presence in the same batch shows why the router logs selectively: it avoids logging every user transaction, which would be too noisy.

### 20) Observability and audit trails

The logs emitted from this layer are part of your audit trail:

- admin actions are logged with hashes,
- mempool broadcast failures are logged as warnings.

If you need to answer “did the gateway submit this registration?”, you can correlate:

- gateway submit logs,
- simulator router logs,
- executor logs,
- update stream events.

The router sits at the heart of that chain of evidence.

### 21) Failure scenario walkthrough

Scenario: A user submits registration, gateway reports “accepted,” but the user never appears registered.

Possible causes at this layer:

- The router accepted the transactions but `submit_transactions` had no subscribers.
- The broadcast channel dropped the message because the subscriber lagged.

In both cases, the router logs a warning. That is your diagnostic signal.

### 22) Why the router does not keep a queue itself

You might ask: why not store transactions in a queue in the router? The answer is separation of concerns:

- The router is stateless.
- The mempool is the queue.

By keeping the router stateless, you avoid duplicating state, reduce memory usage, and keep the system simpler.

### 23) Operational tuning: mempool capacity

The mempool broadcast buffer size is configurable in simulator config (`mempool_broadcast_buffer`). If it is too small, subscribers will lag and miss transactions. If it is too large, memory usage increases.

Register/deposit traffic is low, so the default buffer is usually sufficient. But if you bulk‑register users (e.g., load tests), you may need to increase it.

### 24) Future extensibility

Because the router treats all transactions equally, adding new instruction types does not require changes here. That is a major maintainability win. The only time you would touch this file for new instructions is if you introduce a new submission type.

### 25) Feynman exercise

Explain to a new engineer why the router returns `Ok(())` for invalid transactions. If they can articulate the separation between ingestion and execution, they understand this layer.

---

### 26) Batch submissions and ordering

The router receives a **batch** of transactions, not a single transaction. The order inside the batch is preserved when it is forwarded to the mempool.

Why ordering matters:

- Register must occur before any game actions for a new player.
- If a batch contains multiple transactions from the same account, order determines which nonce is valid.

The router does not reorder anything; it forwards in the same sequence. That keeps ordering deterministic and avoids hidden behavior.

### 27) Idempotency at the router boundary

If the gateway accidentally submits the same register transaction twice, the router will forward both. The execution layer will reject the duplicate (already registered).

This is an important property: the router does not try to deduplicate. It is not stateful. Deduplication belongs to the execution layer, which has the full state needed to decide what is truly a duplicate.

### 28) The meaning of “accepted” at this stage

When `apply_submission` returns `Ok(())` for transactions, it means:

- the submission was well‑formed,
- it has been placed on the mempool broadcast channel.

It does **not** mean:

- the transaction was executed,
- the transaction is valid,
- the transaction will be included in a block.

This distinction is subtle but crucial for onboarding. It explains why an HTTP 200 does not guarantee registration success.

### 29) What happens if there are no subscribers

The mempool broadcast can fail if there are no subscribers. The router logs a warning and continues. That means:

- submissions “succeed” from the HTTP client’s perspective,
- but nothing will ever execute.

This is a dangerous failure mode because it is silent to users. Monitoring the “no subscribers” warning is essential.

### 30) Observability checklist for this layer

To monitor the router:

- watch for warnings about mempool broadcasts,
- watch for audit logs of admin actions,
- correlate submission rates with mempool execution rates.

If those metrics diverge, the pipeline is broken between router and executor.

### 31) Edge case: mixed admin and user transactions

The router logs admin transactions but still forwards the entire batch, including user transactions. That means:

- admin actions are auditable,
- user actions are still processed normally.

This is the correct behavior. Logging should not change execution semantics.

### 32) Concurrency and thread safety

The router itself is async and can be called concurrently. It does not maintain mutable shared state (other than logging), so it is safe under concurrency.

The mempool broadcast channel is thread‑safe. Each call to `submit_transactions` is independent.

This makes the router a good concurrency boundary: it is safe to call from many HTTP requests without coordinating between them.

### 33) Testing recommendations

If you were to test this file, focus on:

- Transaction batch forwarding: ensure mempool subscribers receive the batch in order.
- Admin logging: ensure admin instructions emit log entries.
- Seed/summary validation: ensure invalid seed/summary returns the correct error.

These tests cover the three core responsibilities of the router.

### 34) Mental model: a post office sorting center

The router is a sorting center:

- It recognizes envelopes (submissions) by their tag.
- It routes them to the correct belt (seed, transactions, summary).
- It does not inspect the contents deeply.

If the belt is missing (no subscribers), the envelopes fall off and are lost. That’s why monitoring belt health is critical.

### 35) Final recap

If you summarize this file in one sentence: “It routes submissions into the correct internal pipeline and logs admin actions, without executing anything itself.”

This single sentence captures the essential role of the router. If you keep that in mind, you will not expect it to do things it is not designed to do.

---

### 36) Worked example: a register submission in the router

Imagine a batch with a single register transaction:

1) `/submit` decodes a `Submission::Transactions` with one transaction.
2) `apply_submission` matches `Submission::Transactions(txs)`.
3) `log_admin_transactions` does nothing (not an admin instruction).
4) `submit_transactions` publishes `Pending { transactions: vec![register_tx] }`.
5) The executor subscribes and eventually processes the register.

At no point does the router inspect the instruction contents. The only place the register semantics are enforced is in the execution handler. This worked example reinforces the layering.

### 37) How summaries and seeds still matter to onboarding

Even though register and deposit are transactions, they rely on the chain’s global state, which is updated by summaries and seeds. If the simulator is out of sync with consensus:

- registration may fail because state is stale,
- deposit rate limits may be computed incorrectly,
- leaderboard updates may be wrong.

That means the router’s correctness depends indirectly on the health of seed and summary processing. This is why monitoring summary verification errors is relevant even for onboarding.

### 38) When you might change this file

Most protocol changes will not touch this router. You would only modify it if:

- you add a new submission type, or
- you change the way transactions are routed (e.g., different mempool partitions).

If you find yourself adding logic here for a specific instruction, that is usually a sign that the logic belongs in execution instead.

Keeping this file stable is good for system stability. It acts like a protocol “glue” layer.

---

### 39) Metrics and monitoring gaps

The router itself does not emit dedicated metrics for transaction forwarding. That means you infer its health indirectly:

- count of `/submit` requests,
- mempool subscriber health,
- execution throughput.

If you want more direct visibility, you could add a lightweight counter in `submit_transactions` for “transactions forwarded.” But be cautious: adding too much instrumentation here can increase overhead in the hot path.

### 40) A final mental model

Think of this layer as the “intake desk” of a hospital:

- It checks that the paperwork exists (submission type).
- It hands the patient to the right department (mempool/execution).
- It does not perform the surgery (execution).

If patients vanish between intake and surgery, you look at the hallway (mempool) — not at the intake desk.

---

One last reminder: the submission router is intentionally boring. Its job is to move bytes from the HTTP boundary into the internal pipeline with minimal logic. If you keep that in mind, you will debug faster and avoid over‑engineering this layer. It is the classic case where simplicity is a feature, not a missing capability. Treat it like a stable API surface: you rarely change it, but you rely on it constantly. When in doubt, fix issues in execution or networking, not here. The router should be the last place you suspect a logic bug. That mindset keeps the architecture clean and your troubleshooting focused. It is boring on purpose, and that’s exactly why it works. Keep the router boring and you keep onboarding predictable. That is the whole goal. Everything else belongs downstream. That is the design contract. Stick to it. Always. Seriously.

## Key takeaways
- Register and deposit are handled as plain transactions.
- They enter the mempool via `submit_transactions` and are picked up by validators.

## Next lesson
L20 - Register mempool listener: `feynman/lessons/L20-register-mempool.md`
