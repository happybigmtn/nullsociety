# L26 - Freeroll UI scheduler (from scratch)

Focus file: `website/src/hooks/terminalGame/useFreerollScheduler.ts`

Goal: explain how the UI keeps freeroll tournaments in sync with chain state and automatically starts/ends tournaments when needed. For every excerpt, you will see **why it matters** and a **plain description of what the code does**.

---

## Concepts from scratch (expanded)

### 1) UI needs a scheduler
Freeroll tournaments are time‑based. The UI must:
- know the next tournament time,
- detect the active tournament,
- update player stats and leaderboard,
- trigger auto‑start/end when needed.

### 2) WebSocket vs polling
The UI prefers WebSocket updates. If the socket is idle or hidden, it falls back to periodic HTTP polling.

### 3) Registration vs active phases
Freerolls have a registration window and an active window. The UI uses this to show appropriate state and to trigger auto‑start/end.

---

## Limits & management callouts (important)

1) **Polling intervals**
- `NETWORK_POLL_FAST_MS = 2000`
- `NETWORK_POLL_IDLE_MS = 8000`
- `NETWORK_POLL_HIDDEN_MS = 30000`
These trade responsiveness for bandwidth.

2) **WS idle thresholds**
- `WS_IDLE_FAST_MS = 4000`
- `WS_IDLE_SLOW_MS = 15000`
- `WS_IDLE_HIDDEN_MS = 60000`
Used to decide when to fall back to polling.

3) **Leaderboard polling**
- `LEADERBOARD_POLL_MIN_MS = 15000`
Avoids hammering the leaderboard endpoint.

---

## Walkthrough with code excerpts

### 1) Schedule tick and next tournament timing
```ts
useEffect(() => {
  const interval = setInterval(() => {
    const now = Date.now();
    if (playMode !== 'FREEROLL') {
      setTournamentTime(0);
      setFreerollActiveTournamentId(null);
      setFreerollActiveTimeLeft(0);
      setFreerollNextTournamentId(null);
      setFreerollNextStartIn(0);
      setFreerollIsJoinedNext(false);
    } else {
      const scheduleNow = getFreerollSchedule(now);
      const nextTid = scheduleNow.isRegistration ? scheduleNow.tournamentId : scheduleNow.tournamentId + 1;
      const nextStartMs = nextTid * FREEROLL_CYCLE_MS + FREEROLL_REGISTRATION_MS;
      setFreerollNextTournamentId(nextTid);
      setFreerollNextStartIn(Math.max(0, Math.ceil((nextStartMs - now) / 1000)));

      if (manualTournamentEndTime !== null && phase === 'ACTIVE') {
        const remaining = Math.max(0, manualTournamentEndTime - now);
        setTournamentTime(Math.ceil(remaining / 1000));
      }
    }
    // ...
  }, 1000);

  return () => clearInterval(interval);
}, [/* deps */]);
```

Why this matters:
- The UI must always know when the next freeroll starts and how long the current one lasts.

What this code does:
- Runs once per second.
- If not in freeroll mode, clears tournament UI state.
- If in freeroll mode, computes next tournament ID and time‑to‑start.
- Updates countdown timers when the tournament is active.

---

### 2) WS idle detection and fallback polling
```ts
const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
const updatesStatus = clientRef.current?.getUpdatesStatus?.();
const sessionStatus = clientRef.current?.getSessionStatus?.();
const lastEventAt = Math.max(updatesStatus?.lastEventAt ?? 0, sessionStatus?.lastEventAt ?? 0);
const wsConnected = Boolean(updatesStatus?.connected || sessionStatus?.connected);
const idleThreshold = isHidden
  ? WS_IDLE_HIDDEN_MS
  : (awaitingChainResponseRef.current || isPendingRef.current ? WS_IDLE_FAST_MS : WS_IDLE_SLOW_MS);
const wsIdle = !lastEventAt || now - lastEventAt > idleThreshold;
if (wsConnected && !wsIdle) {
  return;
}

const pollInterval = isHidden
  ? NETWORK_POLL_HIDDEN_MS
  : (awaitingChainResponseRef.current || isPendingRef.current ? NETWORK_POLL_FAST_MS : NETWORK_POLL_IDLE_MS);
if (now - lastNetworkPollRef.current < pollInterval) {
  return;
}
lastNetworkPollRef.current = now;
```

Why this matters:
- WebSockets can go silent or the tab can be hidden. Polling ensures the UI stays correct.

What this code does:
- Detects whether the app is hidden and whether WS has been idle too long.
- If WS is healthy, it skips polling to save bandwidth.
- If WS is idle, it polls at a rate determined by activity level.

---

