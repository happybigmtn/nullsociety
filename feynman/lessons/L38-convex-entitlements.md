# L38 - Entitlements query (from scratch)

Focus file: `website/convex/entitlements.ts`

Goal: explain how entitlements are queried securely for a user. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) What an entitlement is
An entitlement is a server-side record that says "this user has tier X". These are created from Stripe subscriptions and used to enable features and set freeroll limits.

### 2) Service token gating
Entitlements are sensitive. Only trusted services (like the auth service) should be able to read them. That is why a service token is required.

### 3) Indexes and ordering
The query uses an index on `userId` and returns records in descending order. This tends to surface the most recent entitlement first.

---

## Limits & management callouts (important)

1) **Limit is capped**
- The query accepts an optional `limit` and caps to 200.
- This avoids unbounded responses but is still not cursor-based pagination.

2) **Service token is the only access control**
- If the token is leaked, entitlements become readable.
- Rotate and protect service tokens carefully.

---

## Walkthrough with code excerpts

### 1) Entitlement schema
```rust
const entitlementDoc = v.object({
  _id: v.id("entitlements"),
  _creationTime: v.number(),
  userId: v.id("users"),
  tier: v.string(),
  status: v.string(),
  source: v.string(),
  startsAtMs: v.number(),
  endsAtMs: v.optional(v.number()),
  stripeSubscriptionId: v.optional(v.string()),
  stripePriceId: v.optional(v.string()),
  stripeProductId: v.optional(v.string()),
});
```

Why this matters:
- This schema defines the entitlement contract used by the rest of the system.

What this code does:
- Lists all fields an entitlement may contain.
- Marks Stripe-related fields as optional.

---

### 2) Query by user ID
```rust
export const getEntitlementsByUser = query({
  args: {
    serviceToken: v.string(),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  returns: v.array(entitlementDoc),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const rawLimit = Number(args.limit);
    const resolved = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 100;
    const limit = Math.min(resolved, 200);
    return await ctx.db
      .query("entitlements")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});
```

Why this matters:
- Entitlements are the input to freeroll limit sync and feature gating.

Syntax notes:
- `.order("desc")` returns results in descending order (newest first).
- `.collect()` returns the full list in memory.

What this code does:
- Requires a service token before any data access.
- Queries entitlements by user ID using an index.
- Applies a capped limit and returns the most recent entitlements.

---

## Extended deep dive: entitlements as the authorization substrate

The entitlements query seems small, but it sits at the center of feature gating and on‑chain policy updates. This section expands the meaning of each field and the design choices behind the query.

---

### 4) Entitlements as derived permissions

Entitlements are **derived** from Stripe events (see L37). They are not manually granted by users. That means entitlements should be treated as a projection of billing state rather than an authoritative record of user intent. If entitlements are wrong, you should reconcile from Stripe rather than letting users edit entitlements directly.

---

### 5) Field semantics: what each column means

The entitlement schema includes:

- `tier`: the entitlement level (e.g., free, member, premium).
- `status`: Stripe-derived status (active, trialing, canceled, etc.).
- `source`: where the entitlement came from (stripe, promo, admin).
- `startsAtMs`: when the entitlement became active.
- `endsAtMs`: when the entitlement ended (if canceled).
- `stripeSubscriptionId`, `stripePriceId`, `stripeProductId`: optional Stripe identifiers.

These fields allow downstream systems to:

- determine whether an entitlement is active,
- understand why it exists (source),
- and trace it back to Stripe objects for debugging.

---

### 6) Why we query by userId, not public key

The entitlements table is keyed by `userId`. This is an internal identity, not the on-chain public key. The reason is that entitlements are tied to billing and auth, which are anchored to user accounts, not wallets.

If you need to fetch entitlements by public key, you must first map public key → userId via the users table. This is by design; it prevents external services from treating public keys as the primary identity for billing.

---

### 7) Service token gating: the primary access control

The query requires a service token. This is the only access control here. There is no per-user session check because this query is intended for trusted backend services, not client code. The service token is therefore a root secret.

