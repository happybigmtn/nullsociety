# 3D Casino Scene Review: Technical & Creative Audit

**Reviewer Role**: Lead Creative Technologist & 3D Motion Specialist
**Focus**: React Three Fiber + Rapier Physics + Casino Game Feel
**Target**: 60 FPS on average devices with high-energy casino reward loops

---

## Executive Summary

The codebase demonstrates **solid architectural foundations** with proper ref-based physics control, blockchain state synchronization, and lazy loading patterns. However, there are significant opportunities to enhance the **casino "juice"** factor and address several performance anti-patterns that could impact frame stability on lower-end devices.

**Overall Score: B+**
- Architecture: A-
- Physics Integration: B+
- Casino Juice: B-
- Performance Optimization: B
- Blockchain Sync: A

---

## Global Observations

### Strengths

1. **Blockchain-First Architecture** (`PhysicsDice.tsx:336-349`)
   - The `targetValue` gate preventing settlement before chain response is **exemplary**
   - Smooth SLERP-based settling ensures visual consistency with on-chain truth
   - `beginSmoothSettle()` pattern is well-designed for latency hiding

2. **Ref-Based Physics Control**
   - All dice/card components expose imperative handles via `forwardRef`/`useImperativeHandle`
   - Avoids React re-render storms during physics simulation
   - `rigidBodyRef.current` direct manipulation is the correct pattern

3. **Mobile-Aware Rendering**
   - Proper `dpr` scaling: `[1, 1.75]` desktop vs `1` mobile
   - Shadow map reduction: 1024 desktop, 512 mobile
   - `powerPreference` toggle for GPU power management

4. **Lazy Loading Strategy** (`index.ts` exports)
   - All 3D components wrapped in `React.lazy()`
   - Prevents initial bundle bloat
   - Good loading skeleton UI patterns

### Global Anti-Patterns Requiring Attention

#### 1. **Texture Generation in Render Scope** (HIGH PRIORITY)

**Location**: `DiceModel.tsx:64-74`, `cardTextures.ts:137-145`

```typescript
// Current: Textures created inside useMemo but per-component
const materials = useMemo(() => {
  return FACE_VALUES.map((value) => {
    const texture = createFaceTexture(value); // Canvas created every mount
    return new THREE.MeshStandardMaterial({ ... });
  });
}, []);
```

**Issue**: Each `DiceModel` instance creates 6 canvas textures. With 3 dice in Sic Bo, that's 18 texture uploads per scene mount.

**Recommendation**: Hoist texture atlas to module scope with disposal handling:

```typescript
// diceTextures.ts (new module)
const DICE_TEXTURE_ATLAS = new Map<number, THREE.CanvasTexture>();

export function getDiceFaceTexture(value: number): THREE.CanvasTexture {
  if (!DICE_TEXTURE_ATLAS.has(value)) {
    DICE_TEXTURE_ATLAS.set(value, createFaceTexture(value));
  }
  return DICE_TEXTURE_ATLAS.get(value)!;
}
```

#### 2. **Object Allocation in useFrame** (MEDIUM PRIORITY)

**Location**: `PhysicsDice.tsx:251`, `RouletteScene3D.tsx:279-282`

```typescript
// Current: Clone creates new object per frame
const nextQuat = settle.fromQuat.clone().slerp(settle.toQuat, eased);
```

**Issue**: `clone()` allocates a new `THREE.Quaternion` every frame (~1920 allocations per 32-second animation).

**Recommendation**: Pre-allocate work vectors in refs:

```typescript
const workQuatRef = useRef(new THREE.Quaternion());

// In useFrame:
workQuatRef.current.copy(settle.fromQuat).slerp(settle.toQuat, eased);
rigidBodyRef.current.setRotation(workQuatRef.current, true);
```

**Note**: This pattern is already correctly applied in some places (e.g., `linVelRef`, `currentQuatRef` in PhysicsDice), but inconsistently used elsewhere.

#### 3. **Missing InstancedMesh for Repeated Geometry**

**Location**: `RouletteScene3D.tsx:317-327` (37 pocket meshes)

```typescript
// Current: 37 individual mesh components for pockets
{pocketData.map((pocket) => (
  <mesh key={pocket.num} position={pocket.position} ... >
    <boxGeometry args={[...]} />
    <meshStandardMaterial color={pocket.color} />
  </mesh>
))}
```

**Issue**: 37 draw calls for identical geometry with only color variation.

**Recommendation**: Use `InstancedMesh` with per-instance color attribute:

```typescript
function RoulettePockets({ pocketData }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(POCKET_DEPTH, POCKET_HEIGHT, POCKET_DEPTH * 1.6), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const color = new THREE.Color();
    pocketData.forEach((pocket, i) => {
      meshRef.current!.setMatrixAt(i, new THREE.Matrix4().compose(pocket.position, ...));
      meshRef.current!.setColorAt(i, color.set(pocket.color));
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.instanceColor!.needsUpdate = true;
  }, [pocketData]);

  return <instancedMesh ref={meshRef} args={[geometry, undefined, 37]} />;
}
```

**Impact**: Reduces draw calls from 37 to 1 for pockets.

#### 4. **Camera Jitter from Interpolation Timing**

**Location**: `CrapsScene3D.tsx:222-237`

```typescript
// Camera lerp with frame-rate dependent speed
const lerpSpeed = 3.2 * delta;
camera.position.lerp(targetPos.current, lerpSpeed);
```

**Issue**: `lerp` with delta produces slightly different results at different frame rates (59 FPS vs 61 FPS), causing micro-jitter on variable refresh rate displays.

**Recommendation**: Use frame-independent damping:

```typescript
const dampingFactor = 1 - Math.pow(0.05, delta); // Approaches 0.05 remaining per second
camera.position.lerp(targetPos.current, dampingFactor);
```

---

## Scene-by-Scene Breakdown

