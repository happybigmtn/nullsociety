# L34 - Convex user linking (from scratch)

Focus file: `website/convex/users.ts`

Goal: explain how user records are created, linked to auth identities, and connected to public keys and Stripe customers. For every excerpt, you will see **why it matters** and a **plain description of what the code does**. We only explain syntax when it is genuinely tricky.

---

## Concepts from scratch (expanded)

### 1) What a user record represents
A user record is the bridge between external identity providers (auth) and internal game state. It stores:
- the auth provider + subject (identity),
- optional profile data (name/email),
- optional on-chain public key,
- optional Stripe customer ID.

### 2) Internal vs public Convex functions
- **internalQuery / internalMutation**: only callable from server-side Convex code.
- **query / mutation**: callable by clients or external services, usually gated by a service token.

### 3) Indexes are for fast lookups
This file depends on indexes like `by_auth_provider_and_subject` and `by_public_key`. Without them, lookups would be slow and expensive.

### 4) Upsert logic
An upsert either updates an existing user or inserts a new one. This avoids duplicates when the same user logs in again.

---

## Limits & management callouts (important)

1) **Public key uniqueness is enforced**
- `linkPublicKey` throws if a public key is already linked to another user.
- This is good for safety but makes key migration hard without an admin tool.

2) **Fields can only be updated, not cleared**
- `upsertUser` only patches fields that are provided.
- There is no way to erase a field (like `email`) through this API.

3) **Stripe reconcile pagination depends on caller input**
- `listUsersForStripeReconcile` accepts pagination options; the caller controls batch size.
- Very large batches could increase latency or cost.

---

## Walkthrough with code excerpts

### 1) User document schema
```rust
const userDoc = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  authProvider: v.string(),
  authSubject: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  publicKey: v.optional(v.string()),
  stripeCustomerId: v.optional(v.string()),
});
```

Why this matters:
- This is the contract for what a user record looks like everywhere else in the system.

Syntax notes:
- `v.object({...})` declares a schema used for validation and typed returns.
- `v.optional(...)` marks a field as nullable/absent.

What this code does:
- Defines the required and optional fields for user documents.
- Ensures any returned user matches this schema.

---

### 2) Looking up a user by auth identity
```rust
export const getUserByAuth = internalQuery({
  args: {
    authProvider: v.string(),
    authSubject: v.string(),
  },
  returns: v.union(v.null(), userDoc),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_provider_and_subject", (q) =>
        q.eq("authProvider", args.authProvider).eq("authSubject", args.authSubject),
      )
      .unique();
    return user ?? null;
  },
});
```

Why this matters:
- This is how the system links an auth session to a specific user record.

Syntax notes:
- `internalQuery` means this can only be called from server-side Convex code.
- `v.union(v.null(), userDoc)` means the return can be either a user or null.

What this code does:
- Queries by the compound index of auth provider and subject.
- Returns the matching user or null if none exists.

---

### 3) Service-token gated lookups
```rust
export const getUserByPublicKey = query({
  args: {
    serviceToken: v.string(),
    publicKey: v.string(),
  },
  returns: v.union(v.null(), userDoc),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const user = await ctx.db
      .query("users")
      .withIndex("by_public_key", (q) => q.eq("publicKey", args.publicKey))
      .unique();
    return user ?? null;
  },
});
```

Why this matters:
- External services (like the auth service) need to query users securely.

What this code does:
- Requires a service token before any lookup.
- Fetches a user by their linked public key, or returns null.

---

### 4) Upsert user by auth identity
```rust
export const upsertUser = mutation({
  args: {
    serviceToken: v.string(),
    authProvider: v.string(),
    authSubject: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    publicKey: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_provider_and_subject", (q) =>
        q.eq("authProvider", args.authProvider).eq("authSubject", args.authSubject),
      )
      .unique();

    if (existing) {
      const patch: {
        email?: string;
        name?: string;
        publicKey?: string;
      } = {};
      if (args.email !== undefined) patch.email = args.email;
      if (args.name !== undefined) patch.name = args.name;
      if (args.publicKey !== undefined) patch.publicKey = args.publicKey;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(existing._id, patch);
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      authProvider: args.authProvider,
      authSubject: args.authSubject,
      email: args.email,
      name: args.name,
      publicKey: args.publicKey,
    });
  },
});
```