This is an important security boundary: if the service token is leaked, an attacker can read entitlements for any user. That is why it must be stored in a secret manager and never exposed to the frontend.

---

### 8) Limit enforcement and response size

The query accepts an optional `limit` argument and caps it at 200. This is a safety guard to prevent large responses. Because entitlements are ordered by creation time, returning the most recent 100–200 is sufficient for almost all use cases.

This is not full pagination. There is no cursor. If you need historical entitlements beyond 200, you would need to add pagination logic.

---

### 9) Why `.take(limit)` instead of `.collect()`

The query uses `.take(limit)` rather than `.collect()`. This is a performance optimization: `.collect()` loads *all* matching entitlements, while `.take(limit)` stops after the specified number. This protects the system if a user has accumulated a large history of entitlements.

It also aligns with the intended usage: entitlement checks usually care about the most recent active tier, not the entire history.

---

### 10) Sorting and ordering

Results are ordered descending (`.order("desc")`). This means the newest entitlements come first. That makes it easy for the caller to scan for the most recent active entitlement and ignore older, canceled ones.

Without ordering, the caller would have to sort manually, which would be inefficient and error‑prone.

---

### 11) Active entitlement determination

The query does not filter by status. It returns all entitlements (up to the limit), and the caller decides which ones are “active.” This is a deliberate separation of concerns. For example, the auth service uses a helper that treats `active` and `trialing` as valid.

Keeping filtering logic in the caller allows business rules to change without modifying the data layer.

---

### 12) Multiple entitlements per user

Because entitlements are created per Stripe subscription item, a single user can have multiple entitlements simultaneously. The query therefore returns an array, not a single record. The caller must resolve conflicts, for example by picking the highest tier or the most recent active entitlement.

This complexity is real, especially for users with add‑on subscriptions. That is why entitlements are returned as a list rather than a single row.

---

### 13) Use in freeroll sync

The auth server calls this query to determine a user’s entitlement tier. It then maps tiers to on‑chain daily limits. That means the entitlement query has **direct economic consequences**. If it returns the wrong data, on‑chain limits could be wrong.

This is why correctness here matters. Even though the file is small, it sits on a critical path.

---

### 14) Handling entitlements with missing Stripe IDs

Some entitlements may not include Stripe identifiers (e.g., manual grants or legacy events). The schema allows optional Stripe fields to support this. Callers should not assume that `stripeSubscriptionId` is always present.

This flexibility enables non‑Stripe entitlements in the future (e.g., promotional grants).

---

### 15) Privacy considerations

Entitlements reveal billing status. That is sensitive information. The service token gate is therefore essential. In addition, you should avoid logging entitlements in plaintext logs. If you need audit trails, store summary info (tier, status) rather than full Stripe IDs.

---

### 16) Operational recommendations

- Monitor query volume: high volume could indicate abuse or misconfiguration.
- Rotate service tokens periodically.
- Add pagination if you ever need full entitlement history.

These are practical steps to keep the entitlements system healthy at scale.

---

### 17) Feynman analogy: a membership ledger

Imagine a gym membership ledger. Each row is a membership entitlement: which tier, when it started, when it ended. The query is the receptionist looking up your membership history. They don’t decide whether you’re active—they simply hand over the records, and policy decides if you can enter.

That’s the difference between data and policy in this system.

---

### 18) Exercises for mastery

1) Explain why entitlements are keyed by userId rather than public key.
2) Describe how you would determine the “current tier” from the returned array.
3) Explain why the limit is capped at 200 and what could break if it were unlimited.
4) Propose a pagination scheme if the history grows beyond 200.

If you can answer these, you understand entitlements at a systems level.


## Addendum: policy resolution and real-world usage

### 19) How callers interpret entitlements

The entitlements query returns raw records. The caller must interpret them according to policy. A common policy looks like:

- Consider entitlements with status in {"active", "trialing"} as valid.
- If multiple valid entitlements exist, choose the highest tier.
- If no valid entitlement exists, fall back to free tier.

