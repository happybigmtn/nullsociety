# E25 - Commonware macros (select + test_traced) (textbook-style deep dive)

Focus files: `node/src/application/actor.rs`, `node/src/tests.rs`

Goal: explain why Commonware's macros exist, how they affect concurrency semantics, and how they improve test observability. This chapter treats macros as protocol-level behavior, not as syntactic sugar.

---

## 0) Big idea (Feynman summary)

Macros here are not just syntax shortcuts. They encode concurrency policy:

- `select!` decides which asynchronous events win when multiple things happen at once.
- `test_traced` controls how tests emit tracing and logs for deterministic debugging.

These are small pieces of code with large behavioral impact.

---

## 1) Background: async selection and cancellation

### 1.1 The async selection problem

An actor must wait on multiple sources:

- inbound mailbox messages,
- network responses,
- timers,
- cancellation signals.

A naive loop would block on one and starve the others. In distributed systems, starvation is a correctness bug: if you only listen to the mailbox, you might miss a cancellation; if you only listen to the network, you might ignore shutdown.

### 1.2 Why `select!` exists

`select!` allows an actor to wait on multiple futures and take whichever completes first. It is the async equivalent of a priority-aware event loop.

This provides:

- responsiveness (process the first ready event),
- cancellation handling (stop when a signal arrives),
- predictable concurrency boundaries.

---

## 2) The Commonware `select!` macro

Commonware provides its own `select!` macro (via `commonware_macros::select`). It is similar in spirit to `tokio::select!`, but it is designed to be used across runtime variants (deterministic runtime in tests and Tokio in production). That portability is why it matters.

When you use `commonware_macros::select`, you are committing to a concurrency model that is stable across environments.

---

## 3) `select!` in the application actor

The application actor uses `select!` in multiple critical locations. These are not trivial: they decide how the node behaves under load, cancellation, and long-running tasks.

### 3.1 The main mailbox loop

The core loop in `node/src/application/actor.rs` looks like this:

```
select! {
    message = self.mailbox.next() => { ... }
    tx = tx_stream.next() => { ... }
}
```

This pattern means the actor is always responsive to two sources:

- internal control messages (consensus requests, finalize, verify),
- inbound transaction stream from the indexer.

If either side becomes active, the actor handles it immediately. That prevents starvation and keeps both consensus and mempool ingestion moving.

### 3.2 Avoiding blocking on long operations

Inside the propose path, the actor must fetch ancestry and build a block. Instead of blocking the main loop, it spawns a new task and uses `select!` inside that task to wait for ancestry or cancellation:

```
select! {
    ancestry = ancestry => { ... }
    _ = response.closed() => { ... }
}
```

This is subtle but important. The response channel might be closed if consensus moves on or times out. If the actor kept working on ancestry after the response was closed, it would waste resources. The `select!` ensures that cancellation wins if the response is no longer needed.

### 3.3 Verification path with `select!`

The verify path uses a similar pattern:

- It issues asynchronous requests to fetch parent and block data.
- It spawns a task that waits for the fetches or for cancellation.
- It uses `select!` to either process the result or abort.

This ensures that verify does not block the main actor loop and that it respects cancellation semantics.

### 3.4 Why this matters for consensus

Consensus depends on timely responses. If `propose` or `verify` is slow, the node might miss timeouts and trigger view changes. By using `select!` and background tasks, the actor stays responsive and avoids blocking on slow operations.

This is the core value of the macro: it turns asynchronous complexity into explicit, controllable behavior.

---

## 4) `select!` as a cancellation primitive

### 4.1 The response channel pattern

The application actor frequently uses a oneshot `response` channel. If the caller drops the receiver, `response.closed()` becomes ready. That is a signal that the work is no longer needed.

By including `response.closed()` in a `select!`, the actor treats cancellation as a first-class event. This is critical for avoiding wasted computation and for maintaining responsiveness under load.

### 4.2 Deterministic cancellation

Because `select!` is part of the Commonware runtime abstraction, cancellation semantics remain consistent in both deterministic tests and production. This is one of the reasons Commonware provides its own macro: it ensures that concurrency behavior does not change between test and prod.