---

### 1. PhysicsDice.tsx

**Purpose**: Core physics-enabled die with outcome targeting

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Physics Stability | A- | CCD enabled, proper damping values |
| Memory Management | B | Some clones in hot path |
| React Lifecycle | A | Proper ref-based control |
| Collider Efficiency | A | Simple cuboid, optimal |

**Specific Issues**:

1. **Redundant Quaternion Calculations** (line 287-309)
   - `inverseQuat`, `correctionQuat` created fresh each correction cycle
   - Already using refs (`inverseQuatRef`, `correctionQuatRef`) but redundantly copying

2. **setTimeout in Imperative Handle** (line 181-192)
   ```typescript
   setTimeout(() => {
     rigidBodyRef.current?.applyImpulse(...);
   }, staggerDelay * 1000);
   ```
   **Risk**: If component unmounts mid-timeout, stale ref access. Add cleanup:
   ```typescript
   const staggerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   // Clear in reset() and useEffect cleanup
   ```

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Weight & Mass Feel | B+ | Good damping, could be heavier |
| Tumble Satisfaction | B | Random angular velocity feels procedural |
| Settle Drama | B- | SLERP is smooth but lacks anticipation |

**Juice Improvements**:

1. **Add "Wobble Anticipation"**: Before settling, add a micro-shake that builds tension:
   ```typescript
   // In beginSmoothSettle, add wobble phase
   const wobblePhase = t < 0.15;
   if (wobblePhase) {
     const wobbleT = t / 0.15;
     const wobbleAmount = Math.sin(wobbleT * Math.PI * 4) * 0.02 * (1 - wobbleT);
     // Apply to rotation
   }
   ```

2. **Impact Particles on Bounce**: Detect wall/table collisions and emit particles:
   ```typescript
   // Add collision event listener to RigidBody
   onCollisionEnter={(event) => {
     const impactVelocity = event.other.rigidBody?.linvel();
     if (Math.abs(impactVelocity?.y ?? 0) > 3) {
       emitImpactParticles(event.target.translation());
     }
   }}
   ```

3. **Face Glow on Settlement**: Add emissive flash when dice lands on winning number:
   ```typescript
   // In DiceModel, add dynamic emissive based on isSettled prop
   emissive={isSettled && isWinningFace ? new THREE.Color(0x00ff41) : undefined}
   emissiveIntensity={settleGlowIntensity} // Animate 0 -> 1 -> 0.3
   ```

---

### 2. CrapsScene3D.tsx

**Purpose**: Full 3D craps table with 2-dice physics and camera animation

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Physics Config | A | Good gravity (-25), proper timestep |
| Camera Animation | B+ | Smooth orbit, but lerp-based jitter risk |
| Scene Structure | A- | Good separation of concerns |
| Collision Groups | A | Proper dice-only interaction masking |

**Specific Issues**:

1. **Duplicate Physics Worlds Risk** (line 438-444)
   - Physics component creates a new Rapier world on each mount
   - If wrapper causes remount, new world = dice positions lost
   - **Mitigation**: Scene is kept mounted via Suspense (verified in wrapper)

2. **Magic Numbers Scattered** (lines 13-53)
   - `TABLE_CONFIG`, `DICE_SIZE`, `CAMERA_ROLL_RADIUS` etc. are local constants
   - Makes cross-scene consistency difficult

   **Recommendation**: Create `sceneConstants.ts` shared module:
   ```typescript
   export const PHYSICS_DEFAULTS = {
     gravity: -25,
     timeStep: { desktop: 1/60, mobile: 1/45 },
     ccdSubsteps: 4,
   };
   ```

3. **AnimatedCamera Missing Cleanup** (line 185)
   - `settleStartMs.current` persists across animation cycles
   - Could cause stale timing if animation interrupted

   **Fix**: Reset on `isSettled` change:
   ```typescript
   useEffect(() => {
     settleStartMs.current = null;
   }, [isSettled]);
   ```

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Camera Drama | B+ | Orbit feels good, settle is smooth |
| Table Presence | C | Invisible table, no felt texture |
| Lighting Mood | B | Green accent is on-brand, could be more dramatic |
| Win Celebration | D | No visual feedback on results |

**Juice Improvements**:

1. **Add Felt Material with Normal Map**:
   ```typescript
   // Load felt normal map for realistic surface
   const feltNormal = useLoader(THREE.TextureLoader, '/textures/felt-normal.png');
   <meshStandardMaterial
     color="#1a1a2e"
     normalMap={feltNormal}
     roughness={0.95}
   />
   ```

2. **Camera Shake on Impact**:
   ```typescript
   // Add micro-shake when dice hit table
   const shakeRef = useRef({ x: 0, y: 0 });

   // In useFrame:
   if (impactDetected) {
     shakeRef.current.x = (Math.random() - 0.5) * 0.05 * impactIntensity;
     shakeRef.current.y = (Math.random() - 0.5) * 0.03 * impactIntensity;
   }
   camera.position.x += shakeRef.current.x;
   camera.position.y += shakeRef.current.y;
   // Decay shake
   shakeRef.current.x *= 0.85;
   shakeRef.current.y *= 0.85;
   ```

3. **Dice Magnet Effect Enhancement** (lines 379-413):
   - Currently uses linear lerp for magnetization
   - Add "snap" feel with spring physics:
   ```typescript
   // Replace lerp with spring-based attraction
   const springForce = 0.2;
   const dampingForce = 0.7;
   magnetVelocity.current.add(
     magnetizedDice1.current.clone().sub(dice1Pos.current).multiplyScalar(springForce)
   );
   magnetVelocity.current.multiplyScalar(dampingForce);
   dice1Pos.current.add(magnetVelocity.current);
   ```

---

### 3. SicBoScene3D.tsx

