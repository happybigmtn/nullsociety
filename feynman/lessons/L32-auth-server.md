# L32 - Auth service endpoints (from scratch)

Focus file: `services/auth/src/server.ts`

Goal: explain the main auth endpoints: challenge creation, signature verification, profile lookup, and freeroll sync. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Challenge/response auth
The server issues a random challenge. The client signs it. The server verifies the signature to prove ownership of the key.

### 2) Origins and CORS
Auth endpoints are protected by an origin allowlist. Requests from untrusted origins are rejected.

### 3) Entitlements + freeroll sync
After login, the server can sync freeroll limits on chain based on Stripe entitlements.

---

## Limits & management callouts (important)

1) **AUTH_CHALLENGE_TTL_MS default = 300000**
- Challenges expire after 5 minutes to prevent replay.

2) **Rate limits (challenge/profile/billing)**
- Each endpoint applies a rate limiter. Adjust carefully to avoid blocking legitimate users.

3) **AUTH_ALLOWED_ORIGINS must be set**
- If empty, server throws on startup.

---

## Walkthrough with code excerpts

### 1) CORS and origin allowlist
```ts
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"));
    },
    credentials: true,
    exposedHeaders: ["x-request-id"],
  }),
);
```

Why this matters:
- Prevents browsers on unknown domains from accessing auth APIs.

What this code does:
- Allows requests only from configured origins.
- Enables cookies/credentials and exposes request IDs for debugging.

---

### 2) Challenge endpoint
```ts
app.post("/auth/challenge", requireAllowedOrigin, challengeRateLimit, async (req, res) => {
  const publicKey = normalizeHex(String(req.body?.publicKey ?? ""));
  if (!isHex(publicKey, 64)) {
    res.status(400).json({ error: "invalid publicKey" });
    return;
  }
  const challengeId = crypto.randomUUID();
  const challenge = crypto.randomBytes(32).toString("hex");
  const expiresAtMs = Date.now() + effectiveChallengeTtlMs;

  await convex.mutation(api.auth.createAuthChallenge, {
    serviceToken,
    challengeId,
    publicKey,
    challenge,
    expiresAtMs,
  });

  res.json({ challengeId, challenge, expiresAtMs });
});
```

Why this matters:
- This is the entry point for proving key ownership.

What this code does:
- Validates the public key format.
- Generates a random challenge and stores it in Convex with a TTL.
- Returns the challenge to the client.

---

### 3) Mobile entitlements (signature check)
```ts
app.post("/mobile/entitlements", challengeRateLimit, async (req, res) => {
  if (!mobileEnabled) {
    res.status(403).json({ error: "mobile_disabled" });
    return;
  }
  const publicKey = normalizeHex(String(req.body?.publicKey ?? ""));
  const signature = normalizeHex(String(req.body?.signature ?? ""));
  const challengeId = String(req.body?.challengeId ?? "");
  if (!isHex(publicKey, 64)) {
    res.status(400).json({ error: "invalid publicKey" });
    return;
  }
  if (!isHex(signature, 128)) {
    res.status(400).json({ error: "invalid signature" });
    return;
  }

  const challenge = await convex.mutation(api.auth.consumeAuthChallenge, {
    serviceToken,
    challengeId,
    publicKey,
  });
  if (!challenge) {
    res.status(400).json({ error: "invalid challenge" });
    return;
  }
  if (!verifySignature(publicKey, signature, challenge.challenge)) {
    res.status(400).json({ error: "invalid signature" });
    return;
  }

  // lookup entitlements and sync freeroll limit
  // ...
});
```

Why this matters:
- This is the trust boundary: signature verification proves the user controls the key.

What this code does:
- Validates input formats.
- Consumes the stored challenge (one-time use).
- Verifies the signature before returning entitlements.

---

