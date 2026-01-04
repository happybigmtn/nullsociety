# L36 - Stripe actions + sessions (from scratch)

Focus file: `website/convex/stripe.ts`

Goal: explain how Stripe events are verified, how checkout and billing portal sessions are created, and how reconciliation is performed. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Why this file uses Node
Stripe’s official SDK and webhook verification require Node APIs like `Buffer`. Convex actions can run in a Node environment, which is why this file starts with `"use node"`.

### 2) Stripe objects you need to know
- **Customer**: a Stripe account representing a user.
- **Subscription**: the billing relationship for a recurring plan.
- **Checkout session**: a hosted Stripe page to start a subscription.
- **Billing portal session**: a hosted Stripe page to manage subscriptions.

### 3) Entitlements
Subscriptions are converted into entitlements (tiers). Those entitlements are later used to adjust on-chain freeroll limits.

### 4) Reconciliation
Webhooks are reliable, but systems can still drift. Reconciliation re-reads Stripe’s current state and replays entitlements so Convex matches Stripe.

---

## Limits & management callouts (important)

1) **Subscription list limit is capped at 100**
- `resolveSubscriptionLimit` clamps to 100.
- This is safe for rate limits but may miss very large customer histories.

2) **Batch size capped at 200**
- `resolveBatchSize` caps to 200 customers per reconcile batch.
- Good for safety, but full backfills can take many runs.

3) **Stripe API version fixed**
- `apiVersion: "2023-10-16"` locks behavior.
- When Stripe deprecates fields, you must update and test.

---

## Walkthrough with code excerpts

### 1) Stripe client setup and subscription parsing
```rust
const stripeSecret = process.env.STRIPE_SECRET_KEY ?? "";
const stripe = new Stripe(stripeSecret, {
  apiVersion: "2023-10-16",
});

const extractSubscriptionDetails = (subscription: Stripe.Subscription) => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const subscriptionTier = Object.prototype.hasOwnProperty.call(
    subscription.metadata ?? {},
    "tier",
  )
    ? subscription.metadata?.tier
    : undefined;
  const items = subscription.items.data
    .map(
      (item): { priceId: string; productId?: string; tier?: string } | null => {
        const price = item?.price;
        if (!price) return null;
        const productId =
          typeof price.product === "string" ? price.product : price.product?.id;
        return {
          priceId: price.id,
          productId,
          tier: price.metadata?.tier ?? subscriptionTier,
        };
      },
    )
    .filter(
      (item): item is { priceId: string; productId?: string; tier?: string } =>
        Boolean(item?.priceId),
    );
  const startsAtMs = subscription.current_period_start * 1000;
  const endsAtMs = subscription.current_period_end
    ? subscription.current_period_end * 1000
    : undefined;
  return { customerId, items, startsAtMs, endsAtMs };
};
```

Why this matters:
- This function normalizes Stripe data into the format used by entitlements.

Syntax notes:
- `subscription.customer` can be a string or a full object; this handles both.
- The `filter` uses a type predicate to keep TypeScript happy.

What this code does:
- Creates the Stripe client using the secret key.
- Extracts customer ID, line items, and timestamps from a subscription.
- Pulls a tier from metadata if present.

---

### 2) Webhook verification + event forwarding
```rust
export const handleStripeWebhook = internalAction({
  args: {
    signature: v.string(),
    payload: v.bytes(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireStripeSecret();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    }

    const event = stripe.webhooks.constructEvent(
      Buffer.from(args.payload),
      args.signature,
      webhookSecret,
    );

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { customerId, items, startsAtMs, endsAtMs } =
          extractSubscriptionDetails(subscription);

        await ctx.runMutation(internal.stripeStore.applyStripeEvent, {
          eventId: event.id,
          eventType: event.type,
          customerId,
          subscriptionId: subscription.id,
          status: subscription.status,
          items,
          startsAtMs,
          endsAtMs,
        });
        return null;
      }
      default:
        await ctx.runMutation(internal.stripeStore.applyStripeEvent, {
          eventId: event.id,
          eventType: event.type,
        });
        return null;
    }
  },
});
```

Why this matters:
- Stripe verification is the security boundary that prevents forged events.

Syntax notes:
- `internalAction` means only internal Convex code can call this.
- `Buffer.from(args.payload)` converts bytes into the format Stripe expects.

What this code does:
- Requires Stripe secrets to be configured.
- Verifies the webhook signature.
- For subscription events, extracts details and writes them to `stripeStore`.
- For other events, records the event type only.

---

