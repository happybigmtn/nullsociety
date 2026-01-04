# L25 - Web nonce manager (from scratch)

Focus file: `gateway/src/session/nonce.ts`

Goal: explain how the gateway tracks and persists nonces to prevent replay and keep transaction ordering. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) What a nonce is
A nonce is a per‑account counter. Each transaction must use the next nonce value or it will be rejected by the chain.

### 2) Why a nonce manager exists
The gateway sends many transactions and must avoid:
- reusing a nonce,
- skipping a nonce,
- racing two transactions with the same nonce.

### 3) Persistence
If the gateway restarts and loses nonce state, it will submit incorrect nonces. Persisting to disk avoids this.

---

## Limits & management callouts (important)

1) **Data directory permissions = 0700**
- Nonces are sensitive; permissions restrict access to the gateway user.

2) **Nonce file permissions = 0600**
- Prevents other users from reading or editing nonce state.

3) **On‑chain nonce sync**
- `syncFromBackend` relies on `/account/<pubkey>`. If that endpoint is down, nonce recovery fails.

---

## Walkthrough with code excerpts

### 1) Data directory setup and legacy migration
```ts
private ensureDataDir(): void {
  try {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }
    chmodSync(this.dataDir, 0o700);
  } catch (err) {
    console.error('Failed to prepare nonce data directory:', err);
  }
}

private migrateLegacyFile(): void {
  if (!existsSync(this.legacyPath) || existsSync(this.persistPath)) {
    return;
  }
  try {
    const legacyData = readFileSync(this.legacyPath, 'utf8');
    writeFileSync(this.persistPath, legacyData, { mode: 0o600 });
    chmodSync(this.persistPath, 0o600);
    unlinkSync(this.legacyPath);
  } catch (err) {
    console.warn('Failed to migrate legacy nonce file:', err);
  }
}
```

Why this matters:
- Nonce data must survive restarts, and permissions must prevent tampering.

What this code does:
- Ensures the data directory exists and is locked down.
- Migrates a legacy nonce file into the new location with secure permissions.

---

### 2) Get and increment nonce (mark as pending)
```ts
getAndIncrement(publicKeyHex: string): bigint {
  const current = this.nonces.get(publicKeyHex) ?? 0n;
  this.nonces.set(publicKeyHex, current + 1n);

  if (!this.pending.has(publicKeyHex)) {
    this.pending.set(publicKeyHex, new Set());
  }
  this.pending.get(publicKeyHex)!.add(current);

  return current;
}
```

Why this matters:
- This prevents nonce reuse when multiple transactions are submitted.

What this code does:
- Returns the current nonce and immediately increments for the next call.
- Records the used nonce in a pending set until confirmation.

---

### 3) Locking to prevent race conditions
```ts
async withLock<T>(
  publicKeyHex: string,
  fn: (nonce: bigint) => Promise<T>
): Promise<T> {
  const pendingLock = this.locks.get(publicKeyHex);
  if (pendingLock) {
    await pendingLock;
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  this.locks.set(publicKeyHex, lockPromise);

  try {
    return await fn(this.getCurrentNonce(publicKeyHex));
  } finally {
    this.locks.delete(publicKeyHex);
    releaseLock!();
  }
}
```

Why this matters:
- Two concurrent requests could otherwise use the same nonce.

What this code does:
- Serializes all nonce usage per public key.
- Ensures only one transaction builds at a time for each account.

---

