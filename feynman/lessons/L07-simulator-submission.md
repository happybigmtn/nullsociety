# L07 - Submission routing inside the simulator (from scratch)

Focus file: `simulator/src/submission.rs`

Goal: explain how the simulator validates incoming submissions (seed, transactions, summary) and how admin transactions are logged. For every excerpt, you will see **why it matters** and a **plain description of what the code does**. We only explain syntax when it is genuinely tricky.

---

## Concepts from scratch (expanded)

### 1) What is a submission?
The gateway sends the simulator a **Submission**. It can contain:
- **Seed**: a randomness seed for a round.
- **Transactions**: user actions (bets, moves, deposits).
- **Summary**: a consensus checkpoint with proofs and digests.

The simulator’s job is to accept only valid submissions and reject bad ones.

### 2) Why multiple submission types?
Different data serves different purposes:
- **Seeds** establish randomness.
- **Transactions** mutate state.
- **Summaries** sync the simulator to consensus in a verifiable way.

### 3) Threshold signatures (BLS) in one paragraph
Validators collectively sign the same message. Instead of sending N signatures, they combine them into a **single certificate**. Verification checks that:
1) the signers are valid validators, and
2) the threshold was met.

### 4) Domain separation (`NAMESPACE`)
A signature can be “reused” in a different context if the same hash is signed. Domain separation adds a fixed label (namespace) so a signature for one message type cannot be replayed as another.

### 5) Summary verification
Summaries include proofs for state and event changes. Verifying a summary yields:
- **state digests** (commitments to state changes),
- **event digests** (commitments to emitted events).

If these digests do not match, the simulator must reject the summary.

### 6) Why log admin transactions?
Admin actions change core rules (policy, treasury, oracle prices). Logging them creates an audit trail so you can see who did what and when.

---

## Limits and management callouts (important)

1) **No rate limits here**
- This file assumes request limits are enforced earlier (HTTP layer or gateway).
- If the upstream filter fails, this code will happily attempt to process everything.

2) **Admin logs are sensitive**
- Logs include admin public keys and tx hashes. That is usually safe, but treat logs as sensitive operational data.

3) **Audit hash is lossy**
- For large admin payloads (policy, treasury), only a hash is logged.
- This keeps logs small but makes debugging harder if you need full content later.

4) **Error reporting is coarse**
- `SubmitError` only distinguishes `InvalidSeed` and `InvalidSummary`.
- Transaction failures at this layer do not return a reason.

---

## Walkthrough with code excerpts

### 1) Submission error type
```rust
#[derive(Debug)]
pub enum SubmitError {
    InvalidSeed,
    InvalidSummary,
}
```

Why this matters:
- Clear error categories make it obvious why a submission was rejected.

What this code does:
- Defines two rejection reasons the caller can report or log.
- Keeps the error surface small so upstream code can map errors to HTTP status codes.

Syntax notes:
- `enum` declares a type with multiple variants.
- `#[derive(Debug)]` lets the error be printed in logs with `{:?}`.

---

### 2) Top-level submission dispatcher
```rust
pub async fn apply_submission(
    simulator: Arc<Simulator>,
    submission: Submission,
    log_admin: bool,
) -> Result<(), SubmitError> {
    match submission {
        Submission::Seed(seed) => { /* ... */ }
        Submission::Transactions(txs) => { /* ... */ }
        Submission::Summary(summary) => { /* ... */ }
    }
}
```

Why this matters:
- This is the central routing point for all submissions. Every incoming payload ends up here.

What this code does:
- Pattern-matches the submission and delegates to the correct validation path.
- Ensures exactly one of seed/transactions/summary code paths runs for any submission.

Syntax notes:
- `match submission { ... }` is exhaustive; every variant must be handled.
- `Arc<Simulator>` means shared ownership of the simulator across async tasks.

---

### 3) Seed verification path
```rust
Submission::Seed(seed) => {
    let verifier =
        bls12381_threshold::Scheme::<PublicKey, MinSig>::certificate_verifier(
            simulator.identity.clone(),
        );
    if !seed.verify(&verifier, NAMESPACE) {
        tracing::warn!("Seed verification failed (bad identity or corrupted seed)");
        return Err(SubmitError::InvalidSeed);
    }
    simulator.submit_seed(seed).await;
    Ok(())
}
```

Why this matters:
- Seeds decide randomness. If a bad seed is accepted, the game can be manipulated.

