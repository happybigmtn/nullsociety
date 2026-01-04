# L10 - Execution layer dispatch (from scratch)

Focus file: `execution/src/layer/mod.rs`

Goal: explain how the execution layer validates transactions, routes instructions to the right handlers, and stages state updates. For every excerpt, you will see **why it matters** and a **plain description of what the code does**. We only explain syntax when it is genuinely tricky.

---

## Concepts from scratch (expanded)

### 1) What is the execution layer?
This is the "application logic" of the chain. It takes signed transactions and:
- checks nonce correctness,
- runs the game/business logic,
- produces events,
- and stages state changes to commit later.

### 2) Two-phase execution: prepare + apply
Execution is split into:
- **prepare**: load account state and validate/increment nonce,
- **apply**: run the instruction handler and generate events.

This separation keeps validation consistent across all instruction types.

### 3) The Layer is a temporary state overlay
The `Layer` keeps a `pending` map of state changes. Reads first check `pending`, then fall back to the underlying state. When execution is done, `commit()` returns the staged changes to persist.

### 4) Determinism matters
Given the same inputs (seed + transactions), the execution must produce the same outputs. Determinism is critical for consensus and reproducibility.

### 5) Event outputs vs transaction outputs
Execution produces:
- `Output::Event` entries (what happened),
- and an `Output::Transaction` entry (the transaction itself).
These outputs are used later to build proofs and summaries.

### 6) Instruction dispatch
Instructions are grouped into domains (casino, staking, liquidity, bridge). This file dispatches to the correct handler module based on the instruction variant.

---

## Limits and management callouts (important)

1) **MINIMUM_LIQUIDITY = 1000**
- A permanent lock of LP tokens prevents the AMM from ever being fully drained.
- If you change this, you must update economic assumptions and tests.

2) **Nonce mismatch is skipped, not failed**
- In `execute`, a nonce mismatch causes the transaction to be skipped silently.
- This is a deliberate choice to keep blocks moving, but it can hide client bugs.

3) **No gas or complexity limits here**
- This layer assumes upstream limits (mempool, block size, rate limits) already exist.
- If those limits are loose, heavy instructions could become a DoS vector.

4) **Progressive state parsing depends on byte layout**
- The progressive helpers assume exact offsets into a state blob.
- Any schema changes must update these offsets or jackpot logic will break.

---

## Walkthrough with code excerpts

### 1) Minimum liquidity constant
```rust
// Keep a small amount of LP tokens permanently locked so the pool can never be fully drained.
// This mirrors the MINIMUM_LIQUIDITY pattern used by Raydium/Uniswap to avoid zero-price states.
const MINIMUM_LIQUIDITY: u64 = 1_000;
```

Why this matters:
- Prevents the AMM pool from reaching a zero-liquidity state, which would make prices undefined.

What this code does:
- Defines a fixed number of LP tokens that are effectively locked forever.
- Acts as a safety floor for the AMM math.

---

### 2) Helper to parse u64 from a byte slice
```rust
fn parse_u64_be_at(bytes: &[u8], offset: usize) -> Option<u64> {
    let slice = bytes.get(offset..offset + 8)?;
    let buf: [u8; 8] = slice.try_into().ok()?;
    Some(u64::from_be_bytes(buf))
}
```

Why this matters:
- Progressive jackpot logic needs to read numeric fields out of raw state blobs.

What this code does:
- Takes a byte slice and offset, safely slices 8 bytes, and converts them to a big-endian u64.
- Returns `None` if the slice is too short or conversion fails.

Syntax notes:
- The `?` operator early-returns `None` if any step fails.

---

### 3) Parse progressive state for Three Card
```rust
fn parse_three_card_progressive_state(state_blob: &[u8]) -> Option<(u64, [u8; 3])> {
    // v3:
    // [version:u8=3] [stage:u8] [player:3] [dealer:3] [pairplus:u64] [six_card:u64] [progressive:u64]
    if state_blob.len() < 5 {
        return None;
    }

    let version = state_blob[0];
    let player = [state_blob[2], state_blob[3], state_blob[4]];
    let progressive_bet = if version >= 3 {
        parse_u64_be_at(state_blob, 24)?
    } else {
        0
    };

    Some((progressive_bet, player))
}
```

