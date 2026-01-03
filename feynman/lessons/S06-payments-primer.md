# S06 - Payments + webhook idempotency (from scratch, with code walkthroughs)

Focus files: `services/auth/src/server.ts`, `website/convex/stripe.ts`, `website/convex/stripeStore.ts`, `website/convex/entitlements.ts`, `website/src/services/authClient.ts`, and the Convex schema.

Goal: explain how payments flow through the system, how Stripe events are verified and stored, why idempotency is mandatory, and how entitlements become product access. This is a production-grade payments walkthrough tied to the exact code we run.

---

## Learning map

If you want the shortest path to practical understanding:

1) Read Sections 1 to 4 for the overall architecture and data model.
2) Read Sections 5 to 9 for the concrete flows: checkout, portal, webhook, entitlements.
3) Read Sections 10 to 14 for idempotency, reconciliation, and failure modes.

If you only read one section, read Section 8 (Stripe webhook processing and idempotency).

---

## 1) What payments do in this system

Payments are not just about charging a card. They are about **entitlements**. An entitlement is the internal record of what a user is allowed to do: tiers, limits, perks, etc.

In this repo, the payment stack does three jobs:

1) Create and manage Stripe subscriptions.
2) Turn Stripe subscription state into entitlements in Convex.
3) Use entitlements to update gameplay limits (freeroll limits, for example).

If this pipeline breaks, users can pay but not get access, or get access without paying. That is why we are careful about verification, idempotency, and reconciliation.

---

## 2) The architecture: who talks to who

Think of the payment pipeline as three layers:

- Auth service (`services/auth`): the API surface for the web app. It creates checkout sessions, portal sessions, and handles reconcile requests. It does not talk to Stripe directly; it delegates to Convex actions.
- Convex Stripe actions (`website/convex/stripe.ts`): the only place that actually calls Stripe's API or verifies Stripe webhooks.
- Convex storage (`website/convex/stripeStore.ts` + `entitlements` table): where Stripe events and entitlements are stored.

The flow is intentionally split:

- The auth service lives outside Convex, runs on its own infra, and enforces origin + session checks.
- The Stripe secrets live in the Convex environment and are used inside `stripe.ts`.

This separation keeps Stripe secrets out of the public web surface and keeps the Stripe integration inside a controlled backend.

---

## 3) Data model: what we store

There are three key tables in Convex:

1) `users` table: includes `stripeCustomerId` for each user.
2) `stripe_events` table: the idempotency ledger (stores event IDs we've processed).
3) `entitlements` table: the effective product access records for users.

There is also a `stripe_reconcile_state` table used for reconciliation cursors, which we will cover later.

### 3.1 Entitlement record structure

From `website/convex/entitlements.ts` and `schema.ts`, each entitlement includes:

- `userId` (who owns it)
- `tier` (the logical tier, e.g., "member")
- `status` (active, trialing, canceled, etc.)
- `source` ("stripe")
- `startsAtMs` and `endsAtMs` (time window)
- Stripe metadata: `stripeSubscriptionId`, `stripePriceId`, `stripeProductId`

The entitlement is the final output of the payments system. Everything upstream exists to keep entitlements accurate.

---

## 4) Stripe configuration and allowlists

Two critical configuration points appear in `services/auth/src/server.ts`:

1) `STRIPE_PRICE_TIERS`: a comma-separated mapping like `tierA:price_123,tierB:price_456`.
2) `resolveStripeTier`: ensures the price ID the client asks for is allowed and matches the tier.

This is a security measure. The client can request a checkout session, but the server refuses any price ID that is not in the allowlist. That prevents someone from tampering with the client to use a cheaper or unauthorized price.

Also note:

- The auth server does not call Stripe directly; it calls a Convex action.
- Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are required in Convex.

---

## 5) Checkout flow: create a subscription

This is the user-initiated flow. It starts in the web UI and ends with a Stripe checkout session.

### Step 1: UI calls `/billing/checkout`

In `website/src/services/authClient.ts`, `createCheckoutSession` sends:

- `priceId`
- `successUrl`
- `cancelUrl`
- optional `tier`
- optional `allowPromotionCodes`

The request includes cookies (`credentials: "include"`), so the auth server knows which user is logged in.

### Step 2: auth server validates

In `services/auth/src/server.ts`:

- Verifies the session (`requireSession`).
- Validates `priceId` and `tier` using `resolveStripeTier`.
- Validates success/cancel URLs using `ensureAllowedRedirect` (must match allowed origins).
- Calls Convex action `stripe.createCheckoutSession`.

### Step 3: Convex creates Stripe session

In `website/convex/stripe.ts`:

- Ensures Stripe secret exists.
- Loads the user by ID and ensures they have a Stripe customer ID.
- Creates Stripe customer if missing, then stores `stripeCustomerId` in Convex.
- Calls `stripe.checkout.sessions.create` with `mode: "subscription"`.
- Returns the session URL.

### Step 4: UI redirects

The UI receives `{ url }` and redirects the browser to Stripe checkout.

Once the user completes checkout, Stripe sends a webhook event. That is where entitlements are created.

---

## 6) Billing portal flow: manage subscriptions

The billing portal flow is similar but simpler:

1) UI calls `/billing/portal`.
2) Auth server validates session and allowed return URL.
3) Convex action `createBillingPortalSession` calls Stripe to create a portal session.
4) UI redirects to the portal URL.

This allows users to manage subscriptions (cancel, update payment methods) without exposing Stripe secrets to the client.

---

## 7) Webhooks: how Stripe updates arrive

Stripe sends webhooks to your backend. In this repo, webhook verification and processing happen inside Convex (`website/convex/stripe.ts`), not in the auth server.

Key function: `handleStripeWebhook`.

Important details:

- It requires `STRIPE_WEBHOOK_SECRET`.
- It uses `stripe.webhooks.constructEvent` to verify the signature. This is crucial. Without it, anyone could spoof subscription events.
- It handles only a small set of events explicitly:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- All events are passed into `stripeStore.applyStripeEvent` (even unrecognized ones). This ensures the event ledger stays complete.

This is the point where idempotency matters. Stripe can retry events. We must not reapply the same event twice.

---

## 8) Idempotency: the `stripe_events` ledger

Idempotency is implemented in `website/convex/stripeStore.ts` in the `applyStripeEvent` mutation.

Flow:

1) Check if `eventId` exists in `stripe_events`.
2) If it exists, return without doing anything.
3) If it does not exist, insert it and then process the event.

This is the canonical pattern for webhook idempotency. It ensures:

- A retried webhook does not create duplicate entitlements.
- A reconcile run does not double-apply subscription state.

This ledger is small but critical. If you remove it, you will eventually double-grant or double-revoke entitlements.

---

## 9) Entitlement creation and updates

Once a Stripe event is accepted, `applyStripeEvent` translates it into entitlements.

### 9.1 How subscription items become entitlements

Stripe subscriptions can have multiple items. The code extracts:

- `priceId`
- `productId`
- `tier` (from metadata)

For each item, the code either:

- Updates an existing entitlement with matching `subscriptionId` and `priceId`, or
- Inserts a new entitlement.

The entitlement record includes:

- `tier` (from metadata or default)
- `status` (Stripe subscription status)
- `startsAtMs` and `endsAtMs` from the subscription period

This design means a user can have multiple entitlements if the subscription has multiple prices. It also supports multiple tiers in one subscription if you choose to model it that way.

### 9.3 Status mapping and why it matters

Stripe subscriptions have statuses such as `active`, `trialing`, `past_due`, `canceled`, and others. The code does not translate them; it stores the raw Stripe status into the entitlement `status` field.

This is deliberate:

- It preserves the exact Stripe truth.
- It allows downstream logic to decide which statuses count as active.

For example, `services/auth/src/casinoAdmin.ts` uses `ACTIVE_STATUSES = new Set(["active", "trialing"])`. That means a `past_due` subscription does not grant member limits. If you later decide `past_due` should still allow access during a grace period, you can adjust that set without touching the Stripe ingestion logic.

### 9.4 Tier metadata and the Stripe allowlist

There are two related concepts:

- `STRIPE_PRICE_TIERS` (auth server) is an allowlist of price IDs mapped to tiers. It prevents clients from requesting arbitrary prices.
- `tier` metadata in Stripe subscriptions and price objects is used by `extractSubscriptionDetails` to label entitlements.

The system expects that Stripe prices are labeled correctly (metadata `tier`), or that the subscription carries a `tier` in metadata. If both are missing, the entitlement tier defaults to `default`. This is safe but can lead to missing perks if your tiers are misconfigured. The payments system is only as good as its Stripe metadata.

### 9.5 Entitlement uniqueness rules

In `applyStripeEvent`, entitlements are matched by:

- `stripeSubscriptionId` and `stripePriceId` if price ID is present, or
- `stripeSubscriptionId` only if price ID is missing.

This subtle distinction prevents creating duplicate entitlements when Stripe reports multiple items or when price IDs are present. It also means that if you change your Stripe products, you should keep price IDs consistent to avoid accidental duplication.

### 9.2 Handling updates and deletions

When the event is `subscription.updated` or `subscription.deleted`, the code also reconciles entitlements:

- It computes the set of active price IDs in the subscription.
- It marks any entitlement not in that set as `canceled` with `endsAtMs = now`.

This prevents stale entitlements from lingering after a user removes a price from their subscription.

---

## 10) Reconciliation: when webhooks are not enough

Webhooks can be missed (network outages, misconfiguration, Stripe downtime). That is why we also have reconciliation.

There are two reconciliation paths:

1) **Per-user reconcile**: `reconcileCustomerSubscriptions` action, called via `/billing/reconcile` endpoint.
2) **Global reconcile**: `reconcileStripeCustomers` internal action that walks all users.

### 10.1 Per-user reconcile

`/billing/reconcile` in the auth server calls `stripe.reconcileCustomerSubscriptions` in Convex.

That action:

- Lists all Stripe subscriptions for the customer (status: all).
- For each subscription, constructs a synthetic event ID like `reconcile:<subscription_id>:<status>:<period_end>`.
- Passes that event into `applyStripeEvent`.

Notice the synthetic event ID. It is intentionally unique to the subscription state. That means each reconcile run is idempotent too. If you reconcile twice with the same subscription state, it does not duplicate entitlements.

### 10.2 Global reconcile

`reconcileStripeCustomers` processes batches of users by scanning the user list and using a cursor stored in `stripe_reconcile_state`.

This is how you periodically ensure Stripe and Convex entitlements stay consistent even if webhooks fail.

### 10.3 Reconcile cursor and batch size

The global reconcile path uses `stripe_reconcile_state` to store a cursor. This ensures that large user lists can be processed in batches without starting from the beginning every time.

Two environment-driven limits protect this process:

- `STRIPE_RECONCILE_BATCH_SIZE`: how many users per batch.
- `STRIPE_RECONCILE_SUBSCRIPTION_LIMIT`: how many subscriptions per customer to request from Stripe.

Both are capped in code to avoid runaway API usage. This is important because Stripe API calls are rate-limited and billable.

Reconciliation is therefore a controlled, incremental process rather than a full table scan every time. That is the correct approach for production systems with real user counts.

---

## 11) Entitlements -> product access

Entitlements are not just displayed; they are used to enforce limits. In `services/auth/src/casinoAdmin.ts`, the function `syncFreerollLimit`:

- Checks if the user has active entitlements in certain tiers.
- Determines a desired daily limit (free vs member).
- Submits an on-chain transaction to update the player's tournament limit.

This is a key link: **payment state flows into on-chain state**. That is why entitlement correctness is critical. If you incorrectly set entitlements, you will incorrectly set on-chain limits.

From a system design perspective, this is a form of asynchronous consistency: entitlements are computed from Stripe events, then an admin transaction enforces the result on-chain.

### 11.1 The admin signer pipeline (why it is safe but complex)

`syncFreerollLimit` does not directly edit on-chain state. Instead, it constructs an admin transaction using the WASM layer:

- It loads the WASM module from `website/wasm/pkg` inside the auth service.
- It creates a `Signer` from the admin private key.
- It computes the player's casino key and fetches the player state from the chain.
- It reserves a nonce (via Convex or local cache) and signs a transaction.
- It submits the transaction to the chain's `/submit` endpoint.

This is an example of bridging Web2 entitlements into Web3 state. The complexity exists because blockchain state changes must be signed and serialized correctly. The system uses the same WASM code for encoding to avoid mismatches.

Because this path depends on external systems (Convex for nonce reservation, the chain API for submission), it can fail independently of payments. The auth server logs these failures and resets its nonce store so it can recover.

---

## 12) Security: signature verification and allowed origins

There are multiple security gates:

1) Stripe webhooks are verified using `stripe.webhooks.constructEvent` with the webhook secret.
2) Checkout and portal endpoints validate origins and redirect URLs against `allowedOrigins`.
3) Price IDs are allowlisted via `STRIPE_PRICE_TIERS`.

These controls prevent:

- Forged webhook events.
- Open redirect abuses in success/cancel URLs.
- Clients requesting arbitrary price IDs.

The payments system is an attacker target. These checks are not optional.

### 12.5 Secret handling and environment hygiene

Stripe keys and webhook secrets are never embedded in client code. They live in server environments (Convex and auth service). This is non-negotiable: leaking Stripe secrets would allow an attacker to create charges or forge events.

The code enforces this by failing fast if secrets are missing:

- `requireStripeSecret()` throws in Convex if `STRIPE_SECRET_KEY` is missing.
- `handleStripeWebhook` throws if `STRIPE_WEBHOOK_SECRET` is missing.

In production, a missing secret should crash the service or fail the deploy. That is preferable to silently running without verification.