**Purpose**: 3-dice variant for Sic Bo with staggered throws

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Physics Parity | A- | Matches Craps config with minor tweaks |
| Code Duplication | C | ~70% copy-paste from CrapsScene3D |
| Array Handling | B+ | Good use of indexed refs |

**Specific Issues**:

1. **Closure Capture in handleRest** (line 210-216)
   ```typescript
   onRest={() => handleRest(0)}
   onRest={() => handleRest(1)}
   onRest={() => handleRest(2)}
   ```
   - Creates new functions on every render
   - Minor perf impact, but violates referential equality

   **Fix**: Use stable callback pattern:
   ```typescript
   const handleRest0 = useCallback(() => handleRest(0), [handleRest]);
   const handleRest1 = useCallback(() => handleRest(1), [handleRest]);
   const handleRest2 = useCallback(() => handleRest(2), [handleRest]);
   ```

2. **No Camera Animation** (unlike Craps)
   - Static camera at `[0, 4.4, 5.6]`
   - Feels less dynamic compared to Craps

   **Recommendation**: Add subtle zoom on settle:
   ```typescript
   useFrame(() => {
     if (allSettled) {
       const targetFov = 40;
       camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.05);
       camera.updateProjectionMatrix();
     }
   });
   ```

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Visual Consistency | B | Matches Craps, but static camera is jarring |
| Triple Dice Drama | C | No special treatment for triples |
| Settle Arrangement | C | Dice settle randomly, no organized layout |

**Juice Improvements**:

1. **Triangle Magnet Pattern for 3 Dice**:
   ```typescript
   // Settle dice in equilateral triangle formation
   const trianglePositions = [
     { x: 0, z: DICE_SIZE * 0.7 },
     { x: -DICE_SIZE * 0.6, z: -DICE_SIZE * 0.35 },
     { x: DICE_SIZE * 0.6, z: -DICE_SIZE * 0.35 },
   ];
   ```

2. **Triple Detection Celebration**:
   ```typescript
   const isTriple = targetValues?.[0] === targetValues?.[1] &&
                   targetValues?.[1] === targetValues?.[2];

   if (isTriple && allSettled) {
     // Flash all dice with golden glow
     // Add particle explosion
     // Camera zoom punch
   }
   ```

---

### 4. RouletteScene3D.tsx

**Purpose**: Spinning wheel with ball physics settle to chain-determined pocket

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Animation System | A- | Good phase state machine |
| Ball Physics | B | Simulated, not Rapier-based |
| Texture Management | B- | Per-number canvas textures, 37 allocations |
| Draw Call Count | C | 37+ meshes for pockets |

**Specific Issues**:

1. **Ball is Not Physics-Driven** (lines 273-298)
   - Ball position calculated via `Math.sin/cos` lerp
   - Doesn't use Rapier for ball dynamics
   - Acceptable for controlled outcome, but feels "on rails"

2. **Texture Disposal Missing** (line 161-165)
   ```typescript
   useEffect(() => {
     return () => {
       numberTextures.forEach((texture) => texture.dispose());
     };
   }, [numberTextures]);
   ```
   - Good disposal, BUT textures recreated on `isMobile` change
   - If user rotates device, 37 textures regenerated

   **Fix**: Stabilize texture memo:
   ```typescript
   const numberTextures = useMemo(() => {
     const size = 128; // Use larger size for both, rely on mipmaps
     return ROULETTE_NUMBERS.map((num) => createNumberTexture(num, size));
   }, []); // Remove isMobile dependency
   ```

3. **Pocket Data Recreated on Render** (line 135-154)
   - `useMemo` correctly caches, but `pocketData` includes `THREE.Vector3` instances
   - On re-render, these are new object references (though values same)
   - No actual issue, but could use module-level cache

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Spin Drama | B | Good acceleration curve |
| Ball Settle | B- | Drops into pocket, but no bounce |
| Camera Follow | B+ | Zoom to ball on settle is nice |
| Winning Number Highlight | D | No glow/pulse on winning pocket |

**Juice Improvements**:

1. **Ball Bounce in Pocket**:
   ```typescript
   // Add 2-3 micro-bounces when ball enters pocket
   if (state.phase === 'settle' && progress > 0.8) {
     const bouncePhase = (progress - 0.8) / 0.2;
     const bounceCount = 3;
     const bounceHeight = Math.sin(bouncePhase * Math.PI * bounceCount) * 0.015 * (1 - bouncePhase);
     ballHeight += bounceHeight;
   }
   ```

2. **Pocket Glow on Win**:
   ```typescript
   // Add emissive to winning pocket
   <mesh ...>
     <meshStandardMaterial
       color={pocket.color}
       emissive={isWinningPocket ? '#00ff88' : '#000'}
       emissiveIntensity={isWinningPocket ? winGlowPulse : 0}
     />
   </mesh>
   ```

3. **Wheel Reflection/Shine**:
   ```typescript
   // Add environment map for metallic wheel surface
   const envMap = useEnvironment({ files: '/textures/studio.hdr' });
   <meshStandardMaterial
     color={WHEEL_RING_COLOR}
     envMap={envMap}
     metalness={0.6}
     roughness={0.3}
   />
   ```

4. **Ball Trail Effect**:
   ```typescript
   // Add trail geometry that follows ball during spin
   function BallTrail({ spinStateRef }) {
     const trailRef = useRef<THREE.Points>(null);
     const positions = useMemo(() => new Float32Array(30 * 3), []);

     useFrame(() => {
       // Shift positions and add new ball position at head
       // Fade alpha from 1.0 at head to 0 at tail
     });

     return <points ref={trailRef}>...</points>;
   }
   ```

---

### 5. BaccaratScene3D.tsx

**Purpose**: Card dealing from shoe with flip reveal synchronized to chain state

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Animation Sequencing | A | Well-structured deal order system |
| Chain Sync | A | Good handling of partial/delayed card data |
| Card Rig Pattern | A- | Ref-based control with state tracking |
| Performance | B+ | Fixed 6-card slots, minimal allocations |