Why this matters:
- The progressive jackpot payout depends on the player cards and bet size. If parsing is wrong, payouts are wrong.

What this code does:
- Interprets a raw state blob with a versioned layout.
- Extracts the player cards and (for v3+) the progressive bet amount.
- Returns `None` if the blob is too short.

---

### 4) Parse UTH progressive state + jackpot tier
```rust
fn parse_uth_progressive_state(state_blob: &[u8]) -> Option<(u64, [u8; 2], [u8; 3])> {
    // v3:
    // [version:u8=3] [stage:u8] [hole:2] [community:5] [dealer:2] [play_mult:u8] [bonus:4]
    // [trips:u64] [six_card:u64] [progressive:u64]
    if state_blob.len() < 7 {
        return None;
    }

    let version = state_blob[0];
    let hole = [state_blob[2], state_blob[3]];
    let flop = [state_blob[4], state_blob[5], state_blob[6]];
    let progressive_bet = if version >= 3 {
        parse_u64_be_at(state_blob, 32)?
    } else {
        0
    };

    Some((progressive_bet, hole, flop))
}
```

Why this matters:
- UTH progressive jackpots depend on hole cards + flop. The engine needs these to compute the correct payout tier.

What this code does:
- Reads a versioned state blob and extracts hole cards, flop cards, and progressive bet.
- Returns `None` if the blob is too short.

---

### 5) Jackpot tier logic (Royal vs Straight Flush)
```rust
fn uth_progressive_jackpot_tier(hole: &[u8; 2], flop: &[u8; 3]) -> UthJackpotTier {
    let cards = [hole[0], hole[1], flop[0], flop[1], flop[2]];
    if !cards.iter().all(|&c| card_utils::is_valid_card(c)) {
        return UthJackpotTier::None;
    }
    // ... suit + rank checks ...
    if is_flush && is_royal {
        UthJackpotTier::RoyalFlush
    } else if is_flush && is_straight {
        UthJackpotTier::StraightFlush
    } else {
        UthJackpotTier::None
    }
}
```

Why this matters:
- The jackpot payout amount depends on the tier. Misclassification means incorrect payouts.

What this code does:
- Combines hole + flop cards into a 5-card hand.
- Validates card encoding, checks for flush/straight/royal, and returns the tier.

---

### 6) Layer struct and constructor
```rust
pub struct Layer<'a, S: State> {
    state: &'a S,
    pending: BTreeMap<Key, Status>,

    seed: Seed,
    seed_view: u64,
}

pub fn new(
    state: &'a S,
    _master: <MinSig as Variant>::Public,
    _namespace: &[u8],
    seed: Seed,
) -> Self {
    let seed_view = seed.view().get();
    Self {
        state,
        pending: BTreeMap::new(),
        seed,
        seed_view,
    }
}
```

Why this matters:
- The Layer is the core execution context. It holds the current seed and stages all changes.

What this code does:
- Stores the base state reference, an empty pending map, and the seed for this block.
- Extracts `seed_view` so it can be used without repeated decoding.

Syntax notes:
- Lifetime `'a` ties the layer to the underlying state reference.

---

### 7) Prepare step (nonce validation)
```rust
async fn prepare(&mut self, transaction: &Transaction) -> Result<(), PrepareError> {
    let mut account = load_account(self, &transaction.public)
        .await
        .map_err(PrepareError::State)?;
    validate_and_increment_nonce(&mut account, transaction.nonce)?;
    self.insert(
        Key::Account(transaction.public.clone()),
        Value::Account(account),
    );

    Ok(())
}
```

Why this matters:
- Nonce validation prevents replay and ensures transaction ordering.

What this code does:
- Loads the account state through the Layer (so pending updates are considered).
- Validates and increments the nonce.
- Writes the updated account into the pending map.

---

