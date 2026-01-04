# L28 - Auth service + admin txs (from scratch)

Focus files:
- `services/auth/src/server.ts`
- `services/auth/src/casinoAdmin.ts`

Goal: explain how the auth service enforces origin checks, signs/validates auth, and submits admin transactions to sync freeroll limits. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) Auth service responsibilities
The auth service handles:
- login/session validation,
- origin allowlists,
- optional AI strategy helper,
- and admin-only on‑chain actions like setting freeroll limits.

### 2) Admin transactions
Some changes (like daily tournament limits) are admin instructions that must be signed and submitted on chain. The auth service owns the admin key and handles submissions.

### 3) Convex as a nonce store
Admin transactions must use the correct nonce. The service reserves nonces in Convex to avoid collisions across requests.

---

## Limits & management callouts (important)

1) **AUTH_ALLOWED_ORIGINS is required**
- If it’s empty, the server throws at startup.
- Misconfiguration blocks all clients.

2) **AUTH_CHALLENGE_TTL_MS default = 300000 (5 minutes)**
- Too short causes login failures; too long increases replay risk.

3) **Metrics auth can be required**
- `AUTH_REQUIRE_METRICS_AUTH` + `METRICS_AUTH_TOKEN` gate `/metrics` endpoints.

4) **Freeroll limit caps to 255**
- `parseLimit` clamps daily limits to `<= 255`.

---

## Walkthrough with code excerpts

### 1) Required env values (auth server)
```ts
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const convex = new ConvexHttpClient(required("CONVEX_URL"), {
  skipConvexDeploymentUrlCheck: true,
});
const serviceToken = required("CONVEX_SERVICE_TOKEN");
```

Why this matters:
- Missing environment variables should fail fast. Auth without Convex is not safe.

What this code does:
- Validates that required env vars are present.
- Initializes the Convex client and service token for server-side mutations.

---

### 2) Origin allowlist enforcement
```ts
const allowedOrigins = parseAllowedOrigins();
if (allowedOrigins.length === 0) {
  throw new Error("AUTH_ALLOWED_ORIGINS must be set");
}

const requireAllowedOrigin: express.RequestHandler = (req, res, next) => {
  const origin = getRequestOrigin(req);
  if (!origin || !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }
  next();
};
```

Why this matters:
- Prevents unauthorized websites or apps from hitting auth endpoints.

What this code does:
- Parses allowed origins from env.
- Rejects requests whose Origin/Referer is not in the list.

---

### 3) Metrics auth gate
```ts
const metricsAuthToken = process.env.METRICS_AUTH_TOKEN ?? "";
const requireMetricsAuthToken =
  String(process.env.AUTH_REQUIRE_METRICS_AUTH ?? "").toLowerCase() === "true" ||
  String(process.env.AUTH_REQUIRE_METRICS_AUTH ?? "") === "1" ||
  process.env.NODE_ENV === "production";
if (requireMetricsAuthToken && !metricsAuthToken) {
  throw new Error("METRICS_AUTH_TOKEN must be set when metrics auth is required");
}
const requireMetricsAuth: express.RequestHandler = (req, res, next) => {
  if (!metricsAuthToken) {
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;
  const headerToken =
    typeof req.headers["x-metrics-token"] === "string"
      ? req.headers["x-metrics-token"]
      : null;
  if (bearerToken === metricsAuthToken || headerToken === metricsAuthToken) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
};
```

Why this matters:
- Metrics can expose sensitive operational data. This gate keeps them private.

What this code does:
- Requires a token in production or when explicitly enabled.
- Accepts either a Bearer token or `x-metrics-token` header.

---

### 4) Admin key resolution (casinoAdmin)
```ts
const resolveAdminKeyHex = async (): Promise<string> => {
  const secretUrl = process.env.CASINO_ADMIN_PRIVATE_KEY_URL;
  if (secretUrl) {
    const fromUrl = await readSecretUrl(secretUrl, "admin key");
    if (fromUrl) return fromUrl;
  }

  const filePath = process.env.CASINO_ADMIN_PRIVATE_KEY_FILE;
  if (filePath) {
    const fromFile = await readSecretFile(filePath, "admin key");
    if (fromFile) return fromFile;
  }

  const fromEnv = process.env.CASINO_ADMIN_PRIVATE_KEY_HEX ?? "";
  const allowEnv =
    process.env.ALLOW_INSECURE_ADMIN_KEY_ENV === "true" || process.env.NODE_ENV !== "production";
  if (fromEnv && allowEnv) {
    return fromEnv;
  }
  if (fromEnv && !allowEnv) {
    console.warn(
      "[auth] CASINO_ADMIN_PRIVATE_KEY_HEX is not allowed in production; use CASINO_ADMIN_PRIVATE_KEY_FILE instead.",
    );
  }
  return "";
};
```

