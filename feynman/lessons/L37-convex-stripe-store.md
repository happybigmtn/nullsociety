# L37 - Stripe event store + entitlements (from scratch)

Focus file: `website/convex/stripeStore.ts`

Goal: explain how Stripe events are recorded idempotently and translated into entitlement rows. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Idempotency
Stripe may deliver the same webhook more than once. We store `eventId` and ignore duplicates so each Stripe event only affects entitlements once.

### 2) Entitlements
An entitlement is a derived record that says "this user currently has tier X". Stripe subscriptions map into entitlements, which later drive features and freeroll limits.

### 3) Reconcile state
Reconcile jobs need to remember where they left off. This file stores a cursor in a `stripe_reconcile_state` table so reconciliation can resume safely.

---

## Limits & management callouts (important)

1) **Stripe events are stored forever**
- There is no TTL or cleanup in this file.
- Over time, `stripe_events` can grow large.

2) **Entitlements are updated per item, not per subscription only**
- Each subscription item can create or update an entitlement.
- This is good for multi-product subscriptions but increases row count.

3) **Cancellation logic depends on `items` being present**
- If `items` are missing from an event, entitlements may not be marked canceled.
- Reconcile should include items to fix missing updates.

---

## Walkthrough with code excerpts

### 1) Reconcile state helpers
```rust
const reconcileStateDoc = v.object({
  _id: v.id("stripe_reconcile_state"),
  _creationTime: v.number(),
  name: v.string(),
  cursor: v.union(v.string(), v.null()),
  updatedAtMs: v.number(),
});

export const getStripeReconcileState = internalQuery({
  args: { name: v.string() },
  returns: v.union(v.null(), reconcileStateDoc),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("stripe_reconcile_state")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    return state ?? null;
  },
});
```

Why this matters:
- Reconciliation needs a stable cursor so it can resume safely after each batch.

Syntax notes:
- `v.union(v.string(), v.null())` means the cursor can be missing.

What this code does:
- Defines the schema for reconcile state.
- Fetches the state row by name, or returns null if it does not exist.

---

### 2) Upserting reconcile state
```rust
export const setStripeReconcileState = internalMutation({
  args: {
    name: v.string(),
    cursor: v.union(v.string(), v.null()),
    updatedAtMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripe_reconcile_state")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    const updatedAtMs = args.updatedAtMs ?? Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        cursor: args.cursor,
        updatedAtMs,
      });
      return null;
    }

    await ctx.db.insert("stripe_reconcile_state", {
      name: args.name,
      cursor: args.cursor,
      updatedAtMs,
    });
    return null;
  },
});
```

Why this matters:
- This lets reconciliation advance one batch at a time without losing progress.

What this code does:
- Updates the existing reconcile row if present.
- Inserts a new row if it does not exist yet.

---

### 3) Idempotent event storage
```rust
const alreadyProcessed = await ctx.db
  .query("stripe_events")
  .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
  .unique();
if (alreadyProcessed) {
  return null;
}

await ctx.db.insert("stripe_events", {
  eventId: args.eventId,
  eventType: args.eventType,
  processedAtMs: Date.now(),
});
```

Why this matters:
- Stripe can resend events. Without this check, entitlements could be duplicated.

What this code does:
- Checks whether the event ID was already processed.
- Stores the event as processed before doing any entitlement work.

---

### 4) Finding the user and building items
```rust
if (!args.customerId || !args.subscriptionId) {
  return null;
}

const user = await ctx.db
  .query("users")
  .withIndex("by_stripe_customer_id", (q) =>
    q.eq("stripeCustomerId", args.customerId),
  )
  .unique();
if (!user) {
  return null;
}

const items =
  args.items !== undefined
    ? args.items
    : [
        {
          tier: args.tier,
          priceId: args.priceId,
          productId: args.productId,
        },
      ];
```

Why this matters:
- Entitlements are user-specific. If there is no user, we cannot apply them.

What this code does:
- Exits early if required IDs are missing.
- Looks up the user by Stripe customer ID.
- Builds a default single-item list if no detailed `items` were provided.

---

