# L35 - Stripe webhook ingress (from scratch)

Focus file: `website/convex/http.ts`

Goal: explain how Stripe webhooks enter the system, how rate limits are enforced, and how payloads are handed off to Convex actions. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) What a webhook is
A webhook is an HTTP callback sent by another service (Stripe). Stripe calls our `/stripe/webhook` endpoint whenever a billing event happens. We must verify that the request is authentic and process it quickly.

### 2) Why we rate limit webhooks
Even legitimate services can retry aggressively. Rate limits protect the service from floods, misconfigurations, or abuse. Here we use an in-memory bucket per IP address.

### 3) Convex HTTP actions
Convex has a special HTTP router. It lets you expose routes that run inside Convex, then forward work to internal actions or mutations.

---

## Limits & management callouts (important)

1) **Rate limit window defaults to 60 seconds**
- `STRIPE_WEBHOOK_RATE_LIMIT_WINDOW_MS` default is 60,000 ms.
- At most `STRIPE_WEBHOOK_RATE_LIMIT_MAX` events per window (default 120).
- This is reasonable for small deployments but may be too low at high volume.

2) **Bucket memory cap defaults to 10,000 IPs**
- `STRIPE_WEBHOOK_RATE_LIMIT_BUCKET_MAX` prevents unbounded memory growth.
- If too low, legitimate bursts from many IPs may be evicted.

3) **Rate limiting is per instance only**
- Buckets live in memory, so limits reset if the instance restarts.
- In a multi-instance deployment, each instance has its own counters.

---

## Walkthrough with code excerpts

### 1) Parsing integer env values safely
```rust
const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};
```

Why this matters:
- This prevents bad env values from crashing the service or disabling rate limits.

What this code does:
- Attempts to parse a string into a positive integer.
- Falls back to a safe default if parsing fails.

---

### 2) Rate limit configuration
```rust
const RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RATE_LIMIT_WINDOW_MS,
  60_000,
);
const RATE_LIMIT_MAX = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RATE_LIMIT_MAX,
  120,
);
const RATE_LIMIT_BUCKET_MAX = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RATE_LIMIT_BUCKET_MAX,
  10_000,
);
const RATE_LIMIT_CLEANUP_MS = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RATE_LIMIT_CLEANUP_MS,
  300_000,
);
```

Why this matters:
- These values control how many Stripe events we can handle before throttling.

What this code does:
- Reads configurable limits from env, with safe defaults.
- Ensures everything is positive and integer.

---

### 3) Bucket cleanup logic
```rust
const cleanupRateBuckets = (now: number) => {
  if (rateBuckets.size === 0) return;
  if (now - lastRateLimitCleanup < RATE_LIMIT_CLEANUP_MS && rateBuckets.size <= RATE_LIMIT_BUCKET_MAX) {
    return;
  }
  lastRateLimitCleanup = now;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt) {
      rateBuckets.delete(key);
    }
  }
  if (rateBuckets.size > RATE_LIMIT_BUCKET_MAX) {
    const toRemove = rateBuckets.size - RATE_LIMIT_BUCKET_MAX;
    let removed = 0;
    for (const key of rateBuckets.keys()) {
      rateBuckets.delete(key);
      removed += 1;
      if (removed >= toRemove) break;
    }
  }
};
```

Why this matters:
- Without cleanup, the in-memory bucket map would grow forever.

Syntax notes:
- `rateBuckets` is a `Map<string, RateLimitBucket>` keyed by IP.
- `.entries()` returns `[key, value]` pairs you can iterate.

What this code does:
- Periodically removes expired buckets.
- If the map grows beyond the max size, it evicts the oldest entries.

---

### 4) Getting the client IP
```rust
const getRequestIp = (req: Request): string => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
};
```

Why this matters:
- Rate limits are per IP, so we must derive a consistent key.

What this code does:
- Prefers `x-forwarded-for` (common behind proxies).
- Falls back to `x-real-ip`.
- Uses "unknown" if neither is present.

---

### 5) Enforcing the rate limit
```rust
const enforceRateLimit = (key: string): boolean => {
  const now = Date.now();
  cleanupRateBuckets(now);
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return false;
  }
  bucket.count += 1;
  return true;
};
```

Why this matters:
- This logic is the guardrail that blocks abusive traffic.