---

## 5) `test_traced` in `node/src/tests.rs`

The test suite uses `#[test_traced]` on many tests. This macro configures tracing and logging for the test runtime. It is a crucial debugging tool for distributed systems tests because it ensures you can see which tasks ran and in what order.

### 5.1 Why tracing matters in tests

Distributed system tests are complex. They involve multiple simulated validators, network delays, and asynchronous events. If a test fails, you need a timeline of what happened.

The `test_traced` macro ensures that tracing spans are initialized for each test, so logs include context and can be filtered by component.

### 5.2 Test log levels

You will see variants like:

```
#[test_traced("INFO")]
```

This allows tests to run with different log verbosity. For deterministic simulations, being able to toggle log level is essential. It prevents log overload while still providing enough detail for debugging.

### 5.3 Deterministic runtime integration

The tests in `node/src/tests.rs` use the deterministic runtime. The `test_traced` macro ensures that tracing integrates with that runtime rather than the standard Tokio runtime. This is one of those details that makes tests reliable.

---

## 6) How macros encode policy

### 6.1 `select!` chooses winners

When multiple futures are ready, `select!` chooses one. That choice can affect system behavior. For example, if the transaction stream is always busy, the mailbox might be starved unless the `select!` implementation is fair.

The Commonware macro is designed to avoid starvation by being balanced in how it polls futures. This is a policy decision encoded in a macro, not in application logic.

### 6.2 `test_traced` enforces observability

Without `test_traced`, tests would produce sparse or inconsistent logs. By wrapping tests with tracing initialization, the macro guarantees that every test has consistent observability. This is another policy decision: tests must always be inspectable.

---

## 7) Practical example: propose flow with cancellation

Let's walk through a realistic flow:

1) Consensus calls `propose`.
2) The application actor spawns a task to fetch ancestry.
3) The task uses `select!` to wait on ancestry or cancellation.
4) If consensus times out and drops the response, the task stops.
5) The actor remains responsive to new messages.

This is the difference between a responsive node and a node that grinds to a halt under load. The macro drives that behavior.

---

## 8) Practical example: verify flow with cancellation

The verify path is similar:

1) Consensus calls `verify`.
2) The actor spawns a task to fetch parent and block.
3) It uses `select!` to either complete verification or abort.
4) If the response channel is closed, the task cancels.

This ensures verify does not waste CPU if consensus moves on. It is a critical performance safeguard.

---

## 9) Macro usage in tests: consistency and debugging

The tests simulate failures, recoveries, and long-running consensus. Without consistent tracing, failures would be hard to diagnose. The `test_traced` macro ensures:

- consistent logging setup,
- deterministic integration with the runtime,
- easy filtering of logs by component.

This is particularly important for tests like `test_unclean_shutdown` and `test_execution_bad_links`, where timing and ordering matter. The macro gives you the visibility needed to understand these scenarios.

---

## 10) Failure modes and why macros help

### 10.1 Starvation

If the select logic is unfair, one source can starve another. For example, a busy transaction stream could prevent consensus messages from being processed. The Commonware `select!` macro is designed to avoid that by polling multiple futures fairly.

### 10.2 Cancellation leaks

Without cancellation handling, tasks can continue running after they are no longer needed. Over time, these leaked tasks can exhaust resources. The `select!` patterns in the application actor prevent this by explicitly monitoring response channels.

### 10.3 Unobserved test failures

Without `test_traced`, a failing test might produce no useful logs. The macro ensures that every test has a tracing context, making failures diagnosable.

---

## 11) How to reason about `select!` in this codebase

When you see `select!` in the code, ask:

- What are the competing futures?
- Which one should win in case of conflict?
- What happens if the loser is canceled?
- Is there a fairness requirement?

This is the mental model you need to reason about concurrency in this system.

---

## 12) Feynman recap

Commonware's macros encode concurrency and observability policy. `select!` keeps actors responsive by allowing them to wait on multiple events and handle cancellation explicitly. `test_traced` ensures tests emit structured logs and tracing, making complex distributed simulations debuggable.