Why this matters:
- Admin keys are high‑risk secrets. Production should use file or URL sources, not env.

What this code does:
- Tries URL, then file, then env (only in non‑prod or when explicitly allowed).
- Returns an empty string if nothing is available.

---

### 5) Submit admin transaction (freeroll limit)
```ts
const submitTransaction = async (state: AdminState, tx: Uint8Array): Promise<void> => {
  const submission = state.wasm.wrap_transaction_submission(tx);
  const response = await fetch(`${state.baseUrl}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: Buffer.from(submission),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Submit failed (${response.status}): ${text}`);
  }
};
```

Why this matters:
- Admin limits only take effect after an on‑chain transaction is submitted.

What this code does:
- Wraps a signed transaction in a submission payload.
- Sends it to `/submit` and throws on failure.

---

### 6) Sync freeroll limits
```ts
export const syncFreerollLimit = async (
  publicKeyHex: string,
  entitlements: Entitlement[],
): Promise<{ status: string; limit?: number }> => {
  const state = await getAdminState();
  if (!state) {
    return { status: "admin_unconfigured" };
  }

  const normalizedKey = normalizeHex(publicKeyHex);
  if (normalizedKey.length !== 64) {
    return { status: "invalid_public_key" };
  }

  const freeLimit = parseLimit(process.env.FREEROLL_DAILY_LIMIT_FREE, 1);
  const memberLimit = parseLimit(process.env.FREEROLL_DAILY_LIMIT_MEMBER, 10);
  const tiers = getMemberTiers();
  const desiredLimit = hasActiveEntitlement(entitlements, tiers)
    ? memberLimit
    : freeLimit;

  return enqueueAdmin(async () => {
    const playerKeyBytes = hexToBytes(normalizedKey);
    const player = await getPlayer(state, playerKeyBytes);
    if (!player) {
      return { status: "player_not_found" };
    }

    const currentLimit = Number(player.tournament_daily_limit ?? 0);
    if (currentLimit === desiredLimit) {
      return { status: "already_set", limit: desiredLimit };
    }

    const nonce = await reserveNonce(state);
    const tx = state.wasm.Transaction.casino_set_tournament_limit(
      state.signer,
      BigInt(nonce),
      playerKeyBytes,
      desiredLimit,
    );
    await submitTransaction(state, tx.encode());
    return { status: "submitted", limit: desiredLimit };
  });
};
```

Why this matters:
- Freeroll limits are part of the abuse‑prevention system. If sync fails, entitlements don’t apply.

What this code does:
- Computes a desired daily limit based on entitlements.
- Fetches the player’s on‑chain state and compares the current limit.
- If needed, builds and submits an admin transaction to set the new limit.

---

## Extended deep dive: auth service as a security gateway and admin relay

The auth service does two jobs at once:

1) It is the **identity and session gateway** for web and mobile clients.
2) It is the **admin transaction relay** for on-chain configuration changes (like freeroll limits).

These two roles share infrastructure (Convex, rate limits, origin checks), but their security assumptions differ. This section explains both roles and how the code enforces the right boundaries.

---

### 5) Origin allowlists are a hard security boundary

`AUTH_ALLOWED_ORIGINS` is required at startup. If it is empty, the server aborts. This is intentional: auth endpoints are not meant to be open to arbitrary origins. Without this check, any website could trigger auth challenges and attempt to harvest signatures.

The `requireAllowedOrigin` middleware checks:

- `Origin` header first (if present)
- `Referer` as a fallback

If neither is allowed, the request is rejected with `origin_not_allowed`. This prevents untrusted frontends from hijacking auth flows.

---

### 6) Challenge-based auth flow

The login flow is a classic challenge-response protocol:

1) Client requests `/auth/challenge` with its public key.
2) Server creates a random 32-byte challenge and stores it in Convex with a TTL.
3) Client signs the challenge with its private key.
4) Client submits signature and challengeId to `/auth` (via NextAuth credentials provider).
5) Server verifies signature and exchanges it for a session.

The key detail: the **challenge is stored server-side** (Convex) and must be consumed. This prevents replay. Once consumed, the challenge is invalid. The TTL further limits replay windows.

---

### 7) Signature verification details (Ed25519)

The server uses Node’s crypto APIs to verify the Ed25519 signature. It constructs a SPKI buffer by prefixing the public key bytes with the Ed25519 SPKI header (`ED25519_SPKI_PREFIX`). This is a low-level detail that often trips developers: raw public keys are not enough; the crypto API expects a fully formatted key object.

The message that is signed includes a prefix (`nullspace-auth:`) to ensure domain separation. This prevents a signature meant for some other purpose from being reused to authenticate.

