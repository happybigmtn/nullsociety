# S07 - Observability + production readiness (from scratch, with code walkthroughs)

Focus files: `services/auth/src/server.ts`, `services/ops/src/server.ts`, and supporting runbooks in `docs/`.

Goal: explain how this stack is observed in production: metrics, logs, health checks, rate limits, and operational workflows. We will anchor the concepts in the concrete code and show how the ops service ingests analytics events and produces KPIs.

---

## Learning map

If you want a fast, useful understanding:

1) Read Sections 1 to 4 for the foundations and the parts of this repo that implement them.
2) Read Sections 5 to 8 for metrics, logging, and analytics ingestion.
3) Read Sections 9 to 13 for reliability practices, failure modes, and runbook-level thinking.

If you only read one section, read Section 6 (auth service metrics and logs) and Section 7 (ops analytics ingestion).

---

## 1) Observability is a product feature

A production system is not just code that works. It is code that tells you when it stops working. Observability is how you build that feedback.

The traditional triad is:

- Metrics: numbers that update over time (errors, latency, throughput).
- Logs: structured records of discrete events (requests, errors, audits).
- Traces: end-to-end spans linking requests across services.

This stack uses metrics and logs extensively, and uses analytics events for higher-level business KPIs. Tracing is not yet deeply implemented in code, but you can add it later without changing the core observability patterns.

---

## 2) The ops architecture in this repo

There are two main ops-facing services:

1) **Auth service (`services/auth`)**: exposes metrics endpoints, logs every request with a request ID, and emits analytics events to the ops service.
2) **Ops service (`services/ops`)**: ingests analytics events, stores them in local files, aggregates KPIs, and exposes endpoints for dashboards and admin tools.

There are also operational docs (e.g. runbooks) that describe deployment and monitoring. Those are covered in later lessons, but here we focus on the code that powers visibility.

This is a deliberate design: the auth service is a critical API surface, so it exposes detailed metrics and audit logs; the ops service is a lightweight analytics pipeline that does not require a heavy data warehouse to get useful signals.

---

## 3) Health checks: the simplest reliability tool

A health check answers the question: "is this service alive enough to receive traffic?"

In this repo:

- `services/auth/src/server.ts` exposes `GET /healthz` returning `{ ok: true }`.
- `services/ops/src/server.ts` exposes the same `GET /healthz`.

These are intentionally cheap. They do not call downstream dependencies or do long-running checks. That is the correct default: a health check should be fast, predictable, and avoid cascading failures.

If you need deeper readiness checks (for example, "can reach Convex" or "can reach Stripe"), those belong in separate endpoints or internal monitoring, not in the primary health check used by load balancers.

---

## 4) Metrics vs analytics: two layers of visibility

It is easy to confuse metrics with analytics. In this stack, they serve different purposes:

- **Metrics** are operational. They answer: "Is the service healthy?" Example: request latency.
- **Analytics** are product or business signals. They answer: "Are users converting?" Example: billing events.

The auth service handles both:

- It tracks metrics locally (counters and timings) and exposes them via `/metrics` and `/metrics/prometheus`.
- It also sends analytics events to the ops service using `sendOpsEvent`.

The ops service handles analytics:

- It stores events as NDJSON in a local directory.
- It computes KPIs on demand (`/analytics/kpis`).

Keeping these layers separate prevents operational metrics from being polluted with product data, and vice versa.

---

## 5) Request IDs and structured logging

A request ID ties a log line to a specific request. In `services/auth/src/server.ts`, every request gets a `x-request-id` header. The logic is:

- If the client provides `x-request-id`, we reuse it.
- Otherwise, we generate a new UUID.
- We set this ID in the response header for correlation.

Then on `res.finish`, the code logs a JSON line containing:

- requestId
- method
- path
- status
- durationMs

This is critical. It means you can search logs for a request ID and see the exact trace of what happened. It also makes log aggregation much easier because every log line is structured JSON.

The logging helper `logJson` ensures every log line is machine-readable. In production, structured logs are a huge advantage: they can be parsed, searched, and aggregated automatically by log systems.

---

## 6) Metrics in the auth service

The auth service implements a simple in-memory metrics system. This is not Prometheus client instrumentation, but it is compatible with Prometheus by exposing a text endpoint.

### 6.1 Counters and timings

Two maps are used:

- `counters`: a map of counter names to values.
- `timings`: a map of timing names to aggregates (count, total, max).

The helper functions:

- `inc(name)`: increments a counter.
- `observe(name, ms)`: records a duration sample.