### 5) Upserting entitlements per item
```rust
for (const item of items) {
  const existing = item.priceId
    ? await ctx.db
        .query("entitlements")
        .withIndex("by_stripe_subscription_id_and_price_id", (q) =>
          q
            .eq("stripeSubscriptionId", args.subscriptionId)
            .eq("stripePriceId", item.priceId),
        )
        .unique()
    : await ctx.db
        .query("entitlements")
        .withIndex("by_stripe_subscription_id", (q) =>
          q.eq("stripeSubscriptionId", args.subscriptionId),
        )
        .unique();

  const patch: {
    tier: string;
    status: string;
    source: string;
    startsAtMs: number;
    stripeSubscriptionId: string;
    stripePriceId?: string;
    stripeProductId?: string;
    endsAtMs?: number;
  } = {
    tier: item.tier ?? "default",
    status: args.status ?? "unknown",
    source: "stripe",
    startsAtMs: args.startsAtMs ?? Date.now(),
    stripeSubscriptionId: args.subscriptionId,
  };

  if (item.priceId) patch.stripePriceId = item.priceId;
  if (item.productId) patch.stripeProductId = item.productId;
  if (args.endsAtMs !== undefined) patch.endsAtMs = args.endsAtMs;

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    continue;
  }

  await ctx.db.insert("entitlements", {
    userId: user._id,
    ...patch,
  });
}
```

Why this matters:
- This is where Stripe billing data turns into in-app permissions.

Syntax notes:
- The code chooses between two indexes depending on whether `priceId` exists.
- The spread `...patch` copies fields into the insert payload.

What this code does:
- Finds or creates an entitlement row for each subscription item.
- Updates status, tier, and timestamps from Stripe.
- Ensures entitlements are attached to the correct user.

---

### 6) Canceling entitlements when items disappear
```rust
if (
  args.items &&
  (args.eventType === "customer.subscription.updated" ||
    args.eventType === "customer.subscription.deleted" ||
    args.eventType === "reconcile")
) {
  const activePriceIds =
    args.eventType === "customer.subscription.deleted"
      ? new Set<string>()
      : new Set(
          args.items
            .map((item) => item.priceId)
            .filter((priceId): priceId is string => Boolean(priceId)),
        );
  const existingEntitlements = await ctx.db
    .query("entitlements")
    .withIndex("by_stripe_subscription_id", (q) =>
      q.eq("stripeSubscriptionId", args.subscriptionId),
    )
    .collect();
  const now = Date.now();
  for (const entitlement of existingEntitlements) {
    const priceId = entitlement.stripePriceId;
    if (!priceId || !activePriceIds.has(priceId)) {
      await ctx.db.patch(entitlement._id, {
        status: "canceled",
        endsAtMs: now,
      });
    }
  }
}
```

Why this matters:
- Without this, canceled subscriptions could keep granting access.

Syntax notes:
- `collect()` loads all matching entitlements so they can be compared.
- `Set` is used for fast membership checks.

What this code does:
- Builds a set of active price IDs from the event.
- Marks any entitlements not in that set as canceled.

---

## Extended deep dive: event sourcing for billing truth

The `stripeStore.ts` module is effectively an event‑sourced ledger for billing state. It records every Stripe event once, then derives entitlements from those events. This design provides a clear audit trail and makes reconciliation possible.

---

### 4) Stripe events as an idempotent log

Stripe can send duplicate or out‑of‑order events. If you treat webhooks as “truth” without idempotency, you will double‑grant entitlements. To prevent this, the store keeps a `stripe_events` table keyed by `eventId`.

The logic is simple but powerful:

1) Query `stripe_events` for `eventId`.
2) If it exists, return early (idempotency).
3) If not, insert it and proceed with entitlement updates.

This pattern is common in webhook processing. It turns the event store into a **deduplication barrier**.

---

### 5) Why the event store is written first

Note that the event is inserted **before** entitlements are updated. This order is important. If entitlements update and then a crash occurs before the event is stored, a retry would re‑apply entitlements because the system wouldn’t know the event was already processed.

By inserting the event first, you guarantee that any retry will see the eventId and skip, even if the entitlement update partially succeeded. This is a classic “write‑ahead” pattern.

---

### 6) Reconcile state as a cursor ledger

The `stripe_reconcile_state` table stores a cursor for long‑running reconciliation jobs. This allows reconciliation to resume safely without scanning from the beginning every time.

The state is keyed by `name`, which allows multiple reconcile jobs to coexist. In practice, only the `default` job is used, but the design allows more if needed.

---

### 7) User lookup by Stripe customer ID

Entitlements are applied per user, not per customer. That means the store must map Stripe’s `customerId` to a Convex user record. It does this via the `by_stripe_customer_id` index on the users table.

If no user is found, the function returns early. This is safe: a Stripe customer without a linked user shouldn’t grant entitlements. It also avoids creating entitlements with no userId, which would be invalid.

---

### 8) Item normalization and defaults

