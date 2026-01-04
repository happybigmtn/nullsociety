# L29 - Convex admin nonce store (from scratch)

Focus file: `website/convex/admin.ts`

Goal: explain how the admin nonce is reserved and reset in Convex to avoid collisions across auth requests. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Why a nonce store exists
Admin transactions must use sequential nonces. If multiple requests happen at once, they could reuse a nonce and cause rejections. The Convex store reserves nonces atomically.

### 2) Service token protection
These mutations are admin-only. They require a service token so arbitrary users cannot mutate admin nonce state.

---

## Limits & management callouts (important)

1) **Nonce values are normalized**
- `normalizeNonce` clamps to `>= 0` and floors to an integer.
- This avoids negative or NaN values corrupting nonce state.

---

## Walkthrough with code excerpts

### 1) Reserve a nonce
```ts
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
- Only one request can safely reserve a nonce at a time. This prevents admin tx collisions.

What this code does:
- Looks up the stored nonce for the admin public key.
- If none exists, inserts a new record with `fallbackNonce + 1` and returns the fallback nonce.
- If one exists, returns `nextNonce` and increments it for the next reservation.

---

### 2) Reset a nonce
```ts
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
- If an admin transaction fails or the chain nonce changes, the store must be reset.

What this code does:
- Normalizes the requested nonce and writes it into the store.
- Upserts the record if it doesn’t exist.

---

## Extended deep dive: the nonce store as a distributed lock

The admin nonce store is a tiny module, but it solves a real distributed systems problem: **how to allocate nonces safely when multiple requests can race**. You can think of it as a distributed lock or ticket dispenser.

---

### 3) Why this is a coordination problem

Admin transactions must use strictly increasing nonces. If two requests hit the auth service at the same time, they could otherwise choose the same nonce and submit conflicting transactions. The chain would accept at most one, and the other would fail with a nonce mismatch.

The nonce store turns this into a coordination problem with a single source of truth. Convex provides transactional mutations, which means:

- each mutation runs atomically,
- only one mutation can update a record at a time,
- concurrent requests are serialized by Convex.

This is exactly what you want for nonce allocation.

---

### 4) Service token protection as an authorization layer

Both mutations require a `serviceToken` argument. This is validated by `requireServiceToken` in `website/convex/serviceAuth.ts`. That check compares the incoming token to `process.env.CONVEX_SERVICE_TOKEN`.

This is a simple but effective authorization gate. It ensures only the backend service (auth) can mutate the admin nonce store. Without it, any client could reserve or reset nonces, causing denial-of-service.

This is an example of **capability-based security**: possession of the service token grants mutation rights.

---

### 5) Normalization is not just hygiene

`normalizeNonce` floors, clamps, and defaults to 0 if the input is invalid. This is more than just data cleaning—it prevents corrupted or malicious input from poisoning the nonce store. Consider if a caller passed NaN or a negative number. Without normalization, the store could get stuck or allocate invalid nonces, leading to permanent failures.

By clamping to a non-negative integer, the store enforces an invariant: `nextNonce` is always a valid u64‑like integer.

---

### 6) The reserve flow as an atomic counter

`reserveAdminNonce` implements the classic “fetch-and-increment” pattern:

- If no record exists, insert a new one with `fallbackNonce + 1` and return `fallbackNonce`.
- If a record exists, return `nextNonce` and increment it by 1.

This pattern turns the database row into an atomic counter. Convex’s transactional guarantees ensure that two concurrent calls cannot both receive the same `nextNonce`.

This is the same logic as a ticket dispenser in a deli: each caller gets a unique ticket number, and the dispenser advances by one each time.

---

### 7) Why fallbackNonce exists

When the store is first created, it uses `fallbackNonce` (provided by the caller) as the starting point. This fallback is typically the **current on-chain nonce**. That ensures the nonce store is aligned with the chain at initialization.

If you did not use a fallback, the store would start at 0 and likely issue invalid nonces. The fallback therefore anchors the store to the chain’s truth at the time of creation.

---

### 8) Reset flow as reconciliation

`resetAdminNonce` is used when the admin transaction pipeline detects a mismatch or failure. It replaces the store’s `nextNonce` with a fresh value (usually the on-chain nonce).

This is a reconciliation step: it forces the store to match reality again. Without a reset, a single failed submission could leave the store “ahead” of the chain indefinitely.

---

### 9) Convex indexing and lookup semantics

The store uses a Convex index `by_admin_public_key`. This makes lookups by `adminPublicKey` efficient and deterministic. Without the index, each reservation would require a full scan, which would be slow and expensive.

Indexes also enforce a subtle correctness property: the query `.unique()` ensures you only ever get one record for a given admin key. If multiple records existed, the system would be ambiguous and could issue duplicate nonces. The index + unique query enforce the invariant “one admin key = one nonce record.”

---

### 10) updatedAtMs as an operational signal

Each record stores `updatedAtMs`. This is not used in logic, but it is valuable for operations:

- You can detect if the nonce store is stale.
- You can see when the last admin transaction occurred.
- You can alert if the nonce store has not been updated for too long.

This is a common pattern: attach timestamps for observability, even if core logic doesn’t require them.

---

### 11) Failure scenarios and outcomes

Let’s consider failures:

1) **Convex unavailable**: reserve calls fail; auth service falls back to a local nonce cache. This sacrifices cross-request safety but keeps the system alive.
2) **Service token mismatch**: reserve/reset throws; admin operations fail. This is a hard failure and should trigger alerts.
3) **Invalid fallback nonce**: normalization clamps to 0; could lead to reuse if chain nonce is not 0.
4) **Multiple admin keys**: each key gets its own record, so no collisions across keys.

The design prioritizes safety when Convex is available, and availability when it is not.

---

### 12) Why not store nonces on the chain itself?

You might ask: the chain already stores nonces. Why not just query that every time? Two reasons:

- **Concurrency**: two parallel requests could both read the same on-chain nonce before either is committed. You’d still have a race.
- **Latency**: on-chain queries add latency and can be expensive under load.

The Convex nonce store provides a fast, off-chain coordination layer that smooths these issues. It does not replace the chain; it just prevents avoidable conflicts.

---

### 13) Relationship to the auth service

The auth service uses `reserveAdminNonce` before building and submitting a transaction. This means the store is effectively a **front-runner** for admin transactions. If the auth service is down, the store is idle. If the auth service is overloaded, the store serializes allocations.

In other words, the store is a bottleneck by design. This is acceptable because admin operations are low throughput and should be serialized.

---

### 14) Correctness invariant: monotonicity

The key invariant is:

```
nextNonce is always >= last reserved nonce + 1
```

The reserve function enforces this by incrementing `nextNonce` every time it is used. The reset function can break monotonicity if it sets `nextNonce` to a smaller value (e.g., chain reorg). But that is intentional: the chain is the ultimate authority, so the store must follow it even if it goes backwards.

---

### 15) Potential race with chain state

Imagine this sequence:

1) Store reserves nonce 5.
2) Admin submits tx with nonce 5, but it fails to get accepted.
3) Store increments to 6 anyway.
4) Chain still expects 5.

This is why reset is important. Without reset, the store would be ahead and would only issue invalid nonces. The auth service handles this by resetting on submission failures.

---

### 16) Designing for multi‑service usage

If you ever have multiple services that need admin nonces (e.g., scheduler + auth + ops scripts), they should **all use this nonce store**. Otherwise they will conflict.

The store is the coordination point. If you bypass it, you reintroduce the race you were trying to eliminate.

---

### 17) Storing the admin public key

The key is stored as a hex string. This is simple and stable, but you must ensure consistent normalization. The code does not normalize `adminPublicKey` in Convex; the caller is responsible. That means the caller should always pass lowercase hex without `0x` prefix. If you mix formats, you could accidentally create multiple records for the same key.

This is an implicit contract. A good future hardening step would be to normalize inside the mutation itself.

---

### 18) Why `reserve` returns a number, not a bigint

Convex uses JavaScript numbers. That means the nonce store works reliably only while nonces are below 2^53. In practice, this is acceptable because admin transactions are rare. But it is a subtle limitation. If the system ever approaches very high nonces, you would need to switch to string-based or bigint-compatible storage.

This is another example of a practical tradeoff: choose a simple representation that is safe for expected scale.

---

### 19) Extending the store for audit history

Right now, the store only keeps the current `nextNonce`. If you wanted a fuller audit, you could log each reservation in a separate table with:

- timestamp
- adminPublicKey
- reservedNonce
- caller identity

This would provide a chronological record of admin nonce usage, useful for debugging and compliance. It is not strictly required for correctness but could be valuable in regulated environments.

---

### 20) Feynman analogy: the deli ticket dispenser

The Convex nonce store is a ticket dispenser. Each time you pull a ticket, it increments the counter and gives you a unique number. If the dispenser breaks or gets out of sync, you reset it to the correct number from the manager’s logbook (the chain).

This analogy captures both the purpose (unique tickets) and the reset mechanism (reconciliation with the official record).

---

### 21) Exercises for mastery

1) Explain why using on-chain nonce reads alone is insufficient in a concurrent environment.
2) Describe a scenario where the fallback nonce is incorrect and how the system recovers.
3) Propose a modification to store nonces as strings to avoid the 2^53 limit.
4) Explain how you would detect misuse of the nonce store (e.g., unauthorized access).

If you can answer these, you understand the Convex nonce store and its role in the system.


## Addendum: schema design, limits, and future evolution

### 22) Schema design of `admin_nonces`

The Convex schema defines `admin_nonces` with three fields:

- `adminPublicKey: string`
- `nextNonce: number`
- `updatedAtMs: number`

and an index `by_admin_public_key`.

This is intentionally minimal. The table is meant to store *only* the state needed to allocate the next nonce. Any additional metadata would increase write amplification without adding correctness.