These functions are called in request logging and in specific endpoints (billing, profile, etc.). That means you can track not just HTTP volume, but also success/failure breakdowns for key actions.

### 6.2 `/metrics` and `/metrics/prometheus`

The auth service exposes two metrics formats:

- `/metrics`: JSON format (easy for debugging).
- `/metrics/prometheus`: Prometheus exposition format.

The Prometheus endpoint includes counters like:

- `nullspace_auth_counter_total{key="http.requests"}`
- `nullspace_auth_counter_total{key="billing.checkout.success"}`

And timing gauges like:

- `nullspace_auth_timing_avg_ms{key="http.request_ms"}`

This is enough to build dashboards for throughput and latency. It is also enough to trigger alerts on error rates.

### 6.3 Metrics authentication

In production, metrics should not be public. The auth service enforces this with `METRICS_AUTH_TOKEN` and a `requireMetricsAuth` middleware.

The middleware checks:

- `Authorization: Bearer <token>`
- or `x-metrics-token` header.

If no valid token is present, it returns 401.

This is an important security practice: metrics can leak internal structure, and they should not be available to the public internet.

---

## 7) Analytics ingestion in the ops service

The ops service is a lightweight analytics pipeline. It accepts events, stores them in a file system, and computes KPIs.

### 7.1 `/analytics/events`: ingest events

This endpoint accepts events in three shapes:

- An array of events.
- An object with `events` array.
- A single event object.

Each event is normalized, assigned an ID, and augmented with metadata (timestamp, actor info, source info). The code then calls `ingestEvents`, which:

- Groups events by day and appends them to `data/ops/events/YYYY-MM-DD.ndjson`.
- Updates an actors store (`actors.json`) with first/last seen, event counts.
- Updates league and referral aggregates.

The storage format is NDJSON (one JSON record per line). This format is simple, append-only, and easy to parse later.

### 7.2 Event normalization and actor identity

The ops service normalizes each event before storage. It fills defaults like:

- `ts` (timestamp)
- `actor` (publicKey, deviceId, platform)
- `source` (app, surface, version)
- `session` (session id)

It also computes an internal `actorId` by combining available identifiers. This lets the KPI logic count unique users even if some events are missing optional fields. The normalization step is a quiet but critical part of reliability: it makes your analytics resilient to inconsistent clients.

### 7.3 Actors store and lifecycle tracking

After normalizing events, the ops service updates an `actors.json` store. This store contains:

- First seen timestamp
- Last seen timestamp
- Total events
- Last event name

This gives you a lightweight \"user registry\" without a database. It is also used when computing retention metrics. The advantage is simplicity; the tradeoff is that it is file-based and needs durable storage.

### 7.4 Event ingestion limits

The ingest endpoint caps the number of events processed per request (it slices to a fixed maximum). This is a protective measure. It prevents a single request from overwhelming the service and also makes ingestion more predictable. In production, you should keep this limit low enough to protect the service but high enough to avoid excessive request overhead.

### 7.5 Data directories and safety

The ops service resolves a `DATA_DIR` based on env or defaults, then ensures subdirectories exist:

- `events`
- `league`
- `league-season`
- `economy`

When writing JSON, it uses a safe pattern:

- Write to a `.tmp` file.
- Rename to the final path.

This reduces the risk of corrupted files if the process crashes mid-write. This is a small but meaningful production hardening detail.

### 7.6 `/analytics/kpis`: compute KPIs

The ops service can compute KPIs on demand by reading the NDJSON files for a date range. It calculates:

- DAU, WAU, MAU
- New users and retention (D7, D30)
- Conversion rate
- Revenue (from billing events)
- Event counts by name

This is deliberately simple, but it is powerful. You can run analytics without a full data warehouse.

The tradeoff is that KPI computation reads files from disk and can be slow for large ranges. That is acceptable for early-stage operations but might require optimization or offloading in larger scale deployments.

---

## 8) Rate limiting: protecting critical endpoints

The auth service includes a built-in rate limiter. It uses an in-memory map of buckets keyed by IP and endpoint category.

The limiter supports separate buckets for:

- challenge requests
- profile requests
- billing requests
- AI strategy requests

Each bucket is defined by:

- `windowMs`: time window
- `max`: maximum requests per window

If a client exceeds the limit, it receives `429` with a `Retry-After` header. This is a basic but effective shield against brute-force abuse.

Because the rate limiter is in-memory, it is per-instance. In a multi-instance deployment, each instance enforces its own limits. That is fine for basic protection, but for advanced rate limiting you would want a shared store (Redis, etc.).