### 8) Domain-specific dispatch (casino example)
```rust
async fn apply_casino(
    &mut self,
    public: &PublicKey,
    instruction: &Instruction,
) -> Result<Vec<Event>> {
    match instruction {
        Instruction::CasinoRegister { name } => self.handle_casino_register(public, name).await,
        Instruction::CasinoDeposit { amount } => {
            self.handle_casino_deposit(public, *amount).await
        }
        Instruction::CasinoStartGame { game_type, bet, session_id } => {
            self.handle_casino_start_game(public, *game_type, *bet, *session_id).await
        }
        // ... many more casino instructions ...
        _ => anyhow::bail!("internal error: apply_casino called with non-casino instruction"),
    }
}
```

Why this matters:
- This is how the system routes each casino instruction to its correct handler.

What this code does:
- Matches on the specific casino instruction variant.
- Calls the matching handler method and returns the events it produces.
- Errors if a non-casino instruction somehow reaches this function.

---

### 9) Top-level apply dispatcher
```rust
async fn apply(&mut self, transaction: &Transaction) -> Result<Vec<Event>> {
    let instruction = &transaction.instruction;
    let public = &transaction.public;

    match instruction {
        Instruction::CasinoRegister { .. }
        | Instruction::CasinoDeposit { .. }
        | Instruction::CasinoStartGame { .. }
        | Instruction::CasinoGameMove { .. }
        | Instruction::CasinoPlayerAction { .. }
        | Instruction::CasinoJoinTournament { .. }
        | Instruction::CasinoSetTournamentLimit { .. }
        | Instruction::CasinoStartTournament { .. }
        | Instruction::CasinoEndTournament { .. }
        | Instruction::GlobalTableInit { .. }
        | Instruction::GlobalTableOpenRound { .. }
        | Instruction::GlobalTableSubmitBets { .. }
        | Instruction::GlobalTableLock { .. }
        | Instruction::GlobalTableReveal { .. }
        | Instruction::GlobalTableSettle { .. }
        | Instruction::GlobalTableFinalize { .. } => {
            self.apply_casino(public, instruction).await
        }
        Instruction::Stake { .. }
        | Instruction::Unstake
        | Instruction::ClaimRewards
        | Instruction::ProcessEpoch => self.apply_staking(public, instruction).await,
        Instruction::CreateVault
        | Instruction::DepositCollateral { .. }
        | Instruction::BorrowUSDT { .. }
        | Instruction::RepayUSDT { .. }
        | Instruction::Swap { .. }
        | Instruction::AddLiquidity { .. }
        | Instruction::RemoveLiquidity { .. }
        | Instruction::LiquidateVault { .. }
        | Instruction::SetPolicy { .. }
        | Instruction::SetTreasury { .. }
        | Instruction::FundRecoveryPool { .. }
        | Instruction::RetireVaultDebt { .. }
        | Instruction::RetireWorstVaultDebt { .. }
        | Instruction::DepositSavings { .. }
        | Instruction::WithdrawSavings { .. }
        | Instruction::ClaimSavingsRewards
        | Instruction::SeedAmm { .. }
        | Instruction::FinalizeAmmBootstrap
        | Instruction::SetTreasuryVesting { .. }
        | Instruction::ReleaseTreasuryAllocation { .. }
        | Instruction::UpdateOracle { .. } => {
            self.apply_liquidity(public, instruction).await
        }
        Instruction::BridgeWithdraw { .. }
        | Instruction::BridgeDeposit { .. }
        | Instruction::FinalizeBridgeWithdrawal { .. } => {
            self.apply_bridge(public, instruction).await
        }
    }
}
```

Why this matters:
- This is the main routing table for all instruction types. If it is wrong, entire subsystems break.

What this code does:
- Groups instruction variants by domain.
- Delegates to the matching apply_* function for that domain.
- Ensures every instruction variant is handled.

---

### 10) "Get or init" helpers
```rust
async fn get_or_init_house(&mut self) -> Result<nullspace_types::casino::HouseState> {
    Ok(match self.get(Key::House).await? {
        Some(Value::House(h)) => h,
        _ => nullspace_types::casino::HouseState::new(self.seed_view),
    })
}
```

Why this matters:
- Many handlers require a core state object. This guarantees it exists before use.

