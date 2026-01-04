# L33 - Convex auth challenge store (from scratch)

Focus file: `website/convex/auth.ts`

Goal: explain how Convex stores auth challenges and enforces one-time use with expiry. For every excerpt, you will see **why it matters** and a **plain description of what the code does**. We only explain syntax when it is genuinely tricky.

---

## Concepts from scratch (expanded)

### 1) What Convex is doing here
Convex is the server-side database and function runtime. You define **mutations** (write operations) and **queries** (read operations), each with validated inputs. These functions are the authoritative store for auth challenges.

### 2) Challenge/response in plain terms
The server creates a random challenge string and stores it. The client signs it. The server then checks the signature and consumes the challenge so it cannot be reused. This prevents replay attacks.

### 3) One-time use + expiration
A challenge is only valid if:
- it matches the public key,
- it has not been used before,
- it is not expired.

All three checks are required to avoid stolen or reused challenges.

---

## Limits & management callouts (important)

1) **TTL is enforced by the caller, not by Convex**
- This file trusts the `expiresAtMs` value it is given.
- If the auth service sets a long TTL, replay risk goes up.
- If it sets a short TTL, login may fail for slow users.

2) **No cleanup job here**
- Used and expired challenges are not deleted in this file.
- You should consider TTL cleanup or a scheduled purge to keep the table small.

3) **Challenge ID uniqueness relies on UUID quality**
- There is no explicit dedupe on insert; the code assumes UUID collision is practically impossible.
- This is usually fine, but it is still a trust assumption.

---

## Walkthrough with code excerpts

### 1) Creating a challenge record
```rust
export const createAuthChallenge = mutation({
  args: {
    serviceToken: v.string(),
    challengeId: v.string(),
    publicKey: v.string(),
    challenge: v.string(),
    expiresAtMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    await ctx.db.insert("auth_challenges", {
      challengeId: args.challengeId,
      publicKey: args.publicKey,
      challenge: args.challenge,
      expiresAtMs: args.expiresAtMs,
    });
    return null;
  },
});
```

Why this matters:
- This is the single source of truth for whether a challenge exists and when it expires.

Syntax notes:
- `mutation({ args, returns, handler })` defines a Convex write endpoint.
- `v.string()` and `v.number()` are runtime validators for incoming fields.
- `ctx.db.insert("table", {...})` writes a document to the named table.

What this code does:
- Requires a service token so only backend services can create challenges.
- Inserts one challenge row into the `auth_challenges` table.
- Stores the challenge alongside the public key and expiry time.

---

### 2) Looking up a challenge by ID
```rust
const record = await ctx.db
  .query("auth_challenges")
  .withIndex("by_challenge_id", (q) => q.eq("challengeId", args.challengeId))
  .unique();

if (!record) return null;
```

Why this matters:
- If the challenge cannot be found, the login attempt must stop immediately.

Syntax notes:
- `.withIndex("by_challenge_id", ...)` uses a pre-built index for fast lookup.
- `.unique()` means "there should be at most one matching record" and returns one or null.

What this code does:
- Queries the `auth_challenges` table by `challengeId`.
- Returns `null` if no matching record exists.

---

### 3) Enforcing one-time use + expiry
```rust
if (record.publicKey !== args.publicKey) return null;
if (record.usedAtMs) return null;
if (record.expiresAtMs <= Date.now()) return null;
```

Why this matters:
- These checks block replay attacks and prevent using someone else’s challenge.

What this code does:
- Ensures the challenge belongs to the same public key that requested it.
- Rejects challenges that were already used.
- Rejects challenges that are past their expiration time.

---

### 4) Marking the challenge as consumed
```rust
await ctx.db.patch(record._id, { usedAtMs: Date.now() });
return { challenge: record.challenge, expiresAtMs: record.expiresAtMs };
```

Why this matters:
- Marking the challenge as used closes the replay window immediately.

Syntax notes:
- `patch` updates only the fields provided, not the whole document.

What this code does:
- Writes `usedAtMs` to the record so future attempts are rejected.
- Returns the original challenge data to the caller.

---

