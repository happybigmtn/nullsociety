# UX Review: Simplicity, Transparency, Refreshed Play
Date: 2025-12-29

## Scope
- Web app: casino UI, shared header/tabs/pills, and pseudo-3D game elements.
- Mobile app: lobby, game layout/header, and per-game screens.
- Motion system: CSS keyframes and transitions (web), React Spring (web), Reanimated (mobile), and design-tokens spring presets.

## Current design snapshot
### Web
- Visual language: titanium palette + glass surfaces + bold action colors; strong arcade-casino energy.
- Structure: multiple concurrent control surfaces (Header + glass top bar + per-game controls); reads as busy on large screens.
- Information density: status, balance, game controls, and menu items often compete at once.
- Navigation: several entry points (tabs, top bar, hamburger, bottom nav on mobile) that can feel redundant.

### Mobile
- Visual language: minimal, premium surfaces; scanline overlay adds subtle texture.
- Structure: clear lobby grid and a simple header; each game owns its layout.
- Information density: generally calmer than web, but each game screen introduces its own UI conventions.
- Motion: haptics + subtle reanimated transitions add tactility.

## Animation physics inventory
### Web (CSS + React Spring)
- Global CSS: `scaleIn` (0.5s, cubic-bezier(0.2,0.8,0.2,1)), `slideIn` (0.3s), `transition-all-snappy` (0.4s cubic-bezier(0.2,0.8,0.2,1)).
- Pseudo3DCard: spring `mass: 1.2, tension: 280, friction: 22`, with 80ms stagger per card.
- Pseudo3DDice: spring `mass: 1, tension: 200, friction: 20`; settle config `mass: 1.2, tension: 180, friction: 18`; dot opacity spring `tension: 300, friction: 20`.
- Pseudo3DWheel: spin spring `mass: 4, tension: 100, friction: 40`; settle spring `mass: 1, tension: 200, friction: 30`; ball uses duration 3500ms with smoothstep easing.
- DiceThrow2D: custom velocity-based motion with friction and settle-to-row logic.
- Observation: web motion values are bespoke and do not reference design-tokens; perceived feel varies by component. Also, `GameControlBar` includes a non-tailwind class `cubic-bezier(0.2, 0.8, 0.2, 1)` which likely has no effect.

### Mobile (Reanimated + design-tokens)
- Spring presets: `ANIMATION.spring` maps to `SPRING.modal` (tokens); dice and chip gestures use spring to feel tactile.
- Roulette wheel: `withRepeat(withTiming(360, duration=500, linear))`, then resets to 0 on result.
- Dice: `withSequence(withTiming(-40..-50ms), withSpring(0, SPRING.diceTumble))` plus haptic cues.
- Observation: mobile motion is closer to a system (tokens, haptics) but still mixes linear loops and bespoke timings.

## Codebase review (implementation map)
### Web surfaces
- `website/src/CasinoApp.tsx`: top bar + cash-mode banner drive primary CTAs; moved daily bonus into a single rewards hub to reduce clutter.
- `website/src/components/casino/Layout.tsx`: header now the natural anchor for event cadence + session delta (balance + session PnL).
- `website/src/components/casino/ActiveGame.tsx`: central surface for first-hand prompts and a shared bet slip.
- `website/src/components/casino/shared/BetSlip.tsx`: now supports a max-win readout for transparent outcomes.

### Mobile surfaces
- `mobile/src/screens/LobbyScreen.tsx`: primary entry point for rewards + optional club join (no modal stack).
- `mobile/src/components/game/GameLayout.tsx` + `GameHeader.tsx`: consolidated session delta + weekly event badge for in-play clarity.
- `mobile/src/services/storage.ts`: lightweight persistence for daily bonus streaks and club membership.

## Competitive research: leading social casino apps
Sources consulted (marketing sites):
- Slotomania: https://www.slotomania.com/
- Huuuge Casino: https://www.huuugecasino.com/
- DoubleDown Casino: https://www.doubledowncasino.com/
- Jackpot Party Casino: https://www.jackpotparty.com/
- House of Fun: https://www.houseoffun.com/
- Zynga Poker: https://www.zyngapoker.com/

Observed patterns:
- Heavy emphasis on free chips/bonuses, daily rewards, jackpots, and promotions.
- Community and social framing (clubs, tournaments, and events).
- Persistent "economy bar" that includes balance, level, and store access.
- Big single CTA per screen (Spin, Deal, Bet) with secondary actions hidden in drawers.
- Aggressive bannering and modal popups to push events and collect bonuses (often cluttered).

Implications:
- The market uses reward-driven clutter to drive retention. We can take the positive (clear rewards, progress, community) while reducing noise and increasing trust.

