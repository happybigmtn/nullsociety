Goal (incl. success criteria):
- Disable 3D animations, keep 2D-only visuals with realistic physics (especially craps dice rolls), and move all 3D code into a legacy folder for future work while keeping chain + frontend running.

Constraints/Assumptions:
- Follow `agents.md` guidance: read/update this ledger at start of each turn and whenever goal/state/decisions change; keep it brief and factual.
- Default ASCII edits; avoid destructive commands; use `rg` for search.
- Preserve physics/chain-driven outcomes while disabling 3D animations.

Key decisions:
- Removed legacy 3D modules and `CollisionSound`; moved collision audio into `PhysicsDice` due to missing `useRigidBodyContext`.
- 3D code is now isolated under `website/src/components/casino/legacy/3d`; 2D-only rendering is active.

State:
- Simulator running on 0.0.0.0:8080 (exec session 22934).
- Dev executor running against 127.0.0.1:8080 (exec session 28113).
- Frontend Vite dev server running on 0.0.0.0:3000 (exec session 57598).
- QA previously: Baccarat/Blackjack/Casino War/Craps/Sic Bo/Roulette/Hilo bets worked; Video Poker worked once in new tab; Three Card Poker and Ultimate Hold'em deal failed with `CasinoError: Invalid game move` (retest needed after atomic deal change).
- Build failed earlier on PhysicsWorkerBridge worker format (unresolved).
- WebGL context loss in Playwright; 3D overlay canvas can intercept clicks.

Done:
- Allowed atomic deal actions in Three Card and Ultimate Hold'em by adding enum variants (payload 7/11 no longer rejected).
- Rebuilt card textures to photorealistic paper + ink style; added paper normal/roughness maps.
- Updated Card3D and CardPoolManager to use physical materials and subtle edge accents.
- Rebuilt dice textures/materials to photorealistic white dice with red pips.
- Added felt + wood table geometry to CardTableScene3D (no more floating cards).
- Made CardAnimationOverlay render 3D scene full-time behind UI; expands above UI during action.
- Removed legacy 3D files (BaccaratScene3D, BaccaratCard/Dealer, DeckAnimation, GoldTrail, PowerMeter, Slingshot, goldLeafTexture).
- Forced 3D default in `abDefaults`.
- Moved collision audio into `PhysicsDice`; removed `CollisionSound` component.
- Started chain and Vite dev server; verified `http://localhost:5173` reachable.
- QA: Three Card Poker deal/play/reveal/new hand flow works; Ultimate Hold'em check/check/bet/reveal flow works.
- QA: Video Poker hold/draw flow works (result updated and next hand available).
- Removed 3D usage from game views, disabled 3D overlays/toggles, and switched to 2D-only rendering.
- Moved `website/src/components/casino/3d` to `website/src/components/casino/legacy/3d`.
- Updated 2D dice visuals to use photorealistic faces and enhanced roll animation.
- Started simulator, dev-executor, and frontend in long-running exec sessions.

Now:
- Ensure blockchain (simulator + dev-executor) and frontend (Vite) are running per user request.

Next:
- Re-run betting QA across games after 3D is removed/disabled; confirm craps dice roll visuals in 2D.

Open questions (UNCONFIRMED if needed):
- None.

Working set (files/ids/commands):
- CONTINUITY.md
- website/src/components/casino/GameComponents.tsx
- website/src/components/casino/ActiveGame.tsx
- website/src/components/casino/games/CrapsView.tsx
- website/src/components/casino/games/SicBoView.tsx
- website/src/components/casino/games/RouletteView.tsx
- website/src/components/casino/games/BaccaratView.tsx
- website/src/components/casino/games/BlackjackView.tsx
- website/src/components/casino/games/HiLoView.tsx
- website/src/components/casino/games/VideoPokerView.tsx
- website/src/components/casino/games/ThreeCardPokerView.tsx
- website/src/components/casino/games/UltimateHoldemView.tsx
- website/src/components/casino/legacy/3d/
- website/src/index.css
- processes: Vite PID 3022159, simulator PID 3021734, dev-executor PID 3025380
