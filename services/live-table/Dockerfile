FROM rust:1.83-slim-bookworm AS builder

RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY services/live-table/Cargo.toml ./services/live-table/
COPY execution/Cargo.toml ./execution/
COPY types/Cargo.toml ./types/

RUN mkdir -p services/live-table/src execution/src types/src && \
    echo "fn main() {}" > services/live-table/src/main.rs && \
    echo "pub fn placeholder() {}" > execution/src/lib.rs && \
    echo "pub fn placeholder() {}" > types/src/lib.rs

RUN cargo build --release --package nullspace-live-table 2>/dev/null || true

RUN rm -rf services/live-table/src execution/src types/src

COPY services/live-table/ ./services/live-table/
COPY execution/ ./execution/
COPY types/ ./types/

RUN cargo build --release --package nullspace-live-table

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 nullspace

WORKDIR /app

COPY --from=builder /app/target/release/nullspace-live-table /app/nullspace-live-table

RUN chown -R nullspace:nullspace /app

USER nullspace

ENTRYPOINT ["/app/nullspace-live-table"]