## Expanded competitive research (App Store descriptions)
Sources consulted (App Store listings):
- Slotomania: https://apps.apple.com/us/app/slotomania-slots-machine-game/id447553564
- Huuuge Casino: https://apps.apple.com/us/app/huuuge-casino-slots-games-777/id1028362533
- DoubleDown Casino: https://apps.apple.com/us/app/doubledown-casino-vegas-slots/id485126024
- Jackpot Party Casino: https://apps.apple.com/us/app/jackpot-party-casino-slots/id575980917
- House of Fun: https://apps.apple.com/us/app/house-of-fun-casino-slots/id586634331
- Cashman Casino: https://apps.apple.com/us/app/cashman-casino-slots-games/id1123582513
- Zynga Poker: https://apps.apple.com/us/app/zynga-poker-texas-holdem/id354902315
- myVEGAS Slots: https://apps.apple.com/us/app/myvegas-slots-real-rewards/id714508224
- Big Fish Casino: https://apps.apple.com/us/app/big-fish-casino-slots-games/id538212549
- Billionaire Casino: https://apps.apple.com/us/app/billionaire-casino-slots-777/id1098617974

Observed product loops:
- Welcome bonuses are large and immediate; daily bonuses and time-gated rewards are standard.
- Clubs and leagues are prominent: team play, club tournaments, chat, and gifting are common.
- Tournaments and events are presented as constant, rotating content.
- Jackpots and progressive jackpots are emphasized as the core excitement loop.
- VIP or loyalty tiers are used to justify premium currency and retention.

Clutter sources to avoid:
- Multiple simultaneous banners (events, offers, promos) competing with core play.
- Forced modal sequences that interrupt the "moment of play."
- Overloaded header bars (balance, levels, store, inbox, event badge) with no hierarchy.

## Research-driven priority actions (next set)
1) Rewards hub with restraint
   - A single surface that aggregates daily bonus, streak, and a small set of missions.
   - No full-screen modal spam; use a compact "Rewards" drawer with one primary CTA.

2) Social layer, minimal by design
   - Introduce Clubs as an optional lane: join once, then show a weekly club goal and a single club CTA.
   - Keep chat and gifting behind a secondary panel; never on the main play surface.

3) Event cadence without overload
   - One active event at a time, with an unobtrusive countdown chip.
   - Weekly rotation with a clear "why" (ex: roulette week, craps week) rather than a list of parallel promos.

4) Economy clarity
   - Persistent balance + session delta in a single, small widget.
   - Surface "expected payout" and odds in the bet slip for transparency.

5) Onboarding as a calm "first hand"
   - Replace long tutorials with a guided first hand: one prompt at a time, clear confirmation, then fade away.
   - Emphasize provably fair and on-chain safety at the moment of first bet.

## Design recommendations
### Simplicity (reduce clutter, keep focus)
- Unify control surfaces per game. Aim for one primary control area (bottom island or side panel), one header strip, and a single overflow area for secondary actions.
- Standardize "bet slip" placement across games (total bet, max win, odds) so it is predictable and calm.
- Collapse side bets and advanced options into a single "More bets" drawer with state memory.
- Reduce redundant navigation: for web, choose either header tabs or top bar, not both.
- In mobile, keep the lobby grid minimal but introduce a single "session status" tile (balance + streak) instead of multiple banners.

### Transparency (trust and clarity)
- Show odds and house edge where bets are placed (ex: "35:1, house edge 2.7%") to build long-term trust.
- Surface "provably fair" and on-chain status in a consistent, compact component near the bet slip.
- Replace raw backend errors with human-first messaging and a consistent retry pattern.
- Add a lightweight activity ledger (last 3 actions) with states: pending, confirmed, failed.

### Refreshed play (a new casino feel)
- Introduce "Focus Mode" as the default: dim secondary UI, keep table center stage, move all secondary controls to a single slide-out.
- Create a clear "moment of play": big CTA, a short silent beat, then the reveal. Fewer elements animate, but with more intent.
- Adopt a "tactile economy": chips drag/stack, slight table parallax, haptic and audio cues that reinforce action without noise.
- Reframe the lobby as a "gallery of tables" rather than a list of games; reduce emojis and rely on consistent art direction.

### Motion system alignment
- Use design-tokens springs on web to align physics across platforms.
- Define three motion tiers and enforce them:
  - Micro: 150-200ms (press, hover).
  - State change: 250-350ms (bet placement, selection).
  - Reveal: 500-700ms (deal/spin result).
- Gate all non-essential motion behind reduced-motion preferences.

## Priority actions
### Implemented (current pass)
- Rewards hub (drawer) with daily bonus, streak, and three simple missions.
- Minimal clubs lane (join once, show weekly goal progress).
- Event cadence as a single weekly focus chip with countdown.
- Economy clarity widget (balance + session delta) in the web header and mobile game header.
- Bet slip transparency (max win for roulette/sic bo/craps) + first-hand prompt.

Now (1-2 sprints)
- Collapse redundant nav on web, keep one control hub per game.
- Implement a shared bet slip component with clear odds and total bet.
- Standardize motion timings for primary interactions.

Next (2-4 sprints)
- Migrate web springs to design tokens; align with mobile ANIMATION.spring.
- Add session ledger and provably fair callout in both web and mobile.

Later (4+ sprints)
- Rebuild the lobby as a "table gallery" with consistent art direction.
- Explore a "Focus Mode" that is the default entry point for play.