Why this matters:
- Upserts prevent duplicate users while still allowing profile updates.

Syntax notes:
- `v.id("users")` indicates the return value is a users-table document ID.
- The `patch` object is built conditionally so undefined values do not overwrite existing fields.

What this code does:
- Looks for an existing user by auth identity.
- If found, patches only the provided fields.
- If not found, inserts a new user record.

---

### 5) Linking a public key
```rust
export const linkPublicKey = mutation({
  args: {
    serviceToken: v.string(),
    userId: v.id("users"),
    publicKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_public_key", (q) => q.eq("publicKey", args.publicKey))
      .unique();

    if (existing && existing._id !== args.userId) {
      throw new Error("Public key already linked to another account.");
    }

    await ctx.db.patch(args.userId, { publicKey: args.publicKey });
    return null;
  },
});
```

Why this matters:
- Prevents two user accounts from claiming the same on-chain identity.

What this code does:
- Checks whether the public key is already linked to a different user.
- If safe, patches the user record with the new public key.

---

### 6) Stripe reconcile pagination
```rust
export const listUsersForStripeReconcile = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    users: v.array(
      v.object({
        _id: v.id("users"),
        stripeCustomerId: v.optional(v.string()),
      }),
    ),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("users")
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      users: result.page.map((user) => ({
        _id: user._id,
        stripeCustomerId: user.stripeCustomerId,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
```

Why this matters:
- Stripe reconciliation needs to scan users in manageable batches.

Syntax notes:
- `paginate` returns a page of results plus a cursor for the next page.
- `paginationOptsValidator` ensures the pagination parameters are valid.

What this code does:
- Reads a page of users in ascending order.
- Returns only the minimal fields needed for Stripe reconcile.

---

## Extended deep dive: user records as the identity spine

The `users.ts` module defines the spine of identity for the whole application. It links authentication providers, on-chain public keys, and billing identities into a single coherent user record. This is not just a CRUD file; it encodes business rules and trust boundaries.

---

### 5) User records are the “join table” for identity

A single user record ties together:

- **Auth provider + subject**: who the user is at the authentication layer.
- **Public key**: who the user is on chain.
- **Stripe customer ID**: who the user is in billing systems.

This makes the `users` table a *join table* for multiple identity domains. Almost every downstream system relies on this mapping, so correctness here is critical.

---

### 6) Internal vs external queries: a security boundary

The file uses both `internalQuery` and `query`:

- `internalQuery` is only callable from Convex server-side code (trusted).
- `query` is callable externally and must be protected (service token).

This difference is important. For example, `getUserByAuth` is internal because auth sessions and subjects should not be exposed to external callers. By contrast, `getUserByPublicKey` is exposed, but gated by a service token so only trusted backend services can call it.

Think of `internalQuery` as "private" and `query` as "public but authorized." This is a core Convex design pattern.

---

### 7) Schema as a contract

The `userDoc` schema defines required and optional fields and is reused in return types. This ensures every function returns consistent shapes. The schema includes:

- `_id`, `_creationTime` (Convex metadata)
- `authProvider`, `authSubject` (required)
- `email`, `name`, `publicKey`, `stripeCustomerId` (optional)

Optional fields reflect the fact that users can exist before they link a wallet or billing profile. This is a deliberate choice: it allows progressive onboarding.

---

### 8) `getUserByAuth`: the core lookup

This query uses the compound index `by_auth_provider_and_subject`. That index is crucial because auth provider + subject is the unique identity in the auth layer. The logic is:

1) Look up the user by auth provider + subject.
2) Return the user if found, else null.

This lookup is the bridge between auth sessions and user records. It is the first step in nearly every auth-related request.

---

### 9) `getUserById` vs `getUserByIdWithToken`

There are two versions of user-by-ID lookup:

- `getUserById` (internal): for server-only Convex calls.
- `getUserByIdWithToken` (external): for service-token gated access.

This split avoids accidental exposure of user records to client code. If you only need user data inside Convex, use the internal version. If a backend service needs it, use the token-gated version.

---

### 10) `getUserByPublicKey`: reverse lookup

This query maps from on-chain public key to user record. It relies on the `by_public_key` index. This is crucial for cases like:

- Looking up entitlements by on-chain key.
- Linking EVM addresses to the correct user.
- Admin tooling for on-chain identities.

Because public keys are sensitive identifiers, this query is service-token gated. It should never be available to untrusted clients.

---

### 11) Upsert semantics: idempotent user creation

`upsertUser` is the core mutation used when a user logs in. It implements an “upsert” (update if exists, insert otherwise). The logic is:

- Query for existing user by auth provider + subject.
- If found, patch only the provided fields.
- If not found, insert a new record.

This makes login idempotent: logging in twice does not create duplicate users. It also supports progressive enrichment: a user can later add email, name, or public key without creating a new record.

---

### 12) Patch semantics: why undefined fields don’t overwrite

The patch object is built only with fields that are explicitly provided. This prevents accidental data erasure. For example, if a login call does not include email, the stored email remains unchanged rather than being overwritten with undefined.

This is a subtle but crucial design choice. Without it, partial updates would silently wipe user data.

---

### 13) Link public key: uniqueness enforcement

`linkPublicKey` ensures that each public key can only be linked to one user. It does this by querying the `by_public_key` index and throwing if the key is already linked to a different user.

This prevents two accounts from claiming the same on-chain identity. It is a critical safety invariant because on-chain identity is unique.

However, this also means **key migration is hard**. If a user needs to change their public key, there is no built-in migration flow. This would require an admin tool or manual intervention.

---

### 14) Stripe customer linking

`setStripeCustomerId` is an internal mutation. It is intentionally not exposed externally. This prevents untrusted callers from altering billing identities.

This design enforces a separation of concerns: Stripe webhooks or internal reconciliation processes update billing fields, not user-facing flows.

---

### 15) Stripe reconcile pagination

`listUsersForStripeReconcile` is an internal query that paginates through user records. It returns only `_id` and `stripeCustomerId`. This minimal payload keeps reconciliation fast and cheap.

Pagination is essential: a production system could have thousands of users, and scanning them all at once would be too slow and expensive. By returning a cursor, the system can process users in batches.

---

### 16) Indexes and performance

The module relies on indexes defined in the schema:

- `by_auth_provider_and_subject`
- `by_public_key`

Without these, queries would require full table scans. The indexes are therefore part of the performance contract. If you alter the schema, you must maintain these indexes or risk severe performance degradation.

---

### 17) Data consistency and uniqueness

Convex does not enforce uniqueness at the schema level. Instead, the code enforces uniqueness by querying and checking. This is a common pattern in Convex apps.

The implication: uniqueness guarantees are only as strong as the code paths that enforce them. If you add new mutations that bypass these checks, you can accidentally introduce duplicate users or duplicate public keys.

---

### 18) Trust boundary recap

- **Internal queries**: trusted, no service token required.
- **External queries/mutations**: must pass a service token.

This ensures that only trusted backend services can perform user lookups or updates. It protects sensitive user data from direct client access.

---

### 19) Failure modes and safe behavior

Typical failure cases:

- `linkPublicKey` throws if the key is already linked.
- `upsertUser` does nothing if there are no fields to update (patch object empty).
- `getUserByPublicKey` returns null if no record exists.

These behaviors are safe defaults. They prevent duplicate records and avoid data loss.

---

### 20) Migration and key rotation challenges

Because public keys are unique and cannot be linked twice, key rotation is non-trivial. In the current system, you would need:

- an admin-only mutation to clear or transfer a public key,
- or a migration flow that creates a new user and deactivates the old one.

This is a common tradeoff: strong uniqueness vs flexibility. The code chooses strong uniqueness, which is correct for security but may require extra tooling later.

---

