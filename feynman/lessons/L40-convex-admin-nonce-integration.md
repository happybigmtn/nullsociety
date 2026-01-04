# L40 - Admin nonce store (integration) (from scratch)

Focus file: `website/convex/admin.ts`

Goal: explain how Convex stores and reserves admin nonces so multiple services do not collide. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Why nonces need a shared store
Admin transactions must be strictly ordered. If two processes submit the same nonce, one fails. A shared store hands out nonces in sequence.

### 2) Service token access
Only backend services should reserve admin nonces. That is why every mutation requires a service token.

---

## Limits & management callouts (important)

1) **No TTL on nonce records**
- `admin_nonces` rows are never deleted.
- This is usually fine, but the table can grow with multiple admin keys.

2) **Normalization only clamps to >= 0**
- `normalizeNonce` does not enforce a maximum.
- If a bug sets an extremely large nonce, it will be stored as-is.

---

## Walkthrough with code excerpts

### 1) Normalizing nonces
```rust
const normalizeNonce = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};
```

Why this matters:
- It prevents NaN or negative values from corrupting the nonce store.

What this code does:
- Converts the input to a non-negative integer.
- Returns 0 when the input is invalid.

---

### 2) Reserving a nonce
```rust
export const reserveAdminNonce = mutation({
  args: {
    serviceToken: v.string(),
    adminPublicKey: v.string(),
    fallbackNonce: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const fallbackNonce = normalizeNonce(args.fallbackNonce);
    const existing = await ctx.db
      .query("admin_nonces")
      .withIndex("by_admin_public_key", (q) =>
        q.eq("adminPublicKey", args.adminPublicKey),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("admin_nonces", {
        adminPublicKey: args.adminPublicKey,
        nextNonce: fallbackNonce + 1,
        updatedAtMs: Date.now(),
      });
      return fallbackNonce;
    }

    const reserved = normalizeNonce(existing.nextNonce);
    await ctx.db.patch(existing._id, {
      nextNonce: reserved + 1,
      updatedAtMs: Date.now(),
    });
    return reserved;
  },
});
```

Why this matters:
- This is the global counter that prevents two admin transactions from colliding.

Syntax notes:
- The function returns the reserved nonce and advances `nextNonce` for the next caller.

What this code does:
- Creates a new nonce record if one does not exist.
- Otherwise returns the current `nextNonce` and increments it.

---

### 3) Resetting the nonce after a failure
```rust
export const resetAdminNonce = mutation({
  args: {
    serviceToken: v.string(),
    adminPublicKey: v.string(),
    nextNonce: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const nextNonce = normalizeNonce(args.nextNonce);
    const existing = await ctx.db
      .query("admin_nonces")
      .withIndex("by_admin_public_key", (q) =>
        q.eq("adminPublicKey", args.adminPublicKey),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        nextNonce,
        updatedAtMs: Date.now(),
      });
      return null;
    }

    await ctx.db.insert("admin_nonces", {
      adminPublicKey: args.adminPublicKey,
      nextNonce,
      updatedAtMs: Date.now(),
    });
    return null;
  },
});
```

Why this matters:
- If a transaction fails, the local nonce cache can be wrong. Resetting fixes the sequence.

What this code does:
- Updates the stored nonce to a known value.
- Inserts a new record if one does not exist yet.

---

## Extended deep dive: admin nonce store as a shared sequence allocator

This lesson overlaps with L29, but from an integration standpoint: how the admin nonce store is used by services, why it exists, and what invariants it enforces across the stack.

---

### 4) Integration point: the auth service

The auth service calls `reserveAdminNonce` before submitting admin transactions. This means the nonce store is not just a data table; it is a *coordination layer*. If multiple auth requests attempt to update freeroll limits at once, they will serialize through this store.

The store is therefore a distributed mutex for admin nonces. It lets independent requests safely share a single nonce sequence.

---

### 5) Sequence allocator model

You can view the nonce store as a sequence allocator with the following contract:

- Input: adminPublicKey + fallbackNonce.
- Output: unique nonce for the next transaction.
- Side effect: increments the stored `nextNonce`.

