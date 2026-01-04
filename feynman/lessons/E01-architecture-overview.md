# E01 - Architecture overview (textbook-style deep dive)

Focus file: `architecture.md`

Goal: provide a university-level architecture chapter that explains the global-table model, on-chain confirmation flow, and the system's core tradeoffs. This lesson should stand alone as a rigorous conceptual foundation for everything else in the curriculum.

---

## Learning objectives

After this lesson you should be able to:

1) Explain why the system chooses a single global table per game.
2) Describe the on-chain global table confirmation flow and its UX implications.
3) Trace the full data flow from client to table engine to persistence.
4) Describe the round timing model and why each phase exists.
5) Explain how fairness and determinism are enforced.
6) Identify the scaling bottlenecks and the mitigation strategies.

---

## 0) Big idea (Feynman summary)

Imagine a casino game that has exactly one table in the world for each game type. Everyone watches the same countdown. Everyone sees the same outcome at the same time. There is one authoritative engine per game that controls time and state. Gateways are just doors and loudspeakers: they do not decide outcomes, they only relay bets and broadcast updates.

That single-table model is the architectural heart of this system. It is not the usual sharded model. The system chooses shared presence and synchronized outcomes over horizontal partitioning by table. That choice shapes everything else: latency, scaling, storage, and fairness.

---

## 1) Problem framing: what are we actually building?

A standard online casino can scale by spinning up more tables. The more players, the more tables. That is the simplest scaling strategy, but it fragments the user experience. Players do not share the same table or outcomes. It is more like a lobby of many small games.

This system wants the opposite. It wants a single shared experience for each game type. The reasons are product-level and system-level:

- **Product**: a single global table feels like a live event. Everyone is watching the same roll.
- **Fairness**: outcomes are global and verifiable. You do not need to wonder if your table is different.
- **Simplicity**: there is one authoritative state machine per game, not a fleet of tables.

The cost of this choice is that scaling cannot happen by adding tables. It must happen in networking, batching, and execution efficiency. That is a harder scaling path, but it produces a more compelling and unified product.

---

## 2) Goals and non-goals (from `architecture.md`)

### 2.1 Goals

The architecture lists explicit goals:

- **Single global table per game variant** with shared presence and synchronized outcomes.
- **Tens of thousands of concurrent players** watching and betting in the same table.
- **Timed outcomes** that feel exciting but not rushed.
- **Predictable, low-latency updates** with strong fairness guarantees.
- **Resilience** to node failures and safe recovery without corrupting state.

Each goal is a design constraint. When you evaluate any subsystem (gateway, table engine, storage), you should ask: does it help or hinder these goals?

### 2.2 Non-goals

The architecture also defines what it does not do:

- **No multiple concurrent tables per game** (no sharding by table).
- **No peer-to-peer authority** (the server remains authoritative).

These non-goals matter because they remove entire classes of designs. They also make the tradeoffs explicit: we are choosing simplicity and shared presence over horizontal sharding and P2P authority.

---

## 3) Core idea: the single global table

Each game variant runs a single authoritative table engine. The table engine owns the state and the clock. Clients connect to gateways, and gateways relay bet intents to the table engine and broadcast updates back to clients.

The table engine advances in fixed rounds:

1) Betting window
2) Lock
3) Resolve
4) Payout
5) Cooldown

Every client should see the same countdown and the same outcome at the same time. The system's job is to preserve that property under real-world conditions: packet loss, latency, and node failures.

This is why the architecture emphasizes a **stateless gateway**. The gateway is a fan-out and validation layer, not the source of truth.

---

## 4) Single operational mode: on-chain global table

Phase 1 is **fully on-chain**. There is no off-chain live-table service. The gateway
orchestrates round timing, submits on-chain instructions, and fans out updates to
clients. In this mode:

- Bet acceptance and round results are confirmed by chain events.
- The UI can show pending → confirmed/failed statuses.
- The chain is the canonical source of truth.

This improves trust and auditability, but it introduces chain latency and throughput
limits. That tradeoff is now a core constraint rather than an optional mode.

---

## 5) On-chain data model for global tables

The architecture proposes a data model for on-chain tables. The important point is not the exact names, but the pattern: separate config, per-round state, aggregated totals, and per-player bets.

### 5.1 GlobalTableConfig

- Game type
- Allowed bet types and targets
- Timing configuration
- Limits (max bets per round, min/max bet)
- Authority keys for round transitions