### 4) Profile endpoint + freeroll sync
```ts
app.get("/profile", requireAllowedOrigin, profileRateLimit, async (req, res) => {
  const session = await getSession(req, authConfig);
  const userId = (session as any)?.user?.id as string | undefined;
  if (!userId) {
    res.status(401).json({ session: null, entitlements: [] });
    return;
  }
  const entitlements = await convex.query(api.entitlements.getEntitlementsByUser, {
    serviceToken,
    userId,
  });
  const evmLink = await convex.query(api.evm.getEvmLinkByUser, {
    serviceToken,
    userId,
  });
  const publicKey = (session as any)?.user?.authSubject as string | undefined;
  if (publicKey) {
    syncFreerollLimit(publicKey, entitlements)
      .catch(() => { /* ignore */ });
  }
  res.json({ session, entitlements, evmLink });
});
```

Why this matters:
- This endpoint connects login state to on‑chain freeroll limits.

What this code does:
- Validates the session.
- Fetches entitlements and EVM links from Convex.
- Triggers `syncFreerollLimit` to update on-chain limits if needed.

---

## Extended deep dive: auth server as a multi‑role gateway

The auth server is deceptively small in terms of endpoints, but it’s doing three jobs at once:

1) **Identity gateway**: challenge/response login and session management.
2) **Security firewall**: origin allowlists and rate limits.
3) **Cross‑system bridge**: entitlements → on‑chain admin updates.

This section breaks those roles down in detail and explains how the server’s design keeps them safe and deterministic.

---

### 4) Request lifecycle and request IDs

At startup, the server attaches middleware that assigns a request ID (`x-request-id`) and logs a JSON event when the request finishes. This creates a consistent tracing handle across logs. The lifecycle is:

- If the incoming request includes `x-request-id`, it is reused.
- Otherwise, a UUID is generated.
- The ID is stored in `res.locals.requestId` and echoed in the response header.
- On finish, the server logs method, path, status, and duration.

This is critical for production debugging. If a user reports a failure, you can search logs by request ID and reconstruct exactly what happened.

---

### 5) CORS and origin allowlists

The server applies CORS with an origin callback. The policy is strict: if the origin is missing or not in `AUTH_ALLOWED_ORIGINS`, the request is rejected by CORS. This is a first-line defense against browser‑based abuse.

There is also a custom middleware (`requireAllowedOrigin`) that checks `Origin` and `Referer`. This is separate from CORS and is used for endpoints where you want explicit enforcement even if CORS is bypassed (for example, non-browser clients or misconfigured clients).

Together, these checks create a “belt and suspenders” security approach: CORS blocks browser access from untrusted origins, and `requireAllowedOrigin` blocks requests at the application layer.

---

### 6) Trust proxy and IP-based rate limiting

The server enables `trust proxy`. This is important because the rate limiter uses `req.ip`. With a reverse proxy (e.g., NGINX or Cloudflare), the real client IP appears in `X-Forwarded-For`. Without `trust proxy`, every request would look like it comes from the proxy, collapsing rate limits and making them ineffective.

Because this is a subtle dependency, the server explicitly sets `trust proxy` to true. Operators must ensure their proxy configuration is correct, or rate limits will behave incorrectly.

---

### 7) Rate limiting strategy

Rate limiting is implemented as an in-memory bucket per IP, per endpoint category. Each bucket has:

- a count,
- a reset time.

If the count exceeds the max, the server returns 429 and sets `Retry-After`. This is a simple algorithm but works well for low to moderate load.

Important tradeoff: this rate limiter is **not distributed**. If you run multiple auth servers, each instance has its own buckets. That means a client can bypass rate limits by spreading requests across instances. For production scale, you should replace this with a shared rate limiter.

---

### 8) Challenge creation: the core authentication primitive

The challenge endpoint (`/auth/challenge`) is the first step in auth. It generates a random 32‑byte challenge and stores it in Convex along with:

- `challengeId` (UUID)
- `publicKey` (the user’s public key)
- `expiresAtMs`