---

### 8) EVM linking and dual identity

The auth service also supports linking an EVM address to a user. The flow is similar to passkey auth but uses Ethereum `personal_sign`:

- The server builds a structured message containing origin, address, chainId, userId, and nonce (challenge).
- The client signs it with their wallet.
- The server verifies the signature and stores the link in Convex.

This keeps the EVM identity separate from the Ed25519 public key, but tied to the same user account. It is a multi-identity system with a single auth backend.

---

### 9) Rate limiting is per-IP and per endpoint

The auth service uses a simple in-memory rate limiter keyed by IP address. Different endpoints have different limits:

- Challenge: higher throughput
- Profile: moderate
- Billing: lower
- AI: very low

The rate limiter uses a bucket with a reset time. When the bucket is full, the server returns `429` and includes a `Retry-After` header.

This is intentionally simple and not perfectly distributed. It is good enough for a single-instance auth service. If you scale horizontally, you should replace this with a shared rate limiter (Redis, Cloudflare, etc.).

---

### 10) Metrics and observability gates

Metrics endpoints (`/metrics`, `/metrics/prometheus`) are protected by a token. In production, `AUTH_REQUIRE_METRICS_AUTH` defaults to true, so the token is required. This prevents leaking operational data.

The auth service records counters and timing samples for key operations. This is not just for dashboards: it also helps debug issues like challenge creation spikes, failed syncs, or slow Convex mutations.

---

### 11) Convex as the state store for auth

Convex stores:

- auth challenges
- users
- entitlements
- EVM links

The auth service uses `ConvexHttpClient` with a service token for server-side operations. This is a privileged channel. It means the auth service effectively *owns* the integrity of user records. If the service token is compromised, the attacker can mutate user data.

This is why the service token is required at startup and should be treated as a secret of equal sensitivity to the admin key.

---

### 12) The freeroll sync as a cross-system bridge

The `/profile` endpoint fetches user entitlements from Convex and then calls `syncFreerollLimit`. This is a cross-system bridge: off-chain entitlements get translated into on-chain limits.

The flow is:

1) Read entitlements from Convex.
2) Determine desired daily limit.
3) Fetch player state from the chain.
4) If limit differs, submit admin transaction.

This is a hybrid system: entitlement rules are off-chain, enforcement is on-chain. The auth service is the glue.

---

### 13) Admin key resolution and security posture

The admin key can be loaded from:

- a secret URL (preferred),
- a file path,
- an environment variable (only in non-prod or when explicitly allowed).

This is a deliberate security posture: in production, secrets should not live in environment variables. The code enforces that by warning and ignoring the env key unless explicitly allowed.

If no valid key is found, `syncFreerollLimit` returns `admin_unconfigured` instead of attempting any on-chain changes.

---

### 14) WASM as a transaction builder

The auth service loads the `nullspace_wasm` module to build and encode transactions. This avoids having to reimplement encoding logic in JS. It also ensures that admin transactions use the same encoding rules as the rest of the system.

Key functions in the WASM interface:

- `Signer.from_bytes`: builds a signer from the admin private key.
- `Transaction.casino_set_tournament_limit`: builds a signed transaction.
- `wrap_transaction_submission`: wraps the transaction for `/submit` endpoint.
- `encode_*_key` and `decode_lookup`: allow state queries.

This is essentially a lightweight SDK embedded in the auth service.

---

### 15) Querying state via hashed keys

`queryState` hashes the key bytes and then calls `/state/<hash>`. The response is decoded via the WASM module. This mirrors how the chain’s state is exposed: the API expects hashed keys, not raw keys.

This design means the auth service does not need to know the internal hashing rules. It delegates that to the WASM module, which stays in sync with the Rust implementation.

---

### 16) Nonce reservation with Convex

Admin transactions must have correct nonces. The auth service uses `reserveNonce`, which tries to reserve a nonce in Convex by calling `api.admin.reserveAdminNonce`. This allows multiple concurrent admin operations to coordinate without collisions.

If the Convex store is unavailable, the service falls back to a local `nextNonce` cache. This is less safe but keeps the system functional in degraded mode.

This two-tier design (Convex-backed + local fallback) is a classic availability vs consistency tradeoff. In normal operation, use shared storage; in failure, fall back to local cache.

---

### 17) Resetting the nonce store on failure

If submission fails, the auth service calls `resetNonceStore`, which:

- resets the local `nextNonce` to undefined, and
- updates the Convex nonce store to the on-chain nonce.

This is crucial. Without reset, the nonce store could drift and cause repeated failures. The reset is an explicit reconciliation step that re-syncs all layers to the chain’s truth.

---

### 18) Admin queue: serializing privileged actions