What this code does:
- Reads a typed value from state.
- If missing, constructs a default state object using the current seed view.

---

### 11) Execute a batch of transactions
```rust
pub async fn execute(
    &mut self,
    #[cfg(feature = "parallel")] _pool: ThreadPool,
    transactions: Vec<Transaction>,
) -> Result<(Vec<Output>, BTreeMap<PublicKey, u64>)> {
    let mut processed_nonces = BTreeMap::new();
    let mut outputs = Vec::new();

    for tx in transactions {
        match self.prepare(&tx).await {
            Ok(()) => {}
            Err(PrepareError::NonceMismatch { .. }) => continue,
            Err(PrepareError::State(err)) => {
                return Err(err).context("state error during prepare");
            }
        }
        processed_nonces.insert(tx.public.clone(), tx.nonce.saturating_add(1));
        outputs.extend(self.apply(&tx).await?.into_iter().map(Output::Event));
        outputs.push(Output::Transaction(tx));
    }

    Ok((outputs, processed_nonces))
}
```

Why this matters:
- This is the core execution loop for a block.

What this code does:
- Iterates transactions one by one.
- Runs `prepare` to validate nonce and stage account updates.
- Skips transactions with nonce mismatch (does not abort the block).
- Applies the instruction, collects events, and appends the transaction output.
- Returns both outputs and the next nonce per account.

Syntax notes:
- `saturating_add` prevents overflow if a nonce is near `u64::MAX`.

---

### 12) Commit staged changes
```rust
pub fn commit(self) -> Vec<(Key, Status)> {
    self.pending.into_iter().collect()
}
```

Why this matters:
- Execution is not persisted until commit. This function exposes the staged changes to the caller.

What this code does:
- Converts the pending map into a vector of key/status pairs for persistence.

---

### 13) State overlay behavior
```rust
impl<'a, S: State> State for Layer<'a, S> {
    async fn get(&self, key: Key) -> Result<Option<Value>> {
        Ok(match self.pending.get(&key) {
            Some(Status::Update(value)) => Some(value.clone()),
            Some(Status::Delete) => None,
            None => self.state.get(key).await?,
        })
    }
    // insert/delete write to pending...
}
```

Why this matters:
- This ensures reads see the most recent staged changes, not stale base state.

What this code does:
- Reads pending updates first.
- Falls back to the underlying state only if the key is not staged.

---

### 14) Determinism test (excerpt)
```rust
#[test]
fn test_layer_execute_is_deterministic_for_identical_inputs() {
    // ... build two states, same seed, same txs ...
    let (outputs1, nonces1) = layer1.execute(txs.clone()).await.unwrap();
    let (outputs2, nonces2) = layer2.execute(txs).await.unwrap();

    assert_eq!(outputs1, outputs2);
    assert_eq!(nonces1, nonces2);
    assert!(layer1.commit() == layer2.commit());
}
```

Why this matters:
- If two identical inputs produce different outputs, consensus breaks.

What this code does:
- Executes the same transactions against two separate states.
- Asserts that outputs, nonces, and committed changes are identical.

---

## Extended deep dive: execution semantics and invariants

The execution layer is where "protocol correctness" meets "game logic." It is worth understanding the deeper invariants that the code is enforcing.

### 15) Why nonce mismatches are skipped, not fatal

In `execute`, a nonce mismatch causes the transaction to be skipped, not rejected with an error. This is a policy choice:

- It keeps blocks progressing even if some transactions are stale.
- It reduces the chance of a single bad transaction invalidating the entire block.

The tradeoff is visibility: if a client repeatedly submits stale nonces, the chain will silently skip those transactions. That can confuse users unless the gateway or indexer reports the mismatch.

This policy is common in batch execution systems: treat invalid items as no-ops, continue with the rest.

### 16) Why outputs include both events and transactions

The execution loop appends:

- `Output::Event` for each event produced by handlers.
- `Output::Transaction` for the transaction itself.

This means the output stream is an interleaving of events and transactions.

Why include the transaction output at all?

Because downstream components build proofs and summaries that must show both "what happened" and "which transaction caused it." Including the transaction in the output stream makes that explicit.