What this code does:
- Builds a threshold certificate verifier from the simulator identity.
- Verifies the seed’s certificate with domain separation (`NAMESPACE`).
- Logs a warning and returns `InvalidSeed` if verification fails.
- Submits the seed to the simulator on success.

Syntax notes:
- `Scheme::<PublicKey, MinSig>` explicitly fills in generic type parameters.
- `simulator.identity.clone()` clones the identity so the simulator remains usable elsewhere.

---

### 4) Transactions path (with admin logging)
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
- This is the entry point for all user actions. If it fails, the game never advances.

What this code does:
- Optionally logs any admin transactions in the batch.
- Passes the transactions into the simulator for execution.
- Returns `Ok(())` without further validation because signature/nonce checks happen elsewhere.

Syntax notes:
- `log_admin` is a flag passed in by the HTTP handler to control audit logging.

---

### 5) Summary verification path
```rust
Submission::Summary(summary) => {
    let (state_digests, events_digests) = match summary.verify(&simulator.identity) {
        Ok(digests) => digests,
        Err(err) => {
            tracing::warn!(
                ?err,
                view = summary.progress.view.get(),
                height = summary.progress.height,
                state_ops = summary.state_proof_ops.len(),
                events_ops = summary.events_proof_ops.len(),
                "Summary verification failed"
            );
            return Err(SubmitError::InvalidSummary);
        }
    };
    simulator
        .submit_events(summary.clone(), events_digests)
        .await;
    simulator.submit_state(summary, state_digests).await;
    Ok(())
}
```

Why this matters:
- Summaries are the bridge between consensus and state. Accepting a bad one corrupts the chain state.

What this code does:
- Verifies the summary using the simulator’s identity.
- Logs rich context if verification fails (view, height, ops counts).
- On success, extracts state and event digests from the verification result.
- Submits event digests first, then state digests, to keep event indexing ahead of state queries.

Syntax notes:
- `match summary.verify(...)` allows fine-grained logging on error.
- `summary.clone()` is required because `submit_state` consumes the summary later.

---

### 6) Hashing for audit logs
```rust
fn audit_hash<T: Encode>(value: &T) -> String {
    let bytes = value.encode();
    let mut hasher = Sha256::new();
    hasher.update(bytes.as_ref());
    hex(hasher.finalize().as_ref())
}
```

Why this matters:
- Admin payloads can be large. Hashing keeps logs short while still allowing integrity checks.

What this code does:
- Encodes a value into bytes.
- Hashes with SHA‑256.
- Returns the hex string so logs stay compact and readable.

Syntax notes:
- `T: Encode` is a trait bound: any type that can be encoded is accepted.

---

### 7) Admin transaction logging (representative patterns)
```rust
fn log_admin_transactions(txs: &[Transaction]) {
    for tx in txs {
        let admin = hex(&tx.public.encode());
        let tx_hash = hex(tx.digest().as_ref());
        match &tx.instruction {
            Instruction::SetPolicy { policy } => {
                tracing::info!(
                    action = "set_policy",
                    admin = %admin,
                    tx_hash = %tx_hash,
                    nonce = tx.nonce,
                    policy_hash = %audit_hash(policy),
                    "admin transaction submitted"
                );
            }
            Instruction::UpdateOracle {
                price_vusdt_numerator,
                price_rng_denominator,
                updated_ts,
                source,
            } => {
                tracing::info!(
                    action = "update_oracle",
                    admin = %admin,
                    tx_hash = %tx_hash,
                    nonce = tx.nonce,
                    price_vusdt_numerator = *price_vusdt_numerator,
                    price_rng_denominator = *price_rng_denominator,
                    updated_ts = *updated_ts,
                    source_len = source.len(),
                    "admin transaction submitted"
                );
            }
            _ => {}
        }
    }
}
```

Why this matters:
- Logs make admin actions auditable. Without them, privileged changes are invisible.

What this code does:
- Iterates every transaction in the batch.
- Computes the admin public key and transaction hash for logging context.
- Logs only the admin-related instructions and ignores user actions.
- Uses hashes or sizes for large payload fields to avoid log bloat.

Syntax notes:
- `match &tx.instruction` matches by reference so the instruction is not moved.
- `source_len = source.len()` logs size rather than full data.

---

## Extended deep dive: verification and auditing policy

This file is small, but it encodes policy decisions that matter in production. Below are the deeper concepts to internalize.

### 8) Seed verification and why it uses a certificate verifier

Seeds are verified using a BLS threshold certificate. The verifier is built from the simulator's identity (the validator set).