### 3) Creating a checkout session
```rust
export const createCheckoutSession: ReturnType<typeof action> = action({
  args: {
    serviceToken: v.string(),
    userId: v.id("users"),
    priceId: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
    tier: v.optional(v.string()),
    allowPromotionCodes: v.optional(v.boolean()),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    requireServiceToken(args.serviceToken);
    requireStripeSecret();
    const user = await ctx.runQuery(internal.users.getUserById, {
      userId: args.userId,
    });
    if (!user) {
      throw new Error("User not found");
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        metadata: {
          userId: user._id,
        },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.users.setStripeCustomerId, {
        userId: user._id,
        stripeCustomerId: customerId,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: args.priceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      allow_promotion_codes: args.allowPromotionCodes ?? false,
      subscription_data: args.tier
        ? {
            metadata: {
              tier: args.tier,
            },
          }
        : undefined,
    });

    if (!session.url) {
      throw new Error("Stripe checkout session missing URL");
    }

    return { url: session.url };
  },
});
```

Why this matters:
- This is the primary entrypoint for users to start paid subscriptions.

Syntax notes:
- `ReturnType<typeof action>` keeps the exported type aligned with Convex.
- `args.allowPromotionCodes ?? false` uses nullish coalescing to set a default.

What this code does:
- Requires a service token and Stripe secret.
- Ensures the user has a Stripe customer ID (creates one if missing).
- Creates a subscription checkout session and returns the hosted URL.

---

### 4) Creating a billing portal session
```rust
export const createBillingPortalSession = action({
  args: {
    serviceToken: v.string(),
    userId: v.id("users"),
    returnUrl: v.string(),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    requireStripeSecret();
    const user = await ctx.runQuery(internal.users.getUserById, {
      userId: args.userId,
    });
    if (!user?.stripeCustomerId) {
      throw new Error("Stripe customer not linked");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: args.returnUrl,
    });

    if (!session.url) {
      throw new Error("Stripe portal session missing URL");
    }

    return { url: session.url };
  },
});
```

Why this matters:
- Users need a secure way to manage or cancel subscriptions without handling payment data directly.

What this code does:
- Requires a linked Stripe customer.
- Creates a billing portal session in Stripe.
- Returns a hosted URL for the user to manage billing.

---

### 5) Reconciliation across all Stripe customers
```rust
export const reconcileStripeCustomers: ReturnType<typeof internalAction> = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processedCustomers: v.number(),
    processedSubscriptions: v.number(),
    nextCursor: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ processedCustomers: number; processedSubscriptions: number; nextCursor: string | null }> => {
    requireStripeSecret();
    const batchSize = resolveBatchSize(
      args.batchSize,
      parsePositiveNumber(process.env.STRIPE_RECONCILE_BATCH_SIZE, 100),
    );
    const subscriptionLimit = resolveSubscriptionLimit(
      parsePositiveNumber(process.env.STRIPE_RECONCILE_SUBSCRIPTION_LIMIT, 100),
    );
    const state = await ctx.runQuery(internal.stripeStore.getStripeReconcileState, {
      name: "default",
    });
    const page = await ctx.runQuery(internal.users.listUsersForStripeReconcile, {
      paginationOpts: {
        numItems: batchSize,
        cursor: state?.cursor ?? null,
      },
    });

    let processedCustomers = 0;
    let processedSubscriptions = 0;
    for (const user of page.users) {
      if (!user.stripeCustomerId) continue;
      processedCustomers += 1;
      processedSubscriptions += await reconcileStripeCustomerSubscriptions(
        ctx,
        user.stripeCustomerId,
        subscriptionLimit,
      );
    }

    const nextCursor = page.isDone ? null : page.continueCursor;
    await ctx.runMutation(internal.stripeStore.setStripeReconcileState, {
      name: "default",
      cursor: nextCursor ?? null,
    });

    return { processedCustomers, processedSubscriptions, nextCursor };
  },
});
```

Why this matters:
- Reconciliation keeps entitlements correct if webhook events are missed or out of order.

Syntax notes:
- `internalAction` means this is callable only from internal Convex code.
- The return type describes a resumable cursor-based scan.

What this code does:
- Reads a stored cursor to continue reconciliation in batches.
- For each user with a Stripe customer ID, lists subscriptions and applies events.
- Stores the next cursor so the next run can resume.

---

## Extended deep dive: Stripe actions as the billing control plane

The `stripe.ts` module is the billing control plane. It translates Stripe events into Convex state, creates hosted checkout flows, and periodically reconciles to fix drift. Because billing impacts entitlements and on‑chain limits, this code is security‑critical and must be deterministic and idempotent.

---

### 5) Why `"use node"` is mandatory

Convex actions can run in different runtimes. Stripe’s SDK relies on Node primitives like `Buffer` and some crypto APIs. Without `"use node"`, this file would run in a sandboxed environment that lacks those primitives, and webhook verification would fail. Declaring Node mode ensures the Stripe SDK behaves as expected.

---

### 6) Stripe client configuration as a contract

