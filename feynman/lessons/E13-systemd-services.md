# E13 - Systemd + service orchestration (textbook-style deep dive)

Focus files:
- `ops/systemd/README.md`
- `ops/systemd/nullspace-gateway.service`

Goal: explain how systemd units supervise services in production, how environment files are wired, and why unit-level settings like file descriptor limits and restart policies are critical for correctness and uptime. This is a complete walkthrough of the unit structure and deployment workflow.

---

## Learning objectives

After this lesson you should be able to:

1) Explain what systemd units are and why they matter for production services.
2) Interpret the sections of a systemd service file.
3) Describe how env files are loaded and why they are centralized.
4) Explain restart policies, dependency ordering, and file descriptor limits.
5) Execute the standard deployment workflow for systemd-managed services.
6) Identify common failure modes and how to diagnose them with systemd tooling.

---

## 1) Systemd fundamentals (before the walkthrough)

### 1.1 What systemd is

Systemd is the **init system** and **service manager** on most Linux servers. It is responsible for:

- starting services on boot,
- restarting them on failure,
- exposing logs and status,
- wiring dependencies between services.

If systemd is misconfigured, your services will not start reliably.

### 1.2 Units and targets

- A **unit** is a configuration file describing something systemd manages.
- A **service unit** is the most common type: it runs a process.
- A **target** is a logical grouping (e.g., `multi-user.target` for normal servers).

Units can depend on each other. That is how you enforce "start after network is up."

### 1.3 The three main sections of a service file

Every service unit has:

- `[Unit]`: metadata and dependencies (`After=`, `Requires=`).
- `[Service]`: how to run the process (`ExecStart=`, `User=`, `Restart=`).
- `[Install]`: where it hooks into boot (`WantedBy=`).

If you can read those three sections, you can reason about any systemd file.

### 1.4 Lifecycle model (simple vs forking)

Systemd needs to know whether your process:

- **runs in the foreground** (`Type=simple`), or
- **forks to the background** (`Type=forking`).

Most Node services are `simple`: the process started by `ExecStart` is the service.

### 1.5 Journald: the logging backend

Systemd writes service logs to **journald**. You read them via:

- `systemctl status <service>`
- `journalctl -u <service>`

This is why "logging just to stdout" is enough: journald captures it.

### 1.6 Environment files and least privilege

Systemd can load environment variables from files (`EnvironmentFile=`), which is safer than embedding secrets in the unit file. Services should also run as a non-root user to limit blast radius.

---

## 2) Why systemd matters in this stack

A production stack is more than code. You need a supervisor to:

- Start services on boot.
- Restart them if they crash.
- Provide logs and status.
- Manage ordering dependencies.

Systemd is the supervisor chosen here. It is stable, ubiquitous on Linux, and integrates with journald for logs. For a system with gateways, validators, simulators, and ops services, having a uniform supervisor is a practical advantage. It standardizes operations across components.

---

## 3) The ops/systemd README: the deployment contract

The `ops/systemd/README.md` is a compact runbook for systemd-based deployments. It sets expectations and defines conventions:

- Unit templates are copied to `/etc/systemd/system/`.
- Env files live under `/etc/nullspace/`.
- Binaries or built artifacts live under `/opt/nullspace` or `/usr/local/bin`.
- Some services require pre-build steps (gateway, auth, ops).

This README is more than instructions; it is the contract between the repo and production. It defines what the deployment layout should be so that unit files can be consistent and predictable.

---

## 4) Common setup: why the directory layout matters

The README recommends:

- `/usr/local/bin/` for binaries (optional).
- `/opt/nullspace` for repo checkout and built artifacts.
- `/etc/nullspace/` for env files.

This matters because unit files assume those paths. If you deploy into a different layout, you must update `EnvironmentFile`, `WorkingDirectory`, and `ExecStart` accordingly.

Centralizing env files under `/etc/nullspace` has two advantages:

1) **Operational consistency**: every service uses the same pattern.
2) **Security**: configs are root-owned and can be locked down independently of code.

---

## 5) The gateway service unit: anatomy of a systemd file

The gateway service file `ops/systemd/nullspace-gateway.service` looks like this:

```ini
[Unit]
Description=Nullspace Gateway (WS)
After=network.target

[Service]
Type=simple
User=nullspace
Group=nullspace
WorkingDirectory=/opt/nullspace/gateway
EnvironmentFile=/etc/nullspace/gateway.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/nullspace/gateway/dist/index.js
Restart=on-failure
RestartSec=5
LimitNOFILE=100000

[Install]
WantedBy=multi-user.target
```

This file is short, but each line matters. Let's dissect it section by section.