**Specific Issues**:

1. **Mutable Rig Initialization** (line 141-170)
   ```typescript
   if (rigsRef.current.length === 0) {
     rigsRef.current = DEAL_ORDER.map(...);
   }
   ```
   - One-time init is correct, but pattern is fragile
   - If `DEAL_ORDER` ever changed between renders (it won't, but still)

   **Alternative**: Use lazy ref initialization:
   ```typescript
   const rigsRef = useRef<CardRig[] | null>(null);
   if (!rigsRef.current) {
     rigsRef.current = DEAL_ORDER.map(...);
   }
   ```

2. **Sound Effect Timing** (line 344-347)
   ```typescript
   if (!rig.sfxPlayed && dealProgress > 0.1) {
     rig.sfxPlayed = true;
     void playSfx('deal');
   }
   ```
   - Good guard against repeat plays
   - 10% progress feels early; typical card "snap" is on landing

   **Recommendation**: Play on arc peak (~50% progress):
   ```typescript
   if (!rig.sfxPlayed && dealProgress > 0.5) {
     rig.sfxPlayed = true;
     void playSfx('deal');
   }
   ```

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Deal Arc | B+ | Good parabolic motion |
| Flip Animation | B | Smooth, but lacks "pop" |
| Shoe Visual | B- | Static box, no card stack visible |
| Dealer Hand Feel | C | No dealer/hand visual |

**Juice Improvements**:

1. **Card Stagger Reveal Sound**:
   ```typescript
   // Different pitch for each card in reveal
   void playSfx('deal', { playbackRate: 1 + rig.sequenceIndex * 0.05 });
   ```

2. **Card Flip "Pop" Effect**:
   ```typescript
   // Add slight scale punch on flip completion
   const flipPop = rig.flipProgress > 0.9
     ? 1 + (1 - (rig.flipProgress - 0.9) / 0.1) * 0.05
     : 1;
   rig.ref.current.scale.setScalar(flipPop);
   ```

3. **Shoe Card Stack Decrease**:
   ```typescript
   // Show cards in shoe decreasing as dealt
   function CardShoe({ cardsDealt }) {
     const stackHeight = Math.max(0.1, 0.4 - cardsDealt * 0.02);
     return (
       <mesh position={[SHOE_POSITION.x, stackHeight / 2, SHOE_POSITION.z]}>
         <boxGeometry args={[0.7, stackHeight, 0.95]} />
         <meshStandardMaterial color="#fffef0" />
       </mesh>
     );
   }
   ```

4. **Winning Hand Highlight**:
   ```typescript
   // After reveal, add glow to winning hand's cards
   if (isPlayerWinner) {
     playerCards.forEach(card => {
       card.material.emissive = new THREE.Color(0x00ff88);
       card.material.emissiveIntensity = 0.3;
     });
   }
   ```

---

### 6. CardTableScene3D.tsx

**Purpose**: Generic/reusable card table for any card game

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Reusability | A | Props-driven slot configuration |
| Animation Modes | A | Deal/Reveal/Static modes cleanly separated |
| Chain Integration | A | `cardsById` pattern is clean |

**Specific Issues**:

1. **cardsByIdRef Pattern Redundancy** (line 93-99)
   ```typescript
   const cardsByIdRef = useRef(cardsById);
   useEffect(() => {
     cardsByIdRef.current = cardsById;
   }, [cardsById]);
   ```
   - This is to access current `cardsById` in useFrame without causing re-subscribe
   - Correct pattern, but adds cognitive load

   **Alternative**: Use Zustand or Jotai atoms for game state (out of scope for this review)

2. **Deal Order Stability** (line 90)
   ```typescript
   const orderMap = useMemo(() => new Map(dealOrder.map(...)), [dealOrder]);
   ```
   - If parent passes new `dealOrder` array (same values, new reference), map rebuilds
   - Could cause subtle animation glitches

   **Fix**: Serialize to string for comparison:
   ```typescript
   const orderKey = dealOrder.join(',');
   const orderMap = useMemo(() => new Map(dealOrder.map(...)), [orderKey]);
   ```

#### Creative Audit

Same recommendations as BaccaratScene3D apply here since it's the generic version.

---

### 7. Card3D.tsx

**Purpose**: Individual 3D card with front/back faces

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Geometry | A | Simple dual-plane approach, optimal |
| Texture Handling | A- | Uses cached textures from `cardTextures.ts` |
| Memory | B+ | Hidden cards reuse back texture (good) |

**Specific Issues**:

1. **Double-Sided Rendering Gap** (line 22-29)
   ```typescript
   <mesh position={[0, 0, thickness / 2]}>  // Front
   <mesh position={[0, 0, -thickness / 2]}> // Back
   ```
   - Two separate meshes = 2 draw calls per card
   - With 6 cards in Baccarat = 12 draw calls just for cards

   **Alternative**: Use `THREE.DoubleSide` on single geometry:
   ```typescript
   // Single mesh with front/back materials via groups
   const geometry = useMemo(() => {
     const geo = new THREE.PlaneGeometry(width, height);
     geo.addGroup(0, 6, 0); // Front material
     geo.addGroup(0, 6, 1); // Back material (with flipped normals)
     return geo;
   }, [width, height]);

   return (
     <mesh geometry={geometry}>
       <meshStandardMaterial attach="material-0" map={frontTexture} />
       <meshStandardMaterial attach="material-1" map={backTexture} side={THREE.BackSide} />
     </mesh>
   );
   ```

   **Caveat**: This changes the flip animation logic; may not be worth the complexity.

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Card Design | B+ | Good terminal aesthetic |
| Shadow Quality | B | Cast/receive set, but soft shadows would help |
| Edge Treatment | C | No rounded corners, looks flat |

**Juice Improvements**:

1. **Rounded Card Corners**:
   ```typescript
   // Use RoundedBoxGeometry or custom rounded plane
   import { RoundedBoxGeometry } from 'three-stdlib';

   const geometry = useMemo(() =>
     new RoundedBoxGeometry(width, height, thickness, 4, 0.05), []);
   ```

2. **Card Thickness Shadow**:
   ```typescript
   // Add thin edge geometry for realistic card edge
   <mesh position={[0, 0, 0]}>
     <boxGeometry args={[width - 0.01, height - 0.01, thickness]} />
     <meshStandardMaterial color="#1a1a1a" />
   </mesh>
   ```

---

### 8. DiceModel.tsx

**Purpose**: Visual dice geometry with canvas-textured pip faces

#### Technical Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Geometry | A | Simple BoxGeometry, correct |
| Material Creation | C | Creates 6 materials per instance |
| Texture Caching | D | No caching, creates textures every mount |

**Specific Issues**:

1. **Critical: Material Leak** (line 65-74)
   ```typescript
   const materials = useMemo(() => {
     return FACE_VALUES.map((value) => {
       const texture = createFaceTexture(value);
       return new THREE.MeshStandardMaterial({ map: texture, ... });
     });
   }, []);
   ```
   - No disposal of materials/textures on unmount
   - Each mount leaks 6 textures + 6 materials

   **Fix**:
   ```typescript
   useEffect(() => {
     return () => {
       materials.forEach(mat => {
         mat.map?.dispose();
         mat.dispose();
       });
     };
   }, [materials]);
   ```

2. **Memoization Trap** (line 76-81)
   ```typescript
   const geometry = useMemo(() => {
     const geo = new THREE.BoxGeometry(size, size, size);
     return geo;
   }, [size]);
   ```
   - `size` is typically constant (0.6 for Craps, 0.55 for Sic Bo)
   - But if ever changed, creates new geometry without disposing old

   **Fix**: Add cleanup effect.

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Pip Design | B+ | Terminal green looks good |
| Dice Material | B | Slightly too matte |
| Edge Rounding | D | Comment mentions "rounded corners" but not implemented |

**Juice Improvements**:

1. **Implement Rounded Corners**:
   ```typescript
   import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

   const geometry = useMemo(() => {
     return new RoundedBoxGeometry(size, size, size, 4, size * 0.08);
   }, [size]);
   ```

2. **Subsurface Scattering Effect** (for high-end devices):
   ```typescript
   // Use MeshPhysicalMaterial for translucent dice edge
   new THREE.MeshPhysicalMaterial({
     map: texture,
     roughness: 0.25,
     metalness: 0.05,
     transmission: 0.1, // Slight translucency
     thickness: 0.5,
   });
   ```

3. **Specular Highlight on Pips**:
   - Add slight bump/normal mapping to pip texture for 3D feel

---

### 9. PowerMeter.tsx & Slingshot.tsx

**Purpose**: Desktop keyboard + Mobile touch throw interactions

#### Technical Audit (PowerMeter)

| Aspect | Score | Notes |
|--------|-------|-------|
| Spring Animation | A | Good use of react-spring |
| Keyboard Handling | A | Proper event cleanup |
| State Management | B+ | Clean charging logic |

**Issue**: Interval-based charging (line 56):
```typescript
chargeIntervalRef.current = setInterval(() => {
  const elapsed = Date.now() - startTimeRef.current;
  const newPower = Math.min(1, elapsed / 1500);
  setPower(newPower);
}, 16);
```
- `setInterval(16)` doesn't guarantee 16ms execution
- On slow devices, could cause jittery power meter
- `setPower` triggers re-render each tick

**Recommendation**: Use `requestAnimationFrame`:
```typescript
const rafRef = useRef<number>();

const startCharge = useCallback(() => {
  const animate = () => {
    const elapsed = Date.now() - startTimeRef.current;
    const newPower = Math.min(1, elapsed / 1500);
    setPower(newPower);
    if (newPower < 1) {
      rafRef.current = requestAnimationFrame(animate);
    }
  };
  rafRef.current = requestAnimationFrame(animate);
}, []);

// Cleanup
useEffect(() => () => rafRef.current && cancelAnimationFrame(rafRef.current), []);
```

#### Technical Audit (Slingshot)

| Aspect | Score | Notes |
|--------|-------|-------|
| Touch Handling | A | Good global event handling |
| Haptic Feedback | A | Nice vibration patterns |
| Trajectory Preview | A- | Good visual feedback |
| Spring Physics | B+ | Simple but effective |

**Issue**: Transform interpolation (line 256-259):
```typescript
transform: diceSpring.x.to(
  (x) => `translate(${diceSpring.x.get()}px, ${diceSpring.y.get()}px) scale(${diceSpring.scale.get()})`
)
```
- Redundant: `to()` already provides interpolated value, then uses `.get()` again
- Minor perf impact

**Fix**:
```typescript
style={{
  transform: to(
    [diceSpring.x, diceSpring.y, diceSpring.scale],
    (x, y, s) => `translate(${x}px, ${y}px) scale(${s})`
  )
}}
```

#### Creative Audit

| Aspect | Score | Notes |
|--------|-------|-------|
| Power Meter Feel | B+ | Good color transitions |
| Slingshot UX | A- | Intuitive Angry Birds mechanic |
| Trajectory Arc | B+ | Nice dotted preview |

**Juice Improvements**:

1. **Power Meter Pulse at Max**:
   ```typescript
   // When at 100%, add pulsing animation
   const isPulsing = power >= 0.99;
   // Add CSS animation class for glow pulse
   ```

2. **Slingshot Rubber Band Sound**:
   ```typescript
   // Play stretch sound with pitch based on pull distance
   if (pullDistance > 0) {
     void playSfx('stretch', { playbackRate: 0.8 + power * 0.4 });
   }
   ```

3. **Release "Snap" Animation**:
   ```typescript
   // On release, animate dice forward then snap back
   const releaseSpring = useSpring({
     from: { x: throwDirX * 20, y: throwDirY * 20 },
     to: { x: 0, y: 0 },
     config: { tension: 800, friction: 20 },
   });
   ```

---

## Blockchain-State Synchronization Review

### Current Implementation Assessment: A

The codebase demonstrates **excellent** blockchain state synchronization:

1. **PhysicsDice.tsx (lines 336-349)**:
   - Dice refuse to settle until `targetValue` is defined
   - Physics runs but settlement is gated on chain response
   - This is **exactly correct** for blockchain-authoritative outcomes

2. **CrapsScene3D.tsx (lines 112-119)**:
   - `targetValues` prop updated from parent when chain responds
   - Uses ref key comparison to detect actual changes
   - Prevents spurious re-throws on unrelated re-renders

3. **RouletteScene3D.tsx (lines 242-253)**:
   - `targetLocked` flag prevents re-targeting mid-spin
   - Settle phase only begins when target is confirmed
   - Good use of `targetRef.current` for current-value access

4. **BaccaratScene3D.tsx (lines 208-246)**:
   - `targetKey` prop triggers card face updates
   - Deal animation runs with hidden cards, reveal waits for chain
   - Good pattern for latency hiding

### Recommendations for Enhanced Chain Sync

1. **Add Visual "Waiting for Chain" Indicator**:
   ```typescript
   // When animation settles but no targetValue yet
   {isPhysicsSettled && !targetValue && (
     <Html center>
       <div className="animate-pulse text-terminal-green">
         CONFIRMING ON CHAIN...
       </div>
     </Html>
   )}
   ```

2. **Timeout Fallback with Retry**:
   ```typescript
   // If chain response takes > 10 seconds, show error state
   useEffect(() => {
     if (!isAnimating || targetValue) return;
     const timeout = setTimeout(() => {
       setChainTimeout(true);
     }, 10000);
     return () => clearTimeout(timeout);
   }, [isAnimating, targetValue]);
   ```

3. **Optimistic Updates with Rollback**:
   - Currently the system waits for chain confirmation before revealing
   - For faster perceived response, could show "pending" state while awaiting
   - This is a product decision, current implementation is conservative and correct

---

## Performance Budget Recommendations

### Target: 60 FPS on "Average" Devices

**Average Device Profile**:
- iPhone 11 / Samsung Galaxy S10
- 2-3 year old mid-range Android
- M1 MacBook Air (baseline)
- 1080p display

### Budget Allocation

| Metric | Budget | Current Estimate |
|--------|--------|------------------|
| Draw Calls | < 50 | ~80-100 (Roulette worst case) |
| Triangle Count | < 50k | ~15k (good) |
| Texture Memory | < 64MB | ~20MB (good) |
| Physics Bodies | < 20 | 3-5 (excellent) |
| useFrame callbacks | < 10 | ~5-8 (acceptable) |

### Priority Fixes for Performance

1. **HIGH: InstancedMesh for Roulette Pockets**
   - Impact: -36 draw calls
   - Effort: Medium

2. **HIGH: Module-Level Texture Caching**
   - Impact: Eliminates texture regeneration on remount
   - Effort: Low

3. **MEDIUM: Work Vector Pre-allocation in useFrame**
   - Impact: Reduces GC pressure, smoother frame times
   - Effort: Low

4. **MEDIUM: Reduce Shadow Map Resolution on Mobile**
   - Already doing 512 vs 1024, consider 256 for mobile
   - Impact: GPU memory reduction
   - Effort: Trivial

5. **LOW: Geometry Sharing Across Dice**
   - All dice use same `BoxGeometry(size)` - could share single instance
   - Impact: Minor memory reduction
   - Effort: Low

---

## Conclusion & Prioritized Action Items

### Immediate (Before Next Release)

1. [ ] **Fix texture/material disposal in DiceModel**
2. [ ] **Add module-level texture caching for dice faces**
3. [ ] **Replace object allocation in hot paths with refs**

### Short-Term (Next Sprint)

4. [ ] Implement InstancedMesh for roulette pockets
5. [ ] Add winning number/hand highlight effects
6. [ ] Improve dice settle animation with anticipation wobble

### Medium-Term (Polish Phase)

7. [ ] Add particle systems for dice impacts
8. [ ] Implement camera shake on collisions
9. [ ] Add ball bounce animation in roulette pocket
10. [ ] Implement rounded corners on dice and cards

### Long-Term (Casino Juice Phase)

11. [ ] Create reusable win celebration particle system
12. [ ] Add environment maps for metallic surfaces
13. [ ] Implement screen-space reflections for table
14. [ ] Add confetti/coin shower for big wins

---

*Generated by Lead Creative Technologist Review - December 2024*

---

## 2025 Review Addendum (Revised Findings & Plan)

### Corrections to Prior Notes

- `cardTextures.ts` already caches per-card canvas textures; no per-mount regen found.
- Roulette useFrame allocation note is stale; current hotspots are draw-call count and texture reuse.
- Additional hot-path allocations found in dice settle and top-face detection.

### Revised Action Plan (Implementable Now)

1. [ ] Cache dice face textures + reuse dice geometry; dispose per-instance materials.
2. [ ] Remove per-frame allocations in `PhysicsDice` (smooth settle + top-face calc); guard invalid targets.
3. [ ] Clean up dice throw timeouts to avoid stale callbacks (dice component + scenes).
4. [ ] Frame-independent camera damping in Craps; add Sic Bo camera rig + magnetized settle layout.
5. [ ] Instanced roulette pockets + cached number textures.
6. [ ] Roulette settle bounce + winning pocket glow; ignore invalid targets to avoid off-chain settle.
7. [ ] rAF-based PowerMeter charging + Slingshot transform interpolation cleanup.
8. [ ] Align card deal SFX timing with landing beats (Baccarat + CardTable).

---

## Second Review (December 2025) - Implementation Status

**Review Date**: 2025-12-21
**Status**: Major improvements implemented

### Overall Score Update: A-

| Category | Previous | Current | Delta |
|----------|----------|---------|-------|
| Architecture | A- | A | ↑ |
| Physics Integration | B+ | A- | ↑ |
| Casino Juice | B- | B+ | ↑ |
| Performance Optimization | B | A- | ↑ |
| Blockchain Sync | A | A | = |

---

### Verified Implementations

#### 1. ✅ Dice Texture & Geometry Caching (`diceAssets.ts` - NEW FILE)

**Status**: COMPLETE

New module-level caching implemented:

```typescript
// diceAssets.ts:11-12
const textureCache = new Map<string, THREE.Texture>();
const geometryCache = new Map<number, THREE.BoxGeometry>();
```

Key functions:
- `getDiceFaceTexture(value, size)` - Caches by `${value}-${size}` key
- `getDiceGeometry(size)` - Caches by size

**Impact**: Eliminates 18 texture creations per Sic Bo mount → 0 after first load

---

#### 2. ✅ Per-Frame Allocation Removal (`PhysicsDice.tsx`)

**Status**: COMPLETE

Pre-allocated refs added for hot-path operations:

```typescript
// PhysicsDice.tsx:68-73
const wobbleQuatRef = useRef(new THREE.Quaternion());
const wobbleAxisRef = useRef(new THREE.Vector3(1, 0.5, 0.3).normalize());
const localUpRef = useRef(new THREE.Vector3());
const topFaceInverseQuatRef = useRef(new THREE.Quaternion());
```

Target validation guard added:

```typescript
// PhysicsDice.tsx:56-59
const safeTargetValue = useMemo(() => {
  if (typeof targetValue !== 'number' || targetValue < 1 || targetValue > 6) return null;
  return targetValue;
}, [targetValue]);
```

New `getCurrentTopFaceFromQuaternion()` in `diceUtils.ts` accepts refs to avoid allocations.

**Impact**: ~1920 fewer allocations per 32-second animation

---

#### 3. ✅ Throw Timeout Cleanup (`PhysicsDice.tsx`, `SicBoScene3D.tsx`, `CrapsScene3D.tsx`)

**Status**: COMPLETE

Stagger timeout properly tracked and cleaned:

```typescript
// SicBoScene3D.tsx:235
const throwTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// SicBoScene3D.tsx:289-291
if (throwTimeoutRef.current) {
  clearTimeout(throwTimeoutRef.current);
}

// SicBoScene3D.tsx:307-313
useEffect(() => {
  return () => {
    if (throwTimeoutRef.current) {
      clearTimeout(throwTimeoutRef.current);
    }
  };
}, []);
```

**Impact**: Prevents stale callback execution on rapid remounts

---

#### 4. ✅ Frame-Independent Camera Damping + Sic Bo Camera Rig

**Status**: COMPLETE

**CrapsScene3D** now uses exponential damping:
```typescript
// CrapsScene3D.tsx:192
const lerpSpeed = 1 - Math.exp(-3.2 * delta);
```

**SicBoScene3D** now has full camera rig matching Craps:
```typescript
// SicBoScene3D.tsx:165-211
function SicBoCameraRig({ isSettled, diceCenter }) {
  // Orbit during roll, settle to top-down view
  // Frame-independent damping
  // FOV animation on settle
}
```

Triangle magnetized settle layout:
```typescript
// SicBoScene3D.tsx:53-57
const TRIANGLE_OFFSETS: Array<[number, number, number]> = [
  [0, 0, DICE_SIZE * 0.7],
  [-DICE_SIZE * 0.65, 0, -DICE_SIZE * 0.38],
  [DICE_SIZE * 0.65, 0, -DICE_SIZE * 0.38],
];
```

Stable rest handlers:
```typescript
// SicBoScene3D.tsx:323-330
const restHandlers = useMemo(
  () => [() => handleRest(0), () => handleRest(1), () => handleRest(2)],
  [handleRest]
);
```

**Impact**: Consistent animation across frame rates, visual parity between dice games

---

#### 5. ✅ Instanced Roulette Pockets + Cached Number Textures

**Status**: COMPLETE

**InstancedMesh implementation**:
```typescript
// RouletteScene3D.tsx:132-183
function RoulettePockets({ pocketData, isMobile }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(...), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    roughness: 0.5, metalness: 0.1, vertexColors: true
  }), []);
  // ... setMatrixAt + setColorAt for each pocket
  return <instancedMesh ref={meshRef} args={[geometry, material, pocketData.length]} />;
}
```

**Number texture caching**:
```typescript
// RouletteScene3D.tsx:122-130
const numberTextureCache = new Map<number, THREE.Texture[]>();

const getNumberTextures = (size: number) => {
  const cached = numberTextureCache.get(size);
  if (cached) return cached;
  const textures = ROULETTE_NUMBERS.map((num) => createNumberTexture(num, size));
  numberTextureCache.set(size, textures);
  return textures;
};
```

**Impact**: 37 draw calls → 1 for pockets, texture reuse across sessions

---

#### 6. ✅ Roulette Settle Bounce + Winning Pocket Glow

**Status**: COMPLETE

**Ball bounce animation**:
```typescript
// RouletteScene3D.tsx:373-377
if (progress > 0.8) {
  const bounceT = (progress - 0.8) / 0.2;
  const bounce = Math.sin(bounceT * Math.PI * 3) * (1 - bounceT) * 0.02;
  ballHeight += bounce;
}
```

**Winning pocket glow**:
```typescript
// RouletteScene3D.tsx:449-460
<mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
  <ringGeometry args={[POCKET_DEPTH * 0.55, POCKET_DEPTH * 0.9, 24]} />
  <meshStandardMaterial
    ref={glowMaterialRef}
    color="#00ff88"
    emissive="#00ff88"
    emissiveIntensity={0}
    transparent
    opacity={0}
    depthWrite={false}
  />
</mesh>

// Dynamic glow in useFrame:
glowMaterialRef.current.opacity = pulse;
glowMaterialRef.current.emissiveIntensity = state.phase === 'settle' ? 1.2 : 0.6;
```

**Target validation**:
```typescript
// RouletteScene3D.tsx:33-34
const resolveTargetNumber = (value?: number | null) =>
  typeof value === 'number' && ROULETTE_NUMBERS.includes(value) ? value : null;
```

**Impact**: Added casino "juice" with bounce and glow, prevents invalid target settlement

---

#### 7. ✅ rAF-Based PowerMeter + Slingshot Transform Fix

**Status**: COMPLETE

**PowerMeter** now uses requestAnimationFrame:
```typescript
// PowerMeter.tsx:31
const chargeRafRef = useRef<number | null>(null);

// PowerMeter.tsx:57-67
const tick = () => {
  if (!isChargingRef.current) return;
  const elapsed = performance.now() - startTimeRef.current;
  const newPower = Math.min(1, elapsed / 1500);
  setPower(newPower);
  if (newPower < 1) {
    chargeRafRef.current = requestAnimationFrame(tick);
  }
};
chargeRafRef.current = requestAnimationFrame(tick);

// Cleanup: PowerMeter.tsx:114-122
useEffect(() => {
  return () => {
    if (chargeRafRef.current) {
      cancelAnimationFrame(chargeRafRef.current);
      chargeRafRef.current = null;
    }
    isChargingRef.current = false;
  };
}, []);
```

**Slingshot** transform interpolation fixed:
```typescript
// Slingshot.tsx:256-259
transform: to(
  [diceSpring.x, diceSpring.y, diceSpring.scale],
  (x, y, scale) => `translate(${x}px, ${y}px) scale(${scale})`
)
```

**Impact**: Smoother power meter animation, proper spring interpolation

---

#### 8. ✅ Card Deal SFX Timing Aligned

**Status**: COMPLETE

Both **BaccaratScene3D** and **CardTableScene3D** now trigger SFX at 50% progress:
```typescript
// BaccaratScene3D.tsx:344-347
if (!rig.sfxPlayed && dealProgress > 0.5) {
  rig.sfxPlayed = true;
  void playSfx('deal');
}

// CardTableScene3D.tsx:262-265
if (!rig.sfxPlayed && dealProgress > 0.5) {
  rig.sfxPlayed = true;
  void playSfx('deal');
}
```

**Impact**: Sound aligns with visual "landing" beat of card arc

---

### Additional Improvements Found

#### A. DiceModel Material Disposal (`DiceModel.tsx`)

Materials now properly disposed on unmount:
```typescript
// DiceModel.tsx:46-52
useEffect(() => {
  return () => {
    materials.forEach((mat) => {
      mat.dispose();
    });
  };
}, [materials]);
```

#### B. Dice Wobble Anticipation (`PhysicsDice.tsx`)

Added wobble animation during smooth settle phase:
```typescript
// PhysicsDice.tsx:278-284
if (t < 0.18) {
  const wobbleT = t / 0.18;
  const wobbleIntensity = Math.sin(wobbleT * Math.PI) * 0.015;
  wobbleQuatRef.current.setFromAxisAngle(
    wobbleAxisRef.current,
    Math.sin(wobbleT * Math.PI * 5) * wobbleIntensity
  );
  nextQuat.multiply(wobbleQuatRef.current);
}
```

**Impact**: Adds tension/anticipation before dice land on final face

#### C. CardTableScene Order Stability (`CardTableScene3D.tsx`)

Fixed orderMap memoization:
```typescript
// CardTableScene3D.tsx:90-91
const orderKey = dealOrder.join('|');
const orderMap = useMemo(() => new Map(dealOrder.map((id, idx) => [id, idx])), [orderKey]);
```

**Impact**: Prevents animation glitches from array reference changes

---

### Remaining Opportunities (Not Blockers)

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Rounded dice/card corners | LOW | MEDIUM | Cosmetic enhancement |
| Particle system for impacts | LOW | HIGH | Would add visual flair |
| Win celebration animations | LOW | MEDIUM | Confetti/coin showers |
| Environment maps for surfaces | LOW | LOW | Metallic reflections |
| Triple detection in Sic Bo | LOW | LOW | Special glow for triples |

---

### Performance Budget - Updated Estimates

| Metric | Budget | Previous | Current |
|--------|--------|----------|---------|
| Draw Calls | < 50 | ~80-100 | ~45-50 |
| Triangle Count | < 50k | ~15k | ~15k |
| Texture Memory | < 64MB | ~20MB | ~12MB (cached) |
| Physics Bodies | < 20 | 3-5 | 3-5 |
| useFrame callbacks | < 10 | ~5-8 | ~5-8 |

**Summary**: Draw calls reduced significantly via InstancedMesh. Texture memory improved via caching. All critical performance items resolved.

---

### Conclusion

All 8 items from the revised action plan have been **fully implemented**. The codebase now demonstrates:

1. **Proper memory management** - Textures/geometry cached at module level, materials disposed
2. **Smooth animations** - Frame-independent damping, rAF-based UI updates
3. **Casino juice** - Ball bounce, pocket glow, dice wobble anticipation
4. **Visual consistency** - Sic Bo now matches Craps camera behavior
5. **Chain integrity** - Target validation prevents invalid settlements

**Recommended Next Steps**:
1. Run performance profiling on target mobile devices
2. Consider adding triple detection celebration for Sic Bo
3. Evaluate particle system ROI for high-end devices