### 21) Auditability and change tracking

The user record does not include a change log. If you need to track changes (e.g., when a public key was linked), you should add an audit table or append fields like `publicKeyLinkedAtMs`.

This is not required for correctness, but it is useful for customer support and debugging.

---

### 22) Feynman analogy: a passport office

Think of the users table as a passport office:

- Auth provider + subject = your birth certificate.
- Public key = your national ID.
- Stripe customer ID = your tax ID.

The passport office ensures that each national ID is assigned to only one person. It can update your name or email, but it won’t erase your identity without explicit action. This is how the user record behaves.

---

### 23) Exercises for mastery

1) Explain why `linkPublicKey` must check for duplicates before patching.
2) Describe how `upsertUser` prevents duplicate user creation.
3) Propose a safe way to support public key rotation.
4) Explain why Stripe customer IDs are updated only via internal mutations.

If you can answer these, you understand user linking in depth.


## Addendum: operational nuances and scalability

### 24) Email and name as optional fields

Email and name are optional because not all auth providers supply them. For example, passkey-based auth might not include email. The schema’s optional fields allow the system to store whatever data is available without blocking user creation. This flexibility is important for multi-provider auth systems.

---

### 25) Consistency between auth and user records

The auth server uses `upsertUser` in its JWT callback to ensure the Convex user record exists. That means a user record can be created even if the user never explicitly visits profile endpoints. This is intentional: the system always maintains a Convex identity for authenticated users.

The tradeoff is that user records may exist with minimal data. That’s acceptable because the record is primarily an identity anchor, not a full profile.

---

### 26) Pagination and batch size tuning

`listUsersForStripeReconcile` accepts pagination options from the caller. If the caller requests huge pages, the query could be slow and expensive. In production, you should cap page sizes and tune them based on Stripe reconciliation workload.

A common approach is to process 100–500 users per batch, which balances throughput and query latency. The right number depends on user volume and Stripe API rate limits.

---

### 27) Service token exposure risk

Service tokens are the key that unlocks all “external” queries and mutations. If leaked, an attacker could:

- query user records by public key,
- upsert users,
- link public keys.

That is why the service token must be treated like a root secret. Store it in a secure secret manager and never expose it to client code. The Convex functions assume the token holder is trusted.

---

### 28) Handling duplicates during migrations

If you ever migrate auth provider formats (e.g., from one provider to another), you might accidentally create duplicate user records with different `authProvider` values. The current system treats `authProvider + authSubject` as unique, so duplicates across providers are possible.

If you need to merge identities, you will need a manual migration or an admin tool that merges records and resolves conflicts (public key, Stripe ID, etc.).

---

### 29) Potential for race conditions in linking

`linkPublicKey` checks for an existing record and then patches. In Convex, this is effectively safe because the mutation is atomic. Two concurrent link attempts for the same key will be serialized; one will see the key as available, and the other will see it already linked and throw.

This is another example of Convex’s serializable mutation guarantee providing safety without explicit locks.

---

### 30) Future evolution: multiple public keys

Currently, each user can link only one public key. If you ever want to support multiple keys (e.g., hardware + mobile), you would need to change the schema to store an array of keys and update the uniqueness constraints accordingly.

This is a non-trivial change because it impacts indexes and downstream logic. It would likely require a versioned migration.

---

### 31) Feynman exercise

Explain to a teammate why `publicKey` is optional at creation, but must be unique once linked. Then explain how you would design a safe migration path to allow a second key.


### 32) Final note

User records are the source of truth for identity joins. Treat any change to this file like a schema migration: review it for backward compatibility and data integrity.


### 33) Tiny epilogue

Identity glue code looks boring, but it determines whether every other system can trust the user mapping.


### 34) Last word

Protect this mapping at all costs.


## Key takeaways
- Users are keyed by auth provider + subject and can optionally link to a public key.
- Service-token gated queries protect sensitive lookups.
- Pagination is required for scalable Stripe reconciliation.

## Next lesson
L35 - Stripe webhook ingress: `feynman/lessons/L35-convex-http-stripe.md`
