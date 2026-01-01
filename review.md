# Review Issues Log

This file tracks cumulative issues or potential improvements discovered during the walkthrough.
Each entry captures the file, issue, impact, and any suggested action.

## Open Issues
- packages/protocol/src/encode.ts: `encodeGameStart` is labeled as a placeholder and uses little-endian for amounts while other encoders use big-endian; if consumers call this, it likely won’t match the Rust protocol. Suggest either implement the real spec or remove from the public API until ready.
- evm/scripts/deployPhase2.js + evm/scripts/simulateCcaBids.js: bidder key loading + Permit2 allowance logic is duplicated; drift risk if updated in one place. Suggest extracting shared helpers under `evm/src/` and importing from both scripts.
- evm/src/abis/*.js: ABIs are hand-maintained; potential for drift from deployed contracts. Suggest generating from Hardhat artifacts or TypeChain output and importing from a single source.
- execution/src/casino/super_mode.rs: uses `f32` probabilities in consensus-critical RNG paths; likely deterministic but still float-based. Consider replacing with integer-threshold sampling to eliminate any cross-platform float variance risk.
