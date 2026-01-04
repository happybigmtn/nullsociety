# E15 - Testing strategy + harnesses (from scratch)

Focus files: `gateway/tests/integration/all-bet-types.test.ts`, `node/src/tests.rs`

Goal: explain how integration and simulation tests validate the gateway and node logic. For every excerpt, you will see why it matters and a plain description of what the code does. This lesson reads like a textbook chapter: it introduces the testing philosophy, then walks through the two focus files line by line, with Feynman-style explanations.

---

## 0) Feynman summary (why this lesson matters)

Testing is how we turn a distributed system into a predictable product. The gateway integration tests simulate a real player connecting over WebSockets and placing bets. The node tests simulate multiple validators, a network, and a consensus engine, all inside a deterministic runtime. Together these tests answer two questions:

1) Does the user-facing protocol behave correctly end to end?
2) Does the validator stack converge on the same state under normal and stressful conditions?

If either answer is wrong, the game becomes unfair or unreliable. That is why these tests exist.

---

## 1) Testing philosophy: layers and responsibilities

Our stack needs three kinds of tests:

1) **Integration tests** for the gateway and client protocol. These use real WebSocket messages, real game flows, and a running gateway.
2) **Deterministic simulation tests** for the validator stack. These use simulated networks and deterministic time to test consensus and execution without flakiness.
3) **Security regression tests** for config redaction and secrets. These ensure debug logs do not leak private material.

The two focus files cover all three. The gateway test file provides end-to-end integration coverage for every bet type. The node test file provides deterministic simulations, failure scenarios (late validators, bad links, restarts), and a security check.

---

## 2) Gateway integration test: overview

File: `gateway/tests/integration/all-bet-types.test.ts`

This test is designed to be exhaustive. It connects to a live gateway, plays every bet type for every game, and asserts that none of those bets return an error.

It is not a unit test. It is a real protocol exercise:

- WebSocket connection is established.
- The client waits for a `session_ready` event.
- A bet message is sent.
- A response is parsed and validated.
- For multi-step games, a second message is sent (the "move").

If this test passes, it strongly suggests that the gateway routes messages correctly, the game engines accept the bets, and the response types match what the client expects.

---

## 3) The test harness and configuration knobs

At the top of the file we import helpers:

- `BET_TIMEOUT_MS`, `INTEGRATION_ENABLED`, `TEST_GAMES`, `TEST_TIMEOUT_MS`
- `createConnection`, `sendAndReceive`, `waitForReady`

These helpers live in `gateway/tests/helpers/ws.ts` (compiled to `.js` when running). The helper file defines environment-based configuration:

- `RUN_INTEGRATION=true` enables integration tests.
- `TEST_GATEWAY_PORT` controls where the test connects.
- `TEST_TIMEOUT_MS` and `TEST_RESPONSE_TIMEOUT_MS` control overall and per-message timeouts.
- `TEST_BET_TIMEOUT_MS` optionally wraps each bet with a timeout.
- `TEST_GAMES` can restrict which game categories to test.

This design is intentional. Integration tests are slow and require infrastructure, so they are opt-in. The timeouts are generous by default to avoid false failures in CI or remote environments. The gating via `RUN_INTEGRATION` prevents local devs from accidentally hanging their test runs.

---

## 4) The core helper: `testBet`

The heart of the test file is the `testBet` function. It accepts:

- `game`: a human-readable name for logs.
- `betType`: a label for the bet.
- `startMsg`: the first message to send.
- `moveMsg` (optional): the second message for multi-step games.

The structure looks like this, in plain English:

1) Open a WebSocket connection.
2) Wait for the gateway to say `session_ready`.
3) Send the start message and wait for a response.
4) If the start response is an error, return a failure result.
5) If there is no move message, interpret the start response as the final result.
6) If a move message exists, send it and parse the response.
7) Return a structured `TestResult` with status, response type, and payout.
8) Always close the socket and clear timeouts.

This is a small state machine. The test is designed to mirror how the client would behave: connect, wait for ready, then send bets.

### 4.1 Why `waitForReady` matters

`waitForReady` is not a cosmetic step. It does two things:

- It waits for `session_ready`, which indicates the gateway established the session and is ready to accept messages.
- It polls balance and registration state to ensure the account is usable for bets.

If we skip this step, the first bet might be rejected for missing session state. That would produce false failures.

### 4.2 Error handling and `TestResult`

The function returns a `TestResult` object with fields:

- `game`, `betType` for logging.
- `status` as `success` or `failed`.
- `response` if a response type is available.
- `payout` when present.
- `error` if an error occurred.