### 4) Sync nonce from backend
```ts
async syncFromBackend(publicKeyHex: string, backendUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${backendUrl}/account/${publicKeyHex}`, {
      headers: { Origin: this.origin },
    });
    if (response.ok) {
      const account = await response.json();
      const onChainNonce = BigInt(account.nonce);

      this.nonces.set(publicKeyHex, onChainNonce);
      this.pending.delete(publicKeyHex);

      return true;
    }
  } catch (err) {
    console.error(`Failed to sync nonce for ${publicKeyHex.slice(0, 8)}:`, err);
  }
  return false;
}
```

Why this matters:
- If the gateway gets out of sync, transactions will be rejected until fixed.

What this code does:
- Queries the backend account endpoint.
- Sets local nonce to the on‑chain value and clears pending entries.
- Returns whether the sync succeeded.

---

### 5) Persist + restore
```ts
persist(): void {
  try {
    this.ensureDataDir();
    const data: Record<string, string> = {};
    for (const [k, v] of this.nonces.entries()) {
      data[k] = v.toString();
    }
    const tmpPath = `${this.persistPath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    chmodSync(tmpPath, 0o600);
    renameSync(tmpPath, this.persistPath);
    chmodSync(this.persistPath, 0o600);
  } catch (err) {
    console.error('Failed to persist nonces:', err);
  }
}

restore(): void {
  try {
    if (!existsSync(this.persistPath)) {
      return;
    }
    const data = JSON.parse(readFileSync(this.persistPath, 'utf8'));
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') {
        this.nonces.set(k, BigInt(v));
      }
    }
  } catch (err) {
    console.error('Failed to restore nonces:', err);
  }
}
```

Why this matters:
- Without persistence, every restart risks nonce collisions and rejected transactions.

What this code does:
- Writes nonce data to disk atomically via a temp file.
- Restores nonce values on startup.

---

## Extended deep dive: nonce management as a concurrency problem

The `NonceManager` is small but conceptually dense. It is an application-level concurrency controller, a persistence layer, and a recovery mechanism all rolled into one. This section breaks down the design in a more textbook-style way.

---

### 4) Nonce semantics in this chain

On-chain, the account nonce is the next expected value. When a transaction with nonce N is accepted, the account nonce becomes N + 1. The gateway must therefore use the account's current nonce as the nonce in the next transaction it submits. If it skips ahead, the transaction is rejected. If it reuses the same nonce, it is rejected.

The gateway lives in the messy world of asynchronous requests, retries, and user clicks. Without a nonce manager, it would be easy to send duplicate nonces or race two requests for the same account. The `NonceManager` is the layer that prevents that from happening.

---

### 5) Internal data structures and what they mean

`NonceManager` keeps three key maps:

- `nonces: Map<publicKeyHex, bigint>`
- `pending: Map<publicKeyHex, Set<bigint>>`
- `locks: Map<publicKeyHex, Promise<void>>`

Think of them as three views of the same reality:

- `nonces` = the next nonce to use.
- `pending` = nonces that have been handed out but not yet confirmed on-chain.
- `locks` = a per-key mutex to avoid races inside the gateway process.

This is classic state-machine structure: you track the expected state, the in-flight state, and the synchronization mechanism that keeps transitions orderly.

---

### 6) Startup, persistence, and secure storage

On construction, the manager sets up a data directory (`.gateway-data` by default) and a persistence file (`nonces.json`). It enforces permissions:

- Directory: `0700` (only the gateway user can access it).
- File: `0600` (only the gateway user can read/write it).

This matters because nonce files are sensitive. If another user on the same machine edits them, they could force the gateway to reuse nonces or skip ahead, causing denial-of-service or confusing user errors.

The `migrateLegacyFile` function ensures older installations are migrated to the new path with correct permissions. This is a good example of operational hardening: it makes upgrades safe and avoids leaving sensitive files in old locations.

---

### 7) Atomic persistence and crash safety

`persist()` writes to a temporary file and then renames it into place. This is an atomic update on most filesystems. The purpose is to avoid partial writes. Without this, a crash during write could leave a corrupt JSON file and break nonce recovery.

In other words, persistence here is treated like a tiny transaction: write the new version completely, then swap it in. This is the right strategy whenever you persist state that must be consistent across restarts.

---

### 8) `getAndIncrement`: nonce allocation as an atomic step

`getAndIncrement` does two things at once:

1) It returns the current nonce (which will be used in the transaction).
2) It immediately increments the stored nonce so the next caller gets a new value.

This is crucial. If you returned the current nonce without incrementing, two concurrent calls could both see the same nonce. The manager avoids that by mutating state before returning.

It also records the allocated nonce in the `pending` set. That set is the ground truth for "transactions in flight." It gives the gateway a way to answer questions like: "Are we waiting for any submissions for this account?" and "Which specific nonces are still unconfirmed?"

---

### 9) The lock: serialization inside one process

The `withLock` method is effectively a per-key mutex implemented with promises. It makes sure that only one transaction builder for a given public key runs at a time. This prevents race conditions such as:

- Two requests reading the same current nonce.
- Two transactions being submitted simultaneously with identical nonces.

The lock is in-process only. It does not help if you run multiple gateway instances. If you do run multiple instances, you need either:

- an external nonce coordinator, or
- a single shared nonce service.