`enqueueAdmin` is a simple promise-based queue. It guarantees that admin tasks execute sequentially, even if multiple requests hit the auth service at once. This prevents concurrent nonce allocation and simplifies reasoning.

This is the same pattern as a mutex, but implemented with promise chaining. It is lightweight and effective for low-throughput admin actions.

---

### 19) Entitlement mapping to on-chain limits

The daily limit is computed from entitlements:

- If the user has an active entitlement in an allowed tier, use `FREEROLL_DAILY_LIMIT_MEMBER`.
- Otherwise use `FREEROLL_DAILY_LIMIT_FREE`.

Both values are parsed and clamped to <= 255. This clamp is intentional: on-chain limits are stored in a u8‑sized field (or effectively capped). The auth service enforces the same limit to prevent invalid transactions.

---

### 20) Validation of player existence

Before submitting a limit update, the service fetches the player state from chain. If the player does not exist, it returns `player_not_found`.

This prevents the system from creating a limit for a non-existent player. It also acts as a sanity check: if the player isn’t registered, the entitlement sync should not run.

---

### 21) Audit logging

The admin sync logs a series of audit events:

- no change
- submit
- submitted
- failed

These logs include player public key and admin public key. This provides an audit trail for admin operations, which is important for compliance and debugging.

---

### 22) Error handling philosophy

Most errors in the auth service are handled gracefully:

- If Convex is down, it logs and falls back.
- If admin config is missing, it returns `admin_unconfigured` rather than crashing.
- If a sync fails during `/profile`, it logs but still returns profile data.

This reflects a **best-effort** philosophy: authentication should not be blocked by optional features like admin sync. The main auth flow should continue even if admin operations fail.

---

### 23) Operational risk: single point of admin control

The auth service holds the admin key and is therefore a single point of control. If the service is compromised, an attacker could submit admin transactions. If it is down, admin updates cannot be applied.

This is a conscious design tradeoff. For early-stage systems, central admin control is acceptable. For later-stage decentralization, you may want to move admin operations into a dedicated, hardened service or multi-sig validator set.

---

### 24) Feynman analogy: a bank teller and a vault

Think of the auth service as a bank teller. The teller verifies your identity (auth) and can also make privileged changes (admin updates), but only by accessing the vault (admin key). The teller keeps a log of every vault access. If the teller is unavailable, normal account inquiries still work, but vault operations cannot proceed.

This analogy emphasizes the dual role: identity verification and privileged operations in one service.

---

### 25) Exercises for mastery

1) Walk through a full login flow and identify where challenges are created, consumed, and validated.
2) Explain how the service prevents replay attacks for both Ed25519 and EVM signatures.
3) Describe the nonce reservation flow and what happens if Convex is down.
4) Propose a strategy to remove the admin key from the auth service while still syncing freeroll limits.

If you can answer these, you understand the auth + admin system deeply.


## Addendum: edge cases and production hardening

### 26) Challenge TTL caps

The auth service enforces both a configured TTL and a max TTL. This prevents misconfiguration from accidentally allowing very long-lived challenges. A long TTL would expand the replay window, so the cap (`AUTH_CHALLENGE_TTL_MAX_MS`) is a guardrail.

### 27) Mobile endpoints and relaxed origin checks

Mobile endpoints bypass the origin allowlist and instead rely on the `AUTH_MOBILE_ENABLED` flag. This is a controlled exception: mobile clients do not send browser Origin headers. The separate `mobileEnabled` gate ensures these endpoints can be disabled if they become a security risk.

### 28) AI endpoint isolation

The `/ai/strategy` endpoint is gated by auth and a separate rate limit, and it can be globally disabled. This is important because it potentially calls external AI services and could become a cost or abuse vector. The code caps payload sizes (game type, cards, history) before building the prompt. This keeps inputs bounded and helps prevent prompt injection or oversized requests.

### 29) Observability and audit trails

The auth service emits structured logs for audit events (e.g., freeroll sync). This is an intentional design: admin actions should always leave a trace. In production, you should pipe these logs into a SIEM or audit store.


### 30) Trust proxy and IP-based rate limits

The server sets `trust proxy` to true so it can read the correct client IP from proxy headers. This matters because the rate limiter keys by IP. In misconfigured proxy setups, all requests might appear to come from the proxy itself, collapsing rate limits and either over-blocking or under-protecting. Ensure your reverse proxy forwards `X-Forwarded-For` correctly.


## Key takeaways
- The auth service enforces origin allowlists and metrics auth.
- Admin transactions are built in WASM and submitted to the chain.
- Freeroll limits are synced by reading player state and issuing admin updates.

## Next lesson
L29 - Convex admin nonce store: `feynman/lessons/L29-convex-admin-nonce-store.md`