What this code does:
- Creates or resets a bucket when the window expires.
- Rejects when the count hits the limit.
- Increments the counter for each request.

---

### 6) Stripe webhook route
```rust
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const startedAt = Date.now();
    const requestId = req.headers.get("x-request-id") ?? "unknown";
    const ip = getRequestIp(req);
    if (!enforceRateLimit(`stripe:${ip}`)) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "stripe.webhook.rate_limited",
          requestId,
          ip,
        }),
      );
      return new Response("rate limited", { status: 429 });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "stripe.webhook.missing_signature",
          requestId,
          ip,
        }),
      );
      return new Response("Missing stripe signature", { status: 400 });
    }

    try {
      const payload = await req.arrayBuffer();
      await ctx.runAction(internal.stripe.handleStripeWebhook, {
        signature,
        payload,
      });
      const elapsedMs = Date.now() - startedAt;
      console.info(
        JSON.stringify({
          level: "info",
          message: "stripe.webhook.ok",
          requestId,
          ip,
          elapsedMs,
        }),
      );
      return new Response("ok", { status: 200 });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "stripe.webhook.failed",
          requestId,
          ip,
          elapsedMs,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return new Response("webhook failed", { status: 500 });
    }
  }),
});
```

Why this matters:
- This is the public entrypoint from Stripe into your system.

Syntax notes:
- `httpAction` wraps an async handler so it can run in Convex.
- `ctx.runAction` calls an internal Convex action from inside the HTTP handler.
- `req.arrayBuffer()` reads the raw bytes needed for Stripe signature verification.

What this code does:
- Applies the rate limit and rejects if over limit.
- Requires the Stripe signature header.
- Forwards the raw payload and signature to the internal Stripe handler.
- Logs success or failure with a request ID and timing.

---

## Extended deep dive: Stripe ingress as a high‑trust edge

The `/stripe/webhook` route is the public gateway for Stripe events. In many systems, webhook ingress is a simple handler. Here, it is structured as a small but carefully designed pipeline that balances security, reliability, and operational observability.

---

### 7) Why Stripe webhooks are “high‑trust” inputs

Stripe webhooks are not user-controlled, but they are still *external*. That means:

- You must authenticate them (signature verification).
- You must guard against retries and floods.
- You must process them quickly to avoid Stripe timeouts.

The Convex HTTP route is the boundary where these concerns are enforced before handing off to deeper business logic.

---

### 8) Raw payload handling is non‑negotiable

Stripe signature verification requires the exact raw bytes of the HTTP body. If you parse JSON first, you may alter whitespace or encoding and invalidate the signature. That’s why the handler does:

```
const payload = await req.arrayBuffer();
```

It does *not* call `req.json()` or parse the body. The raw buffer is forwarded to the internal handler, which will perform signature verification.

This is a critical design detail: once raw bytes are consumed or transformed, signature verification becomes unreliable.

---

### 9) Rate limiting by IP: benefits and limits

The ingress rate limiter uses a simple IP‑based bucket. This is useful for:

- shielding against abusive traffic,
- reducing load when Stripe retries aggressively,
- preventing simple denial-of-service attacks.

However, there are limitations:

- If Stripe uses a small set of IPs, bursts could hit the limit even for legitimate traffic.
- If you deploy behind a proxy that doesn’t set `x-forwarded-for`, all requests will share the same “unknown” key.

In other words, IP-based rate limiting is a coarse filter. It is helpful but not perfect. The true security boundary remains the Stripe signature check.

---

### 10) The cleanup strategy for rate buckets

Buckets are stored in memory. The cleanup function removes expired buckets and also enforces a cap on the total number of buckets. This prevents memory growth if many IPs hit the endpoint over time.

The eviction strategy is simple: if the map exceeds the cap, it deletes arbitrary keys until the size is within limits. This is not LRU or time-ordered, but it is sufficient for keeping memory bounded. The goal is not perfect fairness; it is survival under load.

---

### 11) The request ID and observability

The handler reads `x-request-id` if present, and logs structured JSON events with `requestId`, `ip`, and `elapsedMs`. This is crucial because Stripe retries can be hard to debug. With request IDs and timing, you can answer:

- Did we receive the webhook?
- How long did it take?
- Did it fail, and why?

This log format is designed for ingestion into log aggregation systems.