This is the static configuration for a table. It does not change often.

### 5.2 GlobalTableRound

- `round_id`, `phase`, and phase timestamps
- `rng_commit` and `rng_reveal`
- Outcome data (dice, total, point, etc.)

This is the per-round state machine. It captures timing and outcome.

### 5.3 GlobalTableTotals

- Aggregated totals per bet type/target
- Fixed-size arrays for hot-path reads

The UI needs heatmaps and totals. Storing these on-chain avoids broadcasting every individual bet.

### 5.4 PlayerRoundBets

- A record of a player's bets for a round
- Used for settlement and for per-player UI (my bets, net win)

This is the per-player record that allows settlement and personalized UI.

---

## 6) On-chain instruction flow (high-level)

The architecture sketches the primary instructions:

- `global_table_init(game)` creates config/state accounts.
- `global_table_open_round(round_id, timing, rng_commit)` opens betting.
- `global_table_submit_bets(round_id, bets[])` validates and records bets.
- `global_table_lock(round_id)` closes betting.
- `global_table_reveal(round_id, rng_reveal)` reveals seed and computes outcome.
- `global_table_settle(round_id, player)` settles one player's bets (batchable).
- `global_table_finalize(round_id)` clears transient state and advances the round.

The critical insight is settlement batching. You cannot settle tens of thousands of players in a single transaction, so you settle in slices. This keeps per-transaction compute bounded while still keeping all results on-chain.

---

## 7) RNG and fairness in the on-chain model

The architecture recommends deriving outcomes from a consensus RNG seed and committing to it at lock time:

- Commit at lock: `rng_commit = H(seed || round_id || game_id)`
- Reveal at resolve: publish the seed

This provides two properties:

1) **Determinism**: all validators compute the same outcome.
2) **Auditability**: anyone can verify that the reveal matches the commit.

The key is that the commitment is made before the outcome is revealed. That prevents a centralized operator from choosing favorable outcomes after seeing bets.

---

## 8) Events and user-visible confirmations

In on-chain mode, the UI needs to show pending/confirmed/failed states. The architecture explicitly calls for events like:

- `GlobalTableBetAccepted`
- `GlobalTableBetRejected`
- `GlobalTableLocked`
- `GlobalTableOutcome`
- `GlobalTableSettled`

Gateways are responsible for forwarding these to clients. The UX should show a pending state immediately on submit, then update to confirmed or failed when the on-chain event arrives. This makes the chain visible without forcing the user to understand the chain.

---

## 9) High-level component architecture

The architecture diagram is simple but important:

```
Clients (web/mobile)
   |  WebSocket (subscribe, bet, presence)
   v
Edge Gateways (stateless, horizontally scaled)
   |  bet intents (gRPC/HTTP)
   |  broadcast updates (pub/sub)
   v
Global Table Engine (authoritative per game)
   |  event log (append-only)
   |  snapshots (periodic)
   v
Persistence + Analytics
```

### 9.1 Edge gateways

Gateways maintain long-lived WebSocket connections, authenticate users, rate-limit inputs, and fan out updates. They are horizontally scalable because they do not own authoritative state.

### 9.2 Global table engine

The table engine is a single state machine per game. It accepts bets, advances rounds, and computes outcomes. It emits updates for fan-out and appends everything to an event log.

### 9.3 Pub/sub fan-out

The table engine publishes updates once per tick. Gateways subscribe and deliver those updates to tens of thousands of clients. This is the core scalability mechanism for read-heavy workloads.

### 9.4 Event log and snapshots

The event log is the source of truth for recovery and audit. Snapshots allow fast restart by avoiding replaying the entire log from genesis.

### 9.5 Bot manager

The architecture mentions a bot manager that generates automated bets for realism and load testing. Bots flow through the same validation paths as users, which provides a natural stress test.

---

## 10) Round timing model

The round schedule is designed for excitement but not rush. Each round has phases:

- **Betting window**: time for players to place bets.
- **Lock**: short buffer to close bets and commit RNG.
- **Resolve**: compute outcomes.
- **Payout**: emit results and credits.
- **Cooldown**: short gap before next round.

The architecture includes example timings:

- Craps: 18s bet, 2s lock, 1s resolve, 2s payout, 7s cooldown (30s total)
- Roulette: 15s bet, 2s lock, 2s resolve, 3s payout, 5s cooldown (27s total)
- Blackjack (global hand): 12s bet, 2s lock, 3s resolve, 3s payout (20s total)