---

## 6) [Unit] section: dependency ordering

- `Description` is for human readability and appears in `systemctl status`.
- `After=network.target` ensures the service starts after basic networking is up.

This does not guarantee external dependencies (like databases) are ready; it only guarantees that the network stack is initialized. If you need stronger guarantees, you would add explicit dependencies or use a health-check loop in the service itself.

---

## 7) [Service] section: runtime behavior

### 7.1 Type=simple

`Type=simple` tells systemd that the process started by `ExecStart` is the main service process and does not fork. This is the correct setting for Node services that run in the foreground.

If you used `Type=forking`, systemd would expect the process to fork and then exit, which is not how Node services behave.

### 7.2 User and Group

```
User=nullspace
Group=nullspace
```

Running as a non-root user is a core security practice. It limits the blast radius of a compromise. If the gateway is exploited, the attacker does not immediately gain root access.

This is especially important for public-facing services like the gateway.

### 7.3 WorkingDirectory

```
WorkingDirectory=/opt/nullspace/gateway
```

The working directory matters because many Node apps resolve relative paths based on `process.cwd()`. If the working directory is wrong, the service might look for assets or configuration in the wrong place. The unit file pins it explicitly.

### 7.4 EnvironmentFile and Environment

```
EnvironmentFile=/etc/nullspace/gateway.env
Environment=NODE_ENV=production
```

The gateway loads environment variables from a file. This file is the canonical source for runtime configuration. The `Environment=NODE_ENV=production` line injects a single variable directly in the unit. This ensures that even if the env file is missing or misconfigured, `NODE_ENV` is correct.

This pattern is common:

- Use the env file for bulk config.
- Use inline `Environment=` for critical defaults.

### 7.5 ExecStart

```
ExecStart=/usr/bin/node /opt/nullspace/gateway/dist/index.js
```

Systemd runs the gateway using the system Node binary. That implies Node must be installed on the host. If you use a different Node path, you must update `ExecStart`.

This is also why the README includes build steps: the gateway must be built (`pnpm -C gateway build`) so that `dist/index.js` exists.

### 7.6 Restart policy

```
Restart=on-failure
RestartSec=5
```

This tells systemd to restart the service when it exits with a non-zero status or crashes. The 5-second delay prevents tight crash loops.

Restart policies are critical for high availability. Without them, a crash would take the service down permanently until a human intervenes.

### 7.7 File descriptor limit

```
LimitNOFILE=100000
```

The gateway handles many WebSocket connections. Each connection consumes a file descriptor. Linux defaults (often 1024) are far too low. The unit explicitly raises the limit to 100000.

If you forget this setting, the gateway will appear to work in low traffic but will fail under load as it hits the file descriptor cap. This is a subtle but critical scalability setting.

### 7.8 Restart policy nuance

`Restart=on-failure` restarts the service only when it exits with a non-zero status or crashes. This is usually safer than `Restart=always`, which would also restart clean shutdowns and can make controlled deployments harder.

If you want even stronger resilience (for example, to recover from transient exit codes), you can combine `Restart=on-failure` with `StartLimitIntervalSec` and `StartLimitBurst` to control how many restarts are allowed within a window. Those settings are not in the current unit file, but they are common in hardened production units.

### 7.9 Timeouts and startup behavior

Systemd has several timeout controls (`TimeoutStartSec`, `TimeoutStopSec`). The gateway unit does not set them explicitly, so defaults apply. In practice, you might want to raise `TimeoutStopSec` if the service needs extra time to drain connections on shutdown.

This is especially relevant for WebSocket services: you may want to allow a graceful shutdown period so that in-flight connections can close cleanly.

### 7.10 Hardening directives (optional but recommended)

Systemd supports security hardening directives such as:

- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `ReadWritePaths=/var/lib/nullspace`

These are not present in the current unit, but they are common in hardened deployments. They can prevent a compromised service from writing to unexpected parts of the filesystem or from gaining new privileges.

The tradeoff is complexity: aggressive hardening can break services that need filesystem access. If you enable these, test carefully and document the required paths.

### 7.11 Resource limits beyond file descriptors

Systemd can also enforce CPU and memory limits with directives like `CPUQuota` and `MemoryMax`. These are useful for multi-tenant hosts where a runaway process could starve others.

In this stack, the most critical resource limit is file descriptors (for WebSockets), which is why it is explicit. But in high-density deployments, CPU and memory limits can provide another layer of safety.

---

## 8) [Install] section: enabling at boot

```
WantedBy=multi-user.target
```

This line tells systemd that the service should be started when the system reaches the multi-user target (the standard server run level). When you run `systemctl enable`, it creates a symlink so the service starts automatically on boot.

