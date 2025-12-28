---
status: completed
priority: p1
issue_id: "004"
tags: [code-review, security, mobile, validation]
dependencies: []
---

# No Client-Side Bet Amount Validation

## Problem Statement

The client allows placing bets without validating against the user's available balance. Users can accumulate bets exceeding their balance before submitting to the server. This pattern exists across all game screens.

**Why it matters:** If server-side validation is weak, users could place bets they cannot cover. Even with server validation, this creates poor UX and potential race conditions.

## Findings

**Agent:** security-sentinel
**Severity:** HIGH (P1 if server trusts client)

**Location:** `mobile/src/screens/games/BlackjackScreen.tsx:132-154`

```typescript
const handleChipPlace = useCallback((value: ChipValue) => {
  if (state.phase !== 'betting') return;
  setState((prev) => ({
    ...prev,
    bet: prev.bet + value,  // No balance check
  }));
}, [state.phase]);

const handleDeal = useCallback(async () => {
  if (state.bet === 0) return;
  // No validation that bet <= balance
  send({
    type: 'blackjack_deal',
    amount: state.bet,
  });
```

This pattern is repeated in all 10 game screens.

## Proposed Solutions

### Option A: Client-Side Balance Check (Recommended)
**Effort:** Small
**Risk:** Low
**Pros:** Immediate feedback, prevents UI confusion
**Cons:** Still needs server validation

```typescript
const handleChipPlace = useCallback((value: ChipValue) => {
  if (state.phase !== 'betting') return;
  if (state.bet + value > state.balance) {
    haptics.error();
    return; // Reject over-balance bets
  }
  haptics.chipPlace();
  setState((prev) => ({
    ...prev,
    bet: prev.bet + value,
  }));
}, [state.phase, state.balance, state.bet]);
```

### Option B: Visual Feedback + Disable Chips
**Effort:** Medium
**Risk:** Low
**Pros:** Better UX, impossible to over-bet
**Cons:** More UI changes

Disable chip values that would exceed remaining balance.

## Recommended Action

Implement Option A across all game screens.

## Technical Details

**Affected files:**
- `mobile/src/screens/games/BlackjackScreen.tsx`
- `mobile/src/screens/games/HiLoScreen.tsx`
- `mobile/src/screens/games/RouletteScreen.tsx`
- `mobile/src/screens/games/CrapsScreen.tsx`
- `mobile/src/screens/games/VideoPokerScreen.tsx`
- `mobile/src/screens/games/BaccaratScreen.tsx`
- `mobile/src/screens/games/SicBoScreen.tsx`
- `mobile/src/screens/games/ThreeCardPokerScreen.tsx`
- `mobile/src/screens/games/UltimateTXHoldemScreen.tsx`
- `mobile/src/screens/games/CasinoWarScreen.tsx`

## Acceptance Criteria

- [ ] User cannot place bets exceeding their balance
- [ ] Haptic feedback indicates rejected bet
- [ ] Visual indication when near/at balance limit
- [ ] Server still validates (defense in depth)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2025-12-26 | Created from code review | Client validation improves UX; server validation is required for security |

## Resources

- Files: All game screens in `mobile/src/screens/games/`