## Extended deep dive: Convex challenge store as a replay‑prevention ledger

The Convex module in `website/convex/auth.ts` is tiny, but it plays a crucial security role: it is the authoritative ledger of authentication challenges. This section expands the reasoning behind each design choice and connects it to the larger auth flow.

---

### 4) Why the challenge store must be authoritative

In challenge/response systems, the *only* thing that prevents replay is the server’s memory of what challenges are valid and unused. If that memory is weak or inconsistent, attackers can reuse a valid signature to impersonate a user. That is why the challenge store must be authoritative and shared across all auth server instances.

Convex provides exactly that: a single source of truth with serialized mutations. This eliminates races between multiple auth servers and ensures that a challenge can only be consumed once.

---

### 5) The schema contract

The `auth_challenges` table (defined in `website/convex/schema.ts`) contains:

- `challengeId` (string)
- `publicKey` (string)
- `challenge` (string)
- `expiresAtMs` (number)
- `usedAtMs` (optional number)

This schema is a contract: if you change it, you must update both the Convex functions and the auth server logic. It is also the basis for indexes, which are essential for fast lookups.

---

### 6) Service token enforcement

Both mutations require a `serviceToken`, validated by `requireServiceToken`. This is a strict security boundary: only trusted backend services are allowed to create or consume challenges. Without this, any client could create arbitrary challenges or consume someone else’s, undermining the auth system.

This is an explicit capability model: possession of the service token grants access. It should therefore be treated as a root secret.

---

### 7) Why challenges are inserted “raw”

The `createAuthChallenge` mutation inserts the challenge record directly. It does not normalize or validate `publicKey` or `challenge` format beyond type checking. That is because validation already happens in the auth server (`isHex` checks). The Convex layer assumes trusted input from the service.

This separation keeps Convex code simple and avoids redundant validation. It also reinforces the trust boundary: Convex trusts the service token holder.

---

### 8) Index lookup by challengeId

`consumeAuthChallenge` looks up the record by `challengeId` using the `by_challenge_id` index. This is critical for performance. Without an index, every consumption would require scanning the entire table.

The query ends with `.unique()`, which asserts there is at most one record. This is a strong assumption: challenge IDs are expected to be unique (UUIDs). If uniqueness were violated, authentication would be ambiguous.

---

### 9) The three validation checks

Before a challenge can be consumed, three conditions must hold:

1) `record.publicKey == args.publicKey`
2) `record.usedAtMs` is empty
3) `record.expiresAtMs > Date.now()`

These correspond exactly to the security requirements:

- **Ownership**: the challenge belongs to the requester’s key.
- **One‑time use**: cannot be reused.
- **Time‑bound**: cannot be used after expiration.

Only if all three pass does the mutation mark the record as used and return the challenge.

---

### 10) Race conditions and atomicity

A key advantage of Convex is that mutations are atomic. That means two simultaneous `consumeAuthChallenge` calls for the same `challengeId` cannot both succeed. One will patch the record first (setting `usedAtMs`), and the other will see `usedAtMs` and return null.

This atomicity is what makes the replay protection strong. Without it, two parallel requests could both accept the same challenge.

---

### 11) Why the mutation returns the challenge

`consumeAuthChallenge` returns `{ challenge, expiresAtMs }`. This might seem redundant because the auth server already knows the challenge. But this return value is useful because:

- It confirms which challenge was consumed.
- It lets the auth server verify signature using the stored challenge (source of truth).
- It avoids trusting any client-provided challenge.

This is subtle: the server never uses the client-supplied challenge string for verification. It always uses the stored challenge. That prevents a client from mixing in a different message.

---

### 12) Expiration is enforced at read time

The mutation checks expiration during consumption. There is no background job that deletes expired records. That means the table may accumulate old rows over time.

This is acceptable for low volume, but at scale you should add a cleanup job. Otherwise, the table will grow indefinitely and queries could become slower.

---

### 13) Cleanup strategies

There are multiple ways to clean old challenges:

- A scheduled Convex mutation that deletes records older than a threshold.
- A periodic job in the auth service that purges expired/used challenges.
- A TTL index if Convex ever supports it.