This is important because it prevents a single validator from injecting arbitrary randomness. The seed must be collectively signed by a quorum of validators.

The call `seed.verify(&verifier, NAMESPACE)` does two things at once:

- It checks the certificate threshold and signer set.
- It ensures domain separation with the `NAMESPACE` string.

If either check fails, the seed is rejected. That is the correct behavior: if randomness is not collectively agreed upon, the chain's fairness is compromised.

### 9) Summary verification: two outputs, two paths

The `summary.verify` call returns two sets of digests:

- state digests
- event digests

Why two?

Because state and events are indexed separately. State digests ensure the key-value store is consistent. Event digests ensure the event log is consistent.

The submission handler applies them in a deliberate order:

1) `submit_events(...)`
2) `submit_state(...)`

This ensures that event indexing stays ahead of state queries. That might sound backwards at first, but it is a common design: events are what clients subscribe to, and they should become visible as soon as possible.

### 10) Summary failure logging is intentionally rich

When summary verification fails, the log includes:

- the view and height,
- the number of state ops,
- the number of event ops,
- the error itself.

This is not just for debugging; it also helps detect malicious inputs. If a peer repeatedly sends summaries with unusually large ops counts or wrong views, you can flag it as suspicious.

### 11) Admin logging: the full set of privileged actions

The excerpt shows two admin instructions, but the real list is longer. The match arms include:

- `CasinoSetTournamentLimit`
- `SetPolicy`
- `SetTreasury`
- `SetTreasuryVesting`
- `ReleaseTreasuryAllocation`
- `FundRecoveryPool`
- `RetireVaultDebt`
- `RetireWorstVaultDebt`
- `SeedAmm`
- `FinalizeAmmBootstrap`
- `UpdateOracle`
- `BridgeDeposit`
- `FinalizeBridgeWithdrawal`

These are high-impact actions: treasury changes, oracle updates, bridge operations, and AMM bootstrapping. Logging them creates an immutable audit trail for governance and incident response.

### 12) Why some fields are hashed and others are logged raw

Large structured fields like policy, treasury, and vesting are logged as hashes. That keeps logs small and prevents sensitive configuration details from being dumped into plaintext logs.

On the other hand, small scalar fields like `amount` or `price_vusdt_numerator` are logged directly. Those values are often necessary to understand the action (for example, the size of a treasury release).

This split is a policy choice: log enough to be auditable, not so much that logs become a data leak.

### 13) The `log_admin` flag and performance

The `apply_submission` function takes a `log_admin` boolean. This gives the caller (the HTTP layer) control over whether admin logging is enabled.

Why make it optional?

- Logging has overhead.
- In high-throughput environments, you may want to disable it temporarily.
- Some test environments may not care about audit logs.

By making it a flag, the code keeps logging policy separate from submission validation.

### 14) Where semantic validation happens

Notice that the transactions path does not verify signatures or nonces. It simply passes transactions to the simulator.

This is a deliberate separation of concerns:

- This file checks submission types and summary/seed validity.
- The actual transaction validity checks happen in the execution engine.

That means "invalid transaction" is not an error here; it is a later-stage rejection.

### 15) Feynman analogy: three mail bins

Imagine a mail room with three bins:

- One bin is for random seeds (requires a special stamp).
- One bin is for normal letters (transactions).
- One bin is for audit packages (summaries with proofs).

The submission router is the person who checks the envelope and puts it into the correct bin. If the stamp is wrong, the envelope is rejected. If the package does not include the right paperwork, it is rejected.

That is what `apply_submission` does. It is a router with verification rules.

### 16) Practical debugging checklist

If submissions are failing in production, use this checklist:

1) If the error is `InvalidSeed`, confirm the validator set and NAMESPACE match.
2) If the error is `InvalidSummary`, inspect the ops counts and view height in logs.
3) If transactions appear to do nothing, confirm they are reaching the simulator and then inspect execution logs.
4) If admin logs are missing, confirm the HTTP layer sets `log_admin = true`.

This checklist aligns with the actual code paths and will save debugging time.

---

### 17) The audit hash helper: deterministic, compact, and portable

`audit_hash` uses `Encode` + SHA-256 to build a compact fingerprint of large structures.

Why not log the raw structure?

- Policies and treasuries can be large.
- Logging full payloads can leak sensitive configuration.
- Logs are expensive to store and ship.

By hashing the encoded bytes, you get a stable identifier that can be compared across systems. If two nodes log the same hash, they observed the same payload, even if they do not log the payload itself.