This is the same pattern as auto-increment IDs in databases, but scoped per admin public key.

---

### 6) Why fallbackNonce is required

The chain is the canonical source of nonces. When the store is first initialized, it does not know the correct next nonce. The caller provides `fallbackNonce` (typically the on-chain nonce). The store uses this to seed `nextNonce` correctly.

This prevents the store from starting at 0 and issuing invalid nonces. It is a critical bootstrap mechanism.

---

### 7) Recovery via reset

If submission fails (e.g., nonce mismatch), the auth service resets the store with the chain nonce. This “hard reset” realigns the store with the chain.

Reset is intentionally idempotent. You can call it multiple times with the same value and the store remains consistent.

---

### 8) Service token as a guardrail

Every mutation checks `requireServiceToken`. This is the only access control. It means any backend service with the token can allocate nonces. The token is therefore a root credential and must be protected.

A leaked token would allow an attacker to drain or scramble the nonce sequence, causing admin transactions to fail or delay. Protect the token like a private key.

---

### 9) Sequence monotonicity and drift

The store guarantees that `nextNonce` monotonically increases. But if the chain nonce ever goes backward (e.g., reorg or failure), the store must be reset. This is why the reset mechanism exists.

Without reset, the store could get “ahead” and continue issuing nonces that the chain rejects. Reset is the escape hatch that restores monotonicity to match the chain.

---

### 10) Multi-admin support

The store keys by `adminPublicKey`, which means it naturally supports multiple admin keys. Each key has its own sequence. This is useful if you ever introduce multiple admin roles (e.g., ops key, finance key).

However, this also means the caller must normalize public keys consistently. If the same key is provided in different formats (with or without `0x`, uppercase vs lowercase), you could create duplicate rows and lose coordination. Normalization should happen before calling the store.

---

### 11) Operational visibility

Every reservation updates `updatedAtMs`. This is useful for monitoring: if the timestamp hasn’t changed in a long time, it might indicate that admin sync is not running. This can be used for alerts.

You could also extend the store with metrics (number of reservations, last reserved nonce) if you need deeper operational insight.

---

### 12) Why no TTL on nonce records

Nonce records are never deleted. This is fine because the number of admin keys is small. Deleting records would complicate recovery, because you would need to seed the store again with a fallback nonce. Keeping records simplifies operations and keeps history intact.

---

### 13) Edge case: extremely large nonces

`normalizeNonce` clamps only to >= 0; it does not enforce an upper bound. If a bug sets an extremely large nonce, the store will accept it. This could effectively lock out admin transactions until a reset occurs.

If you want stronger safety, you could add an upper bound or compare against chain nonce inside the mutation. For now, reset remains the main recovery tool.

---

### 14) Integration with reconciliation

Admin nonce reservation is used mainly by freeroll limit sync, which is driven by entitlements. If entitlements update quickly (e.g., bulk reconciliation), you might get many admin updates. The nonce store serializes them safely, but you should still consider rate limiting at the service layer to avoid hammering the chain.

---

### 15) Testing considerations

Testing should verify:

- first reservation seeds from fallback
- sequential reservations increment correctly
- reset overwrites nextNonce
- service token is required

These are the invariants that keep admin sync stable.

---

### 16) Feynman analogy: a numbered ticket machine

Imagine a deli ticket machine. Each admin key has its own machine. Each time you press the button, you get the next number, and the machine increments. If the numbers drift from the official ledger, the manager resets the machine to the correct number. That is exactly what the nonce store does.

---

### 17) Exercises for mastery

1) Explain why fallbackNonce is needed at initialization.
2) Describe how reset restores consistency after a failed submission.
3) Explain why service token leakage would be dangerous.
4) Propose an enhancement that enforces an upper bound on nonces.

If you can answer these, you understand the integration role of the nonce store.


## Addendum: deeper coordination semantics

### 18) Convex mutation atomicity as a lock

Convex mutations are atomic and serializable. That means `reserveAdminNonce` behaves like a lock-free sequence allocator: no two callers can reserve the same nonce because the mutation serializes their access to the `admin_nonces` record.

