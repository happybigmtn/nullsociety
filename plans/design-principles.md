# Nullspace Casino Design Principles

*Inspired by Jony Ive's philosophy: "True simplicity is derived from so much more than just the absence of clutter and ornamentation. It's about bringing order to complexity."*

---

## Core Philosophy

### 1. Radical Simplicity

Every element must earn its place. If it doesn't directly help the user play the game, it doesn't belong on the primary view.

**Questions to ask:**
- Can a first-time player understand what to do within 3 seconds?
- Is there only ONE primary action visible at any moment?
- Does removing this element break the game?

### 2. Progressive Disclosure

Complexity exists—but reveal it only when needed. Hide advanced options behind deliberate gestures.

**Levels of disclosure:**
1. **Immediate:** Current card/bet, ONE action button
2. **On-demand:** Bet history, modifiers, side bets (swipe/tap to reveal)
3. **Tutorial:** Full explanation (accessible but never intrusive)

### 3. Clarity Over Decoration

Typography, spacing, and color should communicate hierarchy—not decoration. Remove all visual noise.

**Typography hierarchy:**
- **Primary:** Current state (card, pot, result) — Large, bold, centered
- **Secondary:** Action labels — Medium, high contrast
- **Tertiary:** Help text, history — Small, muted

### 4. Tactile Response

Every interaction should feel physical. Haptics and animations confirm actions without requiring visual attention.

**Haptic patterns:**
- **Light tap:** Chip selection, menu toggle
- **Medium impact:** Bet confirmation, card deal
- **Success notification:** Win
- **Error notification:** Loss
- **Heavy pattern:** Jackpot/big win

---

## Color System

```
Background:     #0A0A0A (near-black)
Surface:        #141414 (card/panel background)
Border:         #2A2A2A (subtle dividers)

Primary:        #00FF00 (terminal green) — Positive actions, wins
Accent:         #FF4444 (soft red) — Losses, fold actions
Gold:           #FFD700 — Currency, premium features
Text Primary:   #FFFFFF
Text Secondary: #888888
Text Tertiary:  #444444
```

---

## Spacing System

```
Base unit: 8px

xs:  4px   (tight grouping)
sm:  8px   (element padding)
md:  16px  (component spacing)
lg:  24px  (section spacing)
xl:  32px  (major sections)
2xl: 48px  (screen padding)
```

---

## Typography

```
Font Family: System (SF Pro on iOS, Roboto on Android)
Monospace:   JetBrains Mono (numbers, bets, results)

Sizes:
- Hero:      48px (big wins, jackpots)
- Title:     32px (game name)
- Large:     24px (current bet/pot)
- Body:      16px (action labels)
- Caption:   12px (help text)
- Micro:     10px (disclaimers)

Weight:
- Bold:      Titles, amounts, primary actions
- Medium:    Body text, secondary actions
- Regular:   Help text, captions
```

---

## Component Patterns

### Primary Action Button

ONE primary action per screen state. Always visible, always obvious.

```
┌─────────────────────────────┐
│                             │
│           DEAL              │
│                             │
└─────────────────────────────┘

- Full width on mobile
- High contrast (green bg, black text)
- Minimum 56px height
- Rounded corners (12px)
- Shadow for elevation
```

### Card Display

Cards should be the visual focus. Everything else recedes.

```
       ┌────────┐
       │   A    │
       │   ♠    │
       │        │
       └────────┘

- Centered on screen
- 25% of viewport height
- White background, subtle shadow
- Suit colors: red/black only
- Flip animation: 300ms ease-out
```

### Bet/Pot Display

Clear, monospace, prominent.

```
        POT: $1,250

- Centered above game area
- Monospace font
- Gold color for positive amounts
- Animate number changes (count up/down)
```

### Action Menu (Hidden by default)

Secondary actions behind a single tap.

```
Before tap:     ○ (collapsed indicator)

After tap:
┌─────────────────────────────┐
│  SHIELD      DOUBLE     ×   │
│    ○           ○            │
└─────────────────────────────┘

- Horizontal pill layout
- Toggle states clearly visible
- Dismiss on outside tap
- Animate slide-up from bottom
```

---

