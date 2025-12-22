Goal (incl. success criteria):
- Commit and push all current changes to GitHub, then continue implementing `4d.md` (Phase 2) with deliberate stage tracking; add a test runner and run tests along the way.

Constraints/Assumptions:
- Follow `agents.md` guidance: read/update this ledger at start of each turn and whenever goal/state/decisions change; keep it brief and factual.
- Default ASCII edits; avoid destructive commands.
- Must be deliberate about tracking progress through each stage in `4d.md`.

Key decisions:
- None yet (pending scope/ordering based on `4d.md` stages).

State:
- Phase 1 complete; Phase 2 in progress (deterministic RNG wiring for roulette/craps/sic bo).
- User confirmed committing/pushing all modified/untracked files.

Done:
- Read `agents.md` and `4d.md`.
- Added `zustand` dependency for GuidedStore usage.
- Seeded RNG for roulette/craps/sic bo launches; passed round IDs through wrappers/views.

Now:
- Commit/push all changes; add test runner; proceed Phase 2 physics guidance/collider work.

Next:
- Implement roulette/dice guided physics modules and integrate with scenes; add tests.

Open questions (UNCONFIRMED if needed):
- None.

Working set (files/ids/commands):
- http://CONTINUITY.md
- 4d.md
- website/package.json
- website/package-lock.json
- website/src/components/casino/3d/CrapsScene3D.tsx
- website/src/components/casino/3d/SicBoScene3D.tsx
- website/src/components/casino/3d/RouletteScene3D.tsx
- website/src/components/casino/3d/PhysicsDice.tsx
- website/src/components/casino/3d/diceUtils.ts
- website/src/components/casino/3d/CrapsDice3DWrapper.tsx
- website/src/components/casino/3d/SicBoDice3DWrapper.tsx
- website/src/components/casino/games/CrapsView.tsx
- website/src/components/casino/games/SicBoView.tsx