This is the key property that makes the store safe under concurrency. Without atomicity, two requests could read `nextNonce` simultaneously and both return the same value.

---

### 19) What happens during simultaneous failures

Consider the worst case: two admin submissions happen at once, one fails due to network error, and both attempt to reset. Because reset is also a mutation, Convex will serialize them. The last reset wins.

This means you could briefly oscillate the stored nonce. The system still converges because the chain’s nonce is canonical, and eventually a successful reset will align the store.

---

### 20) Why the store returns the previous nonce

When a record exists, the store returns `nextNonce` and then increments it. This matches the transaction rule: you submit using the current nonce, and the next expected nonce is +1. The store mirrors that protocol exactly.

This is a subtle but important detail. If the store returned the *incremented* nonce instead, all admin transactions would be off by one.

---

### 21) The “gap” problem and why it’s tolerable

If a reservation is made but the transaction is never submitted (e.g., crash before submission), the nonce is “lost” — the store has moved on, but the chain has not. This creates a gap.

Gaps are not fatal. They can be repaired by a reset, or by simply resyncing with the chain and skipping ahead. The system is designed to tolerate such gaps because admin operations are low volume and resets are cheap.

---

### 22) Comparing local nonce caches vs shared store

A local cache is faster and simpler, but it is only safe within one process. A shared store is slower (network round-trip) but safe across processes.

This is a classic tradeoff: consistency vs latency. For admin operations, consistency is more important than speed, which is why the shared store is preferred whenever available.

---

### 23) Scaling to multiple services

If you later add more services that need admin transactions (e.g., ops scripts, schedulers), they should all use the same nonce store. The store becomes a shared coordination primitive.

This is similar to using a centralized job queue: each actor takes a ticket (nonce), performs the job, and the queue guarantees uniqueness.

---

### 24) Debugging nonce issues

If admin transactions fail with nonce mismatch, the first step is to inspect the nonce store and compare it to the chain’s account nonce. If they differ, reset.

A useful debug workflow:

1) Query on-chain account nonce.
2) Query `admin_nonces` record for the same admin key.
3) If mismatch, call reset with chain nonce.

This restores alignment quickly.

---

### 25) Audit trails for nonce allocation

The store itself does not keep a history of allocations, only the current `nextNonce`. If you want an audit trail, you can extend the system with a separate table (`admin_nonce_allocations`) that logs each reservation.

This would be useful for forensic analysis if you suspect misuse or unexpected admin activity.

---

### 26) Potential improvement: monotonicity guard

One hardening step would be to reject resets that move the nonce *forward* by too much (e.g., >1000). This could detect misconfiguration or corrupted values. Currently, the reset mutation accepts any non-negative value.

Adding such guards can prevent runaway errors, but it must be balanced with the need to recover from real drift. In early-stage systems, the simpler approach is often acceptable.

---

### 27) Interaction with database migrations

If you ever migrate Convex tables, be careful not to break the `admin_nonces` schema or indexes. Losing the `by_admin_public_key` index would make reservations inefficient and could lead to timeouts.

Schema stability is important because this table sits on a critical path for admin transactions.

---

### 28) Using multiple admin keys in production

If you split responsibilities across admin keys (e.g., one for tournament limits, one for treasury operations), you will have multiple records in `admin_nonces`. That is fine. But you must ensure each service knows which key it is responsible for and does not accidentally mix them.

Mixing keys could lead to incorrect nonce allocation and signature errors.

---

### 29) Security: service token scope

The service token used here is the same token used for other Convex operations. This means the admin nonce store does not have a separate access scope. If you want stronger isolation, you could create a dedicated token or add additional checks (e.g., only allow specific admin keys).

This is an architectural decision. Simplicity favors a single token; security favors scoped tokens.

---

### 30) Production monitoring suggestions

Key signals to monitor:

- frequency of `reserveAdminNonce` calls (spikes might indicate loops)
- frequency of resets (too many resets suggest nonce mismatch issues)
- time since last update (stale store means admin sync is not running)

These signals can be derived from logs or by querying the table. They provide early warning of admin pipeline issues.

---

### 31) Feynman exercise