The Stripe client is constructed with a fixed API version: `2023-10-16`. This is important because Stripe occasionally changes response shapes. Locking the API version freezes the shape of Stripe objects, which makes your code stable. When Stripe deprecates fields, you must update the version and re‑test.

The code uses `STRIPE_SECRET_KEY`. If it is missing, the `requireStripeSecret()` helper throws, which prevents any Stripe actions from running without proper configuration.

---

### 7) Subscription normalization: turning Stripe into entitlements

`extractSubscriptionDetails` is the normalization layer. It converts Stripe’s complex subscription object into a simplified structure used by entitlements and store mutations:

- `customerId`: always a string (normalizes the union type)
- `items`: list of price/product/tier references
- `startsAtMs` and `endsAtMs`: milliseconds timestamps

The tier extraction logic is important: it checks subscription metadata first, then falls back to item metadata. This allows you to define tiers at either the subscription or price level.

This normalization is what makes the rest of the pipeline deterministic. Every Stripe event is reduced to the same canonical shape before it enters the event store.

---

### 8) Webhook verification: the security boundary

`handleStripeWebhook` is an internal action that receives raw payload bytes and the signature header. It uses:

```
stripe.webhooks.constructEvent(Buffer.from(payload), signature, webhookSecret)
```

This does three things:

1) Validates the signature against the webhook secret.
2) Parses the JSON into a typed Stripe event.
3) Throws if verification fails.

This is the strongest security boundary in the Stripe pipeline. If you disable or bypass it, anyone could forge billing events and grant themselves entitlements.

---

### 9) Event routing: subscription vs non‑subscription

The webhook handler checks event types:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Only those events are normalized with subscription details. All other events are still recorded, but only with `eventId` and `eventType`.

Why record non‑subscription events at all? Because it provides auditability and a complete history of Stripe interactions. Even if you don’t use them for entitlements, they can be useful for debugging or future features.

---

### 10) Idempotency via event IDs

Stripe events include a unique `event.id`. The internal store (see L37) uses that ID to ensure events are applied once. This is essential because Stripe can send duplicate events or out‑of‑order events. By using event IDs as an idempotency key, the system avoids double‑applying entitlements.

Reconciliation uses a synthetic eventId (`reconcile:${subscriptionId}:${status}:${period_end}`) to get the same idempotency behavior even outside webhooks.

---

### 11) Checkout sessions: the subscription entry point

`createCheckoutSession` is the user-facing entry point for subscription purchases. It does several things:

1) Requires a service token (only trusted services can start checkout).
2) Requires a Stripe secret.
3) Fetches the user record.
4) Creates a Stripe customer if missing.
5) Creates a checkout session and returns its URL.

The important detail is customer creation. This is where the system links a Stripe customer ID to the user record. That link is later used for portal sessions and reconciliation.

The checkout session is created with `mode: "subscription"`, so Stripe will create or modify subscriptions automatically when the user completes checkout.

---

### 12) Customer metadata and linking

When creating a Stripe customer, the code includes `metadata: { userId }`. This is not required for billing, but it is extremely useful for debugging and audits. It lets you cross‑reference a Stripe customer back to your internal user ID.

This is one of those small details that saves hours in production debugging.

---

### 13) Promotion codes and tier metadata

`allow_promotion_codes` is optional and defaults to false. This allows you to enable discount codes without additional UI changes.

Tier metadata is added to the subscription (`subscription_data.metadata.tier`) if provided. This is how a checkout session can tag the subscription with the correct tier, which later drives entitlements. If you omit the tier, entitlement resolution must fall back to price metadata.

---

### 14) Billing portal sessions

`createBillingPortalSession` provides a Stripe-hosted management UI. The method requires:

- a service token,
- a user record,
- a linked Stripe customer ID.

This keeps billing management inside Stripe, which is safer than building custom subscription management. It also reduces PCI risk because your system never handles card data directly.

---

### 15) ReconcileCustomerSubscriptions: targeted repair

The module defines a `reconcileCustomerSubscriptions` action (not shown in the earlier excerpt) which takes a userId and an optional limit. This lets you reconcile a single user’s subscriptions, for example if their entitlements look wrong.

It lists subscriptions for that customer and emits synthetic reconcile events into the store. This is a targeted fix and is safer than reconciling all customers.

---

### 16) Full reconciliation: batch scan

`reconcileStripeCustomers` is the bulk repair job. It:

- reads a stored cursor from the reconcile state,
- paginates users from Convex,
- for each user with a Stripe customer ID, lists subscriptions,
- emits reconcile events,
- updates the cursor so the next run resumes.

This is a classic batch processing pattern. It allows reconciliation to run incrementally without re-scanning all users every time.

---

### 17) Why limits are capped

The code caps:

- subscription list limit to 100
- batch size to 200

