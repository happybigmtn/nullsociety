# L22 - Execution dispatch (register + deposit) (from scratch)

Focus file: `execution/src/layer/mod.rs`

Goal: explain how register/deposit transactions are validated and routed in the execution layer. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Prepare vs apply
- **Prepare** validates nonce and stages account updates.
- **Apply** runs the instruction handler to produce events.

### 2) Register/deposit are casino instructions
Both register and deposit are handled by the casino dispatch path.

---

## Walkthrough with code excerpts

### 1) Prepare step (nonce validation)
```rust
async fn prepare(&mut self, transaction: &Transaction) -> Result<(), PrepareError> {
    let mut account = load_account(self, &transaction.public)
        .await
        .map_err(PrepareError::State)?;
    validate_and_increment_nonce(&mut account, transaction.nonce)?;
    self.insert(
        Key::Account(transaction.public.clone()),
        Value::Account(account),
    );

    Ok(())
}
```

Why this matters:
- Register/deposit will be rejected if nonces are wrong.

What this code does:
- Loads the account from state.
- Validates and increments the nonce.
- Stages the updated account in the pending map.

---

### 2) Dispatch to casino handler
```rust
match instruction {
    Instruction::CasinoRegister { .. }
    | Instruction::CasinoDeposit { .. }
    | Instruction::CasinoStartGame { .. }
    | Instruction::CasinoGameMove { .. }
    // ... other casino instructions ...
    => {
        self.apply_casino(public, instruction).await
    }
    // ... staking/liquidity/bridge ...
}
```

Why this matters:
- This is how register/deposit reach their specific handler.

What this code does:
- Groups casino instructions together and delegates to `apply_casino`.

---

## Extended deep dive: execution dispatch for onboarding

The execution layer is where register and deposit become actual state changes. This dispatch file is the traffic controller that routes each instruction to the correct handler and enforces nonce rules first.

### 3) The two‑phase execution model in practice

Execution has two phases:

1) **Prepare**: validate nonce and stage account updates.
2) **Apply**: execute the instruction and emit events.

For register and deposit, this means:

- prepare ensures the nonce matches account state,
- apply executes `handle_casino_register` or `handle_casino_deposit`.

If prepare fails, apply is never called. This is why nonce mismatch prevents registration even if the instruction bytes are correct.

### 4) Why nonce validation happens before instruction routing

Nonce validation is a universal rule for all transactions. It does not depend on instruction type.

Placing nonce validation in `prepare` keeps the code DRY and ensures consistent behavior across all instructions. If nonce validation were handled in each handler, the risk of inconsistent or forgotten checks would be high.

### 5) Register/deposit are casino instructions

The dispatch table groups `CasinoRegister` and `CasinoDeposit` with other casino instructions. This grouping is important because:

- it keeps casino logic encapsulated,
- it avoids mixing casino logic with staking/liquidity/bridge logic,
- it makes the system easier to reason about.

If you add a new casino instruction, you add it to this group and implement it in the casino handler module.

### 6) Prepare step details: account loading and nonce update

The `prepare` function does:

- `load_account(self, &transaction.public)`: fetch account state.
- `validate_and_increment_nonce`: ensure nonce matches and increment.
- `insert` updated account into pending state.

This means nonce increments are staged *before* any game logic runs. It guarantees that if apply succeeds, the nonce update is already ready to commit.

### 7) Why prepare uses the Layer’s overlay

The Layer is an overlay that includes both base state and pending updates. By using `load_account(self, ...)`, prepare sees the latest staged changes.

This matters if:

- a block contains multiple transactions from the same account,
- earlier transactions in the same block already incremented the nonce.

Because prepare sees pending state, it validates the next nonce correctly within the same block.

### 8) The skip‑on‑nonce‑mismatch policy

In `execute`, if `prepare` returns a `NonceMismatch`, the transaction is skipped rather than aborting the entire block.

This policy keeps block execution moving even if one transaction is stale. For onboarding, that means:

- one user’s bad nonce doesn’t block others,
- but the user with the bad nonce sees no effect.

This is a tradeoff: it improves liveness at the cost of silent skips. The gateway must surface nonce mismatch errors to users to avoid confusion.

### 9) Dispatch table as the “source of truth”

The dispatch match in `apply` is the source of truth for what instructions are supported. If an instruction is missing here, it is effectively unsupported even if it exists in the types.

That is why dispatch changes are protocol‑critical. Adding a new instruction requires:

- updating the types,
- updating the dispatcher,
- implementing the handler.

Missing any step yields a runtime error.

### 10) Register flow from dispatcher to handler

For register:

1) Transaction passes nonce validation in `prepare`.
2) Dispatcher matches `Instruction::CasinoRegister`.
3) `apply_casino` calls `handle_casino_register`.
4) Handler writes player state and emits events.
5) Execution returns events to be committed.

This flow is deterministic and repeatable. That is why register is a good “hello world” for understanding the execution pipeline.

### 11) Deposit flow from dispatcher to handler

For deposit:

1) Transaction passes nonce validation in `prepare`.
2) Dispatcher matches `Instruction::CasinoDeposit`.
3) `apply_casino` calls `handle_casino_deposit`.
4) Handler checks rate limits, updates balance, emits events.
5) Execution returns events to be committed.

The only difference from register is the handler logic. Dispatch and prepare are identical.

### 12) Error events vs execution errors

Register/deposit errors are typically returned as **events** (e.g., `casino_error_vec`), not as execution errors. That means:

- the transaction is executed,
- but it produces an error event instead of state changes.

This is important for client UX: error events are visible in the updates stream, while execution errors would be silent to clients.

### 13) How determinism is maintained

Determinism is enforced by:

- deterministic ordering of transactions,
- deterministic dispatch,
- deterministic handler logic.

The dispatcher contributes by using a fixed match ordering. There is no randomness in instruction routing.

### 14) Feynman analogy: switchboard operator

Think of the dispatcher as a switchboard operator:

- every incoming call (instruction) is routed to the correct department,
- the operator doesn’t handle the call’s content,
- the operator ensures the call goes to the right place every time.

That is exactly what `apply` does.

### 15) Practical debugging checklist

If register or deposit fails in execution:

1) Check if `prepare` rejected due to nonce mismatch.
2) Check whether the dispatcher includes the instruction tag.
3) Check casino handler logs for rate limit or “already registered” errors.

This is the fastest way to isolate where the failure occurred.

### 16) Why this lesson exists separately from L10

L10 covers general execution dispatch. This lesson zooms in on register/deposit because they are the first transactions every user executes. Understanding their dispatch path is crucial for onboarding debugging.

---

### 17) The Layer as a transactional overlay

The execution layer uses a `Layer` overlay to stage state changes. This means:

- reads check pending updates first,
- writes go to the pending map,
- commit returns the pending changes for persistence.

Register and deposit both modify player state, but those modifications do not immediately persist. They are staged until the block is committed.

This is important because:

- it keeps execution deterministic,
- it allows the system to roll back if a block fails,
- it enables batch execution without partial writes.

### 18) Output streams and event ordering

Each transaction produces:

- a sequence of `Output::Event` entries,
- followed by `Output::Transaction`.

This ordering is consistent for every transaction. Clients can rely on event ordering to interpret what happened.

For register:

- you expect a `CasinoPlayerRegistered` event,
- possibly a leaderboard update event,
- then the transaction output.

For deposit:

- you expect a `CasinoDeposited` event,
- possibly a leaderboard update event,
- then the transaction output.

### 19) Prepare errors vs apply errors

Prepare errors are treated differently from apply errors:

- **Prepare errors** (nonce mismatch, state access failure) cause the transaction to be skipped or the block to fail.
- **Apply errors** inside handlers often produce error events rather than hard failures.

This is a design choice: “invalid transaction” should be communicated to the client, not crash execution.

### 20) Why skipped transactions are dangerous for UX

Skipping on nonce mismatch keeps the block moving, but it can confuse users. If a registration transaction is skipped, the user sees no event and no error unless the gateway catches the nonce issue earlier.

This is why the gateway’s nonce management is critical. It prevents skipped transactions at the execution layer by ensuring correct nonces up front.

### 21) The role of account state in registration

Registration uses account state for nonce, but the player state (casino player) is stored separately. That means:

- an account can exist without a casino player record,
- register is the step that creates the casino player record.

The dispatcher doesn’t care about this distinction; it only ensures the instruction reaches the casino handler that knows how to create the player record.

### 22) Multi‑instruction blocks and register ordering

Blocks can contain many transactions from different accounts. The execution layer processes them sequentially. That means:

- a register transaction for one account does not affect another account,
- but multiple transactions for the same account in one block must have sequential nonces.

Because prepare reads from the pending overlay, sequential nonces work within a single block.

### 23) Execution determinism depends on dispatch determinism

If dispatch logic were non‑deterministic (e.g., based on hash map iteration), then execution results could diverge across nodes.

The dispatch table is a simple match statement, which is deterministic by construction. This is a subtle but important property.

### 24) Performance considerations

Dispatch is cheap: it is a single match on an enum. The heavy work happens inside handlers.

This matters for register/deposit because:

- onboarding throughput depends mostly on handler logic and state IO,
- dispatch overhead is negligible.

Therefore, optimizing dispatch rarely helps onboarding latency.