This policy is not encoded here because it changes over time. Keeping it in the caller makes it easier to update without touching the data layer.

---

### 20) Tier precedence rules

If you support multiple tiers (e.g., bronze/silver/gold), you need a precedence order. That order is application-specific and could live in an environment variable or a config map.

A common approach is:

1) Map tiers to numeric ranks.
2) Choose the entitlement with the highest rank among active entitlements.

This avoids ambiguity when users have multiple subscriptions or add-ons.

---

### 21) Handling overlapping entitlements

It is possible for a user to have overlapping entitlements (e.g., an active subscription and a promotional grant). The query does not de-duplicate them. The caller must decide how overlaps resolve.

If you treat any active entitlement as sufficient, overlaps are harmless. If you want to charge differently based on tier, overlaps can cause confusion. The policy layer must define the resolution clearly.

---

### 22) End‑time semantics

`endsAtMs` is optional. If it is missing, the entitlement is assumed to be ongoing. If it exists and is in the past, the entitlement is effectively expired.

Some systems treat “endsAtMs in the past” as canceled even if status says active. That is another policy decision. The entitlement store does not enforce it. It simply stores the raw fields.

---

### 23) Why limit defaults to 100

The query defaults to `limit = 100` if no limit is provided. This is a tradeoff:

- Large enough for typical entitlement history.
- Small enough to keep query response quick.

The hard cap of 200 prevents abuse. If you find users with more than 200 entitlements, you likely need a different design (e.g., archival or pagination).

---

### 24) What “source” enables

The `source` field enables multi‑origin entitlements. For example:

- Stripe entitlements: `source = "stripe"`
- Promotional entitlements: `source = "promo"`
- Manual admin grants: `source = "admin"`

By keeping the source, you can implement policies like “promo entitlements do not grant on-chain limits” or “admin grants override billing.” Without source, you would not be able to distinguish them.

---

### 25) Relation to on‑chain limits

Entitlements ultimately influence on‑chain limits (freeroll daily limits). That means entitlement queries are part of a control loop:

1) Stripe events → entitlements.
2) Entitlements → auth service sync.
3) Auth service → on‑chain admin transaction.

If any step is wrong, on‑chain limits will diverge from billing state. This is why reconciliation and careful entitlement interpretation matter.

---

### 26) Race conditions and eventual consistency

Entitlements are updated asynchronously. A user who just paid may not see their entitlement reflected immediately. There is a window between:

- Stripe event delivery,
- event store update,
- entitlement query.

This is normal. The system is eventually consistent. The UI should communicate this to users (“Your benefits may take a minute to appear.”) and provide manual refresh or sync options.

---

### 27) Potential caching strategies

If entitlements are queried frequently, you might cache them at the auth service layer for short durations. This can reduce load on Convex. However, caching introduces staleness. A safe approach is to cache for a short TTL (e.g., 30–60 seconds) and invalidate on known Stripe events.

---

### 28) Validation of tiers

The entitlements table stores arbitrary `tier` strings. The query does not validate them. Validation should happen either at the event processing stage (L37) or at the policy interpretation stage. Otherwise, unexpected tier values could slip through and cause undefined behavior.

A robust approach is to maintain a canonical list of tiers and map unknown tiers to a default (e.g., “free”).

---

### 29) Testing entitlement queries

Important tests include:

- Query returns latest entitlements in descending order.
- Limit cap is enforced (never returns >200).
- Service token is required.
- Query returns empty list for user with no entitlements.

These tests ensure the basic contract is stable.

---

### 30) Security auditing

Because entitlements are sensitive, you should audit access patterns. If the auth service calls this query unusually often, it may indicate a loop or bug. Logging or metrics at the service layer can help detect such anomalies.

---

### 31) Future evolution: pagination and filtering

If entitlement history grows, the query may need cursor-based pagination. You might also add optional filters like `status` or `source`. The current design keeps the query simple and pushes filtering to the caller.

