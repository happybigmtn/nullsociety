# Game Expansions

This document tracks planned game expansions, new game variants, and core rule updates for the Nullspace casino.

## Planned Core Rule Changes

### Nepal Commission-Free Baccarat (New Default)
**Status:** Planned
**Previous Default:** 4% Commission on all Banker wins (96% payout).
**New Default:** Nepal-style Commission-Free.
- **Banker Wins:** Pays **1:1** (Even money) on all totals **except 6**.
- **Banker Wins with 6:** Pays **1:2** (Half-payout, 0.5:1).
- **Player Wins:** Pays **1:1**.

**Rationale:**
Improves game flow by removing the need for small-unit commission calculations and provides a more intuitive experience for players, while maintaining a similar house edge.

### Unified Perfect Pair Side Bet
**Status:** Planned
**Previous:** Separate "Player Perfect Pair" and "Banker Perfect Pair" bets (each paying 25:1).
**New:** A single "Perfect Pair" bet covering both hands.
- **Payout (Either):** **25:1** if either the Player OR the Banker has a suited pair.
- **Payout (Both):** **250:1** if both the Player AND the Banker have suited pairs.

**Rationale:**
Consolidates two low-hit-rate side bets into a single high-excitement bet with a "Super-Jackpot" potential for double pairs.

## Baccarat Variants

### Jackpot Baccarat
**Reference:** [Wizard of Odds - Jackpot Baccarat](https://wizardofodds.com/games/baccarat/side-bets/jackpot-baccarat/)

**Overview:**
A poker-based side bet applied to the first two cards of the Player and Banker hands (4 cards total).

**Rules:**
- Pays based on the poker value of the combined 4 cards (Player's first 2 + Banker's first 2).
- Example Paytable (Verify with WoO):
  - **Royal Match:** King and Queen of the same suit.
  - **Premium Hands:** 4 of a Kind, 3 of a Kind, etc.
  
**Implementation Notes:**
- Requires access to exact card ranks and suits for the first 4 cards dealt.
- Payouts are independent of the main game result (Player/Banker win).

### Big and Small
**Reference:** [Wizard of Odds - Big and Small](https://wizardofodds.com/games/baccarat/side-bets/big-and-small/)

**Overview:**
Side bets based on the total number of cards dealt in a round (across both Player and Banker).

**Rules:**
- **Small:** Wins if the total number of cards dealt is exactly **4**.
- **Big:** Wins if the total number of cards dealt is **5 or 6**.

**Paytables (Playtech Standard):**
- **Small:** 1.5:1
- **Big:** 0.54:1

**Implementation Notes:**
- Very simple to implement as it only depends on the length of the `player_cards` and `banker_cards` vectors.
- Since it depends on the "Third Card Rule" execution, it provides an interesting way for players to bet on the volatility/complexity of the hand.
