# E12 - CI images + Docker build chain (textbook-style deep dive)

Focus files:
- `.github/workflows/build-images.yml`
- `Dockerfile`

Goal: explain how CI builds container images, why the workflow is structured as a matrix, how images are tagged and cached, and how the multi-stage Docker build produces a small runtime image. This is a full walkthrough of the build pipeline, with emphasis on determinism, reproducibility, and operational safety.

---

## Learning objectives

After this lesson you should be able to:

1) Explain when and why the image build workflow runs.
2) Describe how the matrix defines service images and build arguments.
3) Explain how tags and metadata are generated for GHCR.
4) Understand Buildx caching and why the dummy build pattern exists.
5) Walk through the simulator Dockerfile from base image to runtime image.
6) Identify failure modes in CI builds and how to mitigate them.

---

## 1) CI + Docker fundamentals (before the walkthrough)

### 1.1 What CI is (and why it matters)

**Continuous Integration (CI)** is a build pipeline that runs on every change. Its job is to:

- build the same artifacts every time,
- fail fast on broken changes,
- produce deployable outputs from a trusted environment.

Without CI, "it works on my machine" becomes a production risk.

### 1.2 What a container image actually is

A container image is:

- a filesystem snapshot,
- plus metadata (entrypoint, env, ports),
- built in immutable layers.

Images are **content-addressable**. That means if two builds are identical, they produce the same layers and can be cached.

### 1.3 Dockerfile = ordered layers

Every Dockerfile instruction (`FROM`, `COPY`, `RUN`) creates a layer. That matters because:

- later layers can be reused from cache,
- early layer changes invalidate everything after.

So Dockerfiles are performance-sensitive: copy small, stable inputs first, and big changing inputs later.

### 1.4 Multi-stage builds (build vs runtime)

Multi-stage builds separate:

- **build stage**: compilers, toolchains, heavy deps,
- **runtime stage**: only the final binary + minimal OS libs.

This yields smaller, safer runtime images.

Concrete excerpt from the root `Dockerfile`:

```dockerfile
FROM rust:1.83-slim-bookworm AS builder
...
RUN cargo build --release --package nullspace-simulator

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/nullspace-simulator /app/nullspace-simulator
ENTRYPOINT ["/app/nullspace-simulator"]
```

Walkthrough:

1) Build in a Rust image (large).
2) Copy only the final binary into a slim Debian image.
3) Ship the minimal runtime.

### 1.5 Registries and tags

Images are pushed to a registry (GHCR). Tags are labels that point to image digests:

- `latest` for the default branch,
- branch tags for staging,
- SHA tags for exact reproducibility.

Tags are human-friendly pointers to immutable image content.

### 1.6 Buildx caching

Buildx can persist cache across CI runs. That is why the workflow uses `cache-from` and `cache-to`: rebuilding Rust dependencies from scratch is slow without cache.

---

## 2) Why CI builds images at all

In a multi-service system, consistent builds are hard. If each developer builds locally, you get drift: different toolchains, different OS patches, different dependency versions. That is a recipe for production surprises.

The CI pipeline solves this by centralizing builds. Every image for each service is built by the same workflow, on the same runner type, with the same tooling. This makes the resulting images reproducible and trustworthy.

CI-built images also enable **immutable deployment**: you can deploy a specific image tag and know exactly what code it contains. That is the foundation of reliable operations.

---

## 3) Workflow triggers: when builds happen

The workflow in `.github/workflows/build-images.yml` triggers on:

- Pushes to `main` or `master`.
- Tags that match `v*`.
- Pull requests targeting `main` or `master`.
- Manual `workflow_dispatch`.

This is a common pattern:

- PR builds validate that the Dockerfiles still build.
- Main branch builds produce real, deployable images.
- Tag builds produce release artifacts.

Note the difference: PR builds compile but do not push images. This avoids publishing unreviewed code.

---

## 4) The job structure: a build matrix

The workflow defines a single job, `build`, with a matrix of services. Each matrix entry provides:

- `id`: an identifier for the service.
- `dockerfile`: the Dockerfile path.
- `context`: the build context (usually the repo root).
- `image`: the name for the image in GHCR.
- `build_args`: optional build arguments (used by the website).

This is the exact matrix structure:

```yaml
matrix:
  include:
    - id: simulator
      dockerfile: ./Dockerfile
      context: .
      image: nullspace-simulator
    - id: node
      dockerfile: ./node/Dockerfile
      context: .
      image: nullspace-node
    - id: gateway
      dockerfile: ./gateway/Dockerfile
      context: .
      image: nullspace-gateway
    - id: auth
      dockerfile: ./services/auth/Dockerfile
      context: .
      image: nullspace-auth
    - id: website
      dockerfile: ./website/Dockerfile
      context: .
      image: nullspace-website
      build_args: |
        VITE_URL=${{ vars.VITE_URL || secrets.VITE_URL }}
        VITE_AUTH_URL=${{ vars.VITE_AUTH_URL || secrets.VITE_AUTH_URL }}
        VITE_AUTH_PROXY_URL=${{ vars.VITE_AUTH_PROXY_URL || secrets.VITE_AUTH_PROXY_URL }}
        VITE_IDENTITY=${{ vars.VITE_IDENTITY || secrets.VITE_IDENTITY }}
        VITE_STRIPE_TIERS=${{ vars.VITE_STRIPE_TIERS || secrets.VITE_STRIPE_TIERS }}
        VITE_STRIPE_PRICE_ID=${{ vars.VITE_STRIPE_PRICE_ID || secrets.VITE_STRIPE_PRICE_ID }}
        VITE_STRIPE_TIER=${{ vars.VITE_STRIPE_TIER || secrets.VITE_STRIPE_TIER }}
    - id: ops
      dockerfile: ./services/ops/Dockerfile
      context: .
      image: nullspace-ops
```

### 4.1 Why a matrix is the right shape

Without a matrix, you would copy-paste steps for each service. That is brittle. A matrix keeps the workflow DRY: one set of steps runs for each service entry.

This also means adding a new image is a one-line change in the matrix. That is a scale-friendly architecture for CI.

### 4.2 Website build args: secrets and environment

The website image requires Vite build-time envs. Those are injected as build args from GitHub Actions `vars` or `secrets`. This is a deliberate design:

- Build args are only used during build, not at runtime.
- Secrets can be injected without storing them in the repo.

However, it also means the website build can silently drift if those secrets change. This is why the workflow uses explicit build args: it forces you to be aware of the build-time configuration.

---

## 5) Buildx setup and authentication

The workflow sets up Docker Buildx and logs in to GHCR when the event is not a pull request:

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Log in to GHCR
  if: github.event_name != 'pull_request'
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.repository_owner }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

Buildx enables advanced features like cache exports and multi-platform builds (even if this workflow currently builds only one platform).

The login step uses the repo's GitHub token to push images. It is skipped for PRs, so PR builds do not publish images.

---

## 6) Tagging and metadata

The workflow uses `docker/metadata-action@v5` to generate tags and labels:

```yaml
tags: |
  type=ref,event=branch
  type=ref,event=tag
  type=sha
  type=raw,value=latest,enable={{is_default_branch}}
```

This yields several tags:

- Branch name tags (for main/master).
- Tag name tags (for releases).
- Git SHA tags (for exact commit tracking).
- `latest` for the default branch only.

This is a strong tagging strategy. It gives you stable tags for deployments (`latest` or branch tags) and immutable tags for debugging (`sha`).

The labels from metadata-action include standard OCI labels like source repository and commit.

---

## 7) Build and push step