---

## 9) The deployment workflow: enable and start

The README provides a standard sequence:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nullspace-simulator nullspace-node nullspace-auth   nullspace-gateway nullspace-website nullspace-ops
sudo systemctl start nullspace-simulator nullspace-node nullspace-auth   nullspace-gateway nullspace-website nullspace-ops
```

### 9.1 Why daemon-reload is required

`systemctl daemon-reload` tells systemd to re-read unit files. If you edit a unit file and forget to reload, systemd will still use the old version. This is a common operational mistake.

### 9.2 Enable vs start

- `enable` makes the service start at boot.
- `start` starts it now.

You usually do both. If you only start, a reboot will not bring the service back.

### 9.3 Ordering between services

Systemd allows you to specify dependencies like `After=` and `Requires=`. The gateway unit only depends on `network.target`, but other services might need stronger ordering (for example, starting the simulator before the gateway so the gateway can forward requests).

In practice, many services implement their own retry loops and do not require strict systemd ordering. That makes deployments more flexible. But if you see startup races, adding explicit dependencies is the first lever to pull.

---

## 10) Optional services and timers

The README includes optional services:

- `nullspace-economy-snapshot.timer` (a systemd timer for periodic snapshots).

Systemd timers are like cron jobs, but integrated with systemd. Using them keeps all service scheduling under one supervisor, which simplifies operations.

### 10.1 Timers vs cron

Systemd timers have several advantages over cron:

- They integrate with systemd logging and status reporting.
- They can be tied to service units, so failure is visible via `systemctl status`.
- They support randomized delays and missed-run catch-up behavior.

For a production system, that visibility matters more than the simplicity of cron. It makes automated jobs first-class citizens in the same process manager as the rest of the stack.

---

## 11) Container-based units

The README mentions `ops/systemd/docker/` for container-based deployments. These units typically run `docker run` or `docker compose` commands instead of binaries.

Why have both? Because different environments have different constraints:

- Bare-metal deployments often prefer binaries for simplicity.
- Container deployments prefer images for reproducibility.

The architecture supports both, which makes it flexible for staging, testnet, and production.

### 11.1 Why containers still need systemd

It may seem redundant to run containers under systemd, but it is common in production. Systemd provides restart policies, ordering, and status for the container itself. Docker provides isolation and reproducibility. Together, they cover both process supervision and packaging.

This is especially useful when you want to manage containers with the same operational tooling as non-container services. You can `systemctl status` a containerized gateway and get the same interface you use for a binary-based simulator.

---

## 12) Environment files and configuration discipline

The README highlights several env files:

- `/etc/nullspace/gateway.env`
- `/etc/nullspace/simulator.env`
- `/etc/nullspace/node.env`

Each service has its own env file. This separation matters because it limits blast radius. If you accidentally put a gateway config in the simulator env file, only the simulator is affected, not the entire stack.

In production, env files should be owned by root and readable only by the service user. This is where secrets live.

### 12.1 Reloading env changes

Systemd does not automatically reload env files when they change. If you update `/etc/nullspace/gateway.env`, you must restart the service for the changes to take effect. In some cases you can use `systemctl reload` if the service supports SIGHUP reload, but most Node services do not. Plan for restarts when changing configuration.

This is why configuration changes should be batched and applied during maintenance windows. A subtle env change can require a full service restart.

---

## 13) Build prerequisites and why they are explicit

The README explicitly says:

- Build auth (`npm run build` in `services/auth`).
- Build ops (`npm run build` in `services/ops`).
- Build gateway (`pnpm -C gateway install` then `pnpm -C gateway build`).

These build steps are not optional. The systemd units expect built artifacts at fixed paths. If you skip these steps, the service will fail at runtime.

This is why the README is so explicit: it prevents silent failures during deployment.

### 13.1 Keeping build and runtime in sync

Systemd units point to specific paths (for example, `/opt/nullspace/gateway/dist/index.js`). That means your build pipeline must produce output in exactly those locations. If you build in a different directory and then move files manually, you risk mismatches between what the unit expects and what exists on disk.

In practice, the safest pattern is to build in place inside `/opt/nullspace` or to deploy artifacts into the same directory structure. This is why the README sets a standard layout. Consistency is the difference between a clean deployment and a night of debugging missing files.

### 13.2 Service user and permissions

The unit files assume a `nullspace` user exists. Creating that user and ensuring correct permissions is part of the deployment checklist. If files are owned by root and the service runs as `nullspace`, the service can fail due to permission errors.

This is another subtle operational issue: permission failures often look like application bugs. In reality, they are often filesystem ownership mismatches. Standardizing on a service user avoids those errors.

---

## 14) Metrics and security

The README notes that in production you must set `METRICS_AUTH_TOKEN` for simulator and node metrics endpoints. This is a security boundary: metrics often expose internal state and should not be public.

Systemd does not enforce this; it only loads env files. Security is therefore a combination of configuration and network boundaries. The unit files make it easy to set env vars, but you must still choose strong tokens.

### 14.1 Rotating secrets without downtime

Because env files are loaded at service start, rotating tokens typically requires a restart. In a multi-instance setup, you can rotate without downtime by updating one instance at a time and keeping both old and new tokens valid during the transition.

This is another reason to separate services behind load balancers. You can drain one instance, restart it with new config, and then move to the next. Systemd gives you the process control, but your deployment procedure defines how safe the rotation is. In small environments without LBs, secret rotation is inherently risky and should be done during maintenance windows.

---

## 15) Diagnostics and operational tools

When a service fails, the first tools are:

- `systemctl status <service>` to see unit status.
- `journalctl -u <service>` to see logs.

Systemd integrates logs via journald. That means you do not need separate log rotation to see recent logs. For long-term retention, you might still export logs to a central system, but journald is enough for immediate debugging.

### 15.1 Journald persistence and rotation

By default, journald may store logs in memory only. For production, you usually want persistent logs so that crashes and reboots do not erase the evidence. That requires configuring `/etc/systemd/journald.conf` with `Storage=persistent` and setting appropriate size limits.

This is a system-level setting, not a per-service setting, but it directly affects your ability to debug incidents. If you cannot see logs from before a reboot, you lose critical context.

### 15.2 Useful systemctl commands

Beyond `status` and `journalctl`, there are a few commands you should use regularly:

- `systemctl show <service>` to inspect resolved env variables and limits.

- `systemctl restart <service>` for controlled rollouts.

- `systemctl is-enabled <service>` to confirm boot behavior.



These commands turn systemd into an operational dashboard. They are not just admin tools; they are how you verify the system is configured correctly.

---

## 16) Common failure modes

### 16.1 Wrong working directory

If `WorkingDirectory` is wrong, the service may fail to find static assets or local config. The error often looks like a missing file rather than a systemd failure. Always verify `WorkingDirectory` when troubleshooting.

### 16.2 Missing env file

If the env file path is wrong or the file is missing, the service starts with no configuration. This can lead to subtle misbehavior rather than immediate crashes. The fix is to ensure env files exist at `/etc/nullspace/` and have correct permissions.

### 16.3 Low file descriptor limit

If `LimitNOFILE` is not high enough, the gateway will eventually stop accepting connections. This manifests as random connection failures under load. It is not obvious unless you check `ulimit -n` or systemd's limit settings.

### 16.4 Node binary path issues

If `/usr/bin/node` is not present, `ExecStart` fails immediately. This happens if Node is installed in a different path (for example, via nvm). In production, prefer system packages so the path is stable.

### 16.5 Missing build artifacts

Many of the units point to built artifacts under `/opt/nullspace/.../dist` or compiled Rust binaries. If those artifacts are missing, the service will fail with a file-not-found error.

This is why the README lists explicit build steps. The systemd unit is not responsible for building; it assumes build output already exists. In production, that means your deployment pipeline must include build or image pull steps before you start services.

---

## 17) Why these unit files are templates

The README calls them "unit templates". That is important. Every environment will have slight differences:

- Different install paths.
- Different users.
- Different env file locations.

The unit files are starting points. You are expected to copy and customize them. This is why the README emphasizes adjusting `EnvironmentFile` and paths.

---

## 18) Feynman recap

Systemd is the manager. The unit file is the job description. The env file is the backpack of configuration. The gateway unit says: run this Node script as the nullspace user, in this directory, with these env vars, and restart it if it fails. If you can explain that, you understand how systemd orchestrates the services.

Once you can read one unit file, you can read all of them. The patterns repeat; only the paths and binaries change.
This is by design.
In practice.
And that repetition is what makes operational automation possible.
Templates are the real scalability feature here.

---

## 19) Exercises

1) Why does the gateway unit set `LimitNOFILE` so high?
2) What happens if you forget to run `systemctl daemon-reload` after editing a unit file?
3) Why is `WorkingDirectory` important for Node services?
4) What is the difference between `systemctl enable` and `systemctl start`?
5) If a service crashes repeatedly, which systemd settings control restart behavior?

---

## Next lesson

E14 - Hetzner infra + hardening checklist: `feynman/lessons/E14-hetzner-runbook.md`