These timings are intentionally conservative and can be tightened later.

### 10.1 Timing safeguards

The architecture proposes safeguards such as:

- **Soft lock** before the hard lock to account for network latency.
- **Countdown broadcasts** every second (or every 2 seconds) to reduce chatter.
- **Tick overrun protection**: if resolve+payout runs long, shorten cooldown rather than betting.

These safeguards prioritize fairness and clarity over maximum speed.

---

## 11) State management and recovery

The table engine keeps state in memory for speed, but it writes every action to an append-only event log. This provides two properties:

1) **Auditability**: you can replay or inspect the log.
2) **Recovery**: you can rebuild state after a crash.

Snapshots reduce recovery time by storing periodic checkpoints. The engine can replay from the latest snapshot rather than from the beginning of time.

Gateways are stateless with respect to the game state. If a gateway dies, clients can reconnect to another gateway without state loss.

---

## 12) Scalability analysis

Scaling a single global table is hard. The architecture identifies the hot paths:

- **Bet acceptance**: writing many small updates quickly.
- **Settlement**: computing payouts for many players.
- **Fan-out**: broadcasting updates to many clients.

Mitigations include:

- **Batch bets**: allow multiple bets in one submission.
- **Batch settlement**: settle a subset of players per transaction.
- **Aggregate totals**: publish totals rather than every bet.
- **Rate limits**: cap bets per player per round.
- **Optional fast path**: let the UI update quickly while chain confirmation catches up.

The tradeoff is clear: on-chain global tables improve trust and auditability but reduce maximum throughput. Batching is the primary tool to keep throughput viable.

---

## 12.1) Fan-out and networking at scale

One subtle advantage of the global table model is that the workload is read-heavy. Tens of thousands of players might watch a table, but only a fraction place bets each round. That means the system must be optimized for broadcast rather than per-user computation.

The architecture uses pub/sub fan-out so the table engine produces a small number of updates per tick and gateways replicate them to many clients. This is a classic pattern in real-time systems: compute once, broadcast many times.

To make this viable at scale, several techniques matter:

- **Delta updates**: only send changes since the last tick, not full state.
- **Throttled ticks**: broadcast at a fixed cadence (for example, once per second) rather than on every micro-change.
- **Compression**: compress or compact payloads to reduce bandwidth.
- **Client-side interpolation**: clients can animate countdowns locally using the last tick as a reference.

These techniques are not all explicitly listed in `architecture.md`, but they are implied by the requirement for tens of thousands of concurrent watchers. If you broadcast full state on every bet, you will overwhelm the network. If you broadcast small deltas on a fixed cadence, you can scale.

---

## 12.2) Write load vs read load

The single-table model concentrates writes into one stream of bets and outcomes, but it spreads reads across many clients. That is why the architecture emphasizes batching and aggregation on the write path. If every bet triggers a broadcast and a large write, you will hit bottlenecks quickly.

Instead, the system aggregates bets per round and broadcasts totals rather than individual bet events. It also batches settlement to keep per-transaction compute bounded. The result is a system that can handle many watchers and a controlled number of bettors without exploding state or bandwidth.

This is the core scaling intuition: **treat the global table like a broadcast channel with a bounded write rate**. As long as the write rate is controlled, the read rate can be large.

---

## 13) Single global table vs sharded tables: tradeoff summary

| Dimension | Single global table | Sharded tables |
| --- | --- | --- |
| Latency | Higher under load | Lower per shard |
| Trust | Uniform, shared outcomes | Fragmented experiences |
| Throughput | Bounded by chain + round cadence | Scales with shard count |
| UX | One shared event | Multiple smaller events |

This table is the central tradeoff of the architecture. The system chooses a single global table because the product goal is shared presence, even though it makes scaling harder.

---

## 14) Operational configuration (global table envs)

The architecture lists environment variables that control the global table. This is important because it shows that the system was designed to be operationally tunable:

- Gateway flags: `GATEWAY_LIVE_TABLE_CRAPS`, `GATEWAY_LIVE_TABLE_ADMIN_KEY_FILE`.
- Timing + limits: `GATEWAY_LIVE_TABLE_BETTING_MS`, `GATEWAY_LIVE_TABLE_LOCK_MS`, `GATEWAY_LIVE_TABLE_PAYOUT_MS`, `GATEWAY_LIVE_TABLE_COOLDOWN_MS`,
  `GATEWAY_LIVE_TABLE_MIN_BET`, `GATEWAY_LIVE_TABLE_MAX_BET`, `GATEWAY_LIVE_TABLE_MAX_BETS_PER_ROUND`.
