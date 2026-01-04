# Hetzner Deployment Runbook (Staging/Testnet)

This runbook covers provisioning staging/testnet infrastructure on Hetzner for
~5k concurrent players. Hetzner does not offer a NYC region; Ashburn (us-east)
is the closest available location. If NYC residency is mandatory, use a
provider with NYC availability.

## 1) Project + network
1) Create a Hetzner Cloud project: `nullspace-staging` or `nullspace-testnet`.
2) Create a private network: `10.0.0.0/16` with subnet `10.0.1.0/24`.
3) Attach every server to the private network; only load balancers and
   the bastion should have public IPs.

## 2) Firewall rules (baseline)
Allow only required ports and restrict by source IP where possible.

Public ingress (LBs/bastion):
- 22/tcp (SSH): from office/home IPs only.
- 80/443 (HTTP/HTTPS): website + auth + gateway (via LB).

Private network ingress (service-to-service):
- 8080/tcp: simulator/indexer HTTP + WS.
- 9010/tcp: gateway WS (behind LB).
- 4000/tcp: auth service.
- 9020/tcp: ops service (optional).
- 9001-9004/tcp: validator P2P (between validators only).
- 9100-9104/tcp: metrics (Prometheus only).
- 5432/tcp: Postgres (simulator/indexer only).

## 3) Host layout (5k target)
Use the resource sizing in `docs/resource_sizing.md` as a baseline.

Suggested layout (Ashburn):
- `ns-gw-1..2` (Gateway): CPX31 (4 vCPU, 8 GB).
- `ns-sim-1` (Simulator/Indexer): CPX41/CPX51 (8-16 vCPU, 16-32 GB).
- `ns-node-1..3` (Validators): CPX31 (4 vCPU, 8 GB).
- `ns-auth-1` (Auth): CPX21 (2 vCPU, 4 GB).
- `ns-convex-1` (Convex): CPX41 (8 vCPU, 16 GB) + persistent volume.
- `ns-db-1` (Postgres): CPX41 (8 vCPU, 16 GB) + dedicated volume.
- `ns-obs-1` (Prometheus/Grafana/Loki): CPX31 (optional, recommended).
- `ns-ops-1` (Ops/analytics): CPX21 (optional).

Notes:
- Scale gateways horizontally; each node has its own `MAX_TOTAL_SESSIONS`.
- Use a single simulator/indexer host at 5k; add an LB + replicas for >5k.
- Validators should be on separate hosts to maintain quorum.
- For NAT-heavy mobile traffic, raise `MAX_CONNECTIONS_PER_IP` (>=200) and
  `RATE_LIMIT_WS_CONNECTIONS_PER_IP` (>=500) to avoid false throttling.
For 20k+ guidance, see `docs/resource_sizing.md`.

## 4) Base server setup
On each host:
1) Create a `nullspace` user and directories:
   - `/opt/nullspace` (repo checkout)
   - `/etc/nullspace` (env files)
   - `/var/lib/nullspace` (gateway nonces, logs)
2) Install dependencies: Node 20+, pnpm, Rust toolchain, and system tools (source builds only).
   If using containers, install Docker + Compose instead of Rust/Node toolchains.
3) Clone repo to `/opt/nullspace` and build binaries (`cargo build --release`) **or** run
   GHCR images via systemd units in `ops/systemd/docker/`.

## 5) Env files + config distribution
Use env templates from `configs/staging/` or `configs/production/`:
- `configs/staging/simulator.env.example`
- `configs/staging/gateway.env.example`
- `configs/staging/ops.env.example`
- `services/auth/.env.example`
- `website/.env.staging.example`
Optional:
- `/etc/nullspace/ops.env` with `OPS_*` settings
- Global table configuration: set `GATEWAY_LIVE_TABLE_CRAPS=1` and `GATEWAY_LIVE_TABLE_ADMIN_KEY_FILE`
  (env keys are blocked in production unless `GATEWAY_LIVE_TABLE_ALLOW_ADMIN_ENV=1`).
  - Timing is controlled by `GATEWAY_LIVE_TABLE_BETTING_MS`, `GATEWAY_LIVE_TABLE_LOCK_MS`,
    `GATEWAY_LIVE_TABLE_PAYOUT_MS`, and `GATEWAY_LIVE_TABLE_COOLDOWN_MS` (tune after load tests).
  - Global presence aggregation: set `GATEWAY_INSTANCE_ID` on each gateway and (optionally)
    `GATEWAY_LIVE_TABLE_PRESENCE_TOKEN` (must match `GLOBAL_TABLE_PRESENCE_TOKEN` on the simulator).
  - Simulator presence TTL: `GLOBAL_TABLE_PRESENCE_TTL_MS` (defaults to 15000).

