# L14 - Session manager (register + deposit flow) (from scratch)

Focus file: `gateway/src/session/manager.ts`

Goal: explain how sessions are auto‑registered, how faucet deposits work, and how nonce handling is retried safely. For every excerpt, you will see **why it matters** and a **plain description of what the code does**. We only explain syntax when it is genuinely tricky.

---

## Concepts from scratch (expanded)

### 1) Session registration
The gateway creates a session and then sends a `CasinoRegister` transaction on behalf of the player. This is the on‑chain identity step.

### 2) Nonce management
Every transaction must have the correct nonce. The gateway tracks nonces locally and resyncs from the backend when a rejection implies a mismatch.

### 3) Faucet claims are deposits
A faucet claim is just a `CasinoDeposit` instruction. The gateway enforces a client‑side cooldown to avoid spam.

### 4) Updates stream subscription
The session manager connects to the updates stream **before** sending transactions, so the client won’t miss registration events.

---

## Limits & management callouts (important)

1) **Client‑side faucet cooldown**
- Enforced by `requestFaucet` using the `cooldownMs` argument.
- This must match or be stricter than the on‑chain faucet rules.

2) **Initial balance from CASINO_INITIAL_CHIPS**
- After registration, the session sets `hasBalance=true` and `balance=CASINO_INITIAL_CHIPS`.
- If the backend changes initial chips, this will show incorrect balances until refreshed.

3) **Update subscription is best‑effort**
- If updates stream fails to connect, registration still proceeds but real‑time events are missed.

---

## Walkthrough with code excerpts

### 1) Initialize player (subscribe before register)
```ts
private async initializePlayer(
  session: Session,
): Promise<void> {
  // Step 1: Connect to updates stream FIRST (before any transactions)
  try {
    const updatesClient = new UpdatesClient(this.backendUrl, this.origin);
    await updatesClient.connectForAccount(session.publicKey);
    session.updatesClient = updatesClient;
  } catch (err) {
    // Non-fatal - game can still work, just won't get real-time events
  }

  // Step 2: Register player (grants INITIAL_CHIPS automatically)
  const registerResult = await this.registerPlayer(session);
  if (!registerResult) {
    return;
  }

  session.hasBalance = true;
  session.balance = BigInt(CASINO_INITIAL_CHIPS);
}
```

Why this matters:
- If the updates stream isn’t connected first, the client can miss its own registration event.

What this code does:
- Connects to the updates stream for the player’s public key.
- Sends a registration transaction.
- Marks the session as funded with the configured initial chips.

---

### 2) Register player (nonce‑safe submission)
```ts
private async registerPlayer(session: Session): Promise<boolean> {
  return this.nonceManager.withLock(session.publicKeyHex, async (nonce) => {
    const instruction = encodeCasinoRegister(session.playerName);
    const tx = buildTransaction(nonce, instruction, session.privateKey);
    const submission = wrapSubmission(tx);

    const result = await this.submitClient.submit(submission);

    if (result.accepted) {
      session.registered = true;
      this.nonceManager.setCurrentNonce(session.publicKeyHex, nonce + 1n);
      return true;
    }

    if (
      result.error &&
      this.nonceManager.handleRejection(session.publicKeyHex, result.error)
    ) {
      const synced = await this.nonceManager.syncFromBackend(
        session.publicKeyHex,
        this.getBackendUrl(),
      );
      if (synced) {
        const retryNonce = this.nonceManager.getCurrentNonce(session.publicKeyHex);
        const retryTx = buildTransaction(
          retryNonce,
          instruction,
          session.privateKey,
        );
        const retrySubmission = wrapSubmission(retryTx);
        const retryResult = await this.submitClient.submit(retrySubmission);
        if (retryResult.accepted) {
          session.registered = true;
          this.nonceManager.setCurrentNonce(session.publicKeyHex, retryNonce + 1n);
          return true;
        }
      }
    }

    return false;
  });
}
```

Why this matters:
- Registration is the first on‑chain action. If nonce handling is wrong, every later transaction fails.

What this code does:
- Locks nonce access for the public key.
- Builds and submits a `CasinoRegister` transaction.
- If rejected, attempts a nonce resync and retries once.
- Updates the local nonce tracker when accepted.

---

