# Nullspace Testnet Remediation Plan (Master)

Status key:
- [ ] Not started
- [~] In progress
- [x] Complete

## Current focus (this pass)
- [x] Mobile feature parity: bring all casino games + state parsing to iOS/Android
- [x] Mobile wallet/testnet connectivity + reconnect handling
- [x] Mobile performance pass (parsing off main thread, render memoization)
- [x] Mobile UX polish + native navigation behavior
- [x] Mobile QA and docs refresh
- [x] Mobile lint pipeline: ESLint flat config + version alignment + duplicate protocol exports cleanup
- [x] Mobile cleanup: lint warnings resolved + UTH trips bet selection toggle
- [x] Mobile tests: jest-expo setup aligned + baseline utils test added

## Backend (Server & Blockchain Engine)
### Crash-proofing & error handling
- [x] Replace production `panic!`/`unwrap`/`expect` with Result-based errors in casino engine (deck handling, node tool unwraps)
- [x] Replace remaining `lock().unwrap()` / `RwLock` unwraps in production paths with poison-safe handling (simulator/client locks updated)
- [x] Add structured error context for critical failures (casino move rejection context added)

### Untrusted input validation
- [x] Audit payload parsing in casino games; enforce bounds and length checks for all bet counts/indexes
- [x] Add invariant checks on deserialized state blobs (hand counts, indices, dice/card ranges) (blackjack/baccarat/video poker/roulette/sic bo/craps checks added)
- [x] Add fuzz tests for payload/state parsing (per game) (state + payload fuzz coverage for all casino games)

### Performance & memory
- [x] Pre-allocate serialization buffers in hot paths (game state blobs, event logs) (log assembly pre-allocs added, UTH/Three Card/Blackjack/Casino War/Baccarat logs streamlined; bet serialization now stack arrays in craps/roulette/baccarat/sic bo; blackjack deck rebuild prealloc; craps bet snapshots prealloc; baccarat super multiplier uses stack card buffer; three-card deck exclude avoids heap; deck creation avoids collect + prealloc)
- [x] Reduce clone-heavy paths in casino engine (roulette En Prison + handler log clones reduced; start-game handler now stores session without clone)
- [x] Profile and tune per-game move processing allocations (deck creation prealloc + card aggregation allocations reduced)

### Configurable limits & scaling
- [x] Inventory hard-coded limits (payload size, bet caps, mempool fetch count, ws limits)
- [x] Centralize limits in config/constants module (node storage/app tunables moved into config + docs/limits updated; casino limits already centralized)
- [x] Add metrics/alerts when limits are hit (HTTP/WS/mempool alert rules + node metrics scrape)

### Game logic audit & tests
- [x] Verify all casino games against rules/payout tables (Blackjack, Baccarat, Roulette, Craps, Sic Bo, Video Poker, Three Card, UTH, Casino War, Hi-Lo) (UTH dealer-qualification + blind/trips/6-card paytables; Three Card ante bonus; Craps field/odds/no; Sic Bo small/big; Hi-Lo tie push; Video Poker ace-low straight; Blackjack rule toggles; Roulette La Partage/En Prison/American 00; Baccarat dragon/panda/perfect pair; Casino War surrender)
- [x] Fill missing game features/side-bets and add unit tests for edge cases (21+3, dragon/panda/perfect pair, trips/six-card, ATS/field/odds, Sic Bo small/big, Hi-Lo tie push, Video Poker ace-low straight)

### Testnet chain readiness
- [x] Multi-node soak test (mempool, indexer, actor system) without deadlocks (added `scripts/soak-test.sh` harness + readiness/cleanup fixes)
- [x] Persistence for game/ledger state + recovery validation (runtime storage dir + unclean shutdown recovery test in `node/src/tests.rs` + restart check in `docs/testnet-runbook.md`)
- [x] Seed node config + bootstrap scripts for testnet deployment (`scripts/bootstrap-testnet.sh` + `configs/testnet/peers.yaml.example` + `configs/testnet/hosts.yaml.example`)
- [x] External chain integration/bridging (if required) and wallet RPC compatibility (bridge relayer + runbook)

### API & integration services
- [x] Move sensitive integrations to backend (Gemini AI proxy + tournament scheduler + bot load runner)
- [x] Rate limiting + auth on new endpoints (AI strategy route guarded)
- [x] API coverage for all frontend features (leaderboards/tournaments via chain state + wasm encoders)
- [x] Gateway move payloads aligned to shared constants (Hi-Lo/Casino War) to prevent enum drift

