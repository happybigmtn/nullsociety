# E02 - Component roles + deployment topology (textbook-style deep dive)

Focus files: `docs/hetzner-deployment-runbook.md`, `architecture.md`

Goal: build a rigorous mental model for how the system is deployed, why each role exists, and how network boundaries and capacity planning preserve safety and performance.

---

## Learning objectives

After this lesson you should be able to:

1) Explain why topology is part of correctness for a blockchain system.
2) Describe the core deployment roles and their responsibilities.
3) Understand the network layout and firewall rules used in staging/testnet.
4) Explain why certain services are public and others are private.
5) Outline the standard deployment workflow from provisioning to validation.

---

## 0) Big idea (Feynman summary)

A distributed system is not just code; it is a map of responsibilities on real machines. Every machine exists for a reason. If you cannot explain why a role exists and what data it is allowed to touch, you do not yet understand the system.

This chapter explains:

- what each component does,
- where it should run,
- which network boundaries matter,
- and how the deployment plan supports the architecture from E01.

---

## 1) Why topology is part of correctness

### 1.1 Correctness depends on boundaries

In blockchain systems, security is not only about cryptography; it is also about **network boundaries**. Validators must only trust other validators. Databases must only accept writes from the services that own them. Gateways must never be trusted with authoritative state.

If these boundaries are violated (for example, if a public service can write directly to the chain database), you have created a new class of security bugs. The runbook defines boundaries so these bugs are less likely to exist.

### 1.2 Scaling requires role separation

If every service runs on the same machine, you cannot scale. Role-based deployment provides:

- **Independent scaling** (add gateways without adding validators).
- **Fault isolation** (a gateway crash does not crash the simulator).
- **Security isolation** (validators do not expose public endpoints).

### 1.3 Topology is the physical version of the architecture

E01 describes the logical pipeline. This runbook maps that pipeline onto real machines. That mapping is not optional. It is how the architecture becomes real.

---

## 2) Network design: private core, public edge

The runbook specifies a Hetzner project with a private network (`10.0.0.0/16` with a `10.0.1.0/24` subnet). Every server is attached to this private network. Only the load balancers and the bastion host have public IPs.

This design gives two important properties:

1) **Attack surface reduction**: the majority of services are not directly reachable from the public internet.
2) **Predictable service-to-service traffic**: internal traffic stays within the private network.

The bastion host is the only SSH entry point. This creates a single chokepoint for administrative access, which is easier to monitor and secure.

---

## 2.1) Why a /16 with a /24 subnet?

The runbook's network plan uses a large private address space (`10.0.0.0/16`) and a smaller subnet (`10.0.1.0/24`) for the current deployment. This is a common pattern:

- The /16 gives you room to grow without renumbering.
- The /24 provides a clean, manageable subnet for the current environment.

If you later add separate clusters (for example, staging and testnet), you can allocate different /24s inside the same /16. This keeps routing simple and avoids IP overlap.

This design also supports future segmentation. You could create separate subnets for validators, databases, and public services if you need tighter isolation. Starting with a large private block gives you that flexibility.

---

## 3) Firewall rules: public vs private ingress

The runbook divides firewall rules into public ingress and private ingress:

### 3.1 Public ingress (load balancers and bastion)

- 22/tcp (SSH): restricted to office/home IPs.
- 80/443 (HTTP/HTTPS): website, auth, gateway (via LB).

These ports are the only public exposure. Everything else stays private.

### 3.2 Private ingress (service-to-service)

- 8080/tcp: simulator/indexer HTTP + WS.
- 9010/tcp: gateway WebSocket (behind LB).
- 4000/tcp: auth service.
- 9020/tcp: ops service (optional).
- 9001-9004/tcp: validator P2P (between validators only).
- 9100-9104/tcp: metrics (Prometheus only).
- 5432/tcp: Postgres (simulator/indexer only).

This list doubles as a responsibility map. If a service does not need a port, it should not have one. That is the simplest and strongest security rule.

---

## 3.3) Port ownership and blast radius

Think of each port as a capability. If a service can accept traffic on a port, it can be targeted. That is why the runbook is explicit: each port should be reachable only by the services that need it.

For example, Postgres (5432) should only be reachable from the simulator/indexer. If a gateway can reach Postgres, a gateway compromise becomes a database compromise. Similarly, validator P2P ports (9001-9004) should only be reachable by other validators, not by gateways or public clients.

This is the principle of least privilege applied to networking. It reduces blast radius and is a key part of operating safely in production.

---

## 4) Host layout for a 5k player target