The Stripe handler passes `items` when available. But some events may not include item details. The store handles this by building a default single‑item list using `tier`, `priceId`, and `productId` if provided.

This fallback ensures the store can still create entitlements even if the event payload is partial. However, it also means some cancellation logic may miss items (see below).

---

### 9) Entitlement upsert logic

For each item, the store tries to find an existing entitlement:

- If `priceId` is present, it queries by subscriptionId + priceId.
- Otherwise, it queries by subscriptionId alone.

This dual index strategy keeps entitlements unique per subscription + price. It also allows older events without priceId to still map to a single entitlement per subscription.

The patch includes:

- `tier` (defaulting to "default")
- `status` (from Stripe status, defaulting to "unknown")
- `source` (always "stripe")
- `startsAtMs`, `endsAtMs` timestamps
- `stripeSubscriptionId`, `stripePriceId`, `stripeProductId`

If an entitlement exists, it is patched; otherwise, a new one is inserted.

---

### 10) Cancellation logic when items disappear

Stripe updates may remove items from a subscription. The store handles this by comparing the active items in the event to existing entitlements. Any entitlement with a priceId not in the active set is marked `canceled` with an `endsAtMs` timestamp.

This logic runs only when:

- `args.items` exists, and
- eventType is updated, deleted, or reconcile.

That means cancellation is **only as accurate as item data**. If an event lacks items, cancellation might not happen. This is why reconciliation (which fetches full subscription data) is important.

---

### 11) Entitlements as derived state

The entitlements table is derived. It is *not* the source of truth; Stripe is. This is why the store tolerates missing data and leans on reconciliation. If entitlements ever look wrong, the fix is to replay events or run reconciliation.

This is a key design principle: treat entitlements as a cached projection of Stripe state, not as the truth itself.

---

### 12) Status semantics

Stripe subscription status values can include:

- active
- trialing
- canceled
- past_due
- unpaid

The store does not interpret these statuses beyond storing them. Downstream code (entitlements queries, auth sync) decides which statuses count as “active.” This separation keeps the store generic and lets business rules evolve without rewriting event processing.

---

### 13) Source tagging for entitlements

Every entitlement written here uses `source: "stripe"`. This is important because entitlements could be created by other systems in the future (e.g., manual grants, promotions). Source tags allow you to distinguish entitlement origin and apply different rules or audits.

---

### 14) Time fields and determinism

Entitlements store `startsAtMs` and `endsAtMs`. These are derived from Stripe timestamps, which are wall‑clock based. That is fine because entitlements are off‑chain business rules, not consensus state. Determinism across validators is not required here.

---

### 15) Why events are stored forever

The file does not delete events. That means the `stripe_events` table grows over time. This is a tradeoff:

- **Pros**: full audit history, easy debugging.
- **Cons**: storage growth, potentially slower queries if indexes are large.

In practice, you may want a retention policy (e.g., keep 1 year of events) and archive older ones. But for early-stage systems, storing forever is acceptable.

---

### 16) Failure cases and safe defaults

If required IDs are missing (`customerId`, `subscriptionId`), the function returns early. This is safe and avoids partial entitlements. However, it also means that malformed events are effectively ignored. This is fine because Stripe will retry and reconciliation can repair gaps.

---

### 17) Reconcile events are first‑class citizens

Reconcile events use `eventType: "reconcile"`. The store treats them like normal events: it applies entitlements and cancellation logic. This means reconciliation is not a separate path; it flows through the same code. This reduces the chance of divergence between webhook and reconcile logic.

---

### 18) Index dependencies

The store relies on several indexes:

- `stripe_events.by_event_id`
- `users.by_stripe_customer_id`
- `entitlements.by_stripe_subscription_id`
- `entitlements.by_stripe_subscription_id_and_price_id`

These indexes are essential for performance. If any are missing or misconfigured, event processing will become slow and could time out.

---

### 19) Idempotency across reconcilers

Because reconcile events use synthetic event IDs, you can run reconciliation multiple times without re‑applying entitlements. Each reconcile event will be deduped based on its synthetic ID. This is a critical property for batch jobs that may be restarted or retried.

---

### 20) Security boundary

`applyStripeEvent` is an internal mutation. It cannot be called by untrusted clients. This is important because it directly writes entitlements. If this were exposed, an attacker could grant themselves tiers by forging events. Internal-only access is the right boundary.

---

### 21) Feynman analogy: a ledger and a summary

Imagine a bank ledger of deposits. Each deposit is recorded once (event store). The account balance (entitlement) is the summary derived from those deposits. If a deposit is recorded twice, the balance is wrong. That is why the ledger dedupes every event before updating balances.