This is often the right choice early on. If usage patterns change, you can evolve the API by adding optional arguments without breaking existing callers.

---

### 32) Feynman analogy: a stack of membership cards

Picture a desk with a stack of membership cards for a user. The query hands you the top N cards (newest first). It doesn’t tell you which card is “active” — you read the status and decide. That is exactly how entitlement queries work: raw data first, policy second.

---

### 33) Exercises for mastery

1) Define a tier precedence map and show how you’d select the highest active entitlement.
2) Explain how you’d implement pagination without breaking existing callers.
3) Describe how you’d handle a user with both promo and Stripe entitlements.
4) Explain how entitlement delays could affect on-chain limits and how you’d communicate that to users.

If you can answer these, you understand entitlements beyond just the query syntax.


## Addendum: data model edges and performance

### 34) Index behavior and query cost

The query uses the `by_user_id` index, which is essential for performance. Without the index, Convex would have to scan the entire entitlements table to find rows for a user. The index makes lookup O(log n) in the number of entitlements rather than O(n).

This is why every entitlement insert must include `userId`: it guarantees the index is populated and the query stays fast.

---

### 35) Ordering by creation time vs startsAtMs

The query orders by `_creationTime` (implicitly, via `.order("desc")`), not by `startsAtMs`. That means “newest” refers to when the entitlement record was created, not necessarily when the entitlement becomes active. In most cases these align, but there can be edge cases during reconciliation or backfills.

If you need strict ordering by `startsAtMs`, you would need a different index and query. The current design chooses simplicity and performance over strict temporal ordering.

---

### 36) When entitlements should be removed

Entitlements are rarely deleted; instead, they are marked canceled with `endsAtMs`. This preserves auditability. However, if you ever need to remove entitlements (for privacy or regulatory reasons), you must do it with care and ensure downstream systems can handle missing history.

---

### 37) Interactions with on‑chain limits during outages

If the auth service is down, entitlements may still update in Convex but on‑chain limits will not sync. When the auth service comes back, it should resync. This is why the system triggers sync on profile reads and has explicit sync endpoints. The entitlement query itself is reliable; the issue is the downstream sync.

---

### 38) Multi-tenant considerations

If you ever run multiple product lines or environments in the same Convex deployment, you may need a `tenantId` or `environment` field in entitlements. The current schema assumes a single tenant. Without tenant scoping, entitlements from one environment could leak into another if IDs collide.

---

### 39) Entitlements and GDPR/PII

Entitlements themselves are not directly PII, but they are linked to userId. If you need to delete user data, you may need to delete entitlements as well. This is another reason to keep entitlements tied to userId and to have clear deletion policies.

---

### 40) Final recap

This query looks tiny, but it forms the read surface for every premium feature. Guard it, monitor it, and keep its semantics stable.


### 41) Rate of change vs query frequency

Entitlements do not change often compared to game state. That means you can safely query them less frequently than other data (like balances). A good pattern is to refresh entitlements on login, on billing events, or on explicit user action, rather than on every UI tick.

### 42) Common bug: interpreting canceled entitlements as active

If a caller simply checks for the existence of an entitlement without filtering by status or endsAtMs, canceled entitlements may still grant access. Always check status (and optionally endsAtMs) before enabling features.

### 43) Short checklist

- Use service token only on the server.
- Apply status filtering in the caller.
- Don’t assume only one entitlement exists.
- Respect the limit cap or add pagination.


### 44) Tiny epilogue

Entitlements are simple records, but they gate real money and real limits. Treat their query surface as production-critical.


### 45) Final word

Keep entitlement reads minimal, correct, and secured by the service token.


### 46) Tiny epilogue

Authorization begins with accurate entitlement reads.


### 47) Epilogue

Period.


## Key takeaways
- Entitlements are protected by a service token.
- The query returns all entitlements without pagination.
- These records power downstream authorization decisions.

## Next lesson
L39 - Auth admin sync (wasm + /submit): `feynman/lessons/L39-auth-casino-admin.md`