### Logging/monitoring/observability
- [x] Structured logging for game events and errors (casino error events now logged)
- [x] System & game metrics dashboards (CPU/memory/tick, concurrent games, limit hits)
- [x] Diagnostics tooling (state dump, per-session trace)

### Documentation
- [x] Update backend docs for error handling, configs, and architecture changes (limits inventory + runbook/observability/backend notes)

## Web App (Desktop)
### Hook refactor & modularization
- [x] Split `useTerminalGame.ts` into smaller hooks/services; enforce <400 LOC per file
- [x] Move per-game logic into `services/games/*` with unit tests

### State parsing & UI parity
- [x] Ensure parsers exist for all game types; align types via ts-rs or generated types
- [x] Validate/visualize full game state in UI (craps, baccarat, roulette, sic bo, etc.)

### Security
- [x] Remove secrets from client bundle; proxy AI requests via backend
- [x] Remove legacy client-only AI service stub (single backend proxy path)
- [x] Add client-side error handling + rate limit feedback for AI/tooling calls (AI strategy feedback wired)

### Performance
- [x] Memoize expensive computations (roulette exposures cached in `RouletteView`)
- [x] React.memo for heavy game views; remove debug logging in hot paths (useTerminalGame + client/nonce/bot/chain logs now dev-gated)

### Wallet/testnet UX
- [x] Wallet connect with custom testnet chain; network switch prompts
- [x] Faucet/test chip flow + balance visibility
- [x] Deposit/withdraw UX (or explicit “coming soon” guardrails)

### UI/UX polish
- [x] Fix betting controls, timers, modals; add clear error feedback
- [x] Add roulette mobile bet drawer + number picker + spin control (closes missing BETS drawer gap)
- [x] Support roulette 00 input/labels + exposure rows under American rule
- [x] Render 00 on roulette wheel when American rule is active
- [x] Roulette max-win calculation respects American vs European rule
- [x] Cross-browser testing (layout smoke passes Chromium + Chrome + Firefox + WebKit; WebKit requires local runtime libs)

### Documentation
- [x] Update web app docs (hook structure, env config, testnet usage)

## Mobile App (iOS/Android)
### Feature parity
- [x] Implement all games and betting features matching web
- [x] Sync state parsing rules with backend for all games

### Wallet/network integration
- [x] Wallet identity + testnet session key surfaced (gateway session + faucet flow)
- [x] Real-time updates with reconnect handling (AppState foreground reconnect hook wired)

### Performance
- [x] Offload heavy parsing from UI thread
- [x] Memoize derived values; tune list rendering (FlatList + responsive columns)
- [x] Share chip denomination constants with web (no mobile-only duplication)

### Mobile UX & native integration
- [x] Platform-appropriate navigation/back handling
- [x] Touch-optimized layouts + orientation support
- [x] Push notification groundwork (if in scope)

### QA & release readiness
- [x] Device testing checklist (iOS/Android) with flaky network scenarios documented
- [x] Security review (no secrets in logs, secure storage)
- [x] Update mobile docs + screenshots
- [x] Mobile lint config aligned with ESLint 8 + flat config; duplicate protocol exports removed
- [x] Mobile unit tests running via jest-expo (NativeModules + expo-modules-core mappings)

## Cross-cutting
- [x] Test coverage for critical flows (bet placement, payouts, tournaments)
- [x] Gate long-running gateway bet-type coverage suite behind `RUN_INTEGRATION` (keeps unit runs green)
- [x] Align execution layer tests with faucet/AMM policy limits (staking + swap slippage expectations)
- [x] Reduce node test noise (remove unused helpers, clean dead-code warnings)
- [x] Unblock client test harness with simulator origin requirements (allow no-origin in tests)
- [x] Fix simulator tests to use tokio runtime for update indexing tasks
- [x] CI checks for panic/unwrap usage in production modules

## Testing notes
- Layout smoke (`pnpm -C website e2e:layout`) passes in Chromium + Chrome + Firefox; WebKit passes when `PW_WEBKIT_LIB_PATH` points at Ubuntu 20.04 libs staged by `website/scripts/setup-webkit-libs.sh`.