The best option depends on scale. For early stages, manual cleanup is fine. For production, automated cleanup is strongly recommended.

---

### 14) Replay attack analysis

Consider a replay attack scenario:

1) Attacker obtains a signed challenge.
2) Attacker tries to reuse it later.

The mutation blocks this because `usedAtMs` is set immediately on first use. Even if the attacker replays within the TTL window, the challenge is already marked as used.

This is the core security guarantee of the system. If `usedAtMs` were not set, replay would be trivial.

---

### 15) Time consistency and clock drift

The expiration check uses `Date.now()` inside Convex, not the auth server’s clock. This is a good property because it centralizes time checks. However, it also means:

- If Convex clocks drift significantly, challenges might expire too early or too late.
- In practice, managed Convex infrastructure should be consistent, so drift is minimal.

The key is that all consumption checks use the *same* clock, which ensures consistency across auth servers.

---

### 16) Challenge ID uniqueness assumptions

The system assumes `challengeId` is unique. This is generated as a UUID on the auth server. UUID collisions are astronomically unlikely, so the system treats collisions as impossible.

If a collision did occur, `consumeAuthChallenge` would return whichever record the index resolved, creating a security risk. This is why high‑quality UUID generation matters. In practice, using `crypto.randomUUID()` is sufficient.

---

### 17) Negative test cases

The mutation intentionally returns `null` in many cases. These are expected failure modes:

- challenge not found
- wrong public key
- already used
- expired

The auth server treats any of these as a login failure. This is correct: authentication should fail closed.

---

### 18) Error messages and privacy

The mutation does not expose *why* a challenge was rejected. It simply returns `null`. This is a privacy feature: it prevents attackers from probing whether a given challenge exists or whether it has been used.

The auth server could log more details for debugging, but responses to clients remain generic.

---

### 19) Extending the schema for multi-factor auth

If you ever want to add multi-factor auth, you can extend this schema to include additional fields (e.g., OTP codes or device identifiers). The same consume‑once pattern would apply: check validity, mark used, return success.

The current design is flexible enough to support such extensions without major refactoring.

---

### 20) How this ties into the auth server

The auth server calls:

- `createAuthChallenge` when the client requests a challenge.
- `consumeAuthChallenge` when the client submits a signature.

This keeps the auth server stateless with respect to challenges. The state lives entirely in Convex. This is a classic stateless‑service design: horizontal scaling is trivial because any instance can handle any request.

---

### 21) Feynman analogy: a ticket stub

Imagine a movie theater. The auth server gives you a ticket stub (challenge). When you enter, the usher checks your stub and tears it in half (usedAtMs). You cannot reuse it later. The theater also stops accepting stubs after the show starts (expiresAtMs). That’s exactly what the challenge store does: validate once, then invalidate.

---

### 22) Exercises for mastery

1) Explain why both `publicKey` and `challengeId` are required to consume a challenge.
2) Propose a cleanup mutation that deletes expired challenges and explain how you would schedule it.
3) Describe what would happen if the auth server reused a challengeId by accident.
4) Explain how the one‑time use property prevents replay even if the attacker has the signed message.

If you can answer these, you understand the Convex challenge store deeply.


## Addendum: operational considerations and future-proofing

### 23) Scaling behavior and hot keys

The challenge table is accessed by `challengeId`, which is effectively random. That means requests are evenly distributed across the index, avoiding hot keys. This is good for scaling: no single key becomes a bottleneck.

However, if many challenges are created for the same public key, you could add a secondary index on `publicKey` to support per‑user cleanup or debugging. The schema already includes `by_public_key`, so you can build queries for that purpose without schema changes.

---

### 24) Data retention and privacy

Challenges include the raw `publicKey`. Over time, this table can become a log of login attempts. Even though challenges expire, the records remain unless deleted. This has privacy implications. In production, you should establish a retention policy (e.g., delete records older than 30 days).

A simple cleanup job that deletes expired challenges could satisfy both performance and privacy requirements.

---

### 25) Replay window under latency