### 8.1 Rate bucket cleanup and memory safety

The rate limiter includes a cleanup routine that:

- Removes expired buckets.
- Caps total bucket count to a maximum.

Without cleanup, the bucket map could grow unbounded and become a memory leak. This is a good example of operational thinking embedded in code: a small feature (rate limiting) also needs lifecycle management to be safe in production.

---

## 9) Audit logs and operational signals

In addition to metrics, the auth service logs audit events for billing actions and admin-triggered workflows.

Examples:

- `audit.billing.checkout`
- `audit.billing.portal`
- `audit.admin.freeroll_sync`

These logs include the request ID and relevant fields. This allows you to trace business-critical operations in production and answer questions like:

- Who triggered a billing session?
- Did a freeroll limit update succeed?
- Which public key was involved?

Audit logs are not just for debugging. They are also part of compliance and trust. The code already uses JSON logs, which is the correct format for auditing.

### 9.1 Audit event taxonomy

The auth service distinguishes between normal request logs and audit logs. Audit logs explicitly use prefixes like `audit.billing.*` and include domain-specific fields (public keys, tiers, limits). This makes them searchable and allows you to build dashboards based on audit activity.

If you add new privileged operations, follow the same pattern: emit a structured audit log with a stable prefix. This consistency is what turns raw logs into operational knowledge.

---

## 10) The ops service as a product analytics layer

The ops service is not only for engineers. It can power product dashboards. Endpoints include:

- `/analytics/kpis`: aggregated metrics.
- `/economy/snapshot`: economy state snapshot.
- `/league/leaderboard`: leaderboard aggregation.
- `/referrals/*`: referral tracking and claims.
- `/push/*`: push notification registration and sending.

This shows that operations is not just "infrastructure". It is also a product signal hub. The events ingested here influence business metrics, community features, and user engagement flows.

This dual role is common in early-stage systems: one lightweight service can serve both ops and product analytics needs.

### 10.1 File-based analytics: tradeoffs and scaling

Using NDJSON files is intentionally simple. It has benefits:

- No database dependency.
- Easy to back up and inspect.
- Works offline and in small deployments.

It also has limitations:

- Query time grows with data size.
- Concurrent writes can be tricky without careful coordination.
- Retention policies are manual (you must delete or archive files).

If the system grows, you can replace this with a database or a streaming analytics pipeline. The important part is that the event schema and ingestion flow remain stable, so you can migrate without breaking clients.

---

## 11) Security controls in ops

The ops service enforces security in two ways:

1) **Origin checks** via CORS. It validates `Origin` headers against `OPS_ALLOWED_ORIGINS` when required.
2) **Admin tokens** for privileged endpoints. The `requireAdmin` middleware checks `Authorization` bearer token or `x-admin-token` header.

This is critical because ops endpoints can mutate or expose sensitive data. For example, `/push/send` should not be callable by untrusted clients.

The code defaults to stricter behavior in production: if you run with `NODE_ENV=production`, it requires admin tokens and allowed origins by default. This is a good production safety posture.

---

## 12) Production readiness: configuration discipline

Production readiness is mostly about configuration hygiene. The code demonstrates several best practices:

- Fail fast if critical env vars are missing (e.g., `AUTH_ALLOWED_ORIGINS`, `STRIPE_PRICE_TIERS`).
- Use explicit allowlists for origins and price IDs.
- Limit batch sizes and rate limit windows to safe caps.
- Separate dev convenience from production settings (e.g., `ALLOW_INSECURE_ADMIN_KEY_ENV`).

These checks are protective. It is better to fail a deploy than to run in an insecure or partially configured state.

For deployment, you should treat the env as part of your code. Version the env template and keep it in sync with your production configuration.

### 12.1 Configuration defaults and safety caps

Many values are intentionally capped in code:

- Rate bucket max count.
- Reconcile batch sizes.
- Entitlements max counts.

These caps serve as safety valves. Even if an environment variable is misconfigured (for example, set to 10 million), the code clamps it to a reasonable upper bound. This is defensive programming for production environments.

---

## 13) Failure modes and how to detect them

### 13.1 Auth service degraded

Symptoms:

- `/healthz` returns 200 but `/auth/challenge` or `/profile` is slow or erroring.
- Metrics show rising `http.request_ms` and error counters.

Response:

- Inspect logs for request IDs with high latency.
- Check Convex availability (auth depends on Convex).
- Check rate limiter and possible bursts.