The heart of the workflow is the build/push action:

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    context: ${{ matrix.context }}
    file: ${{ matrix.dockerfile }}
    push: ${{ github.event_name != 'pull_request' }}
    tags: ${{ steps.meta.outputs.tags }}
    labels: ${{ steps.meta.outputs.labels }}
    build-args: ${{ matrix.build_args || '' }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Key observations:

- `push` is conditional, so PRs do not publish.
- `build-args` are only set for the website entry.
- `cache-from` and `cache-to` use GitHub Actions cache, which is persistent across workflow runs.

### 7.1 Build cache: why it matters

Rust builds are slow when dependencies are recompiled. Docker layers help, but only if the cache is preserved across runs. Buildx cache in GitHub Actions solves that. When dependencies do not change, the build can reuse layers and skip most compilation.

This is a huge cost reduction for CI. Without cache, build times and CI costs would be much higher.

### 7.2 Cache-from and cache-to explained

The workflow uses `cache-from: type=gha` and `cache-to: type=gha,mode=max`. This means:

- Buildx pulls cached layers from GitHub Actions cache at the start.
- Buildx pushes new layers back to the cache at the end.
- `mode=max` stores more layers, which improves reuse but consumes more cache space.

The design is deliberate: you pay a small cost in cache storage to save minutes of build time on every run. If CI build times spike, the first thing to check is whether the cache is being hit.

### 7.3 Build args and secret hygiene

The website image uses build args derived from GitHub `vars` or `secrets`. This is convenient, but it also means build-time values can be baked into the final static assets. If a secret is truly sensitive (for example, a private API key), you must ensure it is never passed as a build arg. Vite build args are typically public configuration, not secrets.

In other words: treat `build-args` as public configuration. If you need secure runtime secrets, inject them at runtime, not at build time.

---

## 8) Simulator Dockerfile: multi-stage build

The root `Dockerfile` builds the simulator image. It uses a multi-stage build to keep the final image small.

### 8.1 Builder stage

```Dockerfile
FROM rust:1.83-slim-bookworm AS builder

RUN apt-get update && apt-get install -y     pkg-config     libssl-dev     && rm -rf /var/lib/apt/lists/*

WORKDIR /app
```

This stage uses a Rust base image and installs build dependencies. It is a heavy image, but it never ships to production.

### 8.2 Caching strategy with dummy sources

The Dockerfile copies only Cargo manifests first:

```Dockerfile
COPY Cargo.toml Cargo.lock ./
COPY node/Cargo.toml ./node/
COPY client/Cargo.toml ./client/
COPY execution/Cargo.toml ./execution/
COPY simulator/Cargo.toml ./simulator/
COPY types/Cargo.toml ./types/
COPY website/wasm/Cargo.toml ./website/wasm/
```

Then it creates dummy source files and builds the simulator:

```Dockerfile
RUN mkdir -p node/src client/src execution/src simulator/src types/src website/wasm/src &&     echo "fn main() {}" > node/src/main.rs &&     echo "fn main() {}" > client/src/main.rs &&     echo "pub fn placeholder() {}" > execution/src/lib.rs &&     echo "fn main() {}" > simulator/src/main.rs &&     echo "pub fn placeholder() {}" > types/src/lib.rs &&     echo "pub fn placeholder() {}" > website/wasm/src/lib.rs

RUN cargo build --release --package nullspace-simulator 2>/dev/null || true
```

This is a classic Rust Docker caching trick:

- Cargo dependencies are resolved from manifests only.
- By compiling a dummy program, you force Cargo to build dependencies and cache them in a layer.
- When real source files are copied later, dependencies remain cached.

Without this trick, every source change would invalidate the dependency layer and force a full rebuild.

### 8.2 Why the dummy build ignores errors

The dummy build ends with `2>/dev/null || true`. This means the build can fail without aborting the Docker build. The goal is not to produce a working binary at this stage; the goal is to compile dependencies so they are cached.

Sometimes the dummy build fails because the dummy sources are too minimal for a particular dependency or feature flag. Ignoring errors keeps the build moving. The real build happens later with the full source tree, and that is the one that must succeed.

This pattern is safe because the dummy build output is not used. It is purely a cache priming step.

### 8.3 Remove dummy sources and copy real code

After caching, the Dockerfile deletes dummy sources and copies real source code:

```Dockerfile
RUN rm -rf node/src client/src execution/src simulator/src types/src website/wasm/src

COPY node/ ./node/
COPY client/ ./client/
COPY execution/ ./execution/
COPY simulator/ ./simulator/
COPY types/ ./types/
COPY website/wasm/ ./website/wasm/
```

Then it compiles the actual simulator binary:

```Dockerfile
RUN cargo build --release --package nullspace-simulator
```

This sequence ensures the final binary is built from real source but benefits from cached dependencies.

---

## 9) Runtime stage: small and locked down

The runtime stage uses a minimal Debian slim image:

```Dockerfile
FROM debian:bookworm-slim
```

It installs only runtime dependencies:

- `ca-certificates` for HTTPS.
- `curl` for the healthcheck.
- `libssl3` for crypto libraries.

Then it creates a non-root user:

```Dockerfile
RUN useradd -m -u 1000 nullspace
```

Using a non-root user is a security best practice. If the process is compromised, the attacker does not get root privileges inside the container.

### 9.1 File ownership and writable paths

The Dockerfile runs `chown -R nullspace:nullspace /app` and then switches to the `nullspace` user. This ensures the binary and working directory are owned by the runtime user.

Why this matters: if the binary writes logs or temporary files inside `/app`, it will not fail due to permissions. In containers, permission failures often look like mysterious runtime crashes. Explicitly setting ownership avoids those surprises.

If you need writable data outside `/app`, you should mount a volume and ensure it is writable by uid 1000. The Dockerfile itself does not create extra data directories, which keeps the image clean and minimal.

### 9.2 Binary copy

The runtime stage copies the binary from the builder stage:

```Dockerfile
COPY --from=builder /app/target/release/nullspace-simulator /app/nullspace-simulator
```

The build tooling never ships, only the binary. This reduces image size and attack surface.

### 9.3 Healthcheck

The Dockerfile defines a healthcheck:

```Dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3     CMD curl -f http://localhost:8080/healthz || exit 1
```

This healthcheck is a deployment hook. It allows orchestration tools to know whether the simulator is healthy. If the healthcheck fails, the container can be restarted automatically.

### 9.4 Healthcheck intervals and failure detection

The healthcheck runs every 30 seconds with a 10-second timeout and requires 3 consecutive failures before the container is marked unhealthy. This balances sensitivity and noise:

- Too frequent healthchecks can create load and false positives.
- Too infrequent checks delay detection of failures.

The chosen values are a pragmatic compromise. If you run at very large scale or need faster failover, you can tighten the intervals, but you should watch for increased load on the service.

### 9.5 Why `curl` is included in runtime

`curl` is installed in the runtime image only to support the Docker healthcheck. This is a tradeoff: it adds a small amount of size to the image, but it makes healthchecks simple and reliable. You could replace it with a custom healthcheck binary or a `CMD` that checks a local socket, but `curl` is a straightforward and widely supported choice.

If you ever see runtime image size pressure, `curl` is one of the few optional packages you could remove, but you would need to replace the healthcheck with another mechanism.

### 9.6 Entrypoint

The final line is:

```Dockerfile
ENTRYPOINT ["/app/nullspace-simulator"]
```

This makes the container run the simulator binary directly. There is no shell wrapper, which keeps behavior predictable.

---

## 10) Failure modes and mitigation strategies

### 10.1 Cache invalidation

If Cargo manifests change, the dependency cache layer is invalidated. That is expected. But large dependency changes can slow CI dramatically. When possible, batch dependency changes rather than trickling them in, to avoid constant cache busts.

### 10.2 Missing build args for website

The website build depends on Vite environment variables. If those are missing, the build may succeed but produce a misconfigured app. In CI, you should ensure the secrets are set for the repository, and in PRs you should consider using safe defaults.

### 10.3 GHCR authentication failures

If `GITHUB_TOKEN` permissions are misconfigured, pushes to GHCR will fail. The workflow declares `packages: write` permissions explicitly to avoid that. If you change repository permissions, verify that this workflow still has access.

### 10.4 Buildx cache issues

If the Buildx cache grows large, it may be evicted. That causes build times to spike. This is mostly a cost and latency issue, not a correctness issue. Monitor build durations to detect cache misses.

### 10.5 Runtime dependency drift

The runtime image installs `libssl3` because the Rust binary is linked against OpenSSL. If the base image changes and provides a different OpenSSL version, binaries can fail to start or behave unexpectedly.

This is why the Dockerfile pins `debian:bookworm-slim` and uses `libssl3`. It aligns with the Rust builder image (`rust:1.83-slim-bookworm`) so the runtime environment matches the build environment. When you upgrade the Rust base image, check that the runtime image still has compatible libraries. This is one of the most common hidden failure modes in multi-stage builds.

---

## 11) CI best practices reflected here

This workflow already encodes several best practices:

- **Matrix builds** for scalability.
- **Conditional pushing** to avoid publishing PR images.
- **Immutable tags** (SHA) for precise rollbacks.
- **Latest tag only on default branch** to avoid confusion.
- **Build cache** to keep CI fast.

These are all common patterns in production CI/CD pipelines. The value is not just speed; it is reproducibility and safety.

## 10.1 Tag strategy and rollback safety

The tag strategy gives you three time scales:

- **Latest**: for environments that always track the default branch.
- **Branch tags**: for staging environments or long-lived branches.
- **SHA tags**: for debugging and rollbacks.

If a deployment fails, the safest rollback is to pin the SHA tag of a previously known-good image. This avoids ambiguity and does not depend on the mutable `latest` tag. That is why SHA tags are always generated, even though most deployments will not use them day-to-day.

## 10.2 Release tags and versioning

The workflow also tags images with Git tags (`v*`). This aligns image versions with repo releases. If you publish a release `v1.2.3`, the corresponding image tag is `v1.2.3`. This gives you a clean mapping between source releases and deployable artifacts.

In practice, this is how you build a release checklist: release tag -> image tag -> deployment. Each step is explicit and auditable.

## 10.3 Image labels and provenance

The metadata action also injects labels like repository URL and commit SHA. These labels are not just decoration; they are a provenance trail. If you have an image running in production, you can inspect it and recover exactly which commit produced it.

This is especially valuable during incident response. You can answer questions like "what code is running?" without guessing. Provenance labels turn the image itself into a record of its origin.

---

---

## 12) Practical upgrade path

If you add a new service and want a CI image:

1) Add a Dockerfile for the service.
2) Add a new entry to the matrix (with `id`, `dockerfile`, `context`, `image`).
3) Ensure GHCR permissions are correct.
4) Add any required build args or secrets.
5) Test by opening a PR and confirming the build succeeds.