This allows `runAllTests` to produce a clean summary of failures without crashing the entire run.

### 4.3 Timeout control

The function wraps the run in a `Promise.race` if `BET_TIMEOUT_MS` is configured. This is a protective guard: if a bet hangs, the test fails fast and moves on.

Note the default: `BET_TIMEOUT_MS` can be zero, meaning no per-bet timeout. This is useful for local debugging when you want a slow bet to complete rather than be aborted.

### 4.4 Cleanup logic

The `finally` block is important. It clears any timeout and closes the WebSocket. Without this, you would leak sockets and timers, making the test unreliable and possibly exhausting file descriptors.

---

## 5) The bet catalog: exhaustive coverage by game

The file defines arrays for each game category. This is the "data layer" of the test: each entry describes one bet and its required message format.

### 5.1 Craps bet types

`CRAPS_BETS` contains a long list, including:

- Core bets: Pass Line, Don't Pass, Come, Don't Come, Field.
- Place bets ("Yes") with targets 4,5,6,8,9,10.
- Lay bets ("No") with targets.
- Hop bets for specific totals on the next roll.
- Hardway bets for specific doubles.
- Fire bet (side bet).
- ATS (All-Tall-Small) bets.
- Additional side bets like Muggsy, Diff Doubles, Ride Line, Replay, Hot Roller.

Each bet entry includes a numeric `betType` and a `target`. The tests do not verify payout correctness; they verify that the gateway accepts the bet and returns a non-error response. This is a pragmatic choice: payout correctness is covered by lower-level game logic tests; this file focuses on protocol viability and coverage.

### 5.2 Baccarat bet types

`BACCARAT_BETS` covers the common betting categories:

- Player, Banker, Tie.
- Side bets like Player Pair, Banker Pair, Lucky 6, Dragon bets, Panda 8, Perfect Pair.

Each test sends a `baccarat_deal` message with a list of bets. The response is expected to be a deal result with optional payout.

### 5.3 Roulette bet types

`ROULETTE_BETS` includes both inside and outside bets. The list illustrates the protocol shape:

- Inside bets: Straight, Split, Street, Corner, Six Line.
- Outside bets: Red, Black, Odd, Even, Low/High, Dozens, Columns.

Each entry has a `type` (bet kind) and a `value` (often the table position or subgroup). The test uses these to construct a `roulette_spin` message.

### 5.4 Sic Bo bet types

`SICBO_BETS` includes:

- Small and Big totals.
- Odd and Even.
- Specific triple, any triple.
- Specific double.
- Total bets.
- Single number bets.
- Domino (two dice) bets.
- Hop3 and Hop4 combinations.

Several of these use bit-packed numbers. For example, Domino uses `(2 << 4) | 5` to encode dice values. This is a compact representation used by the protocol. The test ensures the gateway accepts these encoded forms.

### 5.5 Three Card Poker bonus bets

`THREE_CARD_BETS` tests combinations of:

- Ante.
- Pair Plus.
- Six Card.
- Progressive.

These bets are represented as a struct of amounts. The test sends a `threecardpoker_deal` followed by a `threecardpoker_play` message. This models the actual game flow: you must deal before you can play.

### 5.6 Ultimate Holdem bonus bets

`ULTIMATE_HOLDEM_BETS` uses a similar pattern:

- Ante and blind are always present.
- Optional trips, six card, and progressive bonuses.

The test sends `ultimateholdem_deal` and then `ultimateholdem_check`, which simulates checking through to the river.

### 5.7 Blackjack bonus bets

`BLACKJACK_BETS` covers the standard bet and the optional 21+3 side bet.

### 5.8 Other games

`OTHER_GAMES` includes single-step games:

- HiLo (deal only).
- Video Poker (deal only).
- Casino War with and without the tie bet.

These are instant games where the deal response includes the result. That is why these entries do not include a `moveMsg`.

---

## 6) Per-game runners

For each game category, there is a `runXTests` function. The pattern is consistent:

1) Print a section header.
2) Create a results array.
3) For each bet, call `testBet` with the appropriate start message (and optional move).
4) Print a per-bet success or failure line.
5) Return the results.

Examples:

- `runBaccaratTests` uses `baccarat_deal` with `bets: [{ type, amount }]`.
- `runCrapsTests` uses `craps_bet` with `betType`, `target`, and `amount`.
- `runRouletteTests` uses `roulette_spin` with a list of bets.
- `runSicBoTests` uses `sicbo_roll` with a list of bets.
- `runThreeCardPokerTests` uses `threecardpoker_deal` then `threecardpoker_play`.
- `runUltimateHoldemTests` uses `ultimateholdem_deal` then `ultimateholdem_check`.
- `runBlackjackTests` uses `blackjack_deal`.
- `runOtherGamesTests` uses prebuilt messages.

