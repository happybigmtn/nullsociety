# L47 - Simulator HTTP API + rate limits (from scratch)

Focus files: `simulator/src/api/mod.rs`, `simulator/src/api/http.rs`

Goal: explain how the simulator exposes HTTP/WS endpoints, enforces origins, and applies rate limits. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) API router
The simulator is the public HTTP/WS surface for submissions, queries, and updates. It uses Axum to build a router.

### 2) CORS vs origin enforcement
CORS headers are for browsers, but the simulator also enforces an origin allowlist at the middleware layer.

### 3) Rate limits
There is a global HTTP rate limit and a stricter submit-specific rate limit. Both are configurable by env.

### 4) Metrics auth
Metrics endpoints can be protected with a bearer token so only trusted clients can read them.

---

## Limits & management callouts (important)

1) **ALLOWED_HTTP_ORIGINS empty rejects browsers**
- The router warns when `ALLOWED_HTTP_ORIGINS` is empty.
- If you forget to configure it, browser calls will be rejected.

2) **Submit rate limits are per-minute and separate**
- `RATE_LIMIT_SUBMIT_PER_MIN` and `RATE_LIMIT_SUBMIT_BURST` control /submit.
- This prevents mempool abuse without throttling read queries.

3) **Body size limits are enforced**
- `http_body_limit_bytes` can reject oversized payloads.
- This prevents large body DoS.

---

## Router anatomy (deep dive)

The simulator API is split into two modules: `api/mod.rs` builds the Axum
router and middleware stack, and `api/http.rs` implements the handlers.
Understanding the router is critical because it shows the surface area and
the security posture.

### 1) Core HTTP endpoints
The router registers a fixed set of endpoints:

- `/healthz` and `/config` for basic health and config introspection.
- `/submit` for transaction submissions.
- `/state/:query` and `/seed/:query` for read queries.
- `/presence/global-table` for gateway presence updates.
- `/metrics/*` for internal visibility.
- `/explorer/*` for explorer reads (blocks, tx, account, games).

This list is the public API surface. Anything not in this list is not exposed.

### 2) Optional passkey endpoints
When compiled with the `passkeys` feature, the router adds:

- `/webauthn/challenge`
- `/webauthn/register`
- `/webauthn/login`
- `/webauthn/sign`

The feature gate is a deliberate safety decision: if you do not enable the
feature, the endpoints do not exist, which is stronger than simply disabling
them at runtime.

### 3) WebSocket endpoints
The router also exposes two WebSocket endpoints:

- `/updates/:filter` for real time state updates.
- `/mempool` for mempool updates.

Both rely on the same origin validation rules as HTTP, but with separate
environment variables (`ALLOWED_WS_ORIGINS` and `ALLOW_WS_NO_ORIGIN`).

---

## CORS vs origin enforcement (why both)

CORS is a browser side enforcement mechanism. It is not an access control
system. That is why the simulator implements explicit origin enforcement:

1) CORS headers are configured in the middleware.
2) A separate middleware checks the Origin header on every request.

If the Origin header is missing and `ALLOW_HTTP_NO_ORIGIN` is not set, the
request is rejected with `403`. This blocks browser requests from unknown
origins and also blocks non browser requests unless explicitly allowed.

This is a deliberate defense in depth. CORS alone would still allow a curl
request from anywhere. The origin middleware does not.

---

## Rate limiting in detail

### 1) Global HTTP rate limit
The global limiter uses `tower_governor` with `SmartIpKeyExtractor`. This
means rate limiting is per client IP. The config is derived from:

- `RATE_LIMIT_HTTP_PER_SEC` (or config default)
- `RATE_LIMIT_HTTP_BURST` (or config default)

The limiter is applied to the entire router (after the origin middleware).

### 2) Submit specific rate limit
`/submit` uses a separate limiter defined in terms of per minute rate:

- `RATE_LIMIT_SUBMIT_PER_MIN`
- `RATE_LIMIT_SUBMIT_BURST`