This is intentionally simple. The workflow is designed to make new services easy to add.

---

## 11.1 Local testing and parity

If you want to reproduce a CI build locally, use the same Dockerfile and build args. For example, you can run `docker build -f Dockerfile .` for the simulator, or use the service-specific Dockerfile paths. The goal is to keep local builds as close as possible to CI so that surprises are rare.

Remember that CI uses Buildx and a fresh Linux environment. If your local environment differs (for example, macOS Docker, different CPU architecture), you may see different build times or cache behavior. The image content should still be the same if the Dockerfile is deterministic, but the performance profile can differ.

This is another reason to rely on CI images for production. Local builds are useful for iteration; CI builds are the source of truth for deployment.

---

## 13) Feynman recap

CI builds are the factory. The matrix is the production line: each service gets its own slot. The Dockerfile is the recipe. The builder stage cooks the meal, the runtime stage serves it on a clean plate. The healthcheck is the waiter checking if the food is good. If you understand this, you understand the CI and Docker pipeline.

---

## 14) Exercises

1) Why does the workflow skip pushing images on pull requests?
2) What is the purpose of `docker/metadata-action` tags, and why are SHA tags important?
3) How does the dummy source build improve Rust build caching?
4) Why does the runtime stage create a non-root user?
5) If the Buildx cache is empty, which part of the workflow gets slower and why?

---

## Next lesson

E13 - Systemd + service orchestration: `feynman/lessons/E13-systemd-services.md`