### 25) Extending dispatch safely

When you add a new instruction:

1) Add the enum variant in `types/src/execution.rs`.
2) Add encoding in the gateway.
3) Add the match arm in `apply`.
4) Implement the handler in the correct module.
5) Add tests for deterministic execution.

If you skip step 3, the instruction will cause an internal error (“apply called with non‑casino instruction”) or simply be unhandled. That’s why dispatch is the integration checkpoint.

### 26) Feynman exercise: trace the register transaction

Take a register transaction and trace it through:

- `execute` loop,
- `prepare`,
- `apply`,
- `apply_casino`,
- `handle_casino_register`,
- events returned,
- commit.

If you can explain each step, you understand the dispatch layer.

### 27) Common misconceptions

1) **“Dispatch validates the instruction.”**  
   It does not. It only routes the instruction to the handler.

2) **“Nonce validation is in the handler.”**  
   It is in `prepare`, before dispatch.

3) **“If register fails, the transaction is rejected.”**  
   Often the handler emits an error event instead of rejecting, so the transaction still appears in outputs.

Knowing these misconceptions helps avoid wrong assumptions when debugging.

### 28) Summary and mental model

Dispatch is like a traffic light system:

- every instruction enters the intersection,
- the dispatcher sends it down the correct road,
- the handler is the road where work happens.

Register and deposit are just two cars in that traffic system.

---

## Extended deep dive, part 2: how `execute` ties everything together

So far we have zoomed in on `prepare` and the dispatch table. The missing piece is **the loop that calls them** and then turns their results into outputs. This loop is the real “conveyor belt” of a block.

### 29) The `execute` loop: the conveyor belt for a block

In `execution/src/layer/mod.rs`, the `execute` function drives the pipeline:

```rust
pub async fn execute(
    &mut self,
    #[cfg(feature = "parallel")] _pool: ThreadPool,
    transactions: Vec<Transaction>,
) -> Result<(Vec<Output>, BTreeMap<PublicKey, u64>)> {
    let mut processed_nonces = BTreeMap::new();
    let mut outputs = Vec::new();

    for tx in transactions {
        match self.prepare(&tx).await {
            Ok(()) => {}
            Err(PrepareError::NonceMismatch { .. }) => continue,
            Err(PrepareError::State(err)) => {
                return Err(err).context("state error during prepare");
            }
        }
        processed_nonces.insert(tx.public.clone(), tx.nonce.saturating_add(1));
        outputs.extend(self.apply(&tx).await?.into_iter().map(Output::Event));
        outputs.push(Output::Transaction(tx));
    }

    Ok((outputs, processed_nonces))
}
```

**Why this matters:**  
This is the heart of execution. It defines *exactly* when a transaction is skipped, how outputs are ordered, and how post‑execution metadata (nonces) are returned to the caller.

**Plain English:**  
For each transaction:  
1) Try `prepare`.  
2) If nonce mismatch, skip.  
3) If a state error occurs, abort execution.  
4) If prepare passes, call `apply`.  
5) Emit events first, then the transaction itself.  
6) Record the next expected nonce for that public key.

This is why register and deposit behave the way they do: they only produce events *after* a successful prepare.

### 30) Why `processed_nonces` exists (and what it’s for)

`processed_nonces` is a `BTreeMap<PublicKey, u64>`. It stores the **next nonce** for every account that had a transaction processed in this block (nonce + 1, saturated).

Think of it as the “ledger of successful nonces.” It allows the caller (consensus or mempool layer) to update its local nonce tracking without re‑reading state. This is crucial for performance because:

- It avoids extra state lookups after execution.
- It lets mempool deduplicate and evict outdated transactions.
- It makes it possible to keep the gateway’s nonce cache in sync with execution results.

In onboarding terms: if a user registers and deposits in the same block, `processed_nonces` gives you the correct next nonce after both.

### 31) Why events are emitted before `Output::Transaction`

Outputs are ordered as:

1) `Output::Event` (one per event from handler)
2) `Output::Transaction` (the original transaction)

This is not an accident. The updates stream expects events *before* the transaction envelope so clients can process “what happened” before they see “what was submitted.” It keeps UI logic simple:

- If you see `CasinoPlayerRegistered` you can update UI immediately.
- The transaction output then ties that event to a specific transaction in the block.

This ordering is part of the protocol contract. If it changed, client event parsers would need to be updated.

### 32) Prepare error handling is explicitly asymmetric

Prepare errors are not treated equally:

- **NonceMismatch**: skip the transaction silently.
- **State error**: abort execution and bubble the error.

This asymmetry encodes a policy decision:

1) Nonce mismatches are “the user’s fault” and shouldn’t block other users.
2) State errors are “the node’s fault” and indicate possible corruption or missing data, so execution halts.