Production-required envs (set in your env files):
- `GATEWAY_ORIGIN` (public gateway origin, e.g. `https://gateway.example.com`)
- `GATEWAY_DATA_DIR` (persistent gateway nonce directory)
- `GATEWAY_ALLOWED_ORIGINS` (origin allowlist for gateway WebSocket)
- `GATEWAY_ALLOW_NO_ORIGIN=1` (if supporting native mobile clients)
- `METRICS_AUTH_TOKEN` (simulator + validators + auth metrics auth)
- `OPS_DATA_DIR` on persistent disk (if running ops service)
- `OPS_ADMIN_TOKEN` (ops admin endpoints) and `OPS_REQUIRE_ADMIN_TOKEN=1`
- `OPS_ALLOWED_ORIGINS` and `OPS_REQUIRE_ALLOWED_ORIGINS=1` (ops CORS allowlist)

Generate validator configs:
```bash
NODES=4 OUTPUT=configs/testnet INDEXER=http://<INDEXER_HOST>:8080 \
  ./scripts/bootstrap-testnet.sh
```

Distribute `nodeN.yaml` + `peers.yaml` to each validator host.
Ensure `peers.yaml` entries are sorted and unique; the node will refuse to start otherwise.
Set `NODE_CONFIG` and `NODE_PEERS` (or `NODE_HOSTS`) in `/etc/nullspace/node.env`.

## 6) Load balancers
Create separate LBs for (optional at 5k if you run single instances):
- Gateway WS (TCP 9010): L4 LB with TCP health checks (or L7 `/healthz` if using HTTP health checks).
- Simulator/indexer (HTTP 8080): L7 LB with `/healthz` checks.
- Auth (HTTP 4000) + Website (HTTP/HTTPS 80/443): L7 LB or Nginx.

Recommended settings:
- Enable PROXY protocol only if your services parse it.
- Increase idle timeout for WS to 5-10 minutes.
- Use Cloudflare in front of website/auth for TLS + WAF.
- Align proxy/body size limits with simulator `http_body_limit_bytes` and gateway `GATEWAY_SUBMIT_MAX_BYTES`.

## 7) Systemd supervision
Copy unit files from `ops/systemd/` to `/etc/systemd/system/` and set
`EnvironmentFile` to your `/etc/nullspace/*.env` files. Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable nullspace-simulator nullspace-node nullspace-auth \
  nullspace-gateway nullspace-website nullspace-ops
sudo systemctl start nullspace-simulator nullspace-node nullspace-auth \
  nullspace-gateway nullspace-website nullspace-ops

# Optional: public economy snapshot generator
sudo systemctl enable nullspace-economy-snapshot.timer
sudo systemctl start nullspace-economy-snapshot.timer
```

Docker-based alternative: copy units from `ops/systemd/docker/` and enable the
`*-docker` services instead.
Create `/etc/nullspace/docker.env` with `IMAGE_REGISTRY` + `IMAGE_TAG`.

## 8) Postgres + backups
Follow `docs/postgres-ops-runbook.md` to configure explorer persistence,
connection pooling, and WAL backups.

## 9) Validation
Run the smoke steps in `docs/testnet-readiness-runbook.md` and the full
sequence in `docs/testnet-runbook.md` before opening the testnet.

Recommended preflight config check:
```bash
node scripts/preflight-management.mjs \
  gateway /etc/nullspace/gateway.env \
  simulator /etc/nullspace/simulator.env \
  node /etc/nullspace/node.env \
  auth /etc/nullspace/auth.env \
  ops /etc/nullspace/ops.env
```