The runbook recommends a baseline layout for about 5k concurrent players. The exact machine sizes (CPX31, CPX41, CPX51) are Hetzner-specific, but the roles are universal:

- Gateways: `ns-gw-1..2` (CPX31). These scale horizontally.
- Simulator/indexer: `ns-sim-1` (CPX41 or CPX51). Central read layer.
- Validators: `ns-node-1..3` (CPX31). Keep separate for quorum.
- Auth: `ns-auth-1` (CPX21). Perimeter API.
- Convex: `ns-convex-1` (CPX41 + persistent volume).
- Postgres: `ns-db-1` (CPX41 + dedicated volume).
- Observability: `ns-obs-1` (optional).
- Ops/analytics: `ns-ops-1` (optional).
- Global table coordinator: runs inside the gateway (no separate host).

This layout is a **role map** more than a sizing guide. The key idea is that each role can scale independently:

- Gateways scale with connections.
- Validators scale with consensus and execution.
- Simulator scales with read load.

The runbook also calls out NAT-heavy mobile traffic: you may need to increase connection limits (`MAX_CONNECTIONS_PER_IP` and `RATE_LIMIT_WS_CONNECTIONS_PER_IP`) to avoid false throttling.

---

## 4.1) Sizing as a function of load

The exact sizes (CPX31, CPX41, CPX51) are not magical. They are proxies for CPU, memory, and network bandwidth. The sizing logic is roughly:

- Gateways are connection-heavy and need enough memory for many sockets.
- Validators are compute-heavy because they run consensus and execution.
- Simulator/indexer is read-heavy and benefits from memory for caching.

If you see gateway CPU pegged while validators are idle, you scale gateways. If validators are saturated, you add validators or increase their size. This is why role separation matters: it makes scaling decisions obvious.

---

## 5) Component roles and responsibilities

### 5.1 Edge gateways

- WebSocket fan-out.
- Authentication and payload validation.
- Rate limiting and session control.

Gateways are publicly exposed and scale horizontally. They are the front door, not the judge. They must never be authoritative.

### 5.2 Validators (node)

- Consensus and block production.
- Deterministic execution.
- Proof generation and finality.

Validators should be isolated on a private network and should only accept P2P traffic from other validators. They are the root of trust.

### 5.3 Simulator/indexer

- Read-only API for clients.
- Explorer persistence and account queries.
- Indexing chain updates for UI and ops.

This is the read model of the chain. It must be fast and reliable, but it is not authoritative.

### 5.4 Auth service

- Authentication flows.
- Admin transactions for entitlements.
- Convex integration.

Auth is a high-risk perimeter service. It should be isolated and locked down.

### 5.5 Convex and Postgres

- Convex stores users, entitlements, and Stripe metadata.
- Postgres stores explorer persistence (optional but recommended).

These are data stores. They should live on the private network with persistent volumes, and only the authorized services should be able to connect.

### 5.6 Observability

- Metrics collection (Prometheus/Grafana/Loki).
- Log aggregation and dashboards.

Observability is optional but recommended. Without it, you are flying blind in production.

### 5.7 Ops / analytics service

The runbook includes an optional ops service (`ns-ops-1`). This service aggregates analytics and provides admin endpoints for operational workflows. It is not part of the consensus path, but it is critical for visibility and debugging.

Because it exposes admin endpoints, it must be protected by strict auth (`OPS_ADMIN_TOKEN`) and origin allowlists. Treat it like a privileged internal tool, not a public API. This is another example of role separation: analytics should not live inside gateways or validators.

### 5.8 Global table coordinator (gateway)

There is no separate live-table service. The on-chain global table is coordinated inside the gateway, which handles round timing, submits on-chain instructions, and fans out updates to clients. That means scaling the global table is primarily a gateway scaling problem: add more gateways to increase fan-out capacity.

---

## 6) Load balancers: public access without public servers

The runbook recommends separate LBs for:

- Gateway WebSocket (TCP 9010).
- Simulator/indexer (HTTP 8080).
- Auth + Website (HTTP/HTTPS 80/443).

This structure allows you to keep servers private while still exposing services. It also gives you a convenient place to handle TLS, health checks, and request limits.

Important settings:

- Use L4 TCP for raw WebSockets or L7 with `/healthz` checks if supported.
- Increase idle timeouts for WebSockets (5-10 minutes).
- Enable PROXY protocol only if services parse it.
- Align proxy/body limits with service limits (`http_body_limit_bytes`, `GATEWAY_SUBMIT_MAX_BYTES`).