The TTL is computed as `effectiveChallengeTtlMs`, which is the minimum of the configured TTL and a max TTL. This ensures challenges cannot live indefinitely even if the environment variable is misconfigured.

By storing challenges in Convex, the server can invalidate them once used. This is what prevents replay attacks.

---

### 9) Signature verification: the proof of possession

The `verifySignature` function does the heavy lifting for Ed25519 auth. It builds a SPKI buffer using a fixed prefix and the raw public key bytes. This step is easy to get wrong; without the SPKI wrapper, the crypto API will reject the key.

The signed message is not just the random challenge. It is the challenge prefixed with `nullspace-auth:`. This prefix is a form of domain separation. It ensures that a signature intended for auth cannot be reused as a signature for another purpose.

If verification passes, the user is authenticated and a session is created via ExpressAuth.

---

### 10) Session creation and JWT callbacks

The auth server uses `@auth/express` (NextAuth for Express) with a JWT session strategy. The key callbacks:

- `jwt` callback: attaches `convexUserId`, auth provider, and auth subject.
- `session` callback: exposes these values in `session.user`.

This means that downstream endpoints (like `/profile`) can read the user’s Convex ID and public key from the session without re-verifying signatures.

The session is therefore the bridge between cryptographic auth and application-level authorization.

---

### 11) Mobile endpoints: a different trust model

Mobile endpoints (`/mobile/challenge`, `/mobile/entitlements`) are gated by `AUTH_MOBILE_ENABLED` instead of origin allowlists. This is because mobile clients do not send browser `Origin` headers. The model is:

- Only enable mobile endpoints when you explicitly trust the mobile channel.
- Use the same challenge/response signature verification as web.

This keeps the cryptographic guarantee intact while relaxing origin checks that do not apply to mobile.

---

### 12) Entitlements and freeroll sync

When a user requests `/profile`, the server fetches entitlements from Convex and then calls `syncFreerollLimit`. This is a subtle but important side effect: simply viewing your profile can trigger an on-chain update.

Why do it here? Because profile is typically called after login, and it ensures that entitlement changes propagate quickly without requiring an explicit sync endpoint call.

This is a good example of cross-system orchestration: the auth server is the orchestrator that keeps off-chain entitlements and on-chain limits in sync.

---

### 13) EVM linking as a second identity layer

The auth server supports linking an EVM address to the user. This involves a separate challenge stored in Convex (`evm.createEvmChallenge`) and a signature check using `ethers.verifyMessage`.

The signed message includes origin, chainId, userId, and challenge. This is similar to SIWE (Sign-In With Ethereum) but simplified. The chainId check ensures the signature is bound to an allowed chain, reducing the risk of cross-chain replay.

The result is a dual identity: one Ed25519 public key for on-chain transactions, and one EVM address for external wallet identity.

---

### 14) Metrics endpoints and auth tokens

Metrics endpoints are protected by a token. In production, the default is to require a token even if `AUTH_REQUIRE_METRICS_AUTH` is not set. This is a conservative choice: metrics can leak sensitive information about traffic volume, error rates, and user behavior.

The token can be sent as either:

- `Authorization: Bearer <token>`
- `x-metrics-token: <token>`

This flexibility makes it easy to integrate with different monitoring stacks.

---

### 15) AI strategy endpoint: gated and capped

The `/ai/strategy` endpoint is optional and guarded by:

- an auth session,
- `AUTH_AI_RATE_LIMIT` settings,
- and `AI_STRATEGY_DISABLED` or missing API key.

Inputs are explicitly capped (gameType length, cards length, history length). This is a simple but effective defense against oversized payloads and accidental prompt blowups.

This endpoint demonstrates a best practice: optional, expensive services should be explicitly gated and safe by default.

---

### 16) Error handling philosophy

Most endpoints do not crash on downstream failures. For example:

- If `syncFreerollLimit` fails, the profile request still succeeds.
- If metrics rendering fails, it logs but does not terminate the server.

This is a deliberate choice: auth should prioritize availability and user login over optional features. Admin sync can be retried later; losing login availability is more damaging.

---

### 17) Security boundaries in practice

The auth server enforces several boundaries:

- **Origin allowlist** (browser access).
- **Session requirement** (protected profile/AI endpoints).
- **Service token** (Convex mutations).
- **Admin key** (on-chain admin transactions).

These boundaries are layered. Even if one is misconfigured, another may still hold. This layered approach is what keeps the system robust against mistakes.

---

### 18) Observability: counters, timings, and ops events

The server tracks counters (`inc`) and timings (`observe`) for key events. It also emits audit logs for admin actions and sends optional ops analytics events.

From an operational standpoint, this means you can answer questions like:

- How many challenges are created per minute?
- How often freeroll sync fails?
- What is the average latency of profile requests?

These are the metrics that matter in production.

---

### 19) The hidden coupling: nonce manager and error strings

The auth server’s freeroll sync ultimately submits admin transactions. Submission errors can bubble up to the gateway and nonce manager. Some nonce logic in the gateway relies on error string matching. That means error messages in the auth chain matter for upstream systems. It is a subtle coupling to be aware of when changing error messages.

---

### 20) Failure modes and recovery

Common failure modes:

- **Convex unavailable**: challenges cannot be stored or consumed → auth fails fast.
- **Admin key missing**: freeroll sync returns `admin_unconfigured` but auth still works.
- **Clock drift**: challenge TTL may be off; auth may reject valid signatures if drift is extreme.
- **Misconfigured origins**: all requests rejected → auth unavailable.

This is why configuration validation at startup is essential. The code already enforces it for critical env vars.

---

### 21) Testing strategy

A robust test suite for the auth server should include:

- unit tests for `verifySignature` with known keys/signatures,
- integration tests for challenge creation and consumption,
- tests for origin allowlist behavior,
- tests for freeroll sync side effects.

Because the auth server touches Convex and the chain, integration tests are especially valuable. Mocking those systems is possible, but end‑to‑end tests catch more real-world issues.

---

### 22) Feynman analogy: a nightclub bouncer

Think of the auth server as a nightclub bouncer:

- The bouncer checks your ID (signature verification).
- The bouncer only admits people from a guest list (origin allowlist).
- The bouncer stamps your hand (session token).
- The bouncer also updates VIP privileges (freeroll sync) if your membership status changes.

This analogy captures the dual role: strict entry checks plus administrative adjustments.

---

### 23) Exercises for mastery

1) Trace the full auth flow from `/auth/challenge` to session creation, identifying each security check.
2) Explain how a replay attack would be attempted and how challenge consumption prevents it.
3) Describe how freeroll sync is triggered and why it is safe to fail silently.
4) Explain why the auth server needs to trust proxies for correct rate limiting.

If you can answer these, you understand the auth server in depth.


## Addendum: deeper security and operational nuances

### 24) Why challenges are stored in Convex (not memory)

A naïve implementation might store challenges in memory. That works for a single process but fails under restarts or multi-instance deployments. By storing challenges in Convex, the system gains:

- durability (restarts do not lose challenges),
- shared state across instances (any instance can verify a challenge),
- consistent TTL enforcement.

This is essential if you ever run more than one auth server. Without shared storage, half of your instances would reject valid challenges created on other instances.

---

### 25) Challenge TTL as a balance between UX and security

A long TTL improves UX (users have more time to sign), but increases replay risk. A short TTL improves security but can frustrate users who delay. The system uses two variables:

- `AUTH_CHALLENGE_TTL_MS` (configured)
- `AUTH_CHALLENGE_TTL_MAX_MS` (cap)

The effective TTL is the min of the two. This design gives operators flexibility but prevents dangerously large TTLs from being configured by mistake.