Explain the nonce store to someone who has never heard of blockchain. Use a metaphor like a queue of numbered tickets and explain why you need a shared ticket machine when multiple clerks are working.

If you can do that, you truly understand the coordination role of this store.


## Addendum: design tradeoffs and future evolution

### 32) Why normalization is minimal

`normalizeNonce` only clamps to >= 0 and floors. It does not enforce an upper bound because the chain nonce is unbounded. Adding an upper bound could accidentally block legitimate nonces if the system runs long enough. This is why the function is intentionally conservative.

---

### 33) The fallback nonce as a synchronization point

The fallback nonce is provided by the caller, which typically queries the chain. That means the store trusts the caller to provide an accurate snapshot. If the snapshot is stale, the store might start at the wrong value.

This is acceptable because resets exist. The system trades strict correctness for simplicity at initialization.

---

### 34) Multiple environments and testnets

If you run multiple environments (dev, staging, prod), ensure each uses a distinct Convex deployment or at least distinct admin public keys. Otherwise, you could accidentally share a nonce store across environments, causing conflicts. The store is not environment-aware; it only keys by admin public key.

---

### 35) Database growth considerations

`admin_nonces` is tiny, so growth is not a concern. However, if you treat admin keys as ephemeral or rotate frequently, you might accumulate unused records. This is still low risk, but you could add an admin cleanup tool if needed.

---

### 36) The role of `updatedAtMs`

`updatedAtMs` is updated on every reservation and reset. This is a cheap heartbeat. It lets you detect whether admin sync is active without parsing logs. A simple monitoring script can query this field and alert if it hasn’t changed recently.

---

### 37) Partial failures and idempotency

The nonce store itself is idempotent: calling reset multiple times with the same value yields the same state. Reservation is not idempotent—it always increments. That means the caller must be careful not to retry reservations blindly.

The typical pattern is:

- Reserve nonce → build transaction → submit.
- If submission fails, reset. Do not retry reservation unless you know the previous nonce was not used.

This pattern avoids “burning” multiple nonces unnecessarily.

---

### 38) Comparison to other systems

In many blockchain systems, nonce management is handled entirely client-side. This system uses a centralized store because admin operations are centralized and low-volume. This is a pragmatic choice: it reduces complexity and avoids distributed nonce conflicts.

---

### 39) Hardening suggestion: optimistic concurrency control

If you wanted to make the store even safer, you could add a version field and require the caller to provide the expected version. That would detect unexpected mutations from other services. However, this adds complexity and is likely unnecessary for current scale.

---

### 40) Final note

The admin nonce store is not glamorous, but it is the glue that keeps privileged transactions ordered and safe. Treat it as critical infrastructure.


### 41) Checklist for operators

When deploying a service that uses the nonce store:

1) Verify the service token is correct.
2) Verify the admin public key is normalized (lowercase, no 0x).
3) Verify the chain nonce can be queried (fallbackNonce).
4) Verify resets are logged and monitored.

This checklist prevents the most common deployment mistakes.

### 42) Tiny epilogue

Small tables can still be mission‑critical.


### 43) Edge case: manual nonce overrides

If an operator manually resets the nonce to an incorrect value, the next admin transaction will fail. This is expected behavior and can be resolved by resetting to the on‑chain nonce. The system assumes human operators might make mistakes, so reset is intentionally simple and safe.

### 44) Last word

Nonce coordination is boring until it breaks; keep it boring.


### 45) Final recap

The nonce store is a coordination primitive. It doesn’t execute transactions, but it determines whether every admin transaction succeeds or fails. That makes it one of the most important pieces of glue in the admin pipeline.


### 46) Tiny epilogue

Sequencing is invisible when it works, and catastrophic when it doesn’t.


### 47) Final word

Treat nonce allocation as critical infrastructure, not a utility.


### 48) Epilogue

Stay consistent.


## Key takeaways
- Convex provides a simple global counter for admin nonces.
- Service token gating protects the nonce store.
- Resetting is essential for recovery after submission errors.

## Next lesson
L41 - Gateway craps handler (live vs normal routing): `feynman/lessons/L41-gateway-craps-handler.md`