The important design choice here is uniformity: each function uses the same `testBet` helper, so the logic for connection setup, timeout, and error handling is centralized.

---

## 7) Test orchestration: `runAllTests`

`runAllTests` is the coordinator. It prints a banner, then decides which categories to run:

- It builds an `include` function that checks `TEST_GAMES`.
- If `TEST_GAMES` is empty, all categories run.
- If `TEST_GAMES` contains entries, only those categories run.

This allows a developer to run a fast subset of tests, such as only `craps` or only `roulette`.

After running all enabled categories, `runAllTests` prints a summary:

- number of passed bets,
- number of failed bets,
- a list of failures with game name and error message.

This summary is crucial in CI where you want a quick view of what failed without scanning hundreds of lines.

---

## 8) Vitest wrapper and timeouts

The bottom of the file uses:

```
describe.skipIf(!INTEGRATION_ENABLED)(...)
```

This is the opt-in gate. If `RUN_INTEGRATION` is not true, the entire suite is skipped.

The single test case calls `runAllTests`, then asserts that the list of failed tests is empty. It passes `TEST_TIMEOUT_MS` to the test, which defaults to 20 minutes. That is deliberate. Integration tests can be slow in CI, especially when the gateway is cold or under load.

---

## 9) What this integration test *does not* do

It is important to understand the limitations:

- It does not check payout correctness or fairness. It only ensures the gateway accepts the bet and returns a response.
- It does not validate internal settlement logic. That is the domain of the execution and game engine tests.
- It requires a live gateway. If the gateway is misconfigured or offline, the test fails for environmental reasons.

The test is therefore best seen as a protocol sanity check, not a full correctness proof.

---

## 10) Node simulation tests: overview

File: `node/src/tests.rs`

This file is the opposite of the integration test. It avoids real networking and runs everything inside a deterministic runtime. The goals are:

- prove consensus determinism,
- simulate adverse network conditions,
- verify backfill and recovery,
- ensure secrets are not leaked in logs.

The file defines constants, helper functions, and multiple tests. It uses Commonware's simulated network and deterministic runtime to eliminate non-determinism.

---

## 11) Constants and context setup

The file begins with imports and a long list of constants. These constants matter because the deterministic runtime stores all state in memory.

Examples:

- `FREEZER_TABLE_INITIAL_SIZE` is set to 1MB to keep memory bounded.
- `BUFFER_POOL_PAGE_SIZE`, `BUFFER_POOL_CAPACITY` tune the storage buffer pool.
- `PRUNABLE_ITEMS_PER_SECTION`, `IMMUTABLE_ITEMS_PER_SECTION`, `MMR_ITEMS_PER_BLOB` define internal storage batching.
- `REPLAY_BUFFER` and `WRITE_BUFFER` define memory used for replay and write batching.

These are not random numbers. They are scaled down versions of production configs to keep tests fast and memory-safe while still exercising the code paths.

The file also defines short polling intervals: `ONLINE_POLL_INTERVAL_MS` and `ONLINE_MAX_POLL_TICKS`. These allow tests to detect convergence quickly without waiting for real timeouts.

---

## 12) Security regression test: config redaction

The first test, `config_redacted_debug_does_not_leak_secrets`, is a security regression test. It constructs a `Config` object with fake secret values:

- `private_key` = "deadbeef"
- `share` = "cafebabe"
- `polynomial` = "0123456789abcdef"

Then it renders `config.redacted_debug()` and asserts:

- none of the secret strings appear,
- the output contains "<redacted>".

This test enforces a critical rule: debug logs must never reveal private keys or secret shares. That matters for production because logs often flow to third-party systems.

---

## 13) Helper: `register_validators`

The function `register_validators` is the first major helper. It interacts with the simulated network oracle to register each validator.

For each validator:

1) It obtains a `control` handle from the oracle.
2) It registers eight channels, each with the same quota.
3) It stores the senders and receivers in a map keyed by validator public key.

The channels correspond to different message types in the engine:

- pending,
- recovered,
- resolver,
- broadcast,
- backfill,
- seeder,
- aggregator,
- aggregation.

The exact semantics of these channels are part of the engine, but the pattern is clear: each validator has a set of pipelines for different network flows. By registering all of them up front, the tests can wire each validator into the network.

The `Quota::per_second(NZU32!(10_000))` ensures that the simulated network does not artificially throttle traffic in tests.

