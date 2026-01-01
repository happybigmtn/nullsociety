# Null/Space Business Strategy

## Executive Summary
Null/Space is building a self-contained casino + DeFi economy that matures
inside a closed system (pre-token launch window) before opening to external convertibility
through a Uniswap v4 continuous clearing auction program. The strategy is
to grow a real player base and stable internal markets first, then allow
controlled on/off-ramping once economic primitives are proven under load.

The end-state objective (post-token launch) is an economy that is 100% owned by RNG
stakers: all protocol revenues flow to stakers, and treasury operations are
governed by stakers.

## Vision
Build the most resilient, playable crypto-native economy by:
- Proving the economy in an "island mode" before external trading.
- Rewarding participation and retention rather than airdrop farming.
- Routing all long-term cash flows to stakers.

## Product Overview
Core loops:
- Casino games + freerolls (engagement and emissions).
- Internal DeFi: AMM (RNG/vUSDT), vaults, staking, and liquidity.
- Membership tier for expanded freeroll access and retention.
Delivery surfaces:
- Web (Vite/React) and mobile (Expo/native), both using the gateway
  WebSocket protocol for on-chain actions and updates.

Internal assets:
- RNG (chips): internal unit of account and staking asset.
- vUSDT: internal stable balance for swap/borrow/lend.

## Phased Strategy

### Pre-token Launch Window: Island Economy + Capital Controls
Goals:
- Grow player base and retention.
- Stress test AMM, vaults, and staking under real usage.
- Prevent early extraction and "down only" dumping.

Key design pillars:
- Capital controls (no external bridge; internal-only balances).
- Reward vesting and account maturity tiers.
- Dynamic fees/taxes and strict swap/borrow caps.
- Full internal DeFi suite + transparent economic dashboards.

### Token Launch + CCA Program: Convertibility + Staker Ownership
Goals:
- Launch RNG on EVM via Uniswap v4 liquidity launcher (CCA).
- Open on/off-ramp with caps and phased ramp-up.
- Distribute 100% of swap fees and protocol revenue to stakers (USDT).

Key design pillars:
- ERC-20 RNG + recurring CCA auctions + v4 liquidity pool.
- Quarterly CCAs (10 total): first auction starts 3 months after testnet launch; each auction sells 2.5% of total supply (30-month program).
- Up to 2.5% additional supply per auction via freeroll BOGO credits (unclaimed bonus to treasury reserve).
- Remaining 50% of total supply controlled by developer (treasury/ops/liquidity/partnerships), vesting at 5% per year over 10 years.
- Bridge policy with caps, delays, and emergency pause.
- USDT fee distribution contract for stakers.
- Staker-governed treasury and operations.

## Revenue Model (Maximize System Revenues)
Primary revenue sources:
- House edge on casino games (net PnL).
- AMM fees, dynamic sell tax, and a 10% buy tax during the CCA program (to encourage bidding).
- Stability fees on vUSDT debt.
- Optional membership subscriptions.

Distribution (token launch + CCA program):
- 100% of net protocol revenues routed to RNG stakers.
- Treasury funding for operations is governed by stakers.
- Net positive house edge is burned on a weekly cadence.

## Token Economy Strategy
See `economy.md` and `liquidity.md` for full parameters and allocation design.

Key mechanics:
- Emissions: freeroll credits capped to support up to 2.5% bonus supply per
  auction (up to 25% total over 30 months), redeemed only via CCA participation (BOGO bonus).
- Credits are non-transferable internal points until token launch redemption.
- Freeroll bonus allocations vest continuously over a 3-month period.
- Sinks: house edge; sell/buy tax split (buy tax 10% during the CCA program; sell tax 80% recovery pool until $10m, then 80% to RNG stakers; 20% to operating budget); stability fees.
- Anti-sybil: vesting schedules, account maturity gating, proof-of-play rules.
- vUSDT stability: interest accrual, liquidation mechanics, and guardrails.

CCA proceeds policy:
- 100% of CCA auction proceeds go directly into the Uniswap v4 liquidity pool.
- Fund a 10m USDT recovery pool to retire vUSDT debt or bad positions via
  80% of sell tax (10% on RNG sales), with 20% to operating budget. After the
  10m threshold, 80% of sell tax routes to RNG stakers.
- If the minimum raise threshold is not met, delay convertibility and rerun
  the auction rather than under-seeding liquidity.

## Marketing Strategy (Simulation-First)
Pre-token launch:
- Weekly leagues + leaderboards + streamer events.
- Transparent economic reporting (issuance, burn, fees, liquidity).
- Seasonal campaigns and retention rewards.

CCA program:
- Auction awareness campaigns.
- Testnet CCA simulations and public results.
- Convertibility ramps and fee distribution transparency.

## Operations and Scaling
Technical plan and infra sizing live in `plan.md` and `golive.md`.
Scale targets prioritize simulator/indexer throughput, gateway WebSocket
fanout, and Convex-backed auth/billing. Production configs should set
gateway session limits (`GATEWAY_SESSION_RATE_LIMIT_*`) and event wait
timeouts (`GATEWAY_EVENT_TIMEOUT_MS`) alongside simulator origin allowlists.

## Legal Structure
We will form a legal entity as the legal wrapper for the DAO-style economy. This enables a
staker-governed entity to hold treasury assets, manage contracts, and define
member rights. Formation details and compliance steps live in `plan.md`.

## Risk and Compliance
Primary risks:
- Sybil farming and supply concentration.
- vUSDT instability and AMM manipulation.
- Regulatory uncertainty for convertibility and gaming.

Mitigations:
- Capital controls, vesting, and account maturity tiers.
- Liquidations and stability fees.
- Compliance planning and security controls.

## KPIs
- DAU/WAU and D7/D30 retention.
- Swap/borrow/LP conversion rates.
- Distribution concentration (top 1% share).
- Fee revenue per active user.
- Sybil flags per 1k accounts.

## References (Authoritative)
- Roadmap + delivery plan: `plan.md`
- Economic design + parameters: `economy.md`
- Liquidity + allocation roadmap: `liquidity.md`
- Production readiness: `golive.md`
- Security disclosure: `SECURITY.md`