## Game-Specific Designs

### Hi-Lo (Simplest game — template for others)

**Betting State:**
```
┌─────────────────────────────────────┐
│                                     │
│              [?] Help               │
│                                     │
│            ┌────────┐               │
│            │   7    │               │
│            │   ♥    │               │
│            └────────┘               │
│                                     │
│            POT: $0                  │
│                                     │
│   ┌─────────────────────────────┐   │
│   │           DEAL              │   │
│   └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Playing State:**
```
┌─────────────────────────────────────┐
│                                     │
│              [?] Help               │
│                                     │
│            ┌────────┐               │
│            │   7    │               │
│            │   ♥    │               │
│            └────────┘               │
│                                     │
│         ↓ 1.86x    ↑ 1.86x          │
│                                     │
│   ┌───────────┐  ┌───────────┐      │
│   │  LOWER    │  │  HIGHER   │      │
│   └───────────┘  └───────────┘      │
│                                     │
│        ─── CASH OUT $25 ───         │
│                                     │
└─────────────────────────────────────┘
```

**Key principles:**
- Card is ALWAYS centered and dominant
- Only 2-3 actions visible at once
- Multipliers shown inline, not in separate panel
- Cash out is styled differently (secondary importance)

---

### Blackjack

**Betting State:**
```
┌─────────────────────────────────────┐
│                                     │
│              [?] Help    [≡] More   │
│                                     │
│            DEALER                   │
│          ┌────────┐                 │
│          │  ░░░░  │  (face down)    │
│          └────────┘                 │
│                                     │
│                                     │
│              YOU                    │
│          ┌────────┐                 │
│          │  ░░░░  │                 │
│          └────────┘                 │
│                                     │
│            BET: $25                 │
│    ○ ○ ○ ○ ○ ○ ○ ○  (chip rail)     │
│                                     │
│   ┌─────────────────────────────┐   │
│   │           DEAL              │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Playing State:**
```
┌─────────────────────────────────────┐
│                                     │
│              [?] Help               │
│                                     │
│            DEALER · 6               │
│          ┌────────┐                 │
│          │   6    │                 │
│          │   ♦    │                 │
│          └────────┘                 │
│                                     │
│              YOU · 14               │
│       ┌────────┐ ┌────────┐         │
│       │   8    │ │   6    │         │
│       │   ♠    │ │   ♣    │         │
│       └────────┘ └────────┘         │
│                                     │
│   ┌─────────────────────────────┐   │
│   │           HIT               │   │
│   └─────────────────────────────┘   │
│                                     │
│   STAND   DOUBLE   SPLIT  (if avail)│
└─────────────────────────────────────┘
```

**Key principles:**
- Primary action (HIT) dominates
- Secondary actions (STAND, DOUBLE, SPLIT) are smaller, below
- Side bets and modifiers hidden in [≡] More menu
- Card values shown inline with label

---

### Roulette

