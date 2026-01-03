# E25 - Commonware macros (select + test_traced) (textbook‑style deep dive)

Focus files: `node/src/application/actor.rs`, `node/src/tests.rs`

Goal: explain why Commonware’s macros exist, how they affect concurrency semantics, and how they improve test observability.

---

## 0) Big idea (Feynman summary)

Macros here are not “syntactic sugar.” They encode **concurrency policy**:
- `select!` determines which asynchronous events win.
- `test_traced` defines how tests emit tracing and logs.

This is small code with big behavioral impact.

---

## 1) Background: async selection and cancellation

### 1.1 The async selection problem
An actor must wait on multiple sources:
- inbound mailbox messages,
- network responses,
- cancellation signals.

A naive loop would block on one and starve the others.

### 1.2 Why `select!` exists
`select!` allows an actor to wait on *multiple* futures and take whichever completes first.

This provides:
- responsiveness,
- cancellation handling,
- predictable concurrency boundaries.

---

## 2) `select!` in the application actor (`node/src/application/actor.rs`)

### 2.1 Main mailbox loop

Excerpt:
```rust
select! {
    message = self.mailbox.next() => { /* dispatch */ }
}
```

Interpretation:
- The actor waits on its mailbox.
- When a message arrives, it handles it immediately.
- The loop is the actor’s “heartbeat.”

### 2.2 Nested selection: handling cancellation
Inside proposal and verification flows, the actor uses `select!` to race:
- a network fetch,
- or a client cancellation (`response.closed()`).

Pattern to find:
```rust
select! {
    result = requester => { /* handle blocks */ },
    _ = response.closed() => { /* cancel */ },
}
```

Why it matters:
- Without cancellation, the actor would keep fetching and processing blocks even if the requester is gone.
- That wastes CPU and delays other tasks.

### 2.3 Fairness and responsiveness
Because the actor uses `select!`:
- It stays responsive under load.
- It can interleave long proof jobs with message handling.

This is the concurrency policy of the system.

---

## 3) `test_traced` in node tests (`node/src/tests.rs`)

### 3.1 What it does
The macro initializes tracing for a test with a specific log level.

Excerpt:
```rust
#[test_traced("INFO")]
fn test_good_links() { ... }
```

### 3.2 Why it matters
Distributed tests can fail nondeterministically.
- Without tracing, you get a silent failure.
- With tracing, you can see timing, retries, and network simulation steps.

### 3.3 How it is used here
In `node/src/tests.rs`, the macro wraps network simulation tests:
- `test_good_links`
- `test_bad_links`
- `test_1k`

These tests are timing‑sensitive, so tracing is essential for debugging.

---

## 4) Invariants and gotchas

- **Selection order matters**: a different ordering can bias the system.
- **Cancellation must be honored**: always check `response.closed()`.
- **Tracing can be noisy**: use it in tests, not production hot loops.

---

## 5) Exercises

1) In `application/actor.rs`, count how many `select!` blocks exist.
2) For each `select!`, list the competing futures.
3) In `node/src/tests.rs`, list every `#[test_traced]` and its log level.

---

## Next steps
Re‑read E17 and E18 with this concurrency model in mind.