This limiter is attached only to the `/submit` route. The logic converts
per minute to a per request period in nanoseconds. It also logs when the
submit limiter is configured so operators can confirm it is active.

### 3) Why split them?
Reads should be cheap and fast. Writes are expensive and can spam the mempool.
By separating the limits, you can allow heavy read traffic while still
protecting the write path.

---

## Request ID and observability (deep dive)

The request ID middleware does four things:

1) Accepts an `x-request-id` header if provided.
2) Generates a UUID if not provided.
3) Tracks the latency of the request.
4) Emits metrics for common rejection paths (origin, rate limit, body size).

It also injects the `x-request-id` header into every response so clients can
correlate a request with a log line. This is not cosmetic. It is how you debug
large systems without a debugger.

The middleware also logs a structured line with:

- request id
- method
- path
- status
- elapsed time

That is a minimal tracing footprint, but it is enough to reconstruct the
traffic profile when something goes wrong.

---

## Submit pipeline (deep dive)

The `/submit` endpoint is the write path. It accepts a binary `Submission`
payload and attempts to apply it to the simulator state.

### 1) Decode path
The handler calls `Submission::decode`. If decode fails, it logs a short hex
preview and then tries to decode the individual summary stages to generate a
more actionable error log. That helper attempts to decode:

- `Progress`
- an aggregation `Certificate`
- a state proof and its ops
- an events proof and its ops

If any stage fails, the logs include where the decode failed. This is a major
operational improvement: you can find whether a bad submission is malformed,
truncated, or just using the wrong limits.

### 2) Apply path
If decode succeeds, the handler calls `apply_submission`. On success, it:

- publishes the submission bytes to updates (for WebSocket subscribers)
- returns `200 OK`

On failure, it returns `400 BAD REQUEST`.

### 3) Metrics
The submit handler records latency in `http_metrics.submit`, which feeds both
JSON metrics and Prometheus output. The submit path is a critical bottleneck,
so this is the metric you should alert on first.

---

## Query endpoints (deep dive)

### 1) /state/:query
This endpoint decodes the path as hex, then decodes it as a `Digest` key. If
the key is valid, it queries the simulator state store. The response is:

- `200` with encoded `Value` if present
- `404` if the key is missing
- `400` if the hex or decode is invalid

### 2) /seed/:query
This endpoint decodes the path as hex, then decodes a `Query`. It returns:

- `200` with encoded seed if present
- `404` if the seed is missing
- `400` if the query is invalid

Both endpoints are pure reads and subject to the global rate limiter only.

---

## Presence updates (global table support)

`/presence/global-table` is used by gateways to report how many players are
currently connected to that gateway. The handler:

1) Validates a shared secret via `x-presence-token` if configured.
2) Validates that `gateway_id` is non empty.
3) Stores a snapshot with a TTL (default 15 seconds).

The response includes total players, gateway count, and the TTL. This allows
the front end to show a global "players online" count without direct gateway
fan out.

---

## Metrics endpoints (auth and formats)

All `/metrics/*` endpoints share the same auth behavior:

- If `METRICS_AUTH_TOKEN` is empty, metrics are public.
- If it is set, requests must include `Authorization: Bearer` or
  `x-metrics-token`.

The API exposes both JSON snapshots and Prometheus text format. Prometheus
format is rendered manually by `render_prometheus_metrics`, which formats
histograms and counters into the text exposition standard.

This dual format is intentional: JSON is easy for humans, Prometheus is easy
for machines.

---

## WebSocket details (updates and mempool)

The WebSocket layer has its own origin validation and connection limits.
Important behaviors:

- Origin is checked against `ALLOWED_WS_ORIGINS`.
- If the origin is missing and `ALLOW_WS_NO_ORIGIN` is not set, the request is
  rejected.
- Connection limits are enforced globally and per IP via `WsConnectionGuard`.