For register/deposit this means:

- A stale nonce does not break the block.
- But a missing or corrupted account state is catastrophic and stops execution.

This is the core trade‑off for liveness vs safety. If you explain only one thing to a new engineer, explain this.

### 33) Apply errors vs error events (and why it matters)

In the handlers, **most user‑level errors become events**, not execution failures. For example, “already registered” or “faucet cooldown” returns an event with an error code.

This design has two consequences:

1) The transaction still counts as executed (nonce incremented).
2) The client gets explicit feedback in the updates stream.

This is different from typical blockchain “revert” semantics. It’s more like:

> “The transaction was accepted, but the result is an error event.”

That has UX benefits (you can show a clean error in the UI), but it also means **bad transactions still consume nonce**. For a user, that feels like “I paid for a failed transaction.”

For onboarding, this is an intentional policy: it keeps errors visible and deterministic.

### 34) The overlay + commit pattern is the atomicity guarantee

`Layer` keeps a `pending` map, and `commit` returns that map:

```rust
pub fn commit(self) -> Vec<(Key, Status)> {
    self.pending.into_iter().collect()
}
```

In other words: execution does not *persist* changes itself. It stages updates, and the caller decides when to commit them. This creates a clean boundary:

- execution = deterministic computation
- persistence = storage engine responsibility

For register/deposit, that means:

1) Handler updates `CasinoPlayer` and registry in the pending map.
2) Execution completes.
3) The state layer commits pending entries together.

This is the equivalent of an atomic database transaction. Either the entire block’s updates are committed, or none of them are.

### 35) Deterministic time: view‑based seconds

Notice how created timestamps and faucet windows use:

```
current_time_sec = seed_view.saturating_mul(SECS_PER_VIEW)
```

Why? Because **wall‑clock time is not deterministic across validators**. The system uses consensus view numbers as a time proxy. That means:

- every node computes the same “time,”
- rate limits are enforced consistently,
- no validator can manipulate faucet windows with local clocks.

From a Feynman perspective: instead of “actual time,” we use “block time.” It’s not perfect real‑world time, but it is consistent.

### 36) Parallel execution is gated, not active

`execute` includes a `_pool` parameter behind a feature flag. This suggests potential parallelism but the function body itself is sequential.

That’s deliberate. Parallel execution is hard because:

- you must preserve determinism,
- you must avoid conflicting writes,
- you must ensure nonce ordering.

For now, register/deposit are sequential. In future, you could parallelize transactions from different accounts if you can prove non‑overlap. But the design keeps things simple and safe.

### 37) Execution vs mempool: who owns ordering?

The execution layer **does not reorder**. It processes transactions in the order it receives. This is important:

- The mempool or consensus layer determines ordering.
- Execution only enforces validity and determinism.

For register/deposit, this means: if you submit two deposits for the same account with consecutive nonces, ordering is critical. If mempool or consensus reorders them, one will be skipped.

This is why the gateway’s nonce logic and submission batching matter. Execution is “dumb” about ordering by design.

### 38) How to reason about register failures in the execution loop

If registration fails, there are only four possibilities:

1) **Skipped at prepare** (nonce mismatch): no events, no output transaction.
2) **Prepare state error**: execution aborts, block fails.
3) **Apply returns error event** (already registered, invalid name): events exist.
4) **Apply returns unexpected error**: execution aborts.

If you ever see a registration transaction in outputs with no events, that would be a bug (because the handler always emits at least one event). So the absence of events indicates either a skip or a crash, not a successful apply.

### 39) Unit tests encode the invariants

The `mod.rs` file contains tests that repeatedly call `prepare` and `apply` with various transactions. These tests provide two guardrails:

1) **Determinism**: the same inputs must produce the same outputs.
2) **Nonce handling**: repeated transactions must fail or pass as expected.

When you modify dispatch logic, update tests. They are the best signal that you preserved core invariants.

### 40) Feynman exercise: simulate a block on paper

Take these transactions (same account):

1) Register (nonce 0)
2) Deposit (nonce 1)
3) Deposit again (nonce 1, duplicate)

Walk through the execute loop:

- Tx1 prepare passes, apply emits register event.
- Tx2 prepare passes (nonce now 1), apply emits deposit event.
- Tx3 prepare fails (nonce mismatch), skipped.

Write down the outputs and the processed_nonces map. If you can do that, you truly understand the execution loop.

---

## Key takeaways
- Register/deposit are validated by `prepare` and routed via `apply_casino`.
- Nonce handling is the first gate for these transactions.

## Next lesson
L23 - Register handlers: `feynman/lessons/L23-register-handlers.md`