---

### 12) The handoff to internal action

The HTTP handler does not implement Stripe logic directly. Instead it calls:

```
ctx.runAction(internal.stripe.handleStripeWebhook, { signature, payload })
```

This separation of concerns matters:

- The HTTP handler is purely ingress and rate limiting.
- The internal action handles verification, event parsing, and downstream mutations.

This keeps the edge layer thin and reduces the chance of accidentally mixing security logic with business logic.

---

### 13) Error handling and Stripe retry semantics

Stripe retries webhook delivery if it receives a non‑2xx response. That means:

- Returning 200 signals success; Stripe will stop retrying.
- Returning 400 or 500 signals failure; Stripe will retry.

The handler returns 400 for missing signatures (likely invalid requests) and 500 for internal failures. This is correct behavior: invalid requests should not be retried, but transient failures should be.

Be careful: if your internal handler throws for a *permanent* failure (e.g., malformed event), you may cause endless retries. It is important to distinguish permanent vs transient errors in the internal handler.

---

### 14) Security boundary: signature validation occurs downstream

The ingress handler only checks that the `stripe-signature` header exists. It does not validate it. The actual signature verification is done in the internal action (see L36).

This is fine because the edge handler is intentionally minimal. But it means the internal action must be robust and must verify the signature against Stripe’s signing secret. If that check is missing or wrong, the entire pipeline is insecure.

---

### 15) Trusting IP headers: a proxy assumption

`getRequestIp` reads `x-forwarded-for` and `x-real-ip`. These headers are typically set by a proxy (e.g., Cloudflare, NGINX). If your system is not behind a trusted proxy, these headers can be spoofed by clients. That would allow an attacker to evade rate limits.

This is why you should only rely on these headers when they are set by infrastructure you control.

---

### 16) The rate limit key namespace

The rate limit key is `stripe:${ip}`. Namespacing is a subtle but good practice because it prevents conflicts if you add other webhook routes with different limits. It keeps buckets isolated by route category.

---

### 17) Performance characteristics

The ingress handler does very little work:

- rate limit check,
- header check,
- payload read,
- runAction call.

This is intentionally lightweight to keep latency low. Stripe expects fast responses; long processing times can cause retries. By offloading heavy processing to an internal action, the HTTP response remains quick.

---

### 18) Potential improvement: request body size limits

The current handler does not enforce a maximum body size. Stripe payloads are typically small, but in a denial-of-service scenario, a large payload could exhaust memory. A future hardening step would be to reject requests over a certain size.

---

### 19) Potential improvement: per‑event idempotency

Stripe can deliver duplicate events (retries, out‑of‑order). The internal handler should be idempotent, typically by tracking Stripe event IDs. The ingress handler doesn’t do this, but it should log request IDs so duplicates can be traced.

---

### 20) Feynman analogy: the loading dock

Think of the `/stripe/webhook` route as a loading dock at a warehouse:

- It checks that the truck has the right paperwork (signature header exists).
- It checks that too many trucks aren’t arriving at once (rate limit).
- It doesn’t open the boxes or inspect the goods—that happens inside the warehouse (internal action).

The dock’s job is to keep traffic safe and orderly, not to do the full processing.

---

### 21) Exercises for mastery

1) Explain why the raw payload is passed through without JSON parsing.
2) Describe how Stripe retries affect error handling decisions.
3) Identify what could go wrong if `x-forwarded-for` headers are spoofed.
4) Propose a body-size limit and explain how it would protect the system.

If you can answer these, you understand the webhook ingress design deeply.


## Addendum: operational tuning and safety gaps

### 22) Convex HTTP router specifics

Convex exposes HTTP routes via `httpRouter()` and `httpAction()`. This is different from a traditional Express server:

- Each route is defined as a static mapping (path + method + handler).
- The handler runs inside Convex’s environment.
- You cannot rely on Express middleware; everything is explicit.

This simplicity is a feature: it reduces the risk of hidden middleware behavior and keeps the ingress logic explicit and auditable.

---

### 23) Environment-based tuning

The ingress rate limits are controlled by environment variables. These values should be tuned based on expected Stripe volume. For example:

- A small beta might be fine with 120 events per minute per IP.
- A large production system might need thousands per minute.

If you see frequent `stripe.webhook.rate_limited` logs, it likely means your limits are too low or your IP detection is collapsing to "unknown".