If you can explain why `select!` is used in propose/verify flows and why tests are wrapped with `test_traced`, you understand how these macros shape system behavior.

---

## 13) Code walkthrough: the main `select!` loop (application actor)

Focus file: `node/src/application/actor.rs` around the first `select!` loop (lines ~770+).

At the top of the application actor, the code builds a reconnecting indexer and then creates a transaction stream from it. After that it enters an infinite loop with a `select!` that waits on three different inputs. This `select!` is the heart of the actor, so it is worth tracing it step by step.

### 13.1 The three branches

The macro waits on three futures at once:

1) `message = self.mailbox.next()`  
2) `fatal = &mut proof_err_rx`  
3) `pending = tx_stream.next()`

Think of this as three phones that can ring. The actor should pick up the first one that rings, handle it, and then go back to listening to all three again. That is the core of responsive event-driven design.

### 13.2 Branch 1: mailbox messages

The mailbox is the internal control plane. Messages come from consensus and other internal components. When `self.mailbox.next()` yields `None`, the mailbox has closed and the actor exits. This is a clean shutdown signal.

When it yields `Some(message)`, the actor matches on the message variant. The match handles `Genesis`, `Propose`, `Ancestry`, `Broadcast`, `Verify`, `Finalized`, `Seeded`, and more. Each variant is a distinct control operation, and most of them do not do heavy work inline. Instead they either:

- respond immediately (genesis), or
- spawn a background task for slow IO, or
- move a job into a proof queue, or
- update internal state.

This is an intentional design: the mailbox is a high-priority control channel. If the actor spent large amounts of time inside this branch, it would block other mailbox messages and stall consensus.

### 13.3 Branch 2: proof worker fatal channel

The second branch waits on `proof_err_rx`. That receiver is an error channel from a background proof worker. If a fatal error arrives, the actor logs and returns. This is effectively a circuit breaker: the proof system is so important that a fatal error means the whole application actor should stop.

The important concurrency idea here is priority. A fatal error should be handled as quickly as possible. Putting it in the `select!` means it can interrupt other work at the next poll, instead of waiting behind slow IO.

### 13.4 Branch 3: incoming transactions from the indexer

The third branch is the data plane. It reads batches of transactions from the mempool stream. The code expects `Some(Ok(pending))`, and anything else is ignored. The comments explain why: the reconnecting wrapper hides network failures, so the stream itself should not end; only per-transaction errors should appear, and those are dropped.

Once a batch arrives, the code loops over `pending.transactions`, checks nonces against state (using the nonce cache and a fallback state read), and then admits valid transactions into the local mempool.

This is important: data-plane work is processed in the same loop as control-plane messages, but it is kept lightweight. It is mostly in-memory checks and insertions. Anything heavy (like proof construction or IO) is deferred to other tasks.

### 13.5 Why this matters for `select!`

If the actor were written as:

- read mailbox fully, then
- read tx stream fully,

one of these would starve the other. The `select!` prevents that by interleaving the two. The data-plane can be busy, but consensus still gets attention. The control-plane can be busy, but transactions still flow.

This is the first key provision of `select!` in this codebase: it gives you fairness at the top-level event loop without writing a custom scheduler.

---

## 14) Code walkthrough: `select!` inside the propose path

Focus file: `node/src/application/actor.rs` around the `Message::Propose` handling (lines ~800+).

The propose path is split into two stages: a fast stage in the mailbox handler and a slow stage in a spawned task.

### 14.1 Fast stage in the mailbox

When a `Message::Propose` arrives:

1) The actor starts timing (ancestry latency, propose latency).
2) It handles the genesis parent case immediately and replies.
3) It computes an ancestry request using `ancestry_cached`.
4) It spawns a task to finish the slow work.

Only step (4) is slow, so it gets pushed into a background task. This avoids blocking the mailbox loop.

### 14.2 The spawned task and its `select!`

Inside the spawned task, there is a `select!` with two futures:

- the ancestry request future, and
- `response.closed()` which signals cancellation.