These caps protect against accidental overload. Stripe API calls are rate-limited, and Convex actions have runtime limits. Capping prevents someone from passing `batchSize = 10_000` and overwhelming the system.

If you need to reconcile more quickly, you should run the job more often rather than increasing the cap too far.

---

### 18) Error handling philosophy

Stripe actions throw errors when required data is missing. This is correct because billing flows should fail loudly if configuration is missing. For example:

- Missing Stripe secret → error
- Missing webhook secret → error
- Missing user or customer ID → error

This is a deliberate contrast with the auth server’s best‑effort philosophy. Billing flows are financially sensitive, so correctness and explicit failure matter more.

---

### 19) Entitlements and on‑chain sync coupling

The Stripe actions do not directly update on‑chain limits. Instead, they update the internal store, which later drives entitlement sync in the auth service. This decoupling is important:

- Stripe actions remain focused on Stripe.
- On-chain changes are handled by auth/admin services with their own nonce and security rules.

This separation makes the system more maintainable and safer.

---

### 20) Security boundaries recap

The module enforces multiple boundaries:

- `internalAction` for webhooks (not callable externally).
- `requireServiceToken` for checkout/portal actions.
- `requireStripeSecret` for any Stripe call.

These boundaries ensure that only trusted services can perform billing operations, and only when properly configured.

---

### 21) Feynman analogy: a payment receptionist

Imagine a receptionist at a gym:

- They verify the authenticity of payment notices (webhook signature).
- They create membership sign‑up links (checkout sessions).
- They give members a portal to manage their plan (billing portal).
- They periodically reconcile records with the payment processor (reconcile).

This receptionist doesn’t set entitlements directly—it updates the membership ledger, and other systems read from it. That is exactly how this file works.

---

### 22) Exercises for mastery

1) Trace a subscription upgrade event from Stripe webhook to entitlement store.
2) Explain why reconcile events use synthetic IDs instead of Stripe event IDs.
3) Describe how a missing Stripe customer ID affects checkout vs portal flows.
4) Propose a safe way to increase reconcile throughput without hitting API limits.

If you can answer these, you understand Stripe actions deeply.


## Addendum: reliability, retries, and operational guardrails

### 23) Stripe API errors and retries

Stripe API calls can fail for many reasons: network hiccups, rate limits, or invalid parameters. The current code does not implement explicit retries. That is acceptable for synchronous user actions (checkout/portal) because the user can retry, but for reconciliation you may want retries with exponential backoff.

A safe pattern is to retry idempotent operations (like listing subscriptions) but avoid retrying non‑idempotent operations (like creating a customer) without careful guards.

---

### 24) Customer creation races

If two checkout sessions are created concurrently for the same user and they both see `stripeCustomerId` as missing, they could create two Stripe customers and then race to set the ID. In practice, this is rare, but it can happen if the user clicks twice or if two servers handle the request simultaneously.

A mitigation is to use a unique constraint or a mutex at the user record level. Alternatively, you could detect multiple customers via metadata and reconcile them manually. The current design accepts this as a low‑probability edge case.

---

### 25) Synthetic reconcile event IDs

Reconciliation events use an ID of the form `reconcile:<subscriptionId>:<status>:<period_end>`. This is a deterministic idempotency key. If you run reconciliation multiple times, the same subscription state generates the same eventId, so the store can deduplicate it.

This is a clever design: it gives idempotency without needing Stripe’s event system. It also means reconciliation will not create infinite duplicate entitlement events.

---

### 26) Billing portal security

Billing portal sessions are powerful: a user can cancel or change subscription. The server requires a service token and a linked Stripe customer. This means only trusted backend services (not browsers directly) can create portal URLs. That reduces exposure to abuse.

However, you still need to ensure that the service token is not leaked to clients. If it is leaked, anyone could create portal sessions for any user.

---

### 27) Webhook ordering assumptions

Stripe webhooks can arrive out of order. The event store should therefore not assume strict ordering. By storing raw events and applying them with idempotent logic, the system can survive reordering. This is another reason reconciliation exists: it replays the current truth from Stripe even if event order was wrong.

---

### 28) Operational playbook

If billing issues occur:

1) Check webhook logs for signature failures.
2) Check `stripeStore` for missing events.
3) Run `reconcileCustomerSubscriptions` for the affected user.
4) If many users are affected, run `reconcileStripeCustomers` in batches.

This sequence minimizes Stripe API usage while restoring correctness.

---

### 29) Tiny epilogue

Billing code is never “done.” Always budget time for monitoring and reconciliation, because real-world Stripe flows are messy.


## Key takeaways
- Stripe webhooks are verified and translated into entitlement events.
- Checkout and billing portal sessions are created through safe service-token actions.
- Reconciliation replays Stripe state in batches to repair drift.

## Next lesson
L37 - Stripe event store + entitlements: `feynman/lessons/L37-convex-stripe-store.md`
