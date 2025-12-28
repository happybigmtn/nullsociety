# Executive Summary

## Top 10 P0/P1 Issues
1) **P0:** Workspace tests fail to compile (`nullspace-node` fixtures missing new fields) blocking CI/releases (`node/src/tests.rs`).  
2) **P0:** Secrets and validator private keys committed to git (`docker/convex/.env`, `configs/local/node*.yaml`, `configs/local/.env.local`).  
3) **P1:** Simulator HTTP/WS API lacks auth and defaults to no rate limiting; quickstart sets `ALLOW_HTTP_NO_ORIGIN=1`, enabling anonymous submits.  
4) **P1:** Gateway WebSocket auto-registers wallets with no auth/TLS, allowing unbounded session creation.  
5) **P1:** Production persistence optional; default in-memory explorer leads to data loss on restart and divergent replicas.  
6) **P2:** No CI enforcing Rust/Node tests or secret scanning; regressions and leaks can land unnoticed.  
7) **P2:** Deployment artifacts only containerize simulator; auth/gateway/website lack repeatable images and health checks.  
8) **P2:** Observability not wired by default; relies on optional docker-compose, so incidents would be opaque.  
9) **P2:** Local configs include real-looking Convex/Stripe tokens without rotation guidance.  
10) **P2:** Gateway/simulator configs lack default connection/request limits, increasing DoS surface.

## Architectural Themes
- Rust core split between consensus node (`node`), execution environment (`execution`), simulator/indexer (`simulator`), and client/dev tooling; heavy reliance on Commonware primitives.  
- Supporting TS stack (auth, gateway, website) is loosely coupled with minimal shared security model; transport/auth between components is ad hoc.  
- Data durability is optional and off by default (explorer in-memory), while secrets and keys are shipped alongside sample configs.

## Biggest Unknowns / Risks
- Unknown whether committed Convex/Stripe tokens are active; if so, external abuse is possible. Confirm with providers and rotate.  
- No evidence of production deployment topology (k8s/ingress/firewall) or how simulator/gateway/auth are exposed; security posture depends on this.  
- Contract between simulator and real consensus nodes (vs dev executor) is unclear; risk of divergence in production mode vs dev.  
- Stripe webhook handling not reviewed; need confirmation that webhook secret validation and idempotency are in place.

## Suggested Execution Order
1) Fix build break (tests compile) to unblock CI.  
2) Remove/rotate exposed secrets and regenerate local keys.  
3) Lock down simulator/gateway surfaces (auth, rate limits, network exposure) and containerize all services.  
4) Enforce durable persistence (Postgres) and add CI + secret scanning.  
5) Wire observability/alerts, then proceed to broader security hardening (mTLS/JWT between components) and deployment automation.
