# 3D Animation Architecture

## Overview

This document describes the 3D animation system using React Three Fiber (R3F) for immersive casino animations in Normal Mode.

## Philosophy

**Turbo Mode**: Instant results, CSS transitions only (current behavior)
**Normal Mode**: Visceral 3D animations that capture the essence of casino action

Each game has a **signature moment** - the action that defines its identity:
- Craps: Dice thrown across green felt, bouncing and tumbling
- Roulette: Wheel spinning, ball bouncing between pockets
- Blackjack: Cards dealt from shoe, sliding across table
- Baccarat: Card squeeze with dramatic reveal
- Sic Bo: Dice shaking in dome, revealed when lifted

## Tech Stack

```
@react-three/fiber    - React renderer for Three.js
@react-three/drei     - Useful helpers (OrbitControls, useGLTF, etc.)
@react-three/rapier   - Physics engine (Rust-based, fast)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GameView (e.g. CrapsView)               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                   3D Animation Layer                    │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │              R3F Canvas                           │  │ │
│  │  │  - Camera (perspective, looking down at table)    │  │ │
│  │  │  - Lighting (ambient + spot for drama)            │  │ │
│  │  │  - Physics World (rapier)                         │  │ │
│  │  │  - Game-specific 3D objects                       │  │ │
│  │  │    • Dice3D (craps)                              │  │ │
│  │  │    • RouletteWheel3D (roulette)                  │  │ │
│  │  │    • Card3D (blackjack, baccarat, poker)         │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                   2D UI Layer (React DOM)               │ │
│  │  - Bet controls, sidebars, info panels                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. CasinoCanvas3D (Wrapper)

```tsx
interface CasinoCanvas3DProps {
  children: React.ReactNode;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  ambientIntensity?: number;
  showTable?: boolean;
}

// Provides: Canvas, Camera, Lighting, Physics World, Table surface
```

### 2. Dice3D

```tsx
interface Dice3DProps {
  targetValue: number;        // 1-6, the value to land on
  position: [number, number, number];
  onRollComplete: () => void;
  throwForce?: number;        // Impulse magnitude
  throwAngle?: number;        // Throw direction
}

// Features:
// - Procedural dice geometry with beveled edges
// - Pip patterns on each face (classic white pips on green)
// - Physics: rigid body with restitution (bounciness)
// - Sound triggers on collision (thump on felt, click on dice-dice)
// - Lands on correct face via angular velocity calculation
```

### 3. Card3D

```tsx
interface Card3DProps {
  card: { rank: string; suit: string };
  isHidden: boolean;
  position: [number, number, number];
  rotation?: [number, number, number];
  onDealComplete?: () => void;
  animationType: 'deal' | 'flip' | 'squeeze';
}

// Features:
// - Thin box geometry with card textures (front/back)
// - Deal animation: arc from shoe position to hand
// - Flip animation: 180° rotation revealing face
// - Squeeze animation (Baccarat): slow corner reveal
```

### 4. RouletteWheel3D

```tsx
interface RouletteWheel3DProps {
  targetNumber: number;       // 0-36
  isSpinning: boolean;
  onSpinComplete: () => void;
}

// Features:
// - Wheel geometry with 37 colored pockets (0-36)
// - Ball as separate physics body
// - Wheel rotation with deceleration
// - Ball orbit with spiral descent
// - Ball bouncing between pockets before settling
```

### 5. DiceShaker3D (Sic Bo)

```tsx
interface DiceShaker3DProps {
  targetValues: [number, number, number];
  isShaking: boolean;
  onReveal: () => void;
}

// Features:
// - Dome/shaker container
// - 3 dice inside rattling
// - Lift animation revealing dice
```

## Integration Pattern

Each game view conditionally renders the 3D layer in Normal Mode:

```tsx
// CrapsView.tsx
const { isNormal } = useAnimationMode();

return (
  <div className="relative">
    {/* 3D Animation Layer - only in Normal Mode */}
    {isNormal && isRolling && (
      <CasinoCanvas3D>
        {gameState.dice.map((value, i) => (
          <Dice3D
            key={i}
            targetValue={value}
            position={[i * 2 - 1, 3, 0]}
            onRollComplete={() => setDiceSettled(prev => prev + 1)}
          />
        ))}
      </CasinoCanvas3D>
    )}

    {/* 2D UI - always present */}
    <div className="relative z-10">
      {/* ... existing UI ... */}
    </div>
  </div>
);
```

## Animation Timing

3D animations respect `BASE_DURATIONS` from animationMode.ts:

| Animation | Duration | Description |
|-----------|----------|-------------|
| diceThrow | 2500ms | Full dice physics simulation |
| rouletteSpin | 4000ms | Wheel spin + ball settle |
| cardDeal | 800ms | Card arc from shoe to hand |
| cardFlip | 600ms | Card flip revealing face |
| domeLift | 800ms | Sic Bo dome lift reveal |

## Sound Integration

3D animations trigger sfxEnhanced events:
- Dice collision with table → `dice-thump`
- Dice collision with dice → `dice-click`
- Ball bounce in pocket → `ball-bounce`
- Card slide → `card-slide`
- Card flip → `card-flip`

## Performance Considerations

1. **Lazy Loading**: 3D components only mounted when animation starts
2. **Dispose on Complete**: Canvas unmounts after animation
3. **LOD**: Simpler geometry on mobile (fewer bevels, lower poly)
4. **Texture Atlas**: Single texture for all card faces
5. **Instancing**: Multiple dice share geometry

## File Structure

```
src/components/casino/3d/
├── CasinoCanvas3D.tsx       # Wrapper with camera, lights, physics
├── Dice3D.tsx               # Single die with physics
├── Card3D.tsx               # Single card with animations
├── RouletteWheel3D.tsx      # Wheel + ball system
├── DiceShaker3D.tsx         # Sic Bo shaker
├── Table3D.tsx              # Green felt table surface
└── materials/
    ├── feltMaterial.ts      # Green felt shader
    ├── diceMaterial.ts      # Dice face textures
    └── cardMaterial.ts      # Card textures
```

## Implementation Phases

### Phase 1: Foundation
- Install R3F + rapier
- Create CasinoCanvas3D wrapper
- Basic lighting and camera setup

### Phase 2: Dice (Craps)
- Dice3D component with physics
- Correct face calculation
- Sound integration
- Integration with CrapsView

### Phase 3: Roulette
- RouletteWheel3D component
- Ball physics with friction
- Pocket detection
- Integration with RouletteView

### Phase 4: Cards
- Card3D component
- Deal, flip, squeeze animations
- Integration with BlackjackView, BaccaratView

### Phase 5: Polish
- Mobile optimizations
- Particle effects (chips, confetti on wins)
- Camera shake on big wins