---

## 6.1) Why separate LBs matter

WebSocket traffic behaves differently from standard HTTP. It keeps connections open, uses different timeout expectations, and is sensitive to idle timeouts. If you mix WebSockets and short-lived HTTP in the same load balancer with default settings, you can accidentally drop sockets or throttle connections.

That is why the runbook recommends separate LBs: one tuned for WebSockets, one for HTTP APIs, and another for the website/auth layer. Each can be tuned with appropriate timeouts, health checks, and TLS policies.

This separation also improves blast radius. A misconfiguration in the gateway LB does not break the website LB, and vice versa.

---

## 7) Base server setup and build strategy

The runbook offers two paths:

### 7.1 Source build

- Install Node 20+, pnpm, Rust toolchain.
- Build binaries with `cargo build --release`.

### 7.2 Docker-based deployment

- Install Docker + Compose.
- Use GHCR images and systemd units in `ops/systemd/docker/`.

Both paths are valid. Docker reduces tooling complexity but introduces container orchestration concerns. Source builds give you more direct control but require more system dependencies.

---

## 7.3) Directory layout conventions

The runbook suggests three standard directories:

- `/opt/nullspace` for the repo checkout and binaries.
- `/etc/nullspace` for environment files.
- `/var/lib/nullspace` for persistent runtime data (for example, gateway nonces and logs).

This separation is not cosmetic. It makes backups and permissions easier. You can lock down `/etc/nullspace` as root-owned configuration, while allowing services to write to `/var/lib/nullspace` without giving them access to configs. It also keeps deploy artifacts (`/opt/nullspace`) separate from data (`/var/lib/nullspace`).

These conventions make it easier to reason about upgrades and rollbacks: you can redeploy `/opt/nullspace` without wiping state in `/var/lib/nullspace`.

---

## 8) Env files and configuration distribution

The runbook uses env templates in `configs/staging/` and `configs/production/`. It also references service-specific env files like `services/auth/.env.example` and `website/.env.staging.example`.

Key production envs include:

- `GATEWAY_ORIGIN`, `GATEWAY_ALLOWED_ORIGINS`, `GATEWAY_ALLOW_NO_ORIGIN`.
- `GATEWAY_DATA_DIR` for persistent nonces.
- `METRICS_AUTH_TOKEN` for protected metrics endpoints.
- `OPS_ADMIN_TOKEN` and origin allowlists.

For validators, the runbook uses a bootstrap script:

```
NODES=4 OUTPUT=configs/testnet INDEXER=http://<INDEXER_HOST>:8080   ./scripts/bootstrap-testnet.sh
```

This generates `nodeN.yaml` and `peers.yaml`, which must be distributed to validators. The runbook emphasizes that `peers.yaml` entries must be sorted and unique, or the node will refuse to start. This is a subtle but critical operational detail.

---

## 8.1) Why peers ordering matters

Validator configs are part of the consensus identity. If two validators disagree on the peer set or its ordering, they can fail to agree on the network view. The runbook enforces sorted, unique `peers.yaml` entries to avoid subtle mismatches.

This might feel like a small operational detail, but it is not. Consensus systems are sensitive to small divergences in configuration. By making the ordering rule explicit, the runbook prevents a whole class of misconfigurations that would be hard to debug later.

---

## 9) Systemd supervision

The runbook recommends systemd for supervision and describes both binary-based and docker-based units. It provides a standard sequence:

- `systemctl daemon-reload`
- `systemctl enable ...`
- `systemctl start ...`

This matters because it turns a pile of processes into a managed fleet. Systemd handles restarts, logs, and ordering. It is not glamorous, but it is essential for production uptime.

---

## 9.1) Docker units vs native units

The runbook offers a docker-based alternative with units in `ops/systemd/docker/`. This is useful when you want consistent builds and easier upgrades. You can pin `IMAGE_REGISTRY` and `IMAGE_TAG` in `/etc/nullspace/docker.env` and roll forward or back by changing a tag.

Native units (running binaries directly) are simpler to reason about and often easier to debug in early environments. Docker units add a layer of indirection but can make deployments more reproducible. The choice depends on your operational maturity. The architecture supports both.

---

## 10) Storage and backups

Postgres is used for explorer persistence and is configured via `docs/postgres-ops-runbook.md`. The runbook explicitly calls out WAL backups and connection pooling.

The key idea is durability: state that is used for user-facing history should be backed up. Even if the chain is the source of truth, re-indexing from scratch can be expensive. Postgres provides a durable read model.

---