---

## 13) Idempotency failure modes

If idempotency breaks, you'll see symptoms like:

- Duplicate entitlements for the same subscription.
- Entitlements flickering between active and canceled.
- Users getting double benefits.

Causes:

- `stripe_events` table is missing or not indexed by eventId.
- Event IDs are not stable or unique (for example, using a timestamp instead of Stripe's event ID).
- Reconcile events not using a unique ID per subscription state.

The current implementation uses Stripe's own `event.id` for webhooks and a deterministic synthetic ID for reconciles, which is correct.

---

## 14) Consistency and timing guarantees

Payments are eventually consistent, not strongly consistent. That means:

- A user can finish checkout and return to the app before their entitlements are visible.
- The UI might need to refresh or poll to reflect updated entitlements.
- Reconciliation can lag behind if it runs in the background.

This is why the auth server returns entitlements from Convex but does not guarantee they reflect Stripe's immediate state. The system relies on webhooks (fast) and reconciliation (slow but robust).

If you want stronger immediacy, you could trigger a reconcile after checkout success, but that increases cost and complexity.

### 14.1 Event ordering and duplicate delivery

Stripe does not guarantee that events arrive in strict order. You might receive `subscription.updated` before `subscription.created` if there is network jitter. Because entitlements are upserted and keyed by subscription ID, the system tolerates this. The latest event wins. This is another reason the `stripe_events` ledger exists: it prevents double-application without assuming order.

### 14.2 Why we store `startsAtMs` and `endsAtMs`

Even if a subscription is canceled, the user might still be in a paid period until the end of the billing cycle. `endsAtMs` allows the UI or backend to reason about \"paid until\" dates. The current entitlement logic stores these values but does not enforce them in auth. That means you can implement \"grace period\" logic later without changing how events are ingested.

---

## 15) Metrics and audit logs for payments

The auth server logs billing actions and emits metrics:

- Counters like `billing.checkout.success`.
- Timings like `billing.checkout_ms`.
- Audit logs `audit.billing.checkout` and `audit.billing.portal`.
- Ops analytics events like `billing.checkout.success`.

These are operational guardrails. If billing starts failing, you can detect it quickly.

In production, payment flows should have alerts for:

- Checkout error rate spikes.
- Webhook failures or missing events.
- Reconcile backlog growth.

---

## 16) Common pitfalls and debugging tips

### 16.1 Missing Stripe secrets

If `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` are missing, Convex actions will throw. The auth server will return 502 on billing endpoints.

### 16.2 Wrong price IDs

If a price ID is not in `STRIPE_PRICE_TIERS`, the auth server rejects the request as "priceId not allowed". This is intentional.

### 16.3 Redirect origin mismatch

If `successUrl` or `cancelUrl` is not in `allowedOrigins`, `ensureAllowedRedirect` throws. This prevents open redirects but can bite you in staging if origins are not configured.

### 16.4 Entitlement not updated

If a user paid but has no entitlements, check:

- Was the webhook received?
- Did `stripe_events` record the event ID?
- Did `applyStripeEvent` find the user by `stripeCustomerId`?

If the user was never linked to a Stripe customer, the webhook cannot resolve them. In that case, a reconcile run after the user is linked can restore entitlements.

---

## 17) Conceptual summary: why idempotency is the heart of payments

Payments are adversarial and unreliable. Networks drop. Providers retry. Users refresh.

The only way to make a payment system reliable is to make each event safe to apply multiple times. That is idempotency. The `stripe_events` table is the simplest, most powerful way to achieve it.

If you take away one idea from this chapter, take this: **never apply a webhook twice**. Always record the event ID first. Everything else in the payments stack can be changed, but this rule must remain.

---

## 18) Feynman recap: explain it like I am five

- Stripe tells us when people pay.
- We save each message so we never use it twice.
- We turn payments into "entitlements" that unlock features.
- If a message is lost, we can ask Stripe again (reconcile).
- Security checks make sure only real Stripe events are accepted.

---

## 19) Exercises (to build mastery)

1) Trace a checkout request from `authClient.ts` to `services/auth/src/server.ts` to `website/convex/stripe.ts`. Identify where the user ID and price ID are validated.

2) Find the `stripe_events` table in Convex and explain how it enforces idempotency. What happens if the same Stripe event arrives twice?

3) Simulate a reconcile by calling `/billing/reconcile` in a dev environment and inspect the resulting `stripe_events` entries.

4) Find the code that cancels entitlements when a subscription is deleted. Explain why it uses price IDs instead of only subscription IDs.

---

## Next primer

S07 - Observability + production readiness: `feynman/lessons/S07-ops-primer.md`