For `/updates/:filter`, the filter is a hex encoded `UpdatesFilter` that is
decoded on connect. That filter controls which updates are delivered.

The server uses a bounded outbound channel and a send timeout. If a client is
slow or unresponsive, the connection is closed and metrics are updated to
record lag or send errors.

---

## Config precedence and env overrides

The router uses a clear precedence rule: environment variables override the
compiled config values. This is visible in code where each rate limit reads
`parse_env_*` first and falls back to `simulator.config.*` if the env is empty.

This lets ops override settings without recompiling or editing config files.
It also means you must be careful when testing: an environment variable can
silently override a config value and make it look like the code is "wrong".

---

## Body size limit and DoS surface

The router applies `DefaultBodyLimit::max(limit)` when
`http_body_limit_bytes` is set. This is critical for the `/submit` endpoint
because submissions are binary blobs that can be large. Without a body limit,
an attacker could send huge payloads and exhaust memory.

The request id middleware explicitly increments a reject counter for
`PAYLOAD_TOO_LARGE`. That means you can graph "body limit rejects" and see if
clients are misconfigured or if you are under attack.

---

## Trace layer and logging

The router attaches `TraceLayer::new_for_http()`. This adds standard request
tracing events that integrate with the tracing subscriber. Combined with the
request id middleware, you get both low level HTTP tracing and high level
application level tracing. This layering is intentional: you want a single
place to look for latency, but you also want to be able to drill down into
application specific context.

If you ever see duplicated logs, check your tracing subscriber config. The
layer is intentionally minimal and should not generate excessive noise on its
own.

---

## WebSocket connection guard (deep dive)

The WebSocket endpoints call `simulator.try_acquire_ws_connection(addr.ip())`
before accepting a connection. This enforces two limits:

- a global cap on total WebSocket connections
- a per IP cap to prevent a single client from exhausting the pool

If either limit is hit, the endpoint returns `429 TOO MANY REQUESTS` with a
human readable message. This is important because WebSocket connections are
long lived and can easily overwhelm a node if unchecked.

The connection guard is returned to the handler and dropped when the socket
closes, so the limit is enforced by RAII rather than explicit bookkeeping.

---

## Update filters and memory safety

The `/updates/:filter` endpoint expects a hex encoded `UpdatesFilter`. This is
decoded and validated before the socket upgrades. If decode fails, the
connection is rejected. This is another example of defensive design: it avoids
creating a WebSocket connection that will never be used.

The update stream uses a bounded outbound channel. If the channel fills or the
send times out, the connection is closed. This prevents unbounded memory usage
for slow clients.

---

## Security posture by endpoint

Not all endpoints are equal. It is useful to think in tiers:

1) **Public safe**: `/healthz`, `/config` (non secret config), `/explorer/*`.
2) **Public but rate limited**: `/submit`, `/state`, `/seed`.
3) **Authenticated**: `/metrics/*` when a metrics token is set.
4) **Guarded by shared secret**: `/presence/global-table` when the presence
   token is set.

This tiering lets you run the simulator with a public read surface while still
protecting write and introspection endpoints.

---

## Health and config endpoints