### 3) Update player stats and balances
```ts
if (playerState) {
  setIsRegistered(true);
  hasRegisteredRef.current = true;

  setTournamentsPlayedToday(Number(playerState.tournamentsPlayedToday ?? 0));
  const chainLimit = Number(playerState.tournamentDailyLimit ?? 0);
  setTournamentDailyLimit(chainLimit > 0 ? chainLimit : FREEROLL_DAILY_LIMIT_FREE);

  const timeSinceLastUpdate = Date.now() - lastBalanceUpdateRef.current;
  shouldUpdateBalance = timeSinceLastUpdate > balanceUpdateCooldownMs;

  playerActiveTid = playerState.activeTournament != null ? Number(playerState.activeTournament) : null;
  setPlayerActiveTournamentId(playerActiveTid);
}
```

Why this matters:
- This keeps the UI accurate even if WebSocket updates are missed.

What this code does:
- Uses the latest player state to update registration status, daily limits, and active tournament.
- Throttles balance refresh to avoid UI jitter and excessive polling.

---

### 4) Auto‑start and auto‑end tournaments
```ts
if (!scheduleNow.isRegistration && now < scheduleNow.endTimeMs && !freerollStartInFlightRef.current) {
  try {
    const t = await client.getCasinoTournament(scheduleNow.tournamentId);
    if (t && t.phase === 'Registration' && Array.isArray(t.players) && t.players.length > 0) {
      freerollStartInFlightRef.current = true;
      setIsTournamentStarting(true);
      try {
        const result = await client.nonceManager.submitCasinoStartTournament(
          scheduleNow.tournamentId,
          scheduleNow.startTimeMs,
          scheduleNow.endTimeMs
        );
        if (result?.txHash) setLastTxSig(result.txHash);
      } finally {
        setIsTournamentStarting(false);
        freerollStartInFlightRef.current = false;
      }
    }
  } catch (e) {
    setIsTournamentStarting(false);
    freerollStartInFlightRef.current = false;
  }
}

if (activeTournament && now >= activeTournament.endTimeMs && !freerollEndInFlightRef.current) {
  freerollEndInFlightRef.current = true;
  try {
    const result = await client.nonceManager.submitCasinoEndTournament(activeTournament.id);
    if (result?.txHash) setLastTxSig(result.txHash);
  } finally {
    freerollEndInFlightRef.current = false;
  }
}
```

Why this matters:
- Freerolls need automation. If no one manually starts or ends them, they stall.

What this code does:
- Detects when a tournament should start, and submits an on‑chain start transaction.
- Detects when an active tournament has ended and submits the end transaction.
- Uses in‑flight refs to avoid double submissions.

---

## Extended deep dive: the freeroll scheduler as a UI state machine

This hook is a client-side scheduler. It is not just a timer; it is a state machine that keeps UI state consistent with chain state. The most important idea is that the UI is *eventually consistent* with the chain. It listens to WebSocket updates, but it also polls and computes schedules locally to fill gaps.

---

### 4) Schedule math: deterministic cycles on the client

`getFreerollSchedule(now)` divides wall-clock time into cycles. Each cycle has:

- a registration window (`FREEROLL_REGISTRATION_MS`),
- a tournament window (`FREEROLL_TOURNAMENT_MS`),
- and a cycle length (`FREEROLL_CYCLE_MS`).

The schedule is purely arithmetic: slot = floor(now / cycle). This yields a deterministic tournamentId for each time slot. The UI uses this to compute the next tournament id, next start time, and end time. This design lets the UI keep running even if it temporarily loses connection to the chain.

Important tradeoff: the schedule uses **wall-clock time**. On-chain time is derived from block views and may drift slightly. The system accepts this because the client is meant to keep the UX responsive. The chain remains the source of truth when conflicts arise.

---

### 5) The one-second heartbeat

The hook runs a 1-second interval. Each tick does multiple jobs:

1) Update the countdown timers.
2) Determine whether the app should poll the backend.
3) If polling is needed, fetch player and tournament state.
4) Potentially submit start/end transactions.

This is a lot of responsibility for a single interval. The reason it works is that most branches are gated by conditions (play mode, WS status, polling thresholds). The loop is simple but it orchestrates a complex state machine.

---

### 6) Play mode switch: CASH vs FREEROLL

When `playMode !== 'FREEROLL'`, the scheduler resets freeroll state and uses the cash leaderboard. This prevents cross-mode contamination:

- Freeroll state is irrelevant in cash mode.
- Cash mode should display persistent balances instead of tournament chips.

By resetting the freeroll fields when not in freeroll mode, the hook ensures the UI cannot show stale tournament data.

---

### 7) WebSocket liveness detection

The hook inspects two sources of WS activity:

- `updatesStatus` (updates stream)
- `sessionStatus` (session stream)

It takes the maximum of their lastEventAt timestamps to decide liveness. This is a robust design: if either stream is alive, we can avoid polling.

The idle threshold depends on:

- document visibility (hidden vs visible), and
- whether the UI is waiting on a chain response.

When the user is active or a transaction is pending, the scheduler polls more aggressively to keep feedback fast. When hidden, it slows down to save bandwidth.

---

### 8) Polling intervals as a resource tradeoff

Polling is not free; it costs bandwidth and backend load. The hook uses three intervals:

- Fast (2s) when activity is high.
- Idle (8s) when activity is low.
- Hidden (30s) when the tab is hidden.

These values strike a balance between responsiveness and resource usage. If you tune them, think in terms of user experience vs server cost. Faster polling is smoother but more expensive.

---

### 9) Player state refresh and registration detection

The scheduler fetches player state via `client.getCasinoPlayer`. If it succeeds, the user is treated as registered; if it fails, the UI assumes the user is unregistered.

Key updates from player state:

- `tournamentsPlayedToday`
- `tournamentDailyLimit`
- `activeTournament`

These fields are used to decide whether the player has joined the next freeroll and to display daily limits. The hook also throttles balance updates using `balanceUpdateCooldownMs` to avoid rapid UI jitter.

---

### 10) Cash mode leaderboard polling

When in cash mode, the scheduler polls the cash leaderboard periodically. It uses `buildLeaderboard` to compute the UI board and rank. It optionally includes the user in the leaderboard even if their entry is missing (by injecting their current chips).

This provides a smooth UI experience: the user always sees themselves in context, not just the top entries returned by the backend.

---

### 11) Freeroll mode tournament discovery

Freeroll is more complex because tournaments can be active or in registration. The hook builds a list of candidate tournament IDs:

- the player's active tournament, if any
- the current schedule slot
- the previous schedule slot

It then queries `getCasinoTournament` for each candidate until it finds one in the Active phase. This is a robust way to handle drift between local schedule and chain state. Even if the schedule is slightly off, the hook will find the active tournament by checking recent IDs.

---

### 12) Active tournament UI state

If an active tournament is found, the hook updates:

- `freerollActiveTournamentId`
- `freerollActiveTimeLeft`
- prize pool and player count

This is what drives the "active" UI: countdowns, prize pool displays, and active tournament badges.

The time left is computed from the tournament's `endTimeMs` and local `now`. This means the UI countdown reflects the tournament's configured end time, not a guessed schedule.

---

### 13) Tournament stack vs cash stack

When a player is in an active tournament, their UI should show tournament chips/shields/doubles, not cash-mode balances. The hook switches between these two "stacks" by computing `desiredChips`, `desiredShields`, and `desiredDoubles` based on `isInActiveTournament`.

This detail is important: a player can have different balances in tournament vs cash. If you display the wrong stack, you confuse the user and cause misplays.

---

### 14) Phase transitions in the UI

The hook sets the UI phase to:

- `ACTIVE` if the player is actively in a tournament,
- `REGISTRATION` otherwise.

This is a UI simplification. The chain may have more detailed phases, but for the user experience we compress it to two phases. If you ever extend tournament phases (e.g., "cooldown"), you will need to update this mapping.

---

### 15) Auto-start logic

The hook can automatically start a tournament when:

- the schedule says registration is over,
- the chain tournament is still in Registration,
- and at least one player has joined.

The auto-start path submits `submitCasinoStartTournament` using the NonceManager. The guard `freerollStartInFlightRef` prevents duplicate submissions inside one client. However, multiple clients could still attempt to start the same tournament. That is fine as long as the on-chain handler rejects duplicate starts safely (which it should).

This design decentralizes liveness: any client can nudge the system to start, so tournaments do not stall if a server cron fails.

---

### 16) Auto-end logic

Similarly, the hook auto-ends a tournament when:

- there is an active tournament, and
- the current time is past `endTimeMs`.

Again, it uses an in-flight guard to avoid duplicate local submissions. This keeps the tournament state moving forward even if no central scheduler exists. It is a decentralized liveness mechanism embedded in the UI.

---

### 17) Leaderboard selection: active vs lobby

If the active tournament includes a leaderboard, the hook uses it directly. If not, it polls the lobby leaderboard at a slower interval.

This ensures that:

- During active tournaments, the leaderboard reflects tournament performance.
- During registration or idle phases, the leaderboard reflects general standings.

The `buildLeaderboard` helper is reused in both contexts, keeping the UI consistent.

---

### 18) Error handling and logging

Errors in network calls are logged via `logDebug`. This is intentionally non-fatal. The scheduler treats errors as transient and retries on the next tick or poll interval. This is consistent with a resilient client: temporary backend errors should not permanently break the UI.

---

### 19) Concurrency concerns and race windows

Even with locks and guards, there are inherent race windows:

- A tournament might start on-chain just as the client decides to auto-start.
- A tournament might end just as the client fetches its state.
- The player might join/leave between polls.