---

### 22) Exercises for mastery

1) Explain why the event store insert happens before entitlement updates.
2) Describe how missing items can lead to stale entitlements.
3) Propose a cleanup strategy for stripe_events that preserves auditability.
4) Explain why entitlements are derived rather than authoritative.

If you can answer these, you understand the Stripe event store deeply.


## Addendum: reconciliation semantics and data hygiene

### 23) Reconcile cursor semantics

The reconcile state stores a cursor, not a page number. Convex pagination cursors are opaque tokens, which makes them stable across inserts and deletes. This is important: if new users are added while reconciliation is running, the cursor still yields a consistent traversal without skipping or duplicating records.

This is a subtle but powerful property of cursor-based pagination. It is one reason reconciliation should use the provided cursor rather than storing an integer offset.

---

### 24) UpdatedAtMs as an operational signal

The reconcile state includes `updatedAtMs`. This field does not affect logic, but it is valuable for operations. You can track when the last reconciliation run updated the cursor and alert if it has been stale for too long. This is an easy health check for billing drift.

---

### 25) Entitlement row explosion risk

Entitlements are stored per subscription item. If you allow many items per subscription (e.g., add-ons), the entitlements table can grow quickly. This is usually acceptable, but you should be aware that each additional item creates an entitlement row.

If row count becomes a concern, you could aggregate items into a single entitlement or add pruning logic for canceled items.

---

### 26) Handling "deleted" subscriptions

When a subscription is deleted, the cancellation logic creates an empty active set and marks all entitlements for that subscription as canceled. This ensures users lose access promptly when subscriptions are canceled.

This is a key security property: entitlements should never remain active after cancellation.

---

### 27) Status transitions and edge cases

Stripe status transitions can be complex (trial → active → past_due → canceled). The store doesn’t encode business logic for these transitions. It simply stores the status. Business logic for entitlement activation should be handled in queries (see L38), where you can define “active” as any of {active, trialing}.

This separation allows you to adjust business rules without rewriting event processing.

---

### 28) Data cleanup strategies

If `stripe_events` grows large, you may want to archive older events. A safe approach:

- Keep a rolling window (e.g., 90 days) in the main table.
- Move older events to an archive table or external storage.
- Ensure reconcile and idempotency keys still work for recent events.

Because deduplication only needs recent events, a rolling window can be safe if you rarely receive duplicates older than your window.

---

### 29) Entitlement revocation when priceId is missing

If an entitlement row was created without a priceId (fallback case), the cancellation logic that uses priceId sets may not catch it. That means such entitlements could linger even when a subscription is updated.

This is another reason reconciliation should prefer events with full items. If you see entitlements without priceId, consider backfilling them or enforcing stricter item presence in webhook processing.

---

### 30) Concurrency and mutation isolation

Convex mutations are isolated and serializable. That means two `applyStripeEvent` calls for different events are executed as independent transactions. This is safe because each event is idempotent and only writes to entitlements for its subscription.

However, if you process multiple events for the same subscription concurrently, you could still get races where later events overwrite earlier ones in a non‑intuitive order. This is acceptable because Stripe events are time-ordered, but retries can reorder them. Reconciliation provides the final correction.

---

### 31) Testing strategy for the store

Good tests for this module include:

- inserting a new event and verifying entitlements created,
- re‑sending the same event and verifying no duplicate entitlements,
- sending an update with fewer items and verifying cancellations,
- sending a delete event and verifying all entitlements are canceled,
- running reconcile events and verifying they are idempotent.

These tests focus on invariants: no duplicates, correct cancellations, and idempotency.

---

### 32) Feynman exercise

Explain why the event store must be written before entitlements, and how cursor-based reconciliation avoids missing users. Then explain why reconciliation is essential even with webhooks. This builds a full mental model of billing data flow.


### 33) Final note

Entitlement drift is inevitable in real systems. The only question is whether your pipeline can detect and repair it quickly. This store is the foundation for that repair loop.


### 34) Tiny epilogue

Store every event once, derive entitlements carefully, and reconcile often. That triad keeps billing state trustworthy.


### 35) Final word

Idempotency is the quiet hero of webhook systems.


### 36) Tiny epilogue

Event dedupe equals entitlement sanity over time.


## Key takeaways
- Stripe events are stored idempotently before entitlements are updated.
- Entitlements are derived per subscription item and kept in sync on updates.
- Reconcile state enables safe, resumable backfills.

## Next lesson
L38 - Entitlements query: `feynman/lessons/L38-convex-entitlements.md`
