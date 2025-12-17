# Refactor 4: Comprehensive Review & Roadmap

## 1. Architectural Overview
*   **Coupling:** The `node` crate depends on `client`, which is an anti-pattern (circular dependency risk).
*   **Logic Sharing:** `client` and `website/wasm` depend on `execution`. While this ensures logic consistency, it bloats the client. The `execution` crate should be kept lean.
*   **Separation of Concerns:** Generally good, but `client` crate mixes SDK with `dev-executor` logic.

## 2. Performance & Security
*   **Safety:** The backend code is generally safe, avoiding `unwrap()` in production paths. Panics are mostly confined to tests.
*   **Frontend Security:** Private keys are stored in `localStorage` in the frontend (`CasinoClient`). This is a known risk for a demo but unacceptable for production.
*   **State Bloat:** The simulator uses in-memory `BTreeMap` for state. This will not scale and persistency is mocked.

## 3. Frontend Complexity (Critical)
*   **Monolithic Hook:** `useTerminalGame.ts` (~6000 lines) is unmaintainable. It mixes:
    *   WebSocket communication
    *   State management for 10+ games
    *   UI logic (sounds, delays)
    *   Business logic (local simulation vs chain)
*   **Recommendation:** Split into `useChainService`, `useGameState`, and game-specific hooks (`useCraps`, `useBlackjack`).
*   **Component Duplication:** `Sidebar` logic is duplicated in `CrapsView` and others. It should be a shared component.

## 4. Recent Fixes
*   **Backend Stability:** Fixed identity decoding crash and race conditions in `dev-executor`.
*   **Network:** Enforced IPv4 binding (`0.0.0.0`) and explicit `VITE_URL` to solve connectivity issues.
*   **Responsiveness:** Fixed tablet overlap by enforcing mobile layout up to `lg` breakpoint.
*   **Game UX:** Fixed Baccarat animation flashing and added Craps Odds selection logic.