### 3) Deposit chips (faucet path)
```ts
private async depositChips(
  session: Session,
  amount: bigint,
): Promise<boolean> {
  return this.nonceManager.withLock(session.publicKeyHex, async (nonce) => {
    const instruction = encodeCasinoDeposit(amount);
    const tx = buildTransaction(nonce, instruction, session.privateKey);
    const submission = wrapSubmission(tx);

    const result = await this.submitClient.submit(submission);

    if (result.accepted) {
      session.hasBalance = true;
      session.balance = session.balance + amount;
      this.nonceManager.setCurrentNonce(session.publicKeyHex, nonce + 1n);
      return true;
    }

    // Retry on nonce mismatch
    // ... same resync + retry logic as register ...

    return false;
  });
}
```

Why this matters:
- This is how faucet claims become actual on‑chain deposits.

What this code does:
- Builds a `CasinoDeposit` transaction and submits it.
- On success, updates the local balance and nonce.
- Uses the same nonce resync pattern if rejected.

---

### 4) Client‑side faucet cooldown
```ts
async requestFaucet(
  session: Session,
  amount: bigint,
  cooldownMs: number,
): Promise<{ success: boolean; error?: string }> {
  const now = Date.now();
  const lastClaim = session.lastFaucetAt ?? 0;
  if (now - lastClaim < cooldownMs) {
    const seconds = Math.ceil((cooldownMs - (now - lastClaim)) / 1000);
    return {
      success: false,
      error: `Faucet cooling down. Try again in ${seconds}s.`,
    };
  }

  const ok = await this.depositChips(session, amount);
  if (ok) {
    session.lastFaucetAt = now;
    return { success: true };
  }

  return { success: false, error: "Faucet claim rejected" };
}
```

Why this matters:
- Without cooldowns, a single client could spam deposit requests.

What this code does:
- Checks a local timestamp and rejects if the cooldown has not elapsed.
- Performs a deposit and updates the last claim time on success.

---

## Extended deep dive: session registration and nonce recovery as a protocol

This file does more than “register a user.” It implements a transaction lifecycle with concurrency control and recovery. The sections below unpack those responsibilities.

### 5) Registration is a transaction, not a flag

The `registered` boolean is derived from on‑chain reality, not from local intent. The gateway cannot simply flip `registered` to true because a user connected. It must:

1) build a `CasinoRegister` instruction,
2) sign and submit it,
3) wait for acceptance,
4) then mark the session as registered.

This is a subtle but critical distinction. The session exists immediately, but registration is asynchronous and can fail.

### 6) Why updates are connected before registration

The registration transaction emits an update event. If the gateway subscribes to updates *after* submitting the transaction, it might miss that event entirely. This is the classic race:

- Submission is fast.
- Subscription is slightly slower.
- The event arrives in between.

By subscribing first, the gateway guarantees that the event stream is already open by the time the transaction is submitted. This is not just a convenience; it avoids inconsistent UI state where registration succeeded but the client never hears about it.

### 7) Nonce locking prevents duplicate nonces

Both `registerPlayer` and `depositChips` run inside:

```ts
this.nonceManager.withLock(session.publicKeyHex, async (nonce) => { ... })
```

This creates a per‑account mutex. Without it, two concurrent operations could grab the same nonce and build two transactions with the same nonce. The backend would accept at most one, and the other would be rejected.

Nonce locking is the simplest and safest way to serialize account operations in an async system.

### 8) Retry logic: when and why it triggers

If a submission fails, the session manager asks the nonce manager whether the error *looks like* a nonce mismatch. That check is a heuristic (string matching on error text).

If it looks like a nonce mismatch, the gateway:

1) synchronizes the nonce from the backend (`/account/:pubkey`),
2) rebuilds the transaction with the new nonce,
3) retries once.

This is a pragmatic recovery path. It avoids infinite retries but handles the common case where the local nonce cache drifted after a restart or a missed confirmation.

### 9) Why the retry is only once

Infinite retries are dangerous. A timeout does not mean the transaction failed; it might still be accepted later. If you retry too aggressively, you can flood the backend with duplicate requests and create confusing logs.

The “retry once after resync” strategy balances recovery with safety:

- It fixes the likely nonce mismatch.
- It avoids endless resubmission loops.

### 10) Local balance updates vs on‑chain truth

When `depositChips` succeeds, the session manager increments the local balance:

```ts
session.balance = session.balance + amount;
```

This is an *optimistic update*. It keeps the UI responsive, but it is not authoritative. The source of truth remains the backend.

That is why the gateway periodically refreshes balances and also refreshes immediately after faucet claims. Local balance updates are a UX optimization, not a consensus record.

### 11) Why registration failures do not destroy the session

Notice that if registration fails, the session is not destroyed. The client remains connected. This is intentional:

- The client can still attempt a faucet claim later.
- The gateway can retry registration on a future action.
- The user does not have to reconnect.

In other words, the session is a connection state, not a guarantee of on‑chain registration.

### 12) Key generation and identity

`SessionManager` generates a new Ed25519 keypair per session. That keypair becomes the player’s on‑chain identity. This is why the `createSession` step is security critical:

- If the RNG is weak, keys are weak.
- If keys collide, identities collide.

The code includes a simple entropy sanity check to avoid obviously broken RNG output. It is not a cryptographic proof, but it is a useful guardrail.

### 13) Faucet as a transaction‑based rate limit

The faucet cooldown is enforced locally, but the actual deposit still goes through the transaction pipeline. This means:

- The faucet is rate limited by the gateway’s cooldown.
- It is also implicitly rate limited by the chain’s nonce rules and any on‑chain faucet logic.

The gateway’s cooldown is primarily about UX (fast feedback), not security. The chain is still the final authority.

### 14) Failure modes you should expect

Here are common failure scenarios and how this file responds:

1) **Backend unreachable**  
   `SubmitClient` returns a failure; registration or deposit returns false; the session remains but `registered` stays false.

2) **Nonce mismatch**  
   The gateway resyncs nonce and retries once.

3) **Updates stream unreachable**  
   Registration proceeds anyway, but real-time events are missed. The session will still function, but the UI may need manual refresh.

4) **Cooldown hit**  
   Faucet requests return a friendly error without attempting submission.

Understanding these modes helps you debug onboarding issues quickly.

### 15) Why the session manager is the right place for this logic

You might wonder why the session manager handles registration and deposits instead of the gateway entrypoint.

The reason is cohesion: the session manager owns:

- the session object,
- the nonce manager,
- the submit client,
- and the updates clients.

All of those are needed to implement registration and deposit safely. Keeping this logic inside the session manager avoids duplicating nonce and update handling in multiple places.

### 16) Feynman analogy: a bank clerk and a queue number

Imagine a bank clerk handing out queue numbers (nonces). Each transaction must use the next number in sequence. If two customers grab the same number, one of them will be rejected.

The session manager is the clerk. It hands out numbers in order and retries if it learns the bank’s official counter is different.

That is all nonce management is: a queue number system for transactions.

### 17) Practical checklist for extending these flows

If you add new session‑level transactions (for example, a “claim bonus” instruction), follow this pattern:

1) Wrap the logic in `nonceManager.withLock`.
2) Build instruction → transaction → submission.
3) Submit via `SubmitClient`.
4) On success, update local session state optimistically.
5) On nonce mismatch, resync and retry once.

This keeps transaction handling consistent across the gateway.

---

### 18) Nonce persistence and restart recovery

The nonce manager persists nonces to disk periodically. This is critical for registration and faucet flows:

- If the gateway restarts and loses nonce state, it may submit with stale nonces.
- Stale nonces cause immediate rejection, which looks like “registration failed.”

Persistent nonces reduce that class of failures. That is why the gateway calls `nonceManager.persist()` on a timer and during shutdown.

This also explains why the session manager does *not* blindly increment nonces on failure. It leaves nonce control in one place so persistence remains correct.

### 19) Pending nonces and confirmation timing

The nonce manager also tracks “pending” nonces (submitted but not confirmed). Even if the session manager doesn’t explicitly use `getAndIncrement`, this internal tracking matters for visibility and potential future features:

- It allows operators to see which accounts have outstanding transactions.
- It makes it possible to build smarter retry strategies in the future.

In other words, nonce tracking is not just about the next number; it is about the lifecycle of each submission.

### 20) Registration and faucet are idempotent at the protocol level

From the chain’s perspective:

- Registering an already‑registered account is usually a no-op or error.
- Depositing twice simply increases balance.

This means retries are relatively safe. If a registration submission is re-sent, the chain will either reject it as duplicate or treat it as idempotent.

The gateway still avoids aggressive retries, but the protocol makes onboarding resilient to transient failures.

### 21) Balance refresh as a convergence mechanism

Even after successful registration or deposit, the session manager refreshes balance through `SubmitClient.getAccount`.

This turns the system into a convergent loop:

- optimistic local updates keep UI responsive,
- periodic refresh pulls truth from the backend.

If the gateway misses an update event, the periodic refresh heals the discrepancy.

### 22) When updates subscriptions fail

If updates subscription fails:

- the session is still created,
- registration still proceeds,
- but events are not received in real time.