### 17) The pending map as a deterministic overlay

The `Layer` uses a `BTreeMap` for `pending` updates, not a `HashMap`. That is subtle but important:

- `BTreeMap` has a deterministic iteration order.
- Deterministic iteration order helps reproducibility when you commit staged changes.

If you used a hash map, the iteration order could change across runs, which might affect ordering-sensitive processes like proof generation.

This is one of those "small choices" that makes the system deterministic.

### 18) The role of the seed and seed view

The Layer stores `seed` and `seed_view`. The seed is used by game logic for randomness. The view number is extracted once and reused because it is referenced frequently.

This is both a performance and correctness choice:

- It ensures all handlers use the same seed and view for a block.
- It avoids repeated decoding or cloning.

The seed is effectively the "randomness anchor" for the block. If two nodes used different seeds, they would diverge immediately.

### 19) Why "get or init" helpers matter

The `get_or_init_*` helpers enforce a key invariant: required state objects exist before use.

This avoids a class of bugs where handlers assume a value exists and then panic on `None`. Instead, the Layer creates a default state on first use.

This pattern also helps with migrations: if you introduce a new state object, old databases that do not have the key will still work because the default is constructed on demand.

### 20) Determinism depends on two inputs, not one

The determinism test shows that outputs depend on:

1) the seed
2) the transaction list

If either changes, the output changes.

That is an important mental model. The seed is not "extra"; it is part of the execution input. Any test or simulation that ignores the seed is incomplete.

### 21) Feynman analogy: a ledger with scratch paper

Think of the Layer as an accountant who uses scratch paper:

- The underlying state is the official ledger.
- The pending map is the scratch paper for the current block.
- `commit` is when the accountant copies the scratch paper into the ledger.

This explains why `get` checks pending first: the accountant uses the most recent notes, not yesterday's ledger entry.

### 22) A practical checklist for extending the execution layer

If you add a new instruction:

1) Add it to the dispatch match in `apply`.
2) Implement a handler in the correct domain module.
3) Ensure the handler uses `self.insert` to stage state changes.
4) Emit events that downstream indexers expect.
5) Add a determinism test or extend existing ones.

Missing any of these will cause subtle bugs. The dispatch table is the single source of truth for what can be executed.

---

### 23) Processed nonces: why the executor returns them

The `execute` function returns a `BTreeMap<PublicKey, u64>` of processed nonces. This is not a random extra return value; it is how the caller updates nonce state efficiently.

Rather than scanning the outputs to infer which transactions were accepted, the executor explicitly reports the next nonce for each account that processed successfully. This keeps the state transition logic clean and avoids redundant computation.

It also ensures determinism. The map is ordered (BTreeMap), so downstream code that iterates it will do so in a stable order.

### 24) About the optional thread pool

The signature of `execute` accepts a thread pool when the `parallel` feature is enabled. In the current code path the parameter is unused (`_pool`), but the presence of the parameter indicates a design intent:

- In the future, execution could be parallelized at the instruction level.
- Any parallelization must preserve deterministic ordering and data dependencies.

This is a non-trivial constraint. You cannot just "run instructions in parallel" without careful analysis of shared state, nonce dependencies, and event ordering.

The current sequential loop is the safe default. The thread pool parameter is a placeholder for future work, not a guarantee of parallel speedups today.

---

### 25) Deletes and tombstones in the pending map

The `pending` map stores `Status::Update` or `Status::Delete`. That means the Layer can represent deletions explicitly, not just additions.

This matters when instructions remove data (for example, ending a game session or clearing temporary state). Without a delete marker, a removed key could appear to still exist when reading through the overlay.

So the Layer tracks deletions as first-class state changes. That is part of why the overlay is correct and consistent. It prevents ghost state from leaking into later reads unexpectedly.

---

## Key takeaways
- The Layer is a staging overlay that validates nonces, applies instructions, and collects events.
- Instruction dispatch is centralized and grouped by domain.
- Execution is deterministic and tested for it.

## Next lesson
L11 - Casino handlers: `feynman/lessons/L11-casino-handlers.md`