So the lock solves the concurrency problem inside one process, but not across processes. This distinction is important for production deployments.

---

### 10) Pending nonces and confirmation

A nonce moves through three states:

1) **Allocated**: returned by `getAndIncrement` and placed into `pending`.
2) **Confirmed**: removed by `confirmNonce` when the transaction appears on-chain.
3) **Discarded**: removed when a mismatch or rejection requires resync.

`confirmNonce` is the cleanup hook that removes a nonce from the pending set. This should be called when the updates stream indicates the transaction was included in a block. If you forget to call it, the pending set will grow and the gateway may think transactions are still in flight.

---

### 11) Nonce mismatch recovery

`handleRejection` and `syncFromBackend` together implement the recovery path. The flow is:

1) Transaction submission fails.
2) The error string is inspected for nonce-related keywords.
3) If it looks like a nonce mismatch, the pending set is cleared.
4) The gateway calls `syncFromBackend` to fetch the authoritative nonce.
5) Local nonce is replaced with the on-chain nonce.

This is the only safe recovery path. If a nonce mismatch occurs, you cannot simply "increment" or "decrement" locally. You must ask the chain for the truth.

---

### 12) `syncFromBackend` and the account endpoint

`syncFromBackend` fetches `/account/<pubkey>` from the backend. That endpoint returns the on-chain account nonce. The manager then sets its local nonce to that value and clears pending entries.

Two important implications:

- The account endpoint must be reliable; if it is down, nonce recovery fails.
- After syncing, **all in-flight transactions are assumed invalid** because the local pending set is cleared.

This is conservative but correct. It avoids accidental reuse of stale nonces.

---

### 13) Origin header and cross-service calls

`syncFromBackend` sends an `Origin` header. This is a subtle security feature: it helps backend CORS and request validation logic. It also makes it possible to distinguish gateway requests from other clients.

If you change the gateway origin, update it here, or nonce recovery may fail due to backend security rules.

---

### 14) `isNonceMismatch`: a fragile but practical heuristic

Nonce mismatch detection is currently string-based. It checks for substrings like "nonce", "invalidnonce", and "replay" in error messages. This is fragile because it depends on error message text, which might change. But it is also practical because it requires no protocol changes.

If you modify backend error messages, you must keep these keywords or update this detection logic. Otherwise, the gateway will fail to resync when it should.

---

### 15) Reset and re-initialization

`reset` clears local nonce and pending state for a key. This is used when you need to restart nonce tracking from scratch (for example, when onboarding a new player or after a critical error).

Reset is a strong action: it discards local knowledge. It should be used only when you are confident that the next operation will synchronize from the backend.

---

### 16) Monitoring and observability

`getStats` returns:

- totalKeys: number of tracked accounts
- totalPending: total in-flight nonces across all accounts

This is extremely useful for monitoring. A rising `totalPending` without corresponding confirmations may signal backend failures or network issues. In production, you can expose these stats to a metrics system.

---

### 17) Security model: what the nonce manager can and cannot protect

NonceManager protects against **accidental** misuse of nonces in the gateway, not against malicious clients. A malicious client can still craft their own transactions. The on-chain nonce validation is the ultimate enforcement.

In other words:

- Gateway nonce manager = usability and reliability for honest clients.
- On-chain nonce check = security for the entire network.

Both are needed, but they serve different roles.

---

### 18) Failure scenarios and their behavior

Here are common failure scenarios and how the manager responds:

1) **Gateway restart**: nonces are restored from disk; pending set is lost unless it was persisted separately. This means a restart might require a resync if there were in-flight transactions.
2) **Backend down**: `syncFromBackend` fails; the gateway cannot recover from nonce mismatch until backend is back.
3) **Concurrent submits**: `withLock` serializes them; only one nonce is used at a time.
4) **Chain reorg / skip**: if a transaction is dropped, the pending nonce remains until a resync or retry occurs.

Understanding these scenarios helps you design robust retry logic in the session manager.

---

### 19) Why pending nonces are not persisted

The manager only persists current nonces, not pending sets. That is a conscious trade-off. Persisting pending sets would require reconstructing in-flight transactions on restart, which is complex and may be wrong anyway. Clearing pending on restart is safer: you can always resync from the backend if needed.

This means that after a restart, you should assume nonces might be stale and be ready to call `syncFromBackend` if submissions fail.

---

### 20) Interactions with SessionManager