This is a best‑effort design choice. It prioritizes onboarding over perfect event delivery. In practice, it means users might have to press “refresh” or wait for periodic balance updates.

This is a good tradeoff for testnet and early production phases, where availability matters more than perfect real-time UX.

### 23) Why `CasinoDeposit` is used for faucet

The faucet is not a special instruction. It uses the same deposit instruction as any other chip funding.

This simplifies the protocol:

- There is only one deposit path.
- The faucet is just a privileged deposit allowed by backend policy.

That means the gateway does not need special on-chain knowledge; it just submits deposits and lets the backend enforce limits.

### 24) Observability hooks

The session manager logs:

- registration success/failure,
- deposit success/failure,
- updates connection failures.

These logs are the first place you look when onboarding fails in production. Combine them with gateway‑level analytics (from `trackGatewaySession` and `trackGatewayFaucet`) to get a complete picture of the onboarding funnel.

### 25) Example: debugging a stuck registration

Suppose a user reports “I can’t play.” Here is a structured debug path:

1) Check if the session exists (gateway logs should show `session_ready`).
2) Check if registration succeeded (look for “Registered player” log).
3) If registration failed, check if the error was a nonce mismatch.
4) If nonce mismatch, check nonce persistence and backend `/account` response.
5) Check whether updates stream was connected (look for “Connected to updates stream” log).

This aligns with the code paths in this file and avoids blind guessing.

### 26) Feynman analogy: post office with a stamp counter

Think of the nonce as a stamp counter at a post office:

- Each letter (transaction) must use the next stamp number.
- If you reuse a stamp number, the letter is rejected.
- If you skip a stamp number, the post office thinks something is wrong.

The session manager is the clerk who hands you the next stamp and keeps track of which stamps are still in transit.

---

### 27) Suggested tests for register + faucet flows

You can validate this file without a full end‑to‑end environment:

1) **Nonce lock test**  
   Simulate two concurrent calls to `registerPlayer` and confirm only one uses a given nonce.

2) **Retry on mismatch test**  
   Mock `SubmitClient` to return a nonce‑mismatch error once, then success. Confirm that `syncFromBackend` is called and the second submission uses the new nonce.

3) **Cooldown test**  
   Call `requestFaucet` twice in quick succession and assert the second call fails with a cooldown error.

4) **Updates failure test**  
   Force `UpdatesClient.connectForAccount` to throw and confirm registration still proceeds.

These tests give confidence that onboarding remains reliable even when the network is unreliable.

### 28) Edge cases to keep in mind

Some edge cases are subtle but important:

- **Session disconnect during registration**: the registration transaction might still be accepted, but the session is destroyed. On reconnect, the player will register again with a new keypair, effectively creating a new on‑chain account.

- **Clock skew**: cooldown uses `Date.now()`. If the system clock jumps backward, the cooldown might appear to “never expire.” This is rare but worth noting in production deployments.

- **Partial failures**: a faucet deposit might succeed but balance refresh might fail due to backend outages. The local balance will be stale until the next refresh.

Understanding these cases helps you interpret unusual user reports.

### 29) Connecting this file to the rest of the stack

The register + faucet flow touches many layers:

- **Codec**: encodes `CasinoRegister` and `CasinoDeposit`.
- **Transaction builder**: signs and wraps the transaction.
- **SubmitClient**: sends it to `/submit`.
- **Simulator**: executes it and emits updates.
- **UpdatesClient**: listens for confirmations.

This file sits at the center of that flow. When debugging, always consider both sides: if something fails here, it could be because any upstream or downstream component is misconfigured.

---

### 30) Hardening checklist (production readiness)

Before production:

- Ensure nonce persistence is enabled and the data directory is writable.
- Align faucet cooldown with on‑chain policy.
- Confirm updates stream connectivity is stable under load.
- Monitor logs for registration failures and nonce mismatch rates.

These are configuration and operational checks, not code changes, but they are crucial for a smooth onboarding experience.

---

One more operational note: if you see a spike in `REGISTRATION_FAILED` errors, correlate it with backend health checks and nonce sync logs. Many registration failures are symptoms of backend unavailability or stale nonce state, not bugs in the registration logic itself. Treat it as a system signal. If you document these failure modes in the client UI, support tickets drop because users can self‑diagnose and know when to retry later.

## Key takeaways
- Registration is a transaction, so nonce handling must be correct.
- The gateway subscribes to updates before sending registration to avoid races.
- Faucet claims are just deposits with a client‑side cooldown.

## Next lesson
L15 - Register instruction encoding: `feynman/lessons/L15-register-instructions.md`