- Fanout tuning: `GATEWAY_LIVE_TABLE_BROADCAST_MS`, `GATEWAY_LIVE_TABLE_BROADCAST_BATCH`.
- Optional bots: `GATEWAY_LIVE_TABLE_BOT_COUNT`, `GATEWAY_LIVE_TABLE_BOT_PARTICIPATION`, `GATEWAY_LIVE_TABLE_BOT_BET_MIN`, `GATEWAY_LIVE_TABLE_BOT_BET_MAX`.

These are not just configuration details; they are knobs for experimentation. They allow the team to tune timings, bot activity, and connection behavior without code changes.

---

## 15) Security and fairness at the edge

Gateways validate payload shapes, rate-limit bets, and enforce timing windows. They also provide latency hints and client clock sync. This is a subtle but crucial point: even if the table engine is authoritative, the gateway can still improve UX and fairness by rejecting obviously late or malformed bets early.

In on-chain mode, the gateway becomes the UX layer for pending/confirmed states. It does not decide outcomes, but it presents them in a way users can understand.

---

## 16) Failure modes and recovery

The architecture explicitly aims for safe recovery without state corruption. The event log and snapshots are the core tools. Other important failure modes include:

- **Gateway failure**: mitigated by stateless design and reconnection.
- **Table engine failure**: mitigated by event log replay and snapshots.
- **Network partitions**: mitigated by soft locks and timing buffers.
- **Chain failures in on-chain mode**: mitigated by pending/confirmed UI and timeouts.

The key is that the authoritative state is always reconstructible from the log. That is the definition of safe recovery.

---

## 16.1) UX implications of shared presence

The single-table model has a strong UX effect: everyone sees the same countdown and the same outcome. This creates a sense of shared presence, similar to a live stream or a live sports event. That is why the architecture emphasizes synchronized timing and global broadcasts.

From a UX perspective, this also means latency matters more than in a sharded system. If two users see different countdowns, the illusion of shared presence breaks. The architecture counters this with periodic tick broadcasts, countdown hints, and soft locks that account for network latency.

In other words, synchronization is not just a technical requirement. It is a core product feature. The architecture treats it as such.

Shared presence also simplifies analytics: there is a single round timeline, so metrics like concurrent viewers, total bet volume, and round latency can be computed once and reused across clients and dashboards. That consistency is much harder in a sharded-table model for operators and analysts.

---

## 17) Why this architecture is unusual (and why that is okay)

Most systems scale by sharding. This system does not. That is unusual, but it is not wrong. It is a deliberate product choice.

The tradeoff is that you must build a high-performance, highly reliable single-table engine and a fan-out network. If you can do that, you get a unique product: a single shared experience with provable fairness and clear auditability.

---

## 18) Feynman recap

There is one table. Everyone watches it. Gateways are just doors. The table engine decides when bets stop and what outcome happens. It writes everything down on-chain so it can be replayed and audited. In phase 1 the table runs fully on-chain; the gateway simply fans out updates to keep the experience synchronized. The architecture is built to make that one-table experience fair, synchronized, and recoverable.

One more operational implication: monitoring has to be phase‑aware, not just node‑aware. A healthy gateway with a stuck table is still a broken product. Your alerts should track “round opened” → “round locked” → “outcome revealed” → “round finalized” latencies, because the user experience is defined by those transitions.

A helpful mental test is to imagine a traffic spike during betting. If the round lock takes too long, you do not just lose throughput; you break the shared experience. That is why latency budgets are tied to phases, not just generic request timing.

In practice this means you should chart per phase durations alongside request latency, because the phase timeline is what players actually feel.

---

## 19) Exercises

1) Why does the architecture avoid multiple tables per game? What product experience does that enable?
2) In on-chain mode, why is settlement done in batches instead of all at once?
3) What does the event log provide that snapshots alone do not?
4) How would you explain the single global table model to a non-technical user?
5) Which component is authoritative for outcomes: gateway or table engine? Why?

---

## Next lesson

E02 - Component roles and topology: `feynman/lessons/E02-component-roles-topology.md`
