# Architecture Review

## System Map
- **Languages / Frameworks**
  - Rust workspace (`node`, `simulator`, `execution`, `client`, `types`, `website/wasm`) using Tokio, Axum, Rayon, Prometheus, Redis client, Commonware consensus/crypto/storage stacks.
  - TypeScript/JavaScript services: `services/auth` (Express + Auth.js + Convex + Stripe), `gateway` (ws server), `website` (Vite/React + wasm-pack), `evm` (Hardhat), `mobile`/`client` scripts.
- **Core runtime topology**
  - `nullspace-simulator`: HTTP/WS API on 8080 for submissions (`/submit`), state/seed queries, explorer endpoints, metrics, WS broadcast; optional Redis pubsub for submission fanout; optional Redis cache; optional SQLite/Postgres for explorer persistence; exports Prometheus and JSON metrics.
  - `dev-executor` (from `client` crate): drives block production against simulator via HTTP; used in quickstart/scripts.
  - `nullspace-node`: validator using Commonware P2P/consensus/broadcast/storage; CLI `node` plus helper bins (`generate-keys`, `init-amm`, etc.); consumes YAML configs under `configs/`.
  - `services/auth`: Express server on 4000 providing Auth.js credentials auth, passkey/EVM linking, Stripe billing sync to Convex, freeroll limit sync to simulator; requires Convex service token/admin key, casino admin key, allowed origins.
  - `website`: Vite/React UI consuming simulator + auth; wasm bridge for signing/encoding; Convex client for account data.
  - `gateway`: WebSocket bridge for mobile clients -> simulator backend; auto-registers wallets, relays game actions, connects to WS updates.
  - `evm`: Hardhat contracts/tests for EVM bridge (not wired into main runtime).
  - Observability: Prometheus/Loki/Grafana docker-compose in `docker/observability`; metrics endpoints on simulator/auth; logs to files in repo.
  - Data/keys: sample identities/validator keys and explorer data under `configs/`, `data/`, `economy_log.json`.
- **Deployment artifacts**
  - Root `Dockerfile` builds only `nullspace-simulator` binary (Debian runtime).
  - `docker/convex/docker-compose.yml` for self-hosted Convex + dashboard; `.env` examples include Stripe and Convex secrets.
  - `ops/systemd/*.service` templates for simulator/node/auth/website.
  - `scripts/start.py`, `scripts/start-network.sh`, `quickstart.md` for local orchestration.
- **Dependencies / external systems**
  - External APIs: Convex (service/admin tokens), Stripe webhooks/secret, Redis (fanout/cache), Postgres/SQLite (explorer), AWS S3 settings in Convex compose.
  - Internal crates depend heavily on `commonware-*` libraries (consensus, cryptography, runtime, resolver, p2p, storage).
  - Frontend deps: Vite, React, three.js, zustand; Auth deps: Auth.js, ethers, Convex SDK.
