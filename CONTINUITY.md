Goal (incl. success criteria):
- Review current codebase against `4d.md` plan and identify gaps.
- Enable all 3D scenes by default and ensure 3D overlays fully cover their subwindow during play, using the new physics engine (avoid legacy animations).

Constraints/Assumptions:
- Follow `agents.md` guidance: read/update this ledger at start of each turn and whenever goal/state/decisions change; keep it brief and factual.
- Default ASCII edits; avoid destructive commands.
- Must be deliberate about tracking progress through each stage in `4d.md`.

Key decisions:
- None yet.

State:
- Phase 1 complete; Phase 2 complete (roulette/dice physics guidance, colliders, shooter arm, pyramid wall).
- Phase 3 complete (card pool/deal/peek system integrated and tested).

Done:
- Read `agents.md` and `4d.md`.
- Added `zustand` dependency for GuidedStore usage.
- Seeded RNG for roulette/craps/sic bo launches; passed round IDs through wrappers/views.
- Committed and pushed all repo changes.
- Added Vitest runner and guided forces unit tests.
- Added roulette physics tests and aligned dice guidance with attractor config/physics constants.
- Added card pool manager, deal/peek animation helpers, integrated into CardTableScene3D with tests.
- Added lighting rig presets and wired them into casino scenes with post-processing exposure.
- Added LightningEffect and SqueezeCard shader components.
- Ran `npm run test:unit` and `npm test`.
- Committed and pushed Phase 4 lighting/shader updates.
- Created AudioManager and procedural sound generators.
- Added CollisionSound, PositionalAudioEmitter, and AmbientSoundscape components.
- Ran `npm run test:unit`.
- Synced AudioManager with sound toggle.
- Wired ambient soundscapes into roulette/craps/sic bo scenes.
- Added collision audio to physics dice.
- Ran `npm run test:unit` after audio integration.
- Added positional audio emitters for dice and roulette ball.
- Wired GuidedStore actions for chain outcomes, skip requests, and animation blocking.
- Ran `npm run test:unit` and `npm test`.
- Committed and pushed positional audio + guided store wiring.
- Added dev-only performance overlay for 3D scenes.
- Tuned mobile physics settings for lighter simulation.
- Wired GuidedStore for blackjack/baccarat card animations (blocking/skip/outcomes).
- Ran `npm run test:unit` and `npm test`.
- Added telemetry tracking for 3D toggles/animation starts/skips.
- Ran `npm run test:unit` and `npm test` (from `website/`).
- Defaulted 3D A/B bucket to always start in 3D.
- Raised card-game 2D/3D toggle z-index to stay visible over sidebars.
- Wired Lightning Roulette multipliers from `superMode` into roulette 3D scene.
- Added Lightning Roulette multiplier badges + lightning overlay effect in RouletteScene3D.
- Ran `npm run test:unit` and `npm test` (from `website/`).
- Added `sessionId` + `moveNumber` to `GameState`, wired round ID derivation for all card games/overlays.
- Added baccarat squeeze shader integration and card reveal handling.
- Added Casino War outcome lighting + trend display and 3D chip stack instancing.
- Added physics worker scaffold and deterministic replay harness + tests.
- Added performance sampler, 3D A/B default, and feedback prompts for 3D scenes.
- Added QA checklist doc for guided 3D regression coverage.
- Ran `npm run test:unit` and `npm test` (from `website/`).
- Fixed roulette ball animation bug: ball now properly settles on target number instead of spinning forever.
  - Root cause: animation start effect re-ran when resultId changed, resetting targetRef.current to null
  - Fix: track previous isAnimating value with ref, only reset on fresh animation start (false→true transition)

Now:
- Roulette 3D animation working correctly (tested: ball settles on target, wins recorded properly).

Next:
- Continue with any remaining 3D scene validation or polish.

Open questions (UNCONFIRMED if needed):
- Which specific animations are considered “legacy” to be removed or replaced?

Working set (files/ids/commands):
- http://CONTINUITY.md
- 4d.md
- website/src/components/casino/3d/CardAnimationOverlay.tsx
- website/src/components/casino/3d/CardTableScene3D.tsx
- website/src/components/casino/3d/PerformanceSampler.tsx
- website/src/components/casino/3d/RouletteWheel3DWrapper.tsx
- website/src/components/casino/3d/CrapsDice3DWrapper.tsx
- website/src/components/casino/3d/SicBoDice3DWrapper.tsx
- website/src/components/casino/3d/RouletteScene3D.tsx
- website/src/components/casino/3d/CrapsScene3D.tsx
- website/src/components/casino/3d/SicBoScene3D.tsx
- website/src/components/casino/3d/BaccaratScene3D.tsx
- website/src/components/casino/3d/cards/SqueezeCard3D.tsx
- website/src/components/casino/3d/chips/ChipStack3D.tsx
- website/src/components/casino/3d/physics/PhysicsWorkerBridge.ts
- website/src/components/casino/3d/engine/replayHarness.ts
- website/src/components/casino/3d/use3DFeedbackPrompt.ts
- website/src/components/casino/games/GenericGameView.tsx
- website/docs/guided-3d-qa.md