**Betting State:**
```
┌─────────────────────────────────────┐
│                                     │
│              [?] Help    [≡] Bets   │
│                                     │
│         ┌───────────────┐           │
│         │               │           │
│         │   ROULETTE    │           │
│         │    WHEEL      │           │
│         │               │           │
│         └───────────────┘           │
│                                     │
│         QUICK BETS:                 │
│    ┌─────┐ ┌─────┐ ┌─────┐          │
│    │ RED │ │BLACK│ │ODD  │          │
│    └─────┘ └─────┘ └─────┘          │
│    ┌─────┐ ┌─────┐ ┌─────┐          │
│    │EVEN │ │1-18 │ │19-36│          │
│    └─────┘ └─────┘ └─────┘          │
│                                     │
│            TOTAL: $25               │
│                                     │
│   ┌─────────────────────────────┐   │
│   │           SPIN              │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Full bet grid accessible via [≡] Bets:**
- Traditional 36-number grid
- Corner, street, split bets
- But NOT shown by default

---

### Craps (Most complex game)

**Simplified view (default):**
```
┌─────────────────────────────────────┐
│                                     │
│              [?] Help    [≡] Bets   │
│                                     │
│         POINT: 8                    │
│         ┌─────┐ ┌─────┐             │
│         │  ⚃  │ │  ⚄  │             │
│         └─────┘ └─────┘             │
│                                     │
│         PASS LINE: $25              │
│                                     │
│   ┌─────────────────────────────┐   │
│   │          ROLL               │   │
│   └─────────────────────────────┘   │
│                                     │
│   DON'T PASS    COME    FIELD       │
└─────────────────────────────────────┘
```

**Key principles:**
- 40+ bet types exist, but show only 4 common ones
- Full bet menu in drawer
- Focus on dice and current point
- One ROLL button

---

## Tutorial / Help Mode

Every game has a persistent [?] Help button that opens contextual guidance.

### Tutorial Modes:

**1. Quick Tips (tooltip-style)**
```
┌─────────────────────────────────────┐
│  ┌──────────────────────────────┐   │
│  │ TIP: In Hi-Lo, Aces are low  │   │
│  │ and Kings are high.          │   │
│  └──────────────────────────────┘   │
│                                     │
│            ┌────────┐               │
│            │   A    │               │
│            │   ♠    │               │
│            └────────┘               │
│                                     │
│  Only HIGHER can win from an Ace.   │
│                                     │
└─────────────────────────────────────┘
```

**2. Full Tutorial (overlay)**
```
┌─────────────────────────────────────┐
│                                     │
│          BLACKJACK BASICS           │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ GOAL: Get closer to 21 than │    │
│  │ the dealer without busting. │    │
│  └─────────────────────────────┘    │
│                                     │
│  ○ HIT - Take another card          │
│  ○ STAND - Keep your hand           │
│  ○ DOUBLE - Double bet, one card    │
│  ○ SPLIT - Split matching cards     │
│                                     │
│  Card Values:                       │
│  • Number cards = face value        │
│  • Face cards = 10                  │
│  • Aces = 1 or 11                   │
│                                     │
│   ┌─────────────────────────────┐   │
│   │        GOT IT               │   │
│   └─────────────────────────────┘   │
│                                     │
│         ○ Don't show again          │
└─────────────────────────────────────┘
```

**3. Interactive Demo Mode**
- Play with fake chips
- Guided steps
- Highlight what to tap next

---

## Animation Guidelines

### Durations
```
Micro:    100ms  (button press feedback)
Fast:     200ms  (menu toggle, chip select)
Normal:   300ms  (card flip, page transition)
Slow:     500ms  (dice roll start, wheel spin start)
Extended: 2-4s   (dice roll, wheel spin, card sequence)
```

### Easing
```
Standard:     ease-out (0.0, 0.0, 0.2, 1.0)
Decelerate:   ease-out (0.0, 0.0, 0.0, 1.0)
Spring:       spring(1, 100, 10) for bouncy feedback
```

### Animation Principles
1. **Anticipation:** Brief pause before action (50ms)
2. **Action:** The actual movement
3. **Resolution:** Settle into final state with micro-bounce
4. **Feedback:** Haptic + visual confirmation

---

## Keyboard Controls (Desktop)

Every game must be fully playable with keyboard alone.

### Universal Keys
```
SPACE/ENTER   Primary action (Deal, Hit, Spin)
ESC           Cancel / Clear bet
?             Toggle help
TAB           Cycle actions
1-5           Quick chip select
```

### Game-Specific Keys
```
BLACKJACK:
H = Hit, S = Stand, D = Double, P = Split

HI-LO:
↑ = Higher, ↓ = Lower, C = Cash out

ROULETTE:
R = Red, B = Black, O = Odd, E = Even

CRAPS:
P = Pass, N = Don't Pass, F = Field
```

---

## Implementation Checklist

For each game, verify:

- [ ] Single primary action visible at all times
- [ ] Secondary actions hidden by default
- [ ] Help button always accessible
- [ ] Tutorial available on first play
- [ ] Haptic feedback on all interactions
- [ ] Full keyboard navigation
- [ ] Animations feel physical, not decorative
- [ ] Color hierarchy communicates state
- [ ] Typography is legible at all sizes
- [ ] Works in portrait and landscape

---

*"Design is not just what it looks like and feels like. Design is how it works."* — Steve Jobs