The TTL is measured by Convex’s clock, but real-world clients might have network latency. If a client is slow and the TTL is too short, they will generate a signature that arrives after expiration. That will fail. This is why the TTL is tuned for user experience and why the max TTL is enforced: it avoids the extremes.

When tuning TTL, you should consider:

- Typical network latency (mobile vs desktop).
- User interaction delay (time between challenge display and signature).
- Security posture (shorter TTL reduces replay risk).

---

### 26) Eventual consistency vs strict consistency

Convex mutations are strongly consistent for a given record. This means once a challenge is consumed, all subsequent reads will see it as used. There is no window where one server sees it as unused while another sees it as used. This is a key safety property.

In a system with eventual consistency, you could get a race where one server consumes while another still sees the record as unused. Convex’s consistency model avoids that, which is why it is a good fit for auth challenges.

---

### 27) Idempotent behavior for consumers

`consumeAuthChallenge` returns `null` for any failure. This is effectively an idempotent response from the client’s perspective: repeating a consume call yields either the same success once or null afterward.

This matters because clients or servers may retry on network failures. The logic is safe: only one attempt can succeed, all retries fail without side effects beyond the initial consumption.

---

### 28) Integration with auditing

Although the mutation itself does not log, the auth server can log when it calls create/consume. This separation keeps Convex functions small and focused, while still allowing audit trails at the service layer.

If you want audit trails at the database level, you could add a second table (e.g., `auth_audit`) and write audit records alongside mutations. This would provide a durable, queryable log independent of server logs.

---

### 29) Potential for rate limiting at the storage layer

Currently, rate limiting is done in the auth server, not in Convex. That is fine because Convex assumes trusted callers. However, if the service token is ever leaked, a malicious actor could spam challenge creation. You might mitigate this by adding a simple rate limiting check in Convex based on publicKey or IP (if IP is passed through).

In practice, protecting the service token is the primary defense.

---

### 30) Cross-service failure modes

If the auth server is down, Convex still holds challenges, but no one consumes them. They will expire naturally. When the auth server comes back, old challenges may still exist but will be expired, so they will be rejected. This is safe and predictable.

If Convex is down, auth cannot create or consume challenges, so login will fail. This is a hard dependency; there is no offline fallback. In production, you should monitor Convex availability closely.

---

### 31) Testing strategy for Convex functions

Even simple mutations deserve tests:

- create a challenge and verify it is stored correctly.
- consume it with correct key → success.
- consume again → null.
- consume with wrong key → null.
- consume after expiration → null.

These tests ensure the core invariants (one-time use, correct key binding, TTL enforcement) are preserved as the code evolves.

---

### 32) Future evolution: support multiple auth methods

If you add new auth methods (e.g., OAuth or hardware tokens), you can reuse the challenge table by adding a `method` field. That would allow different challenge types to coexist while still sharing the one-time-use mechanism.

The current design can evolve in this way without breaking compatibility, because additional fields can be optional in Convex records.

---

### 33) Feynman exercise: explain to a new backend dev

Explain why `consumeAuthChallenge` must check `publicKey` and not just `challengeId`. Then explain why the function returns the stored challenge instead of trusting any client input. Finally, explain how Convex’s atomicity prevents two servers from consuming the same challenge.


### 34) Quick recap

The challenge store is small but security‑critical. Treat it like a cryptographic component: any change to its semantics affects the entire auth system’s safety.


### 35) Last note

If you ever refactor auth flows, make sure this file is updated in lockstep. A tiny change here can silently break login for every client.


### 36) Final word

Replay safety is only as strong as the one‑time‑use guarantee enforced here.


### 37) One‑line summary

Convex provides the durable, atomic check‑and‑set that makes challenge auth safe at scale.


### 38) Tiny epilogue

Small file, huge security impact.


## Key takeaways
- Convex stores auth challenges and enforces one-time usage.
- Expiry is enforced by the auth service through `expiresAtMs`.
- Challenges are not deleted here, so cleanup is an operational concern.

## Next lesson
L34 - Convex user linking: `feynman/lessons/L34-convex-users.md`
