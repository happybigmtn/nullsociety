# Production Blockers

## Summary
- Cargo workspace tests do not compile due to stale `nullspace-node` test fixtures missing new config fields. No further commands executed because build failed.

## Repro Steps
1. From repo root: `cargo test --locked --workspace --all-targets --no-run`
2. Compilation fails with `E0063` in `node/src/tests.rs` (missing `mempool_stream_buffer_size`, `nonce_cache_capacity`, `nonce_cache_ttl*` fields on `Config` and `ApplicationConfig`).

## Impact
- Blocks any CI pipeline or local testing; downstream binaries may be unverified. Treat as **P0** until tests compile or the failing tests are removed/updated.

## Notes
- Did not attempt npm/vite/test runs because Rust workspace build failed; re-run after fixing the Rust blocker.