---

## 14) Helper: `link_validators`

`link_validators` connects validators inside the simulated network. It accepts:

- a list of validators,
- a `Link` that defines latency, jitter, and success rate,
- an optional `restrict_to` function that can limit which connections are created.

The function iterates over all pairs `(v1, v2)`:

- It skips self-links.
- It applies the `restrict_to` filter if provided.
- It calls `oracle.add_link(v1, v2, link)` to establish the connection.

This allows tests to simulate full connectivity, partial partitions, or asymmetric networks simply by changing the `restrict_to` predicate.

---

## 15) The core simulation: `all_online`

`all_online` is the primary test harness. It spins up `n` validators, connects them, runs the engine, and waits until enough progress is observed.

### 15.1 Deterministic runtime

The function uses `commonware_runtime::deterministic::Runner` with a seed. This is crucial: it means every run with the same seed will produce the same execution order and random outcomes.

This property underpins the tests that compare state across runs. If the deterministic runtime works, two runs with the same seed should produce identical end states.

### 15.2 Simulated network

The function constructs a simulated network:

- `Network::new` returns a network handle and an oracle.
- The network is started inside the deterministic runtime.

The simulated network enforces the `Link` characteristics (latency, jitter, success rate). This allows the tests to reproduce good or bad network conditions deterministically.

### 15.3 Validators and keys

For each of `n` validators:

- A deterministic `PrivateKey` is derived from a seed.
- The public key is collected into a list.
- The list is sorted to ensure deterministic ordering.

Sorting is a subtle but important detail: it eliminates nondeterministic iteration order that could change the behavior across runs.

### 15.4 Distributed key generation (DKG)

The function calls `dkg::deal_anonymous::<MinSig>` to generate a threshold sharing and shares for each validator. This provides a shared identity (the threshold public key) and per-validator shares.

In plain terms: the validators jointly create a shared signing key without any single validator owning the full secret. This is a standard BFT technique for threshold signatures.

### 15.5 Mock indexer

A `Mock` indexer is created with the shared identity. The indexer collects summaries and seeds. It acts as the external "observer" in tests, allowing the simulation to check if validators are producing and sharing the expected outputs.

### 15.6 Engine configuration

For each validator, the test builds an `engine::Config` with three major sections:

1) **Identity config**: signer, sharing, share, participants.
2) **Storage config**: all the buffer sizes, freezer sizes, and table parameters.
3) **Consensus and application config**: timeouts, quotas, mempool limits, and execution concurrency.

This is a near-complete representation of the node configuration in production, scaled down for tests.

The presence of many constants here is a reminder: testing is not just about logic, it is about realistic configuration. If the configuration is unrealistic, the tests may not catch production failures.

### 15.7 Starting the engine

Each engine is created with `Engine::new` and started with the registered network channels:

- pending,
- recovered,
- resolver,
- broadcast,
- backfill,
- seeder,
- aggregator,
- aggregation.

This is the moment the simulation becomes active. Each validator starts listening, producing, and participating in consensus.

### 15.8 Polling metrics for convergence

After starting the engines, `all_online` enters a polling loop:

- It calls `context.encode()` to fetch metrics.
- It parses metrics lines, ignoring comments.
- It checks that `peers_blocked` metrics are zero.
- It counts `certificates_processed` metrics for validators.
- It checks the `indexer` for seeds and summaries.

This is a clever convergence detection mechanism. Rather than waiting for a specific block height, it uses metrics and indexer signals to infer that consensus activity is happening and that data is flowing.

If too many polling ticks pass, the test logs a warning and exits. This prevents infinite hangs in CI.

### 15.9 Returning the state

At the end, the function returns `context.auditor().state()`. This is the deterministic runtime's snapshot of system state. It is used by tests to verify determinism: the same inputs should yield the same state.

---

## 16) Tests that use `all_online`

Three tests call `all_online` with different network characteristics:

- `test_good_links`: low latency, low jitter, perfect success rate. It compares the state across two runs with the same seed.
- `test_bad_links`: high latency, high jitter, 75 percent success. Still expects deterministic state across runs.
- `test_1k`: moderate latency and jitter, and a 98 percent success rate. It runs with a large `required` value to stress the system.

These tests are not about performance; they are about determinism and resilience. Even under bad links, the consensus should converge on the same state if the network eventually delivers messages.

---

## 17) Backfill test

`test_backfill` exercises a crucial distributed systems feature: catching up a late validator.

The test uses `n = 5` validators. It proceeds in phases:

1) **Start 4 validators**, leaving one out.
2) **Wait until the online validators have processed enough certificates** (the "initial" container requirement).
3) **Bring the late validator online** but with restricted connectivity (only connected to a subset).
4) **Wait until all validators, including the late one, reach the final container requirement**.

This verifies that backfill works: a validator that missed earlier consensus rounds can fetch and process historical data and still converge to the same state.

The test uses `link_validators` with a `restrict_to` predicate to simulate partial connectivity. This is realistic: in a real network, a node might only connect to a few peers at first.

The backfill test also reuses the metric-based polling strategy, checking `certificates_processed` per validator prefix. This ensures the late validator is truly catching up, not just connecting.

---

## 18) Unclean shutdown test

`test_unclean_shutdown` validates recovery from abrupt restarts.

Key ideas:

- The deterministic runtime supports checkpoints.
- The test simulates random shutdowns and restarts.
- It ensures the system can recover and eventually converge.

### 18.1 Shared identity and indexer

The test derives a threshold sharing once and clones it for each run. The `Mock` indexer is created outside the restart loop, because it stores seeds beyond the pruning boundary. This is a subtle but important detail: if the indexer were reset each run, it would lose context and invalidate the test.

### 18.2 Restart loop

The test runs in a loop. Each iteration:

- Constructs a deterministic runtime (either from a checkpoint or a timed run).
- Starts a network and validators.
- Links validators with good network conditions.
- Runs until either a random shutdown point or completion.

After two restarts, the test lets the run finish and asserts that multiple runs occurred. This proves that the system can recover from unclean shutdowns without corrupting state.

---

## 19) Execution test: 1000 transactions

`test_execution` is the most detailed simulation test. It verifies that the execution pipeline processes transactions consistently and that all validators see the same events at the same heights.

The flow:

1) Build a deterministic runtime and simulated network.
2) Create a validator set and link them.
3) Generate a DKG sharing and mock indexer.
4) Configure and start engines for each validator.
5) Submit 1000 transactions (casino registrations).
6) Wait until all transactions are processed.
7) Verify that all validators produce identical event summaries.

### 19.1 Transaction submission and rebroadcast

The test generates 1000 transactions and submits them via the mock indexer. It keeps a `remaining` map of pending transactions. If no events appear for a while, it rebroadcasts the remaining transactions. This mirrors real-world gossip behavior and ensures that transient drops do not stall the test.

### 19.2 Event processing and consensus checks

The test drains the `summaries` from the indexer and inspects events. It looks for `CasinoPlayerRegistered` events and removes those transactions from the `remaining` map.

It also records each summary by height in a `seen` map. For each height, it counts how many validators produced the same summary. It only advances once all validators agree on the summary for that height. This is the core determinism check: all validators must produce identical outputs at each height.

### 19.3 Final state

Once all transactions are processed and all heights are consistent, the test returns the auditor state. This allows higher-level tests to compare runs with different network conditions.

---

## 20) Execution tests under different links

Three tests exercise `test_execution`:

- `test_execution_basic`: simple run with low latency, low jitter.
- `test_execution_good_links`: repeated runs with the same link and different seeds; asserts deterministic equality across runs.
- `test_execution_bad_links`: same as above but with high latency and packet loss.

The key idea is that even with bad links, deterministic inputs should yield deterministic state. If they do not, there is a bug in consensus or execution ordering.

---

## 21) Why these tests are strong

These tests are powerful because they simulate real distributed behavior without requiring a real network:

- You get repeatability due to deterministic runtime seeds.
- You can control network conditions precisely.
- You can test failure scenarios (late nodes, restarts) deterministically.
- You can verify cross-validator state equality.

This is the gold standard for distributed systems testing. It is much stronger than a single-node unit test and much cheaper than full-scale distributed integration tests.

---

## 22) Operational guidance

When running these tests, keep the following in mind:

- Gateway integration tests require a live gateway and `RUN_INTEGRATION=true`.
- Node simulation tests run entirely in-memory and should be deterministic; if they become flaky, that is a red flag.
- If you change consensus timeouts or storage parameters, update tests accordingly; many constants are tuned for deterministic runtime constraints.
- Long timeouts are intentional; shortening them may introduce false negatives in CI.

---

## 23) Feynman recap

The gateway test file is an exhaustive protocol check: every bet type, every game, via real WebSocket messages. The node test file is a deterministic simulator: it spins up validators, simulates networks, and proves that consensus and execution converge to the same state even under bad links or restarts. Together they give us confidence that both the user-facing protocol and the validator core are stable.

If you can explain these tests to someone new, you understand how the system is supposed to behave under both normal and adversarial conditions.
