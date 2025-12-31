//! Consensus-critical casino limits.
//!
//! These values must remain consistent across all nodes to avoid divergent results.
//! If we want runtime configurability, move them into on-chain policy with explicit versioning.

pub const BACCARAT_MAX_BETS: usize = 11;
pub const CRAPS_MAX_BETS: usize = 20;
pub const ROULETTE_MAX_BETS: usize = 20;
pub const SIC_BO_MAX_BETS: usize = 20;