## 11) Validation and runbooks

The deployment sequence ends with validation:

- Run smoke steps from `docs/testnet-readiness-runbook.md`.
- Run the full sequence in `docs/testnet-runbook.md`.
- Use the preflight config checker:

```
node scripts/preflight-management.mjs   gateway /etc/nullspace/gateway.env   simulator /etc/nullspace/simulator.env   node /etc/nullspace/node.env   auth /etc/nullspace/auth.env   ops /etc/nullspace/ops.env
```

This last step is important: it validates configuration before you open the network to users. Many failures in production are misconfigurations, not code bugs.

---

## 11.1) Validation as a discipline

The runbook does not treat validation as optional. It separates smoke checks (fast, minimal) from full readiness checks (comprehensive). This is a healthy operational pattern: you get quick feedback early, and you still have a thorough gate before exposing the system.

In practice, this means you should script validation and run it for every environment. Manual checks are error-prone; scripts are repeatable. The preflight tool (`scripts/preflight-management.mjs`) is the foundation for that repeatability.

---

## 12) Capacity planning and scaling notes

The runbook points to `docs/resource_sizing.md` for 20k+ guidance. It also notes that gateways scale horizontally and that simulator/indexer can be scaled with replicas behind an LB.

The key scaling rule is simple:

- **Gateways** scale with connection count.
- **Validators** scale with consensus and execution load.
- **Simulator/indexer** scales with read queries.

By keeping these roles separate, you can scale the right part of the system without overprovisioning everything.

---

## 12.1) NAT-heavy traffic and rate limits

Mobile networks often place many users behind a small number of NAT IPs. If you set strict per-IP connection or rate limits, you can accidentally block legitimate users. The runbook explicitly warns about this and suggests raising `MAX_CONNECTIONS_PER_IP` and `RATE_LIMIT_WS_CONNECTIONS_PER_IP` for mobile-heavy environments.

This is a classic example of real-world constraints shaping configuration. A perfect theoretical limit can be harmful in practice if it assumes one user per IP. Good capacity planning must account for the realities of mobile carrier NAT.

---

## 13) Security posture and operational hygiene

The deployment plan assumes a disciplined security posture:

- SSH only from trusted IPs.
- Private network for service-to-service traffic.
- Strict firewall rules per port.
- Persistent volumes for databases.

These are not optional in production. They are the minimum cost of operating a blockchain service safely.

---

## 13.1) Bastion host and access control

The runbook implicitly promotes a bastion model: only the bastion has a public IP and SSH is restricted to trusted IPs. This keeps administrative access narrow and observable. All other hosts are reached via the private network, which reduces exposure and makes lateral movement harder for attackers.

In practice, this means:

- Use SSH agent forwarding sparingly and audit it.

- Rotate bastion access keys regularly.

- Treat bastion logs as security-critical.

The bastion is the single door into the private network. Securing it is not optional.

---

## 13.2) Rolling upgrades and change safety

Because roles are separated, you can perform rolling upgrades. Gateways can be upgraded without touching validators. Simulators can be redeployed without stopping consensus. This is the operational advantage of topology: if you maintain isolation, you can reduce downtime.

In practice, you should:

- Upgrade gateways one at a time behind the LB.
- Keep validators on separate hosts so a single failure does not drop quorum.
- Validate simulator health before exposing new gateways to traffic.

These habits are not just operational niceties. They are how you keep a real-time system online during change.

Another practical tip: keep the website and auth services behind separate LBs or routes so you can deploy UI updates without risking auth downtime. UI changes are frequent; auth changes are sensitive. Separation lets you iterate quickly on UI while protecting critical authentication paths. It also makes staged rollouts easier because you can canary the UI independently of auth. That reduces coordination overhead and limits the blast radius of a UI-only rollback. It also improves incident response speed.

---

## 14) Feynman recap

The system is a set of specialized machines. Gateways are the front door. Validators are the judges. The simulator is the read-only window. Auth handles identity. Databases are locked in the back room. A private network keeps the back room safe. Load balancers let you expose services without exposing servers.

If you forget everything else, remember this: the public surface is thin, and the private core is where authority lives.

---

## 15) Exercises

1) Why are validators kept on a private network with no public endpoints?
2) What services should be exposed through public load balancers, and why?
3) How does the runbook scale gateways differently from validators?
4) Why is `peers.yaml` ordering important for validators?
5) If you had to support 20k players, which components would you scale first?

---

## Next lesson

E03 - Node entrypoint: `feynman/lessons/E03-node-entrypoint.md`