### 13.2 Ops analytics backlog

Symptoms:

- KPI endpoint slow or timing out.
- Large NDJSON files growing without rotation.

Response:

- Narrow the KPI range or add caching.
- Consider archiving old event files.
- Increase disk capacity or move analytics to a database.

### 13.3 Missing ops events

Symptoms:

- KPI dashboards show zero events.
- Billing conversions appear to be zero even though Stripe shows activity.

Response:

- Verify `OPS_ANALYTICS_URL` is set in the auth service.
- Check network connectivity between auth and ops.
- Inspect auth logs for failures in `sendOpsEvent`.

The `sendOpsEvent` helper intentionally ignores errors to avoid breaking auth flows. That means ops failures are silent by default. If analytics is critical, you may want to add optional error logging or a retry mechanism.

### 13.4 Log noise and sampling

Logging every request is useful, but it can become noisy at high traffic. The current code logs every request, which is fine at moderate scale. At higher scale, you may want to:

- Sample successful requests.
- Keep error logs at full fidelity.
- Route logs to a system that supports querying by request ID.

This is a tradeoff between visibility and cost. The right balance depends on traffic volume and operational budget.

### 13.5 Billing issues not visible

Symptoms:

- Users complain about billing but metrics show no errors.

Response:

- Ensure billing metrics are tracked (checkout success/failure).
- Verify Stripe webhooks are arriving (audit logs).
- Run reconcile for affected users.

---

## 14) SLOs, alerts, and error budgets

A production system needs explicit targets. A good starting point:

- Auth API availability: 99.9% (or 43 minutes of downtime per month).
- P95 latency for `/auth/challenge`: under 200ms.
- Billing checkout error rate: under 1%.

Alerts should be built on metrics, not on raw logs. For example:

- Alert if `billing.checkout.failure` increases beyond a threshold.
- Alert if `http.request_ms` average exceeds a threshold.
- Alert if `/healthz` fails from multiple regions.

Error budgets are the difference between 100% and your target. If you burn too much error budget, you slow down feature development and focus on stability. This is how you keep reliability a first-class product requirement.

### 14.1 On-call runbook thinking

Metrics and logs only matter if someone responds. A minimal runbook should answer:

- Who is on call?
- What dashboards and logs should they check first?
- Which services are critical and which can be degraded?
- What actions are safe to take without coordination?

In this stack, the auth service is a primary dependency for users (login, billing, profile), and the ops service is secondary (analytics). That means an auth outage is a paging event, while an ops outage can often be handled during business hours.

---

## 15) The minimal ops checklist before production

Before you ship:

1) Metrics endpoints are protected and scraped.
2) Health checks are wired to load balancers.
3) Request ID logging is enabled and stored.
4) Rate limits are configured.
5) Auth allowed origins are correct.
6) Stripe secrets and webhook secrets are set.
7) Ops service data directory has durable storage.
8) Alerts are configured for core endpoints.

This list is boring, but if you skip any part of it, you will eventually regret it.

### 15.1 Scaling considerations

When traffic grows, the first pain points are usually:

- In-memory rate limiting not shared across instances.
- File-based analytics becoming slow.
- Metrics endpoints being scraped too frequently.

Scaling strategies:

- Move rate limits to a shared store.
- Offload analytics to a database or streaming pipeline.
- Add caching to KPI responses.

Even if you do not implement these today, it is helpful to know where the bottlenecks will appear.

### 15.2 Data retention and backups

The ops service stores data in files. That means you need a retention plan:

- How long do you keep raw event files?
- When do you archive or delete them?
- Are backups stored off the same machine?

Without a plan, disk usage will grow until it becomes a production incident. A simple cron job to archive old files can prevent this.

---

## 16) Feynman recap: explain it like I am five

- Metrics tell you how healthy your services are.
- Logs tell you what happened and why.
- Health checks tell the load balancer whether to send traffic.
- The ops service collects events and turns them into KPIs.
- Security checks keep metrics and ops endpoints private.

---

## 17) Exercises (to build mastery)

1) Find where the auth service increments `http.requests` and `http.request_ms`. Explain how these values appear in `/metrics/prometheus`.

2) Trace an analytics event from `sendOpsEvent` in the auth service to the ops service `events` directory.

3) Inspect `services/ops/src/server.ts` and explain why it writes JSON via a temporary file.

4) Propose an alert rule for billing checkout failures based on the counters in `/metrics`.

---

## End of primers

You can now return to the main curriculum or dive into specific services.