This is a very common cancellation pattern in this codebase. The response channel is a oneshot the consensus layer is waiting on. If consensus times out or moves to a new view, it drops the receiver. That makes `response.closed()` ready, which the `select!` catches.

The behavior is:

- If ancestry arrives first, the actor sends the ancestry back to the consensus layer.
- If cancellation happens first, the task stops and the timer is canceled.

### 14.3 Why the cancellation path is critical

Without the cancellation branch, the task would continue to work even though the result is no longer useful. Under load, that creates a backlog of useless tasks. This can cause memory growth, slow down useful work, and ultimately lead to timeouts.

The macro makes cancellation explicit. It forces the developer to decide what to do when the response channel is closed.

### 14.4 The Feynman mental model

Imagine you are a waiter taking an order from a table. If the table leaves the restaurant, you should stop cooking. The `response.closed()` branch is your signal that the table left. `select!` is you checking both the kitchen timer and the dining room at the same time.

---

## 15) Code walkthrough: `select!` inside the verify path

Focus file: `node/src/application/actor.rs` around `Message::Verify` handling (lines ~980+).

The verify path is slightly more complex than propose, because it has to fetch two blocks: the parent and the block to verify. The code does this by constructing two futures and then joining them.

### 15.1 Building the requests

The code builds `parent_request` as either:

- an immediate future that yields the genesis block, or
- a subscription to the marshal for the parent block.

It also starts a subscription for the payload block (the block being verified).

### 15.2 Joining and then selecting

The verify task creates a future that `try_join`s the parent and payload. Then it wraps that in a `select!` with `response.closed()`, similar to propose.

So the order is:

1) Start both block fetches.
2) Wait for both to complete with `try_join`.
3) Abort if the response channel closes.

### 15.3 The verification logic

When the blocks arrive, the verify path checks:

- the block view matches the requested view,
- the height is parent height plus one,
- the parent digest matches.

It then batch-verifies transaction signatures with a `Batch` verifier. If verification succeeds, the block is persisted as verified and the result `true` is sent back.

Notice the same structure as propose: the heavy work is inside a spawned task, and the `select!` guards it with cancellation.

### 15.4 Why `select!` is necessary here

Verification can be expensive. If consensus times out, continuing to verify is wasted work. The `select!` ensures the node does not spend CPU on a block that is no longer relevant.

This is a practical concurrency policy: always prefer cancellation over expensive computation when the caller has moved on.

---

## 16) The `select!` macro as a policy boundary

One way to understand `select!` is to think of it as a policy boundary between "what the system could do" and "what the system chooses to do."

### 16.1 Choosing between control and data

At the top-level loop, the actor chooses between control messages and incoming transactions. That choice defines the responsiveness of the node. If the node prioritized transactions too much, it would stall consensus. If it prioritized consensus too much, the mempool would grow and the chain would stall due to lack of payload.

The `select!` is the mechanism that enforces this balancing act.

### 16.2 Choosing between work and cancellation

Inside propose and verify, the task chooses between "do the work" and "stop because canceled." This is a more subtle but equally important policy. It is the difference between a system that cleans up after itself and a system that leaks work.

The common pattern across the codebase is: start work, but always keep one eye on cancellation.

### 16.3 The cost of getting it wrong

If you remove the cancellation branch, tasks will accumulate. If you forget to include a critical event in a `select!`, the actor can hang waiting for a future that might never resolve. These are not cosmetic mistakes; they show up as timeouts, missing blocks, or deadlocks.

So while the macro is only a few lines of syntax, it encodes the correctness of liveness and responsiveness.

---

## 17) Deep dive: `test_traced` and deterministic testing

Focus file: `node/src/tests.rs` where `#[test_traced]` is used.

The tests in this codebase are not simple unit tests. Many are full simulations of multi-validator networks, with randomized links and timeouts. These tests run on the deterministic runtime, which means time and scheduling are simulated rather than driven by wall clock.

In that environment, observability is essential. You cannot just "print stuff" and hope it makes sense. You need structured logs with context, and you need them to be reproducible.

### 17.1 What we can infer from usage

The macro is used in two styles:

- `#[test_traced("INFO")]`
- `#[test_traced]`