The index ensures fast lookups by key. Because the table is keyed by admin public key, the index is effectively the primary key.

---

### 23) Why there is no explicit primary key

Convex automatically assigns `_id` to each document, so the schema doesn’t need a primary key. Instead, the combination of `adminPublicKey` and the unique lookup acts like a logical key. The `unique()` query enforces the assumption that only one record exists for a given admin public key. If multiple records somehow existed, the behavior would be ambiguous and unsafe.

This is why normalization at the caller is important: inconsistent casing or prefixes could create multiple records for the same key, violating the logical uniqueness guarantee.

---

### 24) Garbage collection and record lifecycle

The admin nonce records are effectively permanent. There is no deletion path. This is acceptable because there are very few admin keys. The table is not expected to grow beyond a handful of rows. That means the storage overhead is negligible, and there is no need for garbage collection.

If you ever rotate admin keys frequently, you might want to add a cleanup process to remove old keys or archive them. But in typical deployments, admin keys are long‑lived.

---

### 25) Consistency guarantees inside a Convex mutation

Convex mutations are serializable: each mutation sees a consistent view of the database and commits atomically. This is precisely what you want for a counter.

The important consequence: even if two requests hit `reserveAdminNonce` at the same time, Convex will serialize them. One will run first, insert or patch the record, and the other will see the updated value. There is no race condition at the database layer.

This is the strongest property you can have short of a distributed lock service, and it is built into Convex.

---

### 26) Idempotency and retries

The reserve mutation is not idempotent in the strict sense: calling it twice will produce two different nonces. That is correct behavior for a counter. But it means that if a caller retries after a timeout, they may unknowingly consume multiple nonces.

In practice, this is acceptable because:

- Admin transactions are low volume.
- Nonce gaps are not fatal as long as the chain’s expected nonce eventually matches.

However, if you care about minimizing gaps, you could add an idempotency key to the reserve API. That would require additional storage and logic, but could make retries safer.

---

### 27) Reset mutation as an override

Reset overwrites `nextNonce`. It is intentionally idempotent: calling reset twice with the same nonce produces the same state. This makes reset safe to retry.

The reset operation is the escape hatch. If anything goes wrong, you can reset to the on-chain nonce and restore alignment. This is why the auth service calls reset after submission failures.

---

### 28) Security boundary: why service tokens are enough

Convex service tokens are effectively root credentials for server-side mutations. If an attacker gets the token, they can mutate the nonce store. But they could also mutate other tables (users, entitlements) if those mutations are not protected.

So the security boundary is not just the nonce store; it is the entire Convex service token. Protect it accordingly.

If you want stronger isolation, you could create a separate token with limited scope or add additional checks (e.g., allowlist of admin public keys).

---

### 29) Performance characteristics

Each reservation performs:

- a single indexed query,
- a single insert or patch.

This is extremely cheap. Even with moderate admin traffic, this will not be a bottleneck. The bottleneck is far more likely to be network latency between auth service and Convex than the database operations themselves.

---

### 30) Testing the nonce store

Unit tests for this module should cover:

- first reservation inserts and returns fallback nonce,
- subsequent reservation returns incrementing values,
- reset overwrites nextNonce,
- normalization clamps invalid values.

For concurrency, you can simulate parallel reservations and ensure they return unique nonces. Convex’s serialization should guarantee this, but tests provide assurance.

---

### 31) Evolution: supporting multiple admin roles

If you ever introduce multiple admin roles (e.g., different keys for different instruction types), the store naturally supports it. Each admin key gets its own counter. The only requirement is that callers pass consistent `adminPublicKey` values.

You might also add metadata to record which role a key belongs to, but this is not required for the core nonce allocation logic.

---

### 32) Feynman exercise

Explain the nonce store to a teammate using the metaphor of a ticket dispenser in a bakery. Then explain why the dispenser must be guarded by a key (service token). Finally, explain what happens if the dispenser is out of sync and why a reset is needed.

If you can do this, you have internalized both the mechanism and the purpose.


### 33) Operational dashboard idea

Because `updatedAtMs` is stored, you can build a simple dashboard that shows when the admin nonce was last reserved. If this timestamp is stale while admin actions are expected, it is an early warning that the auth service is not performing syncs. This is a cheap but useful operational signal.


### 34) What happens on chain reorgs?

If the chain ever reorgs in a way that rolls back admin transactions, the on-chain nonce could move backward. The next admin submission would fail because the store is ahead. This is exactly why reset exists: after a failure, reset reconciles the store with the chain. It is a simple mechanism that also covers rare consensus edge cases.


### 35) Summary note

At this scale, a tiny table plus a token gate gives strong safety with minimal complexity.


## Key takeaways
- The Convex nonce store prevents collisions across admin requests.
- Service tokens protect these mutations.

## Next lesson
L30 - Tournament handlers: `feynman/lessons/L30-tournament-handlers.md`
