# Remediation Roadmap

## Now (0–2 weeks)
### Epic: Restore build/test pipeline
- **Task:** Fix `nullspace-node` test fixtures to include new config fields.  
  - Scope: `node/src/tests.rs`, any helper builders.  
  - Acceptance: `cargo test --locked --workspace --all-targets` passes locally/CI.  
  - Test plan: Run full workspace tests; smoke-run `dev-executor` + simulator after fix.  
  - Rollout: Merge to main, tag release after CI green.

### Epic: Secret hygiene & rotation
- **Task:** Remove committed secrets and rotate exposed keys.  
  - Scope: `docker/convex/.env`, `configs/local/node*.yaml`, `configs/local/.env.local`, `website/.env.local` if containing real keys.  
  - Acceptance: No real secrets in repo; `.env.example` used instead; secret scanning check added to CI.  
  - Test plan: Verify local bootstrap works using regenerated dev keys; run `quickstart.md` flow.  
  - Rollout: Rotate Convex service token/Stripe keys/validator keys before publishing.

### Epic: Secure simulator surface
- **Task:** Enforce authentication/rate-limits on simulator HTTP/WS.  
  - Scope: `simulator/src/api/mod.rs`, config/env parsing, `quickstart.md` docs.  
  - Acceptance: Requests without valid token/origin rejected; default rate limit >0; integration test proves `/submit` rejects unauthenticated call.  
  - Test plan: Unit tests for origin/auth middleware; load-test with ab/hey to ensure rate limit works.  
  - Rollout: Deploy behind gateway or reverse-proxy with TLS; feature-flag to allow trusted bypass in dev.

### Epic: Gateway hardening
- **Task:** Require authenticated session/bootstrap for gateway clients and cap sessions.  
  - Scope: `gateway/src/index.ts`, `gateway/src/session/manager.ts`.  
  - Acceptance: Unauthenticated connections refused; per-IP/session limits enforced; TLS or reverse-proxy termination documented.  
  - Test plan: Vitest integration to ensure unauthorized client gets error; simulate 1k connects and ensure limits trip.  
  - Rollout: Coordinate with mobile client to send auth token; deploy behind ingress with TLS.

## Next (2–6 weeks)
### Epic: Durable explorer data
- **Task:** Make Postgres-backed persistence the production default and validate config.  
  - Scope: `simulator/src/main.rs` CLI defaults, `docs/persistence.md`, deployment env files.  
  - Acceptance: Simulator refuses to start in prod mode without `--explorer-persistence-url`; retention defaults sensible; migration/runbook documented.  
  - Test plan: Start simulator against Postgres; restart to confirm data retained; run load test to ensure batching/backpressure is stable.  
  - Rollout: Migrate existing data per migration plan; add backup schedule.

### Epic: CI/Release safety
- **Task:** Add CI jobs for Rust fmt/clippy/tests and Node lint/tests; add secret scanning.  
  - Scope: `.github/workflows/*` (new), `codecov.yml` if coverage, `docs/observability.md` mention.  
  - Acceptance: CI blocks on build/test failures; secret scan reports clean; coverage trend visible.  
  - Test plan: Run workflow locally with `act` or dry-run; inject known secret to verify scanner fails.  
  - Rollout: Protect main branch with required checks.

## Later (6–12 weeks)
### Epic: Production readiness & ops
- **Task:** Harden deployment artifacts (Docker for auth/gateway, k8s/compose manifests).  
  - Scope: New Dockerfiles for `services/auth` and `gateway`; k8s/compose manifests with health checks and resource limits; `ops/systemd` updates.  
  - Acceptance: Repeatable builds for all services; health endpoints wired; resource requests/limits defined.  
  - Test plan: Build images; deploy to staging; run smoke tests via quickstart scripts.  
  - Rollout: Blue/green or canary for first prod push.

### Epic: Observability & alerting
- **Task:** Wire metrics/log shipping into default deployments and add alerts for simulator/auth.  
  - Scope: `docker/observability/*`, service configs, Grafana dashboards.  
  - Acceptance: Prometheus scrapes simulator/auth; Loki/ELK collects logs; alerts for WS send errors, submit latency, auth 5xx in place.  
  - Test plan: Force synthetic errors to trigger alerts; verify dashboards show data.  
  - Rollout: Stage alert thresholds; hand off runbooks.

### Epic: Security posture
- **Task:** Threat model external interfaces (simulator/auth/gateway) and implement mTLS/JWT between components.  
  - Scope: Design doc + code changes for client authentication; possibly reuse Auth.js tokens for gateway/simulator.  
  - Acceptance: All cross-service calls authenticated; least-privilege tokens documented; pen-test findings resolved.  
  - Test plan: Integration tests for auth failure paths; manual pen-test checklist.  
  - Rollout: Gradual enablement behind feature flags with fallback.

## Release Safety Checklist (first prod deploy after fixes)
- All secrets rotated and stored in secure store (not git); `.env` templates sanitized.
- `cargo test --locked --workspace --all-targets` and frontend/gateway/auth tests green in CI.
- Simulator/auth/gateway behind TLS and auth; rate limits enabled and tuned.
- Postgres (or chosen DB) provisioned with backups + restore drill; Redis hardened if used.
- Metrics and logs visible in Grafana/Loki; alerting enabled for submit errors, WS send errors, auth 5xx.
- Runbooks updated (startup/shutdown, incident handling, key rotation).*** End Patch