SessionManager orchestrates transaction submission. It uses `NonceManager` to allocate nonces, then submits transactions through the SubmitClient. If submission fails, it uses `handleRejection` to decide whether to resync.

This coupling is important: nonce manager does not know about submission itself, and the session manager does not track nonces directly. Each has a clear responsibility boundary.

---

### 21) Feynman analogy: the deli ticket system

Imagine a deli counter with tickets:

- The nonce manager is the ticket dispenser.
- `getAndIncrement` is pulling the next ticket.
- `pending` is the stack of tickets currently being served.
- `confirmNonce` is when your order is called and the ticket is thrown away.
- If the number system breaks (nonce mismatch), you stop everything, check with the manager, and reset the counter.

This analogy captures the intuition: ordering is everything, and you must coordinate across concurrent customers.

---

### 22) Exercises for mastery

1) Simulate three concurrent submissions for the same public key. Explain how `withLock` and `getAndIncrement` prevent duplicate nonces.
2) Describe how a gateway restart could lead to a nonce mismatch and how `syncFromBackend` fixes it.
3) Explain why pending nonces are not persisted and why that is acceptable.
4) Modify the manager to persist pending sets and describe the new risks that introduces.

If you can do these exercises, you understand both the code and the design choices.


## Addendum: edge cases and practical guidance

### 23) Pending helpers are for UX

`hasPending` and `getPendingNonces` expose pending information to callers. This is primarily for UX and retry logic. For example:

- The UI can disable buttons while there are pending transactions.
- The gateway can decide whether to show a "waiting for confirmation" state.
- Debug tooling can print pending nonces to diagnose stuck submissions.

These helpers are small, but they prevent duplicate submissions in the UX layer.

### 24) BigInt serialization quirks

The manager stores nonces as `bigint` in memory but serializes them to strings in JSON. This is important because JSON does not support BigInt directly. If you accidentally store them as numbers, large nonces will lose precision and your gateway will start submitting invalid transactions.

Always treat nonces as BigInt and serialize them as strings when writing to JSON.

### 25) Error handling philosophy

Notice that most errors are caught and logged rather than thrown. The nonce manager is designed to be resilient: it should not crash the gateway if a nonce file is missing or a sync request fails. Instead, it logs the error and lets the higher layer decide how to recover.

This is a deliberate tradeoff. It favors uptime over strict failure handling, which is appropriate for a gateway that can recover by resyncing.

### 26) If you run multiple gateways

The lock only protects concurrency within a single process. If you run multiple gateway instances that submit transactions for the same public key, you will get nonce collisions. The fix is to:

- ensure a single gateway instance is responsible for a given key, or
- introduce an external nonce coordination service.

Without such coordination, no amount of local locking can prevent conflicts.

### 27) Suggested operational playbook

When nonce issues occur in production:

1) Inspect gateway logs for "nonce mismatch" or "replay" messages.
2) Call `syncFromBackend` for the affected key.
3) Clear pending state for that key if necessary.
4) Re-submit any user transactions with the new nonce.

This playbook mirrors the logic in `handleRejection` but gives human operators a deterministic recovery procedure.


### 28) Coupling to backend error messages

Nonce mismatch detection relies on string matching. That is brittle but functional. It means backend error messages are part of the implicit API contract. If the backend changes its wording and removes the word "nonce" or "replay", the gateway will stop auto-resyncing. When you touch backend error messages, always check the nonce manager. In a future hardening pass, you might switch to structured error codes instead of string matching.


### 29) Garbage collection of pending state

The pending set is cleared when confirmations arrive or when a nonce mismatch is detected. There is no automatic timeout. This is intentional: timeouts are tricky because a slow chain could falsely trigger cleanup. Instead, the manager keeps pending nonces until it has a strong signal (confirmation or mismatch). If you ever see the pending set grow without shrinking, that is a sign of missing confirmations or a stuck updates stream.


### 30) Using stats for alerting

If `totalPending` stays high for several minutes, it is a sign of stuck confirmations or a broken updates stream. Alerting on this metric is an easy way to detect gateway-chain connectivity issues early.


## Key takeaways
- Nonces are critical to transaction ordering and replay protection.
- The manager serializes nonce use, handles mismatches, and persists state to disk.

## Next lesson
L26 - Freeroll scheduler UI: `feynman/lessons/L26-freeroll-scheduler-ui.md`