The hook handles these by always fetching fresh state and by treating submissions as idempotent. The chain is the source of truth; the client simply nudges it forward when needed.

---

### 20) Why local schedule still matters

One might ask: why not rely entirely on chain events? The answer is latency and liveness. Chain events can be delayed or missed (especially when the tab is hidden). The local schedule provides a predictable heartbeat so the UI can still show countdowns and encourage users to join.

The local schedule is an approximation, not truth. But it keeps the experience smooth, which is critical for games.

---

### 21) Testing the scheduler

You can test this hook by simulating time and mocking client responses:

- Freeze time at specific timestamps and verify computed `freerollNextStartIn`.
- Mock `getCasinoTournament` to return various phases and ensure the hook sets `ACTIVE` or `REGISTRATION` correctly.
- Simulate WebSocket idle states and verify polling frequencies.
- Simulate auto-start/end conditions and assert that submission methods are called exactly once.

Because the hook is time-driven, deterministic tests require a controllable clock.

---

### 22) Feynman analogy: a self-updating train schedule board

Imagine a train station board that listens to live train updates. If the live feed is down, it consults the timetable. If a train hasn't departed yet but the time has come and passengers are waiting, it calls the dispatcher to start the train. If a train should have arrived but didn't, it calls the dispatcher to close the route.

That is exactly what the freeroll scheduler does: it is a live board plus a fallback timetable and a self-healing dispatcher.

---

### 23) Exercises for mastery

1) Trace a full freeroll cycle: registration -> active -> end, and list which fields in the hook change at each phase.
2) Explain why the candidate tournament ID list includes the previous slot.
3) Identify the conditions under which auto-start can run twice, and explain how on-chain logic should handle it.
4) Propose a change to reduce polling in hidden tabs and explain the user impact.

If you can answer these, you understand the freeroll scheduler deeply.


## Addendum: subtle state fields and why they exist

This final addendum covers the smaller state fields that are easy to gloss over but matter for correctness.

### 24) manualTournamentEndTime as a guardrail

`manualTournamentEndTime` is set when the UI has positive confirmation of an active tournament and knows its end time. This value is used in the 1-second tick to update the countdown even if the next poll is delayed. It prevents the countdown from freezing if the client temporarily stops receiving data.

This is a small but important resilience feature: the UI continues to count down even when it loses connectivity for a few seconds.

### 25) freerollNextTournamentId and isJoinedNext

`freerollNextTournamentId` is computed from the schedule, and `freerollIsJoinedNext` is derived by comparing it to the player's active tournament id. This allows the UI to show a "you are already registered" indicator for the next upcoming freeroll.

Without this, the user might attempt to register twice or be unsure of their status. It is a pure UI convenience, but it prevents accidental duplicate actions.

### 26) Balance update throttling

The hook uses `balanceUpdateCooldownMs` to prevent rapid balance updates. This is not just cosmetic. Rapid updates can cause rendering jitter, unnecessary React state churn, and poor user experience. Throttling ensures the UI updates are smooth and readable.

This is a typical pattern in real-time UIs: you intentionally slow down updates to make the display more legible, even if you could show every tick.

### 27) Active tournament candidate list and reorg tolerance

The candidate list includes the current slot and the previous slot. This helps if the client clock is slightly ahead or behind the chain's notion of time. It is also a hedge against small scheduling mismatches or delayed tournament starts. By checking the previous slot, the UI can still discover an active tournament that started late or was finalized late.

### 28) Defensive null checks

Every network-dependent branch checks `clientRef.current` and `publicKeyBytesRef.current`. These references can be null if the user is not connected or the wallet is not initialized. Without these checks, the hook would throw errors on first render or while connecting.

This is an example of defensive programming in a React hook that runs on a fixed interval.

### 29) Why this logic lives in a hook

Putting scheduling logic in a hook makes it testable and reusable. The hook is a pure controller: it does not render UI, it only drives state setters. This separation lets you build different UIs (terminal, dashboard, mobile) while reusing the same scheduling logic.

If you later change the freeroll rules or schedule, you only need to update the hook. That is the real payoff of this design.


### 30) Latency hiding in the UI

The scheduler updates countdowns and local state immediately, even before the chain confirms certain transitions. This "optimistic" behavior is a form of latency hiding: users see a responsive UI instead of waiting for network round trips. The real chain state will eventually reconcile via polling or WebSocket updates. This pattern is common in real-time apps, and it is safe here because the UI is designed to correct itself on the next tick if the chain disagrees.


## Key takeaways
- The freeroll scheduler keeps the UI aligned with chain time and state.
- It falls back to polling when WebSockets are idle.
- It can auto‑start and auto‑end tournaments when conditions are met.

## Next lesson
L27 - Tournament scheduler: `feynman/lessons/L27-tournament-scheduler.md`