`/healthz` is intentionally boring: it returns `{ ok: true }`. It is a liveness
probe, not a readiness probe. If you need readiness (for example, "can this
node serve queries?"), you should build that logic at a higher level.

`/config` returns the simulator config struct. This is useful for debugging
and diagnostics, but it is also sensitive: it can reveal rate limits and other
operational settings. That is why it sits in the "public safe" tier only if
you are comfortable exposing it. In production, you may want to gate it behind
network controls even if it is not formally authenticated.

If you are building a status page, prefer to read `/healthz` and a curated
metrics endpoint instead of exposing `/config` broadly. Configuration is useful
for operators but not required for end users.
Treat config as operator facing data, not a public API contract.
If you must expose it, consider scrubbing secrets or proxying through a gateway.
Document this policy in your ops runbook.
It avoids surprises.

---

## Decode errors and operator visibility

The submit path includes a small but important helper:
`log_summary_decode_stages`. It attempts to decode each stage of a submission
and logs exactly where decoding fails.

This is a gift to operators. Without it, a "bad submission" would be a single
opaque error. With it, you can tell if:

- the progress block is missing
- the certificate is malformed
- the state proof is truncated
- the events proof exceeds allowed sizes

That makes it far easier to debug client version mismatches or corrupted
network payloads.

---

## HTTP vs WebSocket origin policy

HTTP and WebSocket origin policies are configured separately:

- HTTP uses `ALLOWED_HTTP_ORIGINS` and `ALLOW_HTTP_NO_ORIGIN`.
- WebSocket uses `ALLOWED_WS_ORIGINS` and `ALLOW_WS_NO_ORIGIN`.

This is intentional because WebSocket connections are long lived and often
used by different clients. You might allow browser origins for HTTP but only
allow internal services for WebSocket, or vice versa. Keep the lists aligned
unless you have a good reason to separate them.

---

## Origin parsing edge cases

Origin allowlists are parsed from comma separated strings. Each origin is
trimmed, and invalid header values are skipped with a warning. That means:

- an empty list rejects all browser origins
- a list with invalid entries silently drops those entries
- a list containing `*` enables any origin

The code also supports `ALLOW_HTTP_NO_ORIGIN` and `ALLOW_WS_NO_ORIGIN` for
non browser clients that do not send an Origin header. This is often required
for internal services and test harnesses.

The warning emitted when `ALLOWED_HTTP_ORIGINS` is empty is a critical
operational signal. If you see it in logs, your browser clients will not be
able to connect.

If you intentionally want to block browsers but allow server to server calls,
leave the allowlist empty and set `ALLOW_HTTP_NO_ORIGIN=1`. That pattern keeps
browser traffic out while letting internal services talk to the simulator.

---

## Prometheus metrics rendering (deep dive)

`render_prometheus_metrics` manually formats counters and histograms. Each
histogram uses a set of bucket counts plus an overflow bucket. The function
computes cumulative counts and a `sum` value derived from the average latency
times count.

This is important because it ensures the Prometheus endpoint matches the
expected exposition format. If you add new metrics, you must remember to
update this renderer; otherwise the metrics will be visible in JSON only.

---

## Walkthrough with code excerpts

### 1) CORS + origin allowlist setup
```rust
let allowed_origins = parse_allowed_origins("ALLOWED_HTTP_ORIGINS");
let allow_any_origin = allowed_origins.contains("*");
let allow_no_origin = parse_allow_no_origin("ALLOW_HTTP_NO_ORIGIN");
if allowed_origins.is_empty() {
    tracing::warn!("ALLOWED_HTTP_ORIGINS is empty; all browser origins will be rejected");
}

let cors = if allow_any_origin {
    CorsLayer::new().allow_origin(AllowOrigin::any())
} else {
    CorsLayer::new().allow_origin(AllowOrigin::list(cors_origins))
}
.allow_methods([Method::GET, Method::POST, Method::OPTIONS])
.allow_headers([
    header::CONTENT_TYPE,
    header::HeaderName::from_static("x-request-id"),
])
.expose_headers([header::HeaderName::from_static("x-request-id")]);
```

Why this matters:
- Browsers will refuse cross-origin calls unless the server explicitly allows them.

What this code does:
- Parses the allowlist from env.
- Builds a CORS layer that allows only those origins (or any origin if `*`).
- Exposes the request ID header for debugging.

---

### 2) Origin enforcement middleware
```rust
async fn enforce_origin(
    config: OriginConfig,
    req: Request,
    next: Next,
) -> axum::response::Response {
    let origin = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok());
    if let Some(origin) = origin {
        if !config.allow_any_origin && !config.allowed_origins.contains(origin) {
            return (StatusCode::FORBIDDEN, "Origin not allowed").into_response();
        }
    } else if !config.allow_no_origin {
        return (StatusCode::FORBIDDEN, "Origin required").into_response();
    }
    next.run(req).await
}
```

Why this matters:
- CORS headers alone do not protect your server from non-browser requests.

What this code does:
- Rejects requests with missing or unapproved Origin headers.
- Allows no-origin requests only when explicitly enabled.

---

### 3) Submit-specific rate limiting
```rust
let submit_governor_conf = match (submit_rate_per_min, submit_rate_burst) {
    (Some(rate_per_minute), Some(burst_size))
        if rate_per_minute > 0 && burst_size > 0 =>
    {
        let nanos_per_request = (60_000_000_000u64 / rate_per_minute).max(1);
        let period = Duration::from_nanos(nanos_per_request);
        let config = GovernorConfigBuilder::default()
            .period(period)
            .burst_size(burst_size)
            .key_extractor(SmartIpKeyExtractor)
            .finish()
            .or_else(default_governor_config);
        config.map(Arc::new)
    }
    _ => None,
};

let submit_route = match submit_governor_conf {
    Some(config) => Router::new()
        .route("/submit", post(http::submit))
        .layer(GovernorLayer { config }),
    None => Router::new().route("/submit", post(http::submit)),
};
```

Why this matters:
- /submit is the hot path and needs stricter protection.

What this code does:
- Builds a rate limiter based on per-minute env values.
- Applies it only to the /submit route.

---

### 4) Request ID middleware + metrics counters
```rust
async fn request_id_middleware(
    AxumState(simulator): AxumState<Arc<Simulator>>,
    req: Request,
    next: Next,
) -> Response {
    let request_id = req
        .headers()
        .get(header::HeaderName::from_static("x-request-id"))
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let start = Instant::now();
    let mut response = next.run(req).await;
    match response.status() {
        StatusCode::FORBIDDEN => simulator.http_metrics().inc_reject_origin(),
        StatusCode::PAYLOAD_TOO_LARGE => simulator.http_metrics().inc_reject_body_limit(),
        StatusCode::TOO_MANY_REQUESTS => simulator.http_metrics().inc_reject_rate_limit(),
        _ => {}
    }
    if let Ok(header_value) = HeaderValue::from_str(&request_id) {
        response.headers_mut().insert(
            header::HeaderName::from_static("x-request-id"),
            header_value,
        );
    }
    tracing::info!(
        request_id = %request_id,
        method = %method,
        path = %path,
        status = response.status().as_u16(),
        elapsed_ms = start.elapsed().as_millis() as u64,
        "http.request"
    );
    response
}
```

Why this matters:
- Request IDs make it possible to trace a single request across logs and services.

What this code does:
- Ensures every request has an `x-request-id` header.
- Records metrics for rejected requests.
- Logs request timing and status.

---

### 5) Metrics auth checks
```rust
fn metrics_auth_error(headers: &HeaderMap) -> Option<StatusCode> {
    let token = std::env::var("METRICS_AUTH_TOKEN").unwrap_or_default();
    if token.is_empty() {
        return None;
    }
    let bearer = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string);
    let header_token = headers
        .get("x-metrics-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if bearer.as_deref() == Some(token.as_str()) || header_token.as_deref() == Some(token.as_str()) {
        None
    } else {
        Some(StatusCode::UNAUTHORIZED)
    }
}
```

Why this matters:
- Metrics endpoints should not be public in production.

What this code does:
- Requires a bearer token or `x-metrics-token` header if the env var is set.
- Returns 401 when unauthorized.

---

## Key takeaways
- The simulator enforces both CORS and strict origin checks.
- Rate limits protect the /submit endpoint from abuse.
- Metrics endpoints can be locked behind a token.

## Next lesson
L48 - Explorer persistence worker: `feynman/lessons/L48-explorer-persistence.md`