---

### 24) Memory footprint of rate buckets

The buckets map grows with the number of distinct IPs. In a typical Stripe setup, traffic comes from a limited set of Stripe IPs, so this map stays small. However, if the endpoint is exposed publicly and abused, many IPs could hit it, filling the bucket map.

The `RATE_LIMIT_BUCKET_MAX` guard prevents unbounded growth. This is a coarse safeguard. A more sophisticated approach would implement LRU eviction or TTL-based pruning only.

---

### 25) Logging strategy and JSON formatting

Logs are formatted as JSON objects with fields like `level`, `message`, `requestId`, and `elapsedMs`. This is intentional: JSON logs are easy to parse and index in log aggregation tools.

It also means you should not use raw console logs with arbitrary text in this handler; keeping logs structured ensures observability remains consistent.

---

### 26) Response bodies and Stripe expectations

Stripe only cares about HTTP status codes, not body contents. The handler still returns small response bodies ("ok", "webhook failed") for human debugging. This is fine, but don’t rely on these bodies for programmatic behavior—they are not part of Stripe’s contract.

---

### 27) Retry storms and backpressure

Stripe retries exponentially if it receives non‑2xx. If your internal handler is down, you may get a retry storm. The rate limiter provides a partial backpressure mechanism, but it may also cause Stripe to give up if too many retries are blocked.

In production, you should ensure the internal handler is highly available, and treat webhook failures as critical incidents.

---

### 28) Testing strategies

Testing webhook ingress typically includes:

- Valid webhook with signature → 200 response.
- Missing signature → 400 response.
- Rate limit exceeded → 429 response.
- Internal handler throws → 500 response.

You can simulate these with a local tool or Stripe’s webhook test CLI. Because signature verification happens downstream, end‑to‑end tests are most valuable.

---

### 29) Forward‑compatibility considerations

If you add additional webhook routes in the future (e.g., for other payment providers), consider:

- separate rate limit namespaces (`provider:${ip}`),
- shared helper functions for IP parsing and bucket cleanup,
- consistent logging format across all webhook ingress endpoints.

Consistency makes ops and debugging much easier.

---

### 30) Feynman exercise

Explain why the webhook handler does not parse JSON and why signature verification is deferred to a deeper handler. Then explain how rate limits protect against retry storms. This exercise connects the security and reliability concerns into one mental model.


### 31) Multi-instance deployment caveat

The rate limiter is per instance. If you run multiple Convex instances or scale horizontally, each instance has its own bucket map. This means the global rate limit is effectively multiplied by the number of instances. That may be acceptable, but it also means you cannot rely on this limiter as a strict global throttle. If strict global throttling is required, you need a shared rate limit store.

### 32) Handling “unknown” IPs

If neither `x-forwarded-for` nor `x-real-ip` is present, the handler uses `unknown` as the IP key. This collapses all such requests into one bucket. If your proxy does not set these headers, legitimate traffic could be rate‑limited prematurely. In production, ensure proxy headers are configured correctly.

### 33) Stripe signature header absence

The handler returns 400 when the `stripe-signature` header is missing. This is important: it prevents the internal handler from seeing unsigned payloads and potentially wasting CPU on invalid requests. Missing signature is treated as a client error, not a server error, which avoids retries.

### 34) Tiny epilogue

Ingress code is short, but it defines the safety of the entire billing pipeline. Treat it like a firewall, not a convenience function.


### 35) Final recap

The webhook ingress is deliberately boring: parse a few headers, rate limit, forward raw bytes, log outcomes. That simplicity is a virtue. Complexity belongs in the internal handler where it can be tested and retried safely.


### 36) Last word

Stripe webhooks are the bloodstream of billing; protect and observe them like production traffic, not just a dev tool.


### 37) Tiny epilogue

Ingress code rarely changes, but when it does, re-run Stripe test webhooks and review logs for regressions.


### 38) Final note

Keep webhook ingress boring and reliable.


## Key takeaways
- Stripe webhooks arrive through Convex HTTP routes.
- Rate limiting protects the service from overload or retries.
- The raw payload is forwarded to the Stripe handler for signature verification.

## Next lesson
L36 - Stripe actions + sessions: `feynman/lessons/L36-convex-stripe-actions.md`