---

### 26) Cookie/session implications of CORS

CORS is configured with `credentials: true`. This is required if you want cookies (JWT session cookies) to be sent cross‑origin. However, it also means:

- the `Access-Control-Allow-Origin` response cannot be `*` (it must echo a specific origin),
- browsers will block requests if the origin is not explicitly allowed.

This is why the origin allowlist is strict: it is a functional requirement, not just a security choice. Without a correct origin list, sessions would not work.

---

### 27) Session scope and privilege separation

The session created by ExpressAuth is used for profile and EVM link operations. It is *not* used for admin key operations. Admin operations use service tokens and private keys, not user sessions.

This separation is important: a valid user session should never grant admin privileges. The code reflects this by isolating admin logic in `casinoAdmin.ts` and requiring service tokens.

---

### 28) The interplay between `/profile` and `/profile/sync-freeroll`

The `/profile` endpoint does a best‑effort sync. The explicit `/profile/sync-freeroll` endpoint performs a full sync with error handling and returns a status. The difference is subtle:

- `/profile` prioritizes user experience (returns quickly, ignores sync failure).
- `/profile/sync-freeroll` prioritizes correctness (returns errors if sync fails).

This split lets the UI choose: show profile quickly, or force a sync when needed.

---

### 29) Status codes as part of the API contract

The auth server uses consistent error JSON payloads, for example:

- `origin_not_allowed` → 403
- `invalid publicKey` → 400
- `unauthorized` → 401
- `rate_limited` → 429

Clients can rely on these codes to show appropriate UI feedback. In a production environment, you should treat these error shapes as API contracts and avoid changing them without coordinating client updates.

---

### 30) What happens if Convex is slow

Convex calls are used in critical paths (challenge creation, challenge consumption, profile queries). If Convex is slow, auth latency increases. The server does not currently implement explicit timeouts for Convex calls, so a slow Convex backend could stall requests.

A production hardening step would be to add timeouts or circuit breakers around Convex calls, and return an error if the storage backend is unhealthy.

---

### 31) Why the server logs JSON

All request logs are JSON. This makes them machine‑parsable and easy to ship into log aggregation systems. Text logs are human-friendly, but JSON logs are far easier to analyze at scale.

The logJson function is used for audit logs as well. This consistent format means you can search for all audit events across services with simple filters.

---

### 32) Behavior under partial configuration

The auth server is strict about some configuration (e.g., `AUTH_ALLOWED_ORIGINS`, `CONVEX_URL`, `CONVEX_SERVICE_TOKEN`) and lenient about others (e.g., AI settings). This is a deliberate stance: if critical configuration is missing, the server should fail fast; if optional configuration is missing, it should continue operating in a reduced mode.

This reduces the blast radius of optional feature misconfiguration.

---

### 33) How to reason about trust boundaries

A useful mental model is to classify inputs:

- **Untrusted inputs**: HTTP request bodies, query params, headers.
- **Semi-trusted inputs**: Convex query results (trusted storage, but still external).
- **Trusted inputs**: environment variables and service tokens.

The code validates untrusted inputs aggressively (hex checks, length checks). Semi‑trusted inputs are used but not blindly trusted (e.g., entitlements may be empty). Trusted inputs are used to gate security decisions (service token, allowed origins).

Understanding these layers helps you reason about where additional validation is needed.

---

### 34) Feynman exercise: explain to a security engineer

Explain why the auth server uses both CORS and an allowlist middleware. Then explain why challenges are stored in Convex instead of memory. Finally, explain why admin actions are isolated from user sessions. This exercise forces you to articulate the security boundaries clearly.


## Key takeaways
- Auth endpoints use challenge/response and origin allowlists.
- Entitlements can drive on‑chain admin updates.
- Profile requests also trigger freeroll sync as a side effect.

## Next lesson
L33 - Convex auth sync: `feynman/lessons/L33-convex-auth.md`