This is a classic "audit trail" technique: you keep a cryptographic commitment in logs and store the full payload elsewhere.

### 18) Digest vs certificate vs signature (clear separation)

It is easy to confuse these terms:

- **Digest**: a hash of data (e.g., a transaction hash).
- **Signature**: proof that a signer approved a specific message.
- **Certificate**: a threshold signature or aggregated proof from multiple signers.

In this file:

- `tx.digest()` produces a digest used for logging.
- `seed.verify(...)` checks a certificate from the validator set.
- `summary.verify(...)` checks summary proofs and returns digests.

Keeping these concepts separate is crucial. A digest alone does not prove anything; it just identifies bytes. A certificate proves that a quorum signed the same bytes.

### 19) Why the router does not validate transactions

You might expect the submission router to validate transactions, but it does not. Instead it hands them to `simulator.submit_transactions`.

That is intentional:

- The execution engine has the full context to validate transactions (current state, nonce, balances).
- Validating in two places would be redundant and risk inconsistent logic.

So the router stays thin: it routes, logs, and rejects only clearly invalid submission types (bad seed, bad summary).

This split is a design principle: do minimal validation at the boundary, then do full validation at the execution layer.

### 20) Admin logs as a governance signal

The admin logs are not just for debugging; they are a governance signal. They tell you:

- which admin key initiated changes,
- which transaction hash represents the change,
- what type of change it was.

In a production system, you can pipe these logs into an audit dashboard. That lets you answer questions like "who changed policy last week" or "when was the oracle updated."

Because the logs include hashes (and not the full payload), you can store the full payload elsewhere, perhaps in a secured governance registry.

### 21) Potential extension: structured audit events

Right now, admin logging is done via `tracing::info!` statements. That is good for logs, but not structured enough for machine consumption.

A natural extension would be:

- emit a dedicated "admin_event" record with fields,
- publish those events to a dedicated audit stream,
- store them in an immutable log.

This file is not implementing that, but the current structure (hashes + metadata) already points in that direction.

### 22) Feynman summary of submit routing

If you had to explain this file to a new engineer in one minute:

- There are three submission types: seed, transactions, summary.
- Seed and summary are verified here because they are global consistency inputs.
- Transactions are passed through to the executor, because only the executor can validate them.
- Admin transactions are logged for audit.

Everything else in the file is supporting those four lines.

---

### 23) Ordering and concurrency details

Two ordering choices matter in this file:

1) **Summary processing order**: events first, then state.  
   This keeps event subscribers ahead of state readers. A client that listens to events will see the new round as soon as possible, even if state indexing is still catching up.

2) **Async boundaries**: `submit_events` and `submit_state` are `await`ed.  
   That means summary processing is serialized: the simulator completes the event submission before it begins state submission. This is safer than firing both at once because it preserves a predictable ordering for any downstream consumers.

The use of `Arc<Simulator>` in `apply_submission` is also a concurrency detail. It allows the simulator to be shared across concurrent tasks without copying the underlying state. Each async handler gets a clone of the `Arc`, which increments a reference count rather than duplicating data.

This is a standard Rust concurrency pattern:

- `Arc` gives shared ownership.
- interior mutability is handled inside the simulator.

Understanding these details helps you reason about potential races. For example, if you wondered "could a summary be applied while a seed is applied?" the answer depends on how the simulator queues those internal operations. At this layer, the routing is sequential within a single call, but multiple submissions can still be processed concurrently by the HTTP layer.

That is why the simulator itself must be concurrency-safe. The routing file is just the entry point.

---

### 24) Suggested tests and invariants

If you want confidence in this file, focus on these invariants:

1) A seed with an invalid certificate must always return `InvalidSeed`.
2) A malformed summary must always return `InvalidSummary` and include view/height in logs.
3) Admin transactions should always produce a log record with `action`, `admin`, and `tx_hash`.
4) Transaction submissions should never fail here due to state conditions (that is the executor's job).

These tests do not require full integration. You can construct minimal submissions and call `apply_submission` directly with a mock simulator to validate behavior.

If those tests pass, you can be confident that higher-level HTTP failures are coming from elsewhere, not from the submission router itself. This is the core contract. Period.

---

## Key takeaways
- The simulator accepts three submission types and validates each differently.
- Seed and summary verification protect randomness and state integrity.
- Admin transactions are logged for audit, with hashes to keep logs small.

## Next lesson
L08 - Simulator state and mempool: `feynman/lessons/L08-simulator-state-mempool.md`