From this we can infer that the macro accepts an optional string parameter, likely a log level. When no parameter is provided, it probably uses a default level.

Because the tests import `tracing::{info, warn}`, the macro almost certainly initializes a tracing subscriber or similar logging backend so those macros actually emit output in a consistent format.

### 17.2 Why this matters for deterministic tests

In deterministic runtimes, task scheduling is reproducible. That means logs are also reproducible if they are tied to the same scheduler. A test failure can be replayed and studied.

If the tracing setup differed between tests, you could get inconsistent logs and lose the ability to compare runs. The macro enforces consistency across the suite.

### 17.3 A practical debugging rule

When a test fails, you can rerun it and expect the same order of events. The `test_traced` macro is the tool that ensures you can see those events at the right level of detail.

Without it, the tests would still run, but you would be debugging in the dark.

---

## 18) Walkthroughs of key `test_traced` tests

Here we connect the macro to the tests that use it. The point is not the macro itself, but how the macro enables the tests to act as reliable simulations.

### 18.1 `test_good_links` and `test_bad_links`

These tests build simulated networks with different link qualities. The important part is not just that they run, but that they are repeatable. The tests call `all_online` with fixed seeds and then compare the resulting auditor state across runs.

If the deterministic runtime produced divergent scheduling between runs, this test would fail. The macro ensures that the logging and tracing are deterministic as well, which helps when debugging any divergence.

### 18.2 `test_1k`

This test simulates a network with a larger message load. It intentionally reduces validator count to keep the runtime bounded in CI. Here, tracing matters for performance debugging: if the simulation is slow, the logs help explain whether the delay was due to link latency, consensus timeouts, or execution work.

### 18.3 `test_backfill`

This test is long and complex. It simulates validators joining and then backfilling missing data. The test includes multiple loops that wait for the indexer and metrics to catch up.

Without structured logging, this test would be opaque. With `test_traced`, you can see when each validator progresses and where it stalls.

### 18.4 `test_unclean_shutdown`

This test repeatedly starts and stops validators to simulate crash recovery. It loops across runs, reusing indexer state, and checks that the network converges again.

This is exactly the kind of test where tracing is needed: you need to see which run failed, which validator failed to restart, and whether the failure was due to network conditions or state handling.

### 18.5 `test_execution_*`

The execution tests exercise the state transition logic under different link qualities. They rely on repeated runs with fixed seeds to verify determinism.

Again, the macro ensures that logs are consistent and that you can compare run-to-run behavior if a test fails.

---

## 19) How to extend `select!` and `test_traced` correctly

This section is a checklist for future development.

### 19.1 Adding a new asynchronous operation in the actor

If you add a new slow operation in the mailbox handler, you should almost always:

1) spawn a task for the slow part, and
2) include a `select!` between the work future and `response.closed()`.

That ensures the work can be canceled if consensus moves on.

### 19.2 Adding new streams to the main loop

If you introduce a new stream (for example, a gossip channel), you have two options:

- add it as another branch in the main `select!`, or
- create a separate task that forwards into the mailbox.

The first gives the stream equal priority with existing events. The second treats it as lower priority since it can be buffered and serialized into mailbox events.

### 19.3 Adding new tests

If the test depends on deterministic scheduling or if it is a multi-node simulation, use `#[test_traced]`. If it is a simple unit test with no concurrency or network simulation, a plain `#[test]` is fine.

If you do use `#[test_traced]`, pick a log level that will be useful when the test fails, not when it passes.

---

## 20) Conceptual exercises (Feynman style)

1) Explain why the main application actor loop needs to listen to the mailbox and the mempool stream at the same time. What goes wrong if it does not?
2) Explain why the propose and verify tasks check `response.closed()`. What resource leak occurs if you remove that branch?
3) Suppose `proof_err_rx` fires while the actor is busy processing transactions. Why is `select!` the right tool to handle this?
4) If you add a new stream for gossip, where would you integrate it and why?
5) When would you intentionally avoid `test_traced` and use a plain `#[test]`?

These questions are a self-check. If you can answer them, you understand the concurrency policy embodied by these macros.
