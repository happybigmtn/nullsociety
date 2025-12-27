# feat: Mobile-Native Gaming Platform (Android-First)

## Overview

Transform Nullspace from a web-first to a mobile-native gaming experience, targeting Android first with iOS follow-up. The goal is 100% mobile-native UX with smooth 60fps animations, tactile haptic feedback, and keyboard-only desktop accessibility—all while maintaining the fully on-chain architecture using the Commonware consensus stack.

**Release Milestone:** Mobile-Native Casino Experience v1.0

## Problem Statement / Motivation

The current Nullspace casino platform is web-based with basic mobile-responsive design. While functional, it lacks the premium "native app" feel expected by mobile gamers:

- Touch interactions feel sluggish compared to native casino apps
- No haptic feedback for key game events (bets, wins, losses)
- No offline resilience or app-like persistence
- Desktop users must use mouse—no keyboard-only navigation
- 3D rendering (React Three Fiber) may not perform well on mobile browsers
- No push notifications, no home screen shortcuts, no native integration

A mobile-native approach addresses these issues while maintaining the core on-chain gaming mechanics.

## Proposed Solution

Build a React Native + Expo application that:

1. **Shares core logic** with the web app (game state machines, types, API protocols)
2. **Native touch + haptics** via React Native Gesture Handler + expo-haptics
3. **60fps animations** via React Native Reanimated 3 + React Native Skia
4. **Native crypto signing** using platform keystore (Android Keystore) instead of WASM
5. **Keyboard accessibility** for desktop/web using React Native Web
6. **Offline resilience** with local state caching and reconnection logic

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile App                               │
├─────────────────────────────────────────────────────────────────┤
│  React Native + Expo SDK 54+                                    │
│  ├── Navigation: React Navigation 7                             │
│  ├── Animations: Reanimated 3 + Skia                            │
│  ├── State: Zustand (same as web)                               │
│  ├── Gestures: React Native Gesture Handler                     │
│  └── Haptics: expo-haptics                                      │
├─────────────────────────────────────────────────────────────────┤
│  Shared Core (extracted from website/)                          │
│  ├── Game state machines                                        │
│  ├── API client (WebSocket + HTTP)                              │
│  ├── Types (from types/ crate or generated)                     │
│  └── Utilities (bet validation, chip math)                      │
├─────────────────────────────────────────────────────────────────┤
│  Platform Layer                                                  │
│  ├── Crypto: expo-crypto + native Ed25519                       │
│  ├── Storage: expo-secure-store (keys) + MMKV (state)           │
│  ├── Auth: Biometric via expo-local-authentication              │
│  └── Network: Native WebSocket with reconnection                │
└─────────────────────────────────────────────────────────────────┘
          │
          │ WebSocket (wss://api.nullspace.../ws)
          │ HTTP (https://api.nullspace.../submit)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Existing Backend (unchanged)                                    │
│  ├── nullspace-simulator (HTTP/WS API)                          │
│  ├── nullspace-node (Commonware consensus)                      │
│  ├── nullspace-executor (game logic, RNG)                       │
│  └── Auth service (Auth.js + Convex)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: Foundation (Week 1-2)
- Tasks and deliverables
- Success criteria
- Estimated effort

#### Phase 2: Core Implementation (Week 3-6)
- Tasks and deliverables
- Success criteria
- Estimated effort

#### Phase 3: Polish & Optimization (Week 7-8)
- Tasks and deliverables
- Success criteria
- Estimated effort

## Alternative Approaches Considered

### 1. Capacitor/Ionic Wrapper (Rejected)
**Pros:** Fastest path, wraps existing React web app
**Cons:** Not truly native, no 60fps guarantee, limited haptics, WebView performance ceiling

**Verdict:** Rejected—doesn't meet "native feel" requirement

### 2. Flutter + Dart (Rejected)
**Pros:** Excellent animation performance, single codebase, Flame game engine
**Cons:** Different language (Dart), can't share code with existing React web, team learning curve

**Verdict:** Rejected—code sharing value outweighs Flutter's animation edge

### 3. Native Kotlin/Swift (Rejected)
**Pros:** Maximum performance and platform integration
**Cons:** 2x codebase, 2x maintenance, can't share logic with web

**Verdict:** Rejected—maintenance burden too high for 10 games

### 4. React Native + Expo (Selected)
**Pros:** Share components/hooks with web, excellent animation libs (Reanimated 3, Skia), large ecosystem, Expo simplifies native module access
**Cons:** Some performance overhead vs pure native, must port WASM signing

**Verdict:** Selected—best balance of code sharing, performance, and development velocity

## Acceptance Criteria

### Functional Requirements

- [ ] All 10 casino games playable on Android (API 26+)
- [ ] All 10 games playable on desktop with keyboard-only navigation
- [ ] Biometric authentication (fingerprint/face) for session start
- [ ] Ed25519 transaction signing without WASM
- [ ] Haptic feedback for: chip placement, bet confirmation, card deal, win, loss, jackpot
- [ ] 60fps animations for: card flips, dice rolls, wheel spins, chip movements
- [ ] Offline mode: graceful degradation, cached balance display, reconnection retry
- [ ] Deep link support for sharing game sessions
- [ ] Background/foreground state persistence

### Non-Functional Requirements

- [ ] App size: < 50MB initial download (Android APK)
- [ ] Cold start: < 3 seconds to interactive lobby
- [ ] Animation frame rate: 60fps on SD 660+ devices, 30fps minimum on SD 450+
- [ ] WebSocket latency: < 100ms p95 on stable connection
- [ ] Memory usage: < 200MB in-game, < 80MB backgrounded
- [ ] Battery: < 5% drain per 30 minutes active gameplay
- [ ] Crash rate: < 0.5% of sessions

### Quality Gates

- [ ] Unit test coverage > 80% for shared game logic
- [ ] E2E test coverage for all 10 games (Detox)
- [ ] Accessibility audit pass (TalkBack navigation)
- [ ] Performance profiling on 3+ device tiers
- [ ] Security audit for key storage and transaction signing
- [ ] Code review approval from 2 engineers

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| App Store Rating | > 4.0 stars | Google Play Console |
| D7 Retention | > 30% | Analytics |
| Session Length | > 8 minutes avg | Analytics |
| Crash-Free Rate | > 99.5% | Sentry |
| ANR Rate | < 0.5% | Play Console |
| Frame Drop Rate | < 2% of frames | Profiling |
| Transaction Success | > 99% | Backend metrics |

## Dependencies & Prerequisites

### Technical Dependencies
- Existing WebSocket API (nullspace-simulator) - **Ready**
- Auth service with biometric challenge support - **Needs extension for mobile clients**
- Ed25519 signing library compatible with React Native - **Needs selection (noble-ed25519 vs native)**
- MMKV or similar for high-performance local storage - **Available via expo**

### Team Dependencies
- Design mockups for all game screens (Figma) - **Not started**
- Sound design/audio assets - **Not started**
- Legal review for app store compliance - **Not started**

### Infrastructure Dependencies
- CI/CD for mobile builds (EAS Build) - **Not configured**
- TestFlight/Internal testing track setup - **Not configured**
- Sentry/crash reporting project - **Not configured**

## Risk Analysis & Mitigation

### Risk 1: Ed25519 Signing Performance (High Impact, Medium Probability)
**Risk:** JavaScript-based Ed25519 signing may be too slow for real-time betting
**Mitigation:** Use `@noble/ed25519` (pure JS, fast) or write thin native module wrapping libsodium
**Contingency:** Pre-sign batch of transactions, use signing queue

### Risk 2: Animation Performance on Low-End Devices (Medium Impact, High Probability)
**Risk:** 60fps target unrealistic on 2GB RAM / SD 450 class devices
**Mitigation:** Implement adaptive quality (detect device tier, reduce particle effects, use sprite sheets instead of Skia)
**Contingency:** Set minimum device requirements, exclude low-end segment

### Risk 3: App Store Rejection (High Impact, Medium Probability)
**Risk:** Google Play may reject gambling app without proper licensing
**Mitigation:** Ensure "simulation" mode with no real money for review, implement responsible gaming features (age gate, session limits), geo-fence restricted jurisdictions
**Contingency:** Distribute as APK direct download, use alternative stores (Amazon, Samsung)

### Risk 4: WebSocket Reliability on Cellular (Medium Impact, High Probability)
**Risk:** Mobile networks have high latency variability, frequent disconnects
**Mitigation:** Aggressive reconnection with exponential backoff, local state caching, optimistic UI updates with reconciliation
**Contingency:** Implement "offline mode" where user can browse but not bet

### Risk 5: Code Sharing Complexity (Low Impact, Medium Probability)
**Risk:** Divergence between web and mobile codebases over time
**Mitigation:** Extract shared code into `packages/shared` monorepo structure, enforce via lint rules
**Contingency:** Accept some duplication, prioritize mobile

## Resource Requirements

### Team
- 2 React Native engineers (full-time, 8 weeks)
- 1 Backend engineer (part-time, for auth/API extensions)
- 1 Designer (for mobile-specific mockups)
- 1 QA engineer (for device testing matrix)

### Infrastructure
- EAS Build subscription (~$29/month for production builds)
- TestFlight / Play Console fees (Apple Developer $99/year, already have Play Console)
- Additional Sentry quota for mobile errors
- Device lab (or BrowserStack/Sauce Labs for cloud testing)

### Timeline
- Week 1-2: Foundation (project setup, auth, signing, core navigation)
- Week 3-4: First 3 games (Hi-Lo, Casino War, Blackjack)
- Week 5-6: Remaining 7 games
- Week 7: Polish, performance optimization, accessibility
- Week 8: QA, beta testing, store preparation

## Future Considerations

### iOS Build (Phase 2)
- Same codebase, additional iOS-specific testing
- App Store review process (stricter than Play Store)
- App Tracking Transparency considerations

### Tablet Optimization (Phase 3)
- Landscape-first layouts for games like Craps
- Multi-pane navigation for larger screens

### Apple Watch / Wear OS (Future)
- Balance checking widget
- Win/loss notifications
- Quick bet on simple games

### Widget Support (Future)
- Balance widget for home screen
- Recent game results widget

## Documentation Plan

### Required Updates
- `docs/plan.md` - Add mobile milestone and dependencies
- `README.md` - Add mobile development section
- New: `mobile/README.md` - Mobile-specific setup and development guide
- New: `mobile/ARCHITECTURE.md` - Mobile technical decisions

### API Documentation
- Document mobile-specific auth flow (biometric challenge)
- Document transaction signing format (native vs WASM)

## References & Research

### Internal References
- Game logic implementation: `execution/src/casino/*.rs`
- Keyboard controls pattern: `website/src/hooks/useKeyboardControls.ts`
- WebSocket client: `website/src/api/client.js`
- Touch components: `website/src/components/casino/MobileChipSelector.tsx`

### External References
- React Native Reanimated 3: https://docs.swmansion.com/react-native-reanimated/
- React Native Skia: https://shopify.github.io/react-native-skia/
- Expo Haptics: https://docs.expo.dev/versions/v54.0.0/sdk/haptics
- React Native Gesture Handler: https://docs.swmansion.com/react-native-gesture-handler/
- EAS Build: https://docs.expo.dev/build/introduction/

### Related Work
- Previous PRs: N/A (new initiative)
- Related issues: N/A

---

# Detailed Implementation Plan

## Phase 1: Foundation (Week 1-2)

### 1.1 Project Scaffolding

**Files to create:**

```
mobile/
├── app.json                      # Expo configuration
├── eas.json                      # EAS Build configuration
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── babel.config.js               # Babel for Reanimated
├── metro.config.js               # Metro bundler config
├── src/
│   ├── App.tsx                   # Root component
│   ├── navigation/
│   │   ├── RootNavigator.tsx     # Navigation structure
│   │   └── types.ts              # Navigation type definitions
│   ├── screens/
│   │   ├── SplashScreen.tsx      # Loading/auth check
│   │   ├── AuthScreen.tsx        # Biometric prompt
│   │   ├── LobbyScreen.tsx       # Game selection
│   │   └── GameScreen.tsx        # Game container
│   ├── services/
│   │   ├── websocket.ts          # WebSocket connection manager
│   │   ├── auth.ts               # Biometric + key management
│   │   ├── crypto.ts             # Ed25519 signing
│   │   ├── storage.ts            # Secure storage wrapper
│   │   └── haptics.ts            # Centralized haptics service
│   ├── hooks/
│   │   ├── useWebSocket.ts       # WebSocket hook
│   │   ├── useAuth.ts            # Auth state hook
│   │   ├── useGameState.ts       # Shared game state
│   │   └── useHaptics.ts         # Haptics convenience hook
│   ├── components/
│   │   ├── ui/                   # Buttons, inputs, etc.
│   │   ├── game/                 # Shared game components
│   │   └── casino/               # Casino-specific (chips, cards)
│   └── types/
│       └── index.ts              # Shared types
├── assets/
│   ├── images/                   # Sprites, icons
│   └── sounds/                   # Audio files (optional)
└── android/                      # Native Android customizations
```

**Implementation:**

```typescript
// mobile/src/services/crypto.ts
import { ed25519 } from '@noble/curves/ed25519';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_KEY = 'nullspace_private_key';

// Utility functions for hex conversion (React Native doesn't have Buffer)
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function getOrCreateKeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  let privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_KEY);

  if (!privateKeyHex) {
    const privateKey = ed25519.utils.randomPrivateKey();
    privateKeyHex = bytesToHex(privateKey);
    await SecureStore.setItemAsync(PRIVATE_KEY_KEY, privateKeyHex, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  const privateKey = hexToBytes(privateKeyHex);
  const publicKey = ed25519.getPublicKey(privateKey);

  return { publicKey, privateKey };
}

export async function signTransaction(
  message: Uint8Array,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  return ed25519.sign(message, privateKey);
}

// Export for use in auth.ts
export { bytesToHex, hexToBytes };
```

```typescript
// mobile/src/services/haptics.ts
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

class HapticsService {
  private enabled = true;
  private abortController: AbortController | null = null;

  // Centralized guard to reduce duplication
  private canVibrate(): boolean {
    return this.enabled && Platform.OS !== 'web';
  }

  // Safe delayed haptic with abort support
  private scheduleHaptic(
    fn: () => Promise<void>,
    delayMs: number,
    signal: AbortSignal
  ): void {
    const timeoutId = setTimeout(() => {
      if (!signal.aborted) {
        fn().catch(() => {
          // Haptic failure is non-critical, silently ignore
        });
      }
    }, delayMs);

    signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  }

  async chipPlace(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async betConfirm(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async cardDeal(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async win(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async loss(): Promise<void> {
    if (!this.canVibrate()) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async jackpot(): Promise<void> {
    if (!this.canVibrate()) return;

    // Cancel any in-flight pattern
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    // Celebratory pattern with proper cleanup
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    this.scheduleHaptic(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      100,
      signal
    );
    this.scheduleHaptic(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      200,
      signal
    );
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // Call when component unmounts to cancel pending haptics
  cleanup(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

export const haptics = new HapticsService();
```

```typescript
// mobile/src/services/websocket.ts
import { useCallback, useEffect, useRef, useState } from 'react';

// Define message types for type safety
interface GameMessage {
  type: string;
  [key: string]: unknown;
}

interface WebSocketManager<T = GameMessage> {
  isConnected: boolean;
  send: (message: object) => boolean; // Returns false if send failed
  lastMessage: T | null;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
}

const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_RECONNECT_DELAY_MS = 30000;
const BASE_RECONNECT_DELAY_MS = 1000;

export function useWebSocket<T = GameMessage>(url: string): WebSocketManager<T> {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected' | 'failed'
  >('disconnected');
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutId.current) {
      clearTimeout(reconnectTimeoutId.current);
      reconnectTimeoutId.current = null;
    }

    setConnectionState('connecting');
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setIsConnected(true);
      setConnectionState('connected');
      reconnectAttempts.current = 0;
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        setLastMessage(data);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.current.onclose = () => {
      setIsConnected(false);

      // Check if we've exceeded max attempts
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        setConnectionState('failed');
        console.error('WebSocket reconnection failed after max attempts');
        return;
      }

      setConnectionState('disconnected');

      // Exponential backoff reconnection
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current),
        MAX_RECONNECT_DELAY_MS
      );

      reconnectTimeoutId.current = setTimeout(() => {
        reconnectAttempts.current++;
        connect();
      }, delay);
    };
  }, [url]);

  const send = useCallback((message: object): boolean => {
    if (ws.current?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, message not sent:', message);
      return false;
    }
    ws.current.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutId.current) {
        clearTimeout(reconnectTimeoutId.current);
      }
      ws.current?.close();
    };
  }, [connect]);

  return { isConnected, send, lastMessage, connectionState };
}
```

### 1.2 Authentication Flow

**Files to create:**
- `mobile/src/screens/AuthScreen.tsx`
- `mobile/src/services/auth.ts`

```typescript
// mobile/src/services/auth.ts
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { getOrCreateKeyPair, bytesToHex } from './crypto';

export interface AuthResult {
  success: boolean;
  error?: string;
}

export async function authenticateWithBiometrics(): Promise<AuthResult> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();

  if (!hasHardware) {
    // Device doesn't support biometrics - still require device PIN
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Enter your device PIN to access Nullspace',
      disableDeviceFallback: false, // Fixed typo: was 'disableDeviceVallback'
    });
    return { success: result.success, error: result.error };
  }

  if (!isEnrolled) {
    // Biometrics available but not set up - require device credential
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Set up biometrics or enter PIN to access Nullspace',
      disableDeviceFallback: false,
    });
    return { success: result.success, error: result.error };
  }

  // Biometrics available and enrolled
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Authenticate to access Nullspace',
    fallbackLabel: 'Use PIN',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false, // Fixed typo: was 'disableDeviceVallback'
  });

  return { success: result.success, error: result.error };
}

export async function initializeAuth(): Promise<{
  publicKey: string;
  isNewUser: boolean;
}> {
  const { publicKey } = await getOrCreateKeyPair();
  const publicKeyHex = bytesToHex(publicKey); // Use bytesToHex instead of Buffer

  // Check if this is a returning user
  const existingKey = await SecureStore.getItemAsync('user_initialized');
  const isNewUser = !existingKey;

  if (isNewUser) {
    await SecureStore.setItemAsync('user_initialized', 'true');
  }

  return { publicKey: publicKeyHex, isNewUser };
}
```

### 1.3 Core Navigation Structure

```typescript
// mobile/src/navigation/RootNavigator.tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SplashScreen } from '../screens/SplashScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { GameScreen } from '../screens/GameScreen';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: 'fade',
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Lobby" component={LobbyScreen} />
        <Stack.Screen
          name="Game"
          component={GameScreen}
          options={{ gestureEnabled: false }} // Prevent swipe-back during game
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

## Phase 2: Core Implementation (Week 3-6)

### 2.1 Shared Game Components

**Chip Selector with Gestures:**

```typescript
// mobile/src/components/casino/ChipSelector.tsx
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { haptics } from '../../services/haptics';

const CHIP_VALUES = [1, 5, 25, 100, 500, 1000];

interface ChipProps {
  value: number;
  selected: boolean;
  onSelect: (value: number) => void;
  onDrop: (value: number, position: { x: number; y: number }) => void;
}

export function Chip({ value, selected, onSelect, onDrop }: ChipProps) {
  const offset = useSharedValue({ x: 0, y: 0 });
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const startPosition = useSharedValue({ x: 0, y: 0 });

  const triggerHaptic = () => haptics.chipPlace();
  const triggerDropHaptic = () => haptics.betConfirm();

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      isDragging.value = true;
      scale.value = withSpring(1.2);
      startPosition.value = { x: offset.value.x, y: offset.value.y };
      runOnJS(triggerHaptic)();
    })
    .onUpdate((e) => {
      'worklet';
      offset.value = {
        x: startPosition.value.x + e.translationX,
        y: startPosition.value.y + e.translationY,
      };
    })
    .onEnd((e) => {
      'worklet';
      isDragging.value = false;
      scale.value = withSpring(1);

      // Check if dropped in betting area (above starting position)
      if (offset.value.y < -100) {
        runOnJS(onDrop)(value, {
          x: e.absoluteX,
          y: e.absoluteY,
        });
        runOnJS(triggerDropHaptic)();
      }

      // Spring back to origin
      offset.value = {
        x: withSpring(0),
        y: withSpring(0),
      };
    });

  const tap = Gesture.Tap().onEnd(() => {
    'worklet';
    runOnJS(onSelect)(value);
    runOnJS(triggerHaptic)();
  });

  const composedGesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value.x },
      { translateY: offset.value.y },
      { scale: scale.value },
    ],
    zIndex: isDragging.value ? 100 : 0,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.chip,
          selected && styles.chipSelected,
          animatedStyle,
        ]}
      >
        <Animated.Text style={styles.chipText}>${value}</Animated.Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4a4a4a',
    borderWidth: 3,
    borderColor: '#FFD700', // Gold color
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  chipSelected: {
    borderColor: '#00ff00',
    transform: [{ scale: 1.1 }],
  },
  chipText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
```

### 2.2 Card Animation Component

```typescript
// mobile/src/components/casino/Card.tsx
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, RoundedRect, Image, useImage } from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS, // Added missing import
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { haptics } from '../../services/haptics';

interface CardProps {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  faceUp: boolean;
  onFlipComplete?: () => void;
}

// Card face component showing suit and rank
function CardFace({ suit, rank }: { suit: CardProps['suit']; rank: string }) {
  const suitSymbols = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const suitColors = { hearts: '#ef4444', diamonds: '#ef4444', clubs: '#1f2937', spades: '#1f2937' };

  return (
    <View style={[styles.cardFace, { backgroundColor: '#fff' }]}>
      <Text style={[styles.rank, { color: suitColors[suit] }]}>{rank}</Text>
      <Text style={[styles.suit, { color: suitColors[suit] }]}>{suitSymbols[suit]}</Text>
    </View>
  );
}

// Card back pattern
function CardBack() {
  return (
    <View style={[styles.cardFace, styles.cardBack]}>
      <View style={styles.backPattern} />
    </View>
  );
}

export function Card({ suit, rank, faceUp, onFlipComplete }: CardProps) {
  const flip = useSharedValue(faceUp ? 180 : 0);

  useEffect(() => {
    flip.value = withTiming(
      faceUp ? 180 : 0,
      {
        duration: 300,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      },
      (finished) => {
        'worklet';
        if (finished && faceUp) {
          runOnJS(haptics.cardDeal)();
          if (onFlipComplete) runOnJS(onFlipComplete)();
        }
      }
    );
  }, [faceUp]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${flip.value}deg` },
    ],
    backfaceVisibility: 'hidden',
    opacity: flip.value > 90 ? 1 : 0,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${flip.value - 180}deg` },
    ],
    backfaceVisibility: 'hidden',
    position: 'absolute',
    opacity: flip.value < 90 ? 1 : 0,
  }));

  return (
    <View style={styles.cardContainer}>
      <Animated.View style={[styles.card, frontStyle]}>
        <CardFace suit={suit} rank={rank} />
      </Animated.View>
      <Animated.View style={[styles.card, backStyle]}>
        <CardBack />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: 80,
    height: 120,
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardFace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  cardBack: {
    backgroundColor: '#1e40af',
  },
  backPattern: {
    width: '80%',
    height: '80%',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 4,
  },
  rank: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  suit: {
    fontSize: 32,
  },
});
```

### 2.3 Game Screen Template

```typescript
// mobile/src/screens/games/HiLoScreen.tsx
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useState, useCallback, useEffect } from 'react'; // Added useEffect
import { Canvas } from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle
} from 'react-native-reanimated';

import { ChipSelector } from '../../components/casino/ChipSelector';
import { Card } from '../../components/casino/Card';
import { useWebSocket, GameMessage } from '../../services/websocket';
import { haptics } from '../../services/haptics';

// WebSocket URL from environment config
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.casino/ws';

// Game state hook for Hi-Lo
interface HiLoGameState {
  balance: number;
  currentCard: { suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string } | null;
  gameState: 'betting' | 'waiting' | 'revealed';
}

interface HiLoMessage extends GameMessage {
  type: 'game_result' | 'state_update';
  won?: boolean;
  balance?: number;
  card?: HiLoGameState['currentCard'];
}

function useGameState(lastMessage: HiLoMessage | null): HiLoGameState {
  const [state, setState] = useState<HiLoGameState>({
    balance: 0,
    currentCard: null,
    gameState: 'betting',
  });

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'state_update') {
      setState((prev) => ({
        ...prev,
        balance: lastMessage.balance ?? prev.balance,
        currentCard: lastMessage.card ?? prev.currentCard,
      }));
    }
  }, [lastMessage]);

  return state;
}

export function HiLoScreen() {
  const [bet, setBet] = useState(0);
  const [selectedChip, setSelectedChip] = useState(25);
  const { isConnected, send, lastMessage } = useWebSocket<HiLoMessage>(WS_URL);
  const { balance, currentCard, gameState } = useGameState(lastMessage);

  const handleBet = useCallback(async (choice: 'higher' | 'lower') => {
    if (bet === 0) return;

    await haptics.betConfirm();

    send({
      type: 'hilo_bet',
      amount: bet,
      choice,
    });
  }, [bet, send]);

  const handleWin = useCallback(() => {
    haptics.win();
  }, []);

  const handleLoss = useCallback(() => {
    haptics.loss();
  }, []);

  // Listen for game results
  useEffect(() => {
    if (lastMessage?.type === 'game_result') {
      if (lastMessage.won) {
        handleWin();
      } else {
        handleLoss();
      }
    }
  }, [lastMessage, handleWin, handleLoss]);

  return (
    <View style={styles.container}>
      {/* Balance display */}
      <View style={styles.header}>
        <Text style={styles.balance}>${balance.toLocaleString()}</Text>
        <Text style={styles.bet}>Bet: ${bet}</Text>
      </View>

      {/* Game area */}
      <View style={styles.gameArea}>
        {currentCard && (
          <Card
            suit={currentCard.suit}
            rank={currentCard.rank}
            faceUp={gameState === 'revealed'}
          />
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.higherButton]}
          onPress={() => handleBet('higher')}
          disabled={gameState !== 'betting'}
        >
          <Text style={styles.buttonText}>HIGHER</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.lowerButton]}
          onPress={() => handleBet('lower')}
          disabled={gameState !== 'betting'}
        >
          <Text style={styles.buttonText}>LOWER</Text>
        </Pressable>
      </View>

      {/* Chip selector */}
      <ChipSelector
        selectedValue={selectedChip}
        onSelect={setSelectedChip}
        onChipPlace={(value) => setBet(prev => prev + value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  balance: {
    color: '#00ff00',
    fontSize: 24,
    fontFamily: 'JetBrainsMono',
  },
  bet: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'JetBrainsMono',
  },
  gameArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  higherButton: {
    backgroundColor: '#22c55e',
  },
  lowerButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono',
  },
});
```

### 2.4 Keyboard Controls for Desktop

```typescript
// mobile/src/hooks/useKeyboardControls.ts
import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

type KeyAction =
  | 'bet'
  | 'clearBets'
  | 'hit'
  | 'stand'
  | 'double'
  | 'split'
  | 'higher'
  | 'lower'
  | 'spin'
  | 'deal'
  | 'chip1'
  | 'chip5'
  | 'chip25'
  | 'chip100'
  | 'chip500';

interface KeyboardControlsConfig {
  onAction: (action: KeyAction) => void;
  enabled: boolean;
}

export function useKeyboardControls({ onAction, enabled }: KeyboardControlsConfig) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const key = event.key.toLowerCase();

    // Chip selection (number keys)
    if (key === '1') return onAction('chip1');
    if (key === '2') return onAction('chip5');
    if (key === '3') return onAction('chip25');
    if (key === '4') return onAction('chip100');
    if (key === '5') return onAction('chip500');

    // Game actions
    if (key === 'enter' || key === ' ') return onAction('bet');
    if (key === 'escape') return onAction('clearBets');
    if (key === 'h') return onAction('hit');
    if (key === 's') return onAction('stand');
    if (key === 'd') return onAction('double');
    if (key === 'p') return onAction('split');
    if (key === 'arrowup') return onAction('higher');
    if (key === 'arrowdown') return onAction('lower');
  }, [enabled, onAction]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

### 2.5 Jony Ive-Inspired Game Components

Following the design principles in `plans/design-principles.md`, each game component follows these rules:
1. **Single primary action** visible at all times
2. **Progressive disclosure** for secondary options
3. **Persistent help button** for tutorials
4. **Full keyboard navigation**
5. **Haptic feedback** on all interactions

#### Tutorial System

```typescript
// mobile/src/components/ui/TutorialOverlay.tsx
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';

interface TutorialStep {
  title: string;
  description: string;
  highlight?: string; // Element to highlight
}

interface TutorialOverlayProps {
  gameId: string;
  steps: TutorialStep[];
  onComplete: () => void;
}

export function TutorialOverlay({ gameId, steps, onComplete }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(true);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    await AsyncStorage.setItem(`tutorial_${gameId}_completed`, 'true');
    setVisible(false);
    onComplete();
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(`tutorial_${gameId}_completed`, 'true');
    setVisible(false);
    onComplete();
  };

  if (!visible) return null;

  const step = steps[currentStep];

  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View
          entering={SlideInDown.duration(300)}
          exiting={FadeOut.duration(200)}
          style={styles.card}
        >
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>

          <View style={styles.progress}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentStep && styles.dotActive,
                  i < currentStep && styles.dotComplete,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip tutorial</Text>
            </Pressable>
            <Pressable onPress={handleNext} style={styles.nextButton}>
              <Text style={styles.nextText}>
                {currentStep === steps.length - 1 ? 'GOT IT' : 'NEXT'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    color: '#888',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#00ff00',
    width: 24,
  },
  dotComplete: {
    backgroundColor: '#00ff00',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipButton: {
    padding: 12,
  },
  skipText: {
    color: '#666',
    fontSize: 14,
  },
  nextButton: {
    backgroundColor: '#00ff00',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  nextText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
```

#### Help Button Component

```typescript
// mobile/src/components/ui/HelpButton.tsx
import { Pressable, Text, StyleSheet } from 'react-native';
import { haptics } from '../../services/haptics';

interface HelpButtonProps {
  onPress: () => void;
}

export function HelpButton({ onPress }: HelpButtonProps) {
  const handlePress = async () => {
    await haptics.chipPlace();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Help"
      accessibilityHint="Opens game tutorial"
    >
      <Text style={styles.text}>?</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#888',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
```

#### Primary Action Button

```typescript
// mobile/src/components/ui/PrimaryButton.tsx
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { haptics } from '../../services/haptics';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PrimaryButton({
  label,
  onPress,
  disabled,
  variant = 'primary',
  style,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);

  const triggerHaptic = () => haptics.betConfirm();

  const handlePressIn = () => {
    scale.value = withSpring(0.96);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    if (disabled) return;
    runOnJS(triggerHaptic)();
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyles = {
    primary: { bg: '#00ff00', text: '#000' },
    secondary: { bg: '#1a1a1a', text: '#fff' },
    danger: { bg: '#ff4444', text: '#fff' },
  };

  const colors = variantStyles[variant];

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.button,
        { backgroundColor: colors.bg },
        disabled && styles.disabled,
        animatedStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  disabled: {
    opacity: 0.4,
  },
});
```

#### Hi-Lo (Ive-Redesigned)

```typescript
// mobile/src/screens/games/HiLoScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Card } from '../../components/casino/Card';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { HelpButton } from '../../components/ui/HelpButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { useWebSocket, GameMessage } from '../../services/websocket';
import { haptics } from '../../services/haptics';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.casino/ws';

const HILO_TUTORIAL = [
  {
    title: 'Welcome to Hi-Lo',
    description: 'Guess whether the next card will be higher or lower than the current card.',
  },
  {
    title: 'Card Values',
    description: 'Aces are LOW (1), Kings are HIGH (13). Same rank pushes.',
  },
  {
    title: 'Cash Out Anytime',
    description: 'Lock in your winnings whenever you want. The multiplier grows with each correct guess.',
  },
];

type GameStage = 'betting' | 'playing' | 'result';

interface HiLoState {
  pot: number;
  currentCard: { suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string } | null;
  stage: GameStage;
  message: string;
}

export function HiLoScreen() {
  const [bet] = useState(25);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { send, lastMessage, connectionState } = useWebSocket<GameMessage>(WS_URL);

  const [state, setState] = useState<HiLoState>({
    pot: 0,
    currentCard: null,
    stage: 'betting',
    message: '',
  });

  // Check if tutorial should show on first launch
  useEffect(() => {
    AsyncStorage.getItem('tutorial_hilo_completed').then((completed) => {
      if (!completed) setShowTutorial(true);
    });
  }, []);

  // Calculate multipliers
  const getMultiplier = useCallback((direction: 'higher' | 'lower' | 'same'): string => {
    if (!state.currentCard) return '—';
    const rankMap: Record<string, number> = {
      A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
    };
    const rank = rankMap[state.currentCard.rank] || 7;

    let winningRanks: number;
    if (direction === 'same') {
      winningRanks = 1;
    } else if (direction === 'higher') {
      if (rank === 13) return '—';
      winningRanks = 13 - rank;
    } else {
      if (rank === 1) return '—';
      winningRanks = rank - 1;
    }

    const multiplier = (13 / winningRanks).toFixed(2);
    return `${multiplier}x`;
  }, [state.currentCard]);

  // Determine which buttons to show
  const isAtAce = state.currentCard?.rank === 'A';
  const isAtKing = state.currentCard?.rank === 'K';

  const handleDeal = useCallback(() => {
    haptics.betConfirm();
    send({ type: 'hilo_deal', amount: bet });
  }, [bet, send]);

  const handleGuess = useCallback((guess: 'higher' | 'lower' | 'same') => {
    haptics.chipPlace();
    send({ type: 'hilo_guess', guess });
  }, [send]);

  const handleCashout = useCallback(() => {
    haptics.win();
    send({ type: 'hilo_cashout' });
  }, [send]);

  // Keyboard controls
  useKeyboardControls({
    enabled: state.stage !== 'betting',
    onAction: (action) => {
      if (action === 'higher' && !isAtKing) handleGuess('higher');
      if (action === 'lower' && !isAtAce) handleGuess('lower');
      if (action === 'bet') {
        if (state.stage === 'betting') handleDeal();
        else if (isAtAce || isAtKing) handleGuess('same');
      }
    },
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowHelp(true)} />
        <Text style={styles.connectionStatus}>
          {connectionState === 'connected' ? '●' : '○'}
        </Text>
      </View>

      {/* Game Area */}
      <View style={styles.gameArea}>
        {/* Pot Display */}
        <Animated.View entering={FadeIn} style={styles.potContainer}>
          <Text style={styles.potLabel}>POT</Text>
          <Text style={styles.potValue}>${state.pot.toLocaleString()}</Text>
        </Animated.View>

        {/* Current Card */}
        {state.currentCard && (
          <Animated.View entering={SlideInUp} style={styles.cardContainer}>
            <Card
              suit={state.currentCard.suit}
              rank={state.currentCard.rank}
              faceUp
            />
          </Animated.View>
        )}

        {/* Multipliers (only during play) */}
        {state.stage === 'playing' && state.currentCard && (
          <View style={styles.multipliers}>
            <View style={styles.multiplierItem}>
              <Text style={styles.multiplierLabel}>
                {isAtAce ? 'SAME' : 'LOWER'}
              </Text>
              <Text style={styles.multiplierValue}>
                {isAtAce ? getMultiplier('same') : getMultiplier('lower')}
              </Text>
            </View>
            <View style={styles.multiplierItem}>
              <Text style={styles.multiplierLabel}>
                {isAtKing ? 'SAME' : 'HIGHER'}
              </Text>
              <Text style={styles.multiplierValue}>
                {isAtKing ? getMultiplier('same') : getMultiplier('higher')}
              </Text>
            </View>
          </View>
        )}

        {/* Message */}
        {state.message && (
          <Text style={styles.message}>{state.message}</Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {state.stage === 'betting' || state.stage === 'result' ? (
          <PrimaryButton label="DEAL" onPress={handleDeal} />
        ) : (
          <>
            {/* Cash Out (secondary, less prominent) */}
            <Pressable style={styles.cashoutButton} onPress={handleCashout}>
              <Text style={styles.cashoutText}>CASH OUT · ${state.pot}</Text>
            </Pressable>

            {/* Main Actions */}
            <View style={styles.actionRow}>
              <PrimaryButton
                label={isAtAce ? 'SAME' : 'LOWER'}
                onPress={() => handleGuess(isAtAce ? 'same' : 'lower')}
                variant="secondary"
                style={styles.actionButton}
              />
              <PrimaryButton
                label={isAtKing ? 'SAME' : 'HIGHER'}
                onPress={() => handleGuess(isAtKing ? 'same' : 'higher')}
                style={styles.actionButton}
              />
            </View>
          </>
        )}
      </View>

      {/* Tutorial */}
      {showTutorial && (
        <TutorialOverlay
          gameId="hilo"
          steps={HILO_TUTORIAL}
          onComplete={() => setShowTutorial(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
  },
  connectionStatus: {
    color: '#00ff00',
    fontSize: 12,
  },
  gameArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  potContainer: {
    marginBottom: 32,
    alignItems: 'center',
  },
  potLabel: {
    color: '#666',
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
  },
  potValue: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono',
  },
  cardContainer: {
    marginBottom: 24,
  },
  multipliers: {
    flexDirection: 'row',
    gap: 48,
    marginBottom: 16,
  },
  multiplierItem: {
    alignItems: 'center',
  },
  multiplierLabel: {
    color: '#666',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 2,
  },
  multiplierValue: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono',
  },
  message: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  controls: {
    padding: 24,
    paddingBottom: 48,
  },
  cashoutButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cashoutText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});
```

#### Blackjack (Ive-Redesigned)

```typescript
// mobile/src/screens/games/BlackjackScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Card as CardComponent } from '../../components/casino/Card';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { HelpButton } from '../../components/ui/HelpButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { useWebSocket, GameMessage } from '../../services/websocket';
import { haptics } from '../../services/haptics';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.casino/ws';

const BLACKJACK_TUTORIAL = [
  {
    title: 'Welcome to Blackjack',
    description: 'Get as close to 21 as possible without going over. Beat the dealer to win.',
  },
  {
    title: 'Card Values',
    description: 'Number cards = face value. Face cards (J/Q/K) = 10. Aces = 1 or 11.',
  },
  {
    title: 'Your Options',
    description: 'HIT to take a card. STAND to keep your hand. DOUBLE to double your bet and take one card.',
  },
  {
    title: 'Splitting',
    description: 'If you have two cards of the same rank, you can SPLIT them into two hands.',
  },
];

type Card = { suit: 'hearts' | 'diamonds' | 'clubs' | 'spades'; rank: string };

interface BlackjackState {
  dealerCards: Card[];
  playerCards: Card[];
  stage: 'betting' | 'playing' | 'result';
  message: string;
  bet: number;
}

// Calculate hand value
function getHandValue(cards: Card[]): number {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces++;
      value += 11;
    } else if (['K', 'Q', 'J'].includes(card.rank)) {
      value += 10;
    } else {
      value += parseInt(card.rank, 10);
    }
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return value;
}

export function BlackjackScreen() {
  const [showTutorial, setShowTutorial] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const { send, connectionState } = useWebSocket<GameMessage>(WS_URL);

  const [state, setState] = useState<BlackjackState>({
    dealerCards: [],
    playerCards: [],
    stage: 'betting',
    message: '',
    bet: 25,
  });

  // Calculated values
  const playerValue = useMemo(() => getHandValue(state.playerCards), [state.playerCards]);
  const dealerValue = useMemo(() => getHandValue(state.dealerCards), [state.dealerCards]);

  // Check for tutorial on first launch
  useEffect(() => {
    AsyncStorage.getItem('tutorial_blackjack_completed').then((completed) => {
      if (!completed) setShowTutorial(true);
    });
  }, []);

  // Action availability
  const canHit = state.stage === 'playing' && playerValue < 21;
  const canStand = state.stage === 'playing' && state.playerCards.length > 0;
  const canDouble = state.stage === 'playing' && state.playerCards.length === 2;
  const canSplit =
    state.stage === 'playing' &&
    state.playerCards.length === 2 &&
    state.playerCards[0]?.rank === state.playerCards[1]?.rank;

  const handleDeal = useCallback(() => {
    haptics.betConfirm();
    send({ type: 'blackjack_deal', amount: state.bet });
  }, [state.bet, send]);

  const handleHit = useCallback(() => {
    haptics.cardDeal();
    send({ type: 'blackjack_hit' });
  }, [send]);

  const handleStand = useCallback(() => {
    haptics.chipPlace();
    send({ type: 'blackjack_stand' });
  }, [send]);

  const handleDouble = useCallback(() => {
    haptics.betConfirm();
    send({ type: 'blackjack_double' });
  }, [send]);

  const handleSplit = useCallback(() => {
    haptics.betConfirm();
    send({ type: 'blackjack_split' });
  }, [send]);

  // Keyboard controls
  useKeyboardControls({
    enabled: state.stage !== 'betting',
    onAction: (action) => {
      if (action === 'bet' && state.stage === 'betting') handleDeal();
      if (action === 'hit' && canHit) handleHit();
      if (action === 'stand' && canStand) handleStand();
      if (action === 'double' && canDouble) handleDouble();
      if (action === 'split' && canSplit) handleSplit();
    },
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        {(canDouble || canSplit) && (
          <Pressable
            style={styles.moreButton}
            onPress={() => setShowMoreActions(!showMoreActions)}
          >
            <Text style={styles.moreButtonText}>≡</Text>
          </Pressable>
        )}
      </View>

      {/* Game Area */}
      <View style={styles.gameArea}>
        {/* Dealer Hand */}
        <View style={styles.handSection}>
          <Text style={styles.handLabel}>
            DEALER{state.dealerCards.length > 0 ? ` · ${dealerValue}` : ''}
          </Text>
          <View style={styles.cardsRow}>
            {state.dealerCards.length > 0 ? (
              state.dealerCards.map((card, i) => (
                <View key={i} style={[styles.cardWrapper, { marginLeft: i > 0 ? -40 : 0 }]}>
                  <CardComponent suit={card.suit} rank={card.rank} faceUp />
                </View>
              ))
            ) : (
              <View style={styles.emptyCard} />
            )}
          </View>
        </View>

        {/* Message */}
        {state.message && (
          <Animated.Text entering={FadeIn} style={styles.message}>
            {state.message}
          </Animated.Text>
        )}

        {/* Player Hand */}
        <View style={styles.handSection}>
          <Text style={styles.handLabel}>
            YOU{state.playerCards.length > 0 ? ` · ${playerValue}` : ''}
          </Text>
          <View style={styles.cardsRow}>
            {state.playerCards.length > 0 ? (
              state.playerCards.map((card, i) => (
                <View key={i} style={[styles.cardWrapper, { marginLeft: i > 0 ? -40 : 0 }]}>
                  <CardComponent suit={card.suit} rank={card.rank} faceUp />
                </View>
              ))
            ) : (
              <View style={styles.emptyCard} />
            )}
          </View>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {state.stage === 'betting' || state.stage === 'result' ? (
          <PrimaryButton label="DEAL" onPress={handleDeal} />
        ) : (
          <>
            {/* More Actions Drawer */}
            {showMoreActions && (canDouble || canSplit) && (
              <Animated.View entering={SlideInUp.duration(200)} style={styles.moreActions}>
                {canDouble && (
                  <Pressable style={styles.secondaryButton} onPress={handleDouble}>
                    <Text style={styles.secondaryButtonText}>DOUBLE</Text>
                  </Pressable>
                )}
                {canSplit && (
                  <Pressable style={styles.secondaryButton} onPress={handleSplit}>
                    <Text style={styles.secondaryButtonText}>SPLIT</Text>
                  </Pressable>
                )}
              </Animated.View>
            )}

            {/* Primary Action Row */}
            <View style={styles.actionRow}>
              <PrimaryButton
                label="STAND"
                onPress={handleStand}
                disabled={!canStand}
                variant="secondary"
                style={styles.actionButton}
              />
              <PrimaryButton
                label="HIT"
                onPress={handleHit}
                disabled={!canHit}
                style={styles.actionButton}
              />
            </View>
          </>
        )}
      </View>

      {/* Tutorial */}
      {showTutorial && (
        <TutorialOverlay
          gameId="blackjack"
          steps={BLACKJACK_TUTORIAL}
          onComplete={() => setShowTutorial(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 48,
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreButtonText: {
    color: '#888',
    fontSize: 18,
  },
  gameArea: {
    flex: 1,
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  handSection: {
    alignItems: 'center',
  },
  handLabel: {
    color: '#888',
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  cardWrapper: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emptyCard: {
    width: 70,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#333',
  },
  message: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 16,
  },
  controls: {
    padding: 24,
    paddingBottom: 48,
  },
  moreActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});
```

#### Roulette (Ive-redesigned)

```typescript
// mobile/src/screens/games/RouletteScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
  SlideInUp,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

// Ive Principle: Progressive disclosure - 6 quick bets visible, 15+ in drawer
const QUICK_BETS = ['RED', 'BLACK', 'ODD', 'EVEN', '1-18', '19-36'] as const;

const ROULETTE_TUTORIAL = [
  { title: 'Simple Betting', description: 'Tap quick bet buttons to place common bets. Red/Black, Odd/Even pay 1:1.' },
  { title: 'Advanced Bets', description: 'Tap "More Bets" for dozens, columns, and straight number bets up to 35:1.' },
  { title: 'Spin to Win', description: 'Place your bets, then tap SPIN. The wheel determines your fate on-chain.' },
];

interface RouletteState {
  lastNumber: number | null;
  history: number[];
  bets: Array<{ type: string; target?: number; amount: number }>;
  isSpinning: boolean;
  message: string;
}

export function RouletteScreen() {
  const [state, setState] = useState<RouletteState>({
    lastNumber: null,
    history: [],
    bets: [],
    isSpinning: false,
    message: 'PLACE YOUR BETS',
  });
  const [showBetDrawer, setShowBetDrawer] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const wheelRotation = useSharedValue(0);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_roulette_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  // Wheel spin animation
  useEffect(() => {
    if (state.isSpinning) {
      wheelRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1
      );
    } else {
      wheelRotation.value = withSpring(0);
    }
  }, [state.isSpinning]);

  const wheelStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wheelRotation.value}deg` }],
  }));

  const getColor = (num: number | null): string => {
    if (num === null || num === 0 || num === 37) return '#00ff00';
    const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    return reds.includes(num) ? '#ff4444' : '#ffffff';
  };

  const placeQuickBet = async (betType: string) => {
    await haptics.chipPlace();
    const mappedType = betType === '1-18' ? 'LOW' : betType === '19-36' ? 'HIGH' : betType;
    send({ action: 'roulette_bet', type: mappedType });
  };

  const handleSpin = async () => {
    if (state.bets.length === 0) {
      setState(s => ({ ...s, message: 'PLACE A BET FIRST' }));
      return;
    }
    await haptics.betConfirm();
    setState(s => ({ ...s, isSpinning: true, message: 'SPINNING...' }));
    send({ action: 'roulette_spin' });
  };

  const totalBet = state.bets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        {totalBet > 0 && (
          <Text style={styles.betTotal}>${totalBet}</Text>
        )}
        <Pressable
          style={styles.moreButton}
          onPress={() => setShowBetDrawer(true)}
        >
          <Text style={styles.moreButtonText}>≡</Text>
        </Pressable>
      </View>

      {/* Wheel Display - The hero element */}
      <View style={styles.wheelArea}>
        <Animated.View style={[styles.wheel, wheelStyle]}>
          <Text style={[styles.wheelNumber, { color: getColor(state.lastNumber) }]}>
            {state.lastNumber === null ? '—' : state.lastNumber === 37 ? '00' : state.lastNumber}
          </Text>
        </Animated.View>

        {/* History dots */}
        <View style={styles.history}>
          {state.history.slice(-8).map((num, i) => (
            <View key={i} style={[styles.historyDot, { borderColor: getColor(num) }]}>
              <Text style={[styles.historyNum, { color: getColor(num) }]}>
                {num === 37 ? '00' : num}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Message */}
      <Text style={styles.message}>{state.message}</Text>

      {/* Quick Bets - Always visible, Ive's "essential controls" */}
      <View style={styles.quickBets}>
        {QUICK_BETS.map((bet) => (
          <Pressable
            key={bet}
            style={[
              styles.quickBet,
              bet === 'RED' && styles.quickBetRed,
              bet === 'BLACK' && styles.quickBetBlack,
            ]}
            onPress={() => placeQuickBet(bet)}
          >
            <Text style={styles.quickBetText}>{bet}</Text>
          </Pressable>
        ))}
      </View>

      {/* Primary Action */}
      <View style={styles.controls}>
        <PrimaryButton
          label="SPIN"
          onPress={handleSpin}
          disabled={state.isSpinning}
        />
      </View>

      {/* Advanced Bets Drawer - Progressive disclosure */}
      {showBetDrawer && (
        <Pressable
          style={styles.drawerOverlay}
          onPress={() => setShowBetDrawer(false)}
        >
          <Animated.View
            entering={SlideInUp.duration(300)}
            style={styles.drawer}
          >
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>ALL BETS</Text>

            <ScrollView style={styles.drawerScroll}>
              {/* Dozens */}
              <Text style={styles.betSection}>DOZENS</Text>
              <View style={styles.betRow}>
                {['1st 12', '2nd 12', '3rd 12'].map((label, i) => (
                  <Pressable key={label} style={styles.betButton} onPress={() => {
                    send({ action: 'roulette_bet', type: `DOZEN_${i + 1}` });
                    haptics.chipPlace();
                  }}>
                    <Text style={styles.betButtonText}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Columns */}
              <Text style={styles.betSection}>COLUMNS</Text>
              <View style={styles.betRow}>
                {[1, 2, 3].map((col) => (
                  <Pressable key={col} style={styles.betButton} onPress={() => {
                    send({ action: 'roulette_bet', type: `COL_${col}` });
                    haptics.chipPlace();
                  }}>
                    <Text style={styles.betButtonText}>Col {col}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Straight Numbers */}
              <Text style={styles.betSection}>STRAIGHT (35:1)</Text>
              <View style={styles.numberGrid}>
                {[0, ...Array.from({ length: 36 }, (_, i) => i + 1)].map((num) => (
                  <Pressable
                    key={num}
                    style={[styles.numberButton, { borderColor: getColor(num) }]}
                    onPress={() => {
                      send({ action: 'roulette_bet', type: 'STRAIGHT', target: num });
                      haptics.chipPlace();
                    }}
                  >
                    <Text style={[styles.numberText, { color: getColor(num) }]}>{num}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </Pressable>
      )}

      {/* Tutorial */}
      {showTutorial && (
        <TutorialOverlay
          gameId="roulette"
          steps={ROULETTE_TUTORIAL}
          onComplete={() => setShowTutorial(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  betTotal: { color: '#FFD700', fontSize: 16, fontWeight: 'bold' },
  moreButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  moreButtonText: { color: '#888', fontSize: 18 },
  wheelArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wheel: { width: 180, height: 180, borderRadius: 90, borderWidth: 4, borderColor: '#333', alignItems: 'center', justifyContent: 'center', backgroundColor: '#141414' },
  wheelNumber: { fontSize: 64, fontWeight: 'bold', fontFamily: 'JetBrains Mono' },
  history: { flexDirection: 'row', gap: 8, marginTop: 24 },
  historyDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  historyNum: { fontSize: 12, fontWeight: 'bold' },
  message: { color: '#888', fontSize: 14, textAlign: 'center', letterSpacing: 2, marginBottom: 16 },
  quickBets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  quickBet: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
  quickBetRed: { borderColor: '#ff4444' },
  quickBetBlack: { borderColor: '#666' },
  quickBetText: { color: '#fff', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  controls: { padding: 24, paddingBottom: 48 },
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', padding: 24 },
  drawerHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  drawerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  drawerScroll: { flex: 1 },
  betSection: { color: '#666', fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  betRow: { flexDirection: 'row', gap: 8 },
  betButton: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  betButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numberButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },
  numberText: { fontSize: 14, fontWeight: 'bold' },
});
```

#### Craps (Ive-redesigned)

```typescript
// mobile/src/screens/games/CrapsScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  FadeIn,
  SlideInUp,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

// Craps has 40+ bet types - Ive principle: show only essential, hide complexity
const CRAPS_TUTORIAL = [
  { title: 'Pass Line', description: 'The fundamental bet. Win on 7 or 11 on come-out, lose on 2, 3, or 12. Otherwise, a point is set.' },
  { title: 'The Point', description: 'Once set, you win if the point rolls again before a 7. The shooter keeps rolling.' },
  { title: 'Advanced Bets', description: 'Tap "More Bets" for place bets, hardways, field bets, and proposition bets.' },
];

interface CrapsState {
  dice: [number, number];
  point: number | null;
  phase: 'come_out' | 'point';
  bets: Array<{ type: string; amount: number }>;
  isRolling: boolean;
  message: string;
}

export function CrapsScreen() {
  const [state, setState] = useState<CrapsState>({
    dice: [1, 1],
    point: null,
    phase: 'come_out',
    bets: [],
    isRolling: false,
    message: 'COME-OUT ROLL',
  });
  const [showBetDrawer, setShowBetDrawer] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const dice1Rotation = useSharedValue(0);
  const dice2Rotation = useSharedValue(0);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_craps_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const dice1Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dice1Rotation.value}deg` }],
  }));

  const dice2Style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dice2Rotation.value}deg` }],
  }));

  const rollDice = async () => {
    if (state.bets.length === 0) {
      setState(s => ({ ...s, message: 'PLACE A BET FIRST' }));
      return;
    }
    await haptics.betConfirm();

    // Dice roll animation
    dice1Rotation.value = withSequence(
      withTiming(720, { duration: 400 }),
      withSpring(0)
    );
    dice2Rotation.value = withSequence(
      withTiming(-720, { duration: 450 }),
      withSpring(0)
    );

    setState(s => ({ ...s, isRolling: true, message: 'ROLLING...' }));
    send({ action: 'craps_roll' });
  };

  const placeBet = async (type: string) => {
    await haptics.chipPlace();
    send({ action: 'craps_bet', type });
  };

  const diceTotal = state.dice[0] + state.dice[1];
  const hasBet = (type: string) => state.bets.some(b => b.type === type);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        {state.point && (
          <View style={styles.pointBadge}>
            <Text style={styles.pointLabel}>POINT</Text>
            <Text style={styles.pointValue}>{state.point}</Text>
          </View>
        )}
        <Pressable style={styles.moreButton} onPress={() => setShowBetDrawer(true)}>
          <Text style={styles.moreButtonText}>≡</Text>
        </Pressable>
      </View>

      {/* Dice Display */}
      <View style={styles.diceArea}>
        <Animated.View style={[styles.die, dice1Style]}>
          <Text style={styles.dieText}>{state.dice[0]}</Text>
        </Animated.View>
        <Animated.View style={[styles.die, dice2Style]}>
          <Text style={styles.dieText}>{state.dice[1]}</Text>
        </Animated.View>
      </View>

      {/* Total */}
      <Text style={styles.total}>{diceTotal}</Text>
      <Text style={styles.message}>{state.message}</Text>

      {/* Essential Bets Only - Pass/Don't Pass */}
      <View style={styles.essentialBets}>
        <Pressable
          style={[styles.passBet, hasBet('PASS') && styles.betActive]}
          onPress={() => placeBet('PASS')}
        >
          <Text style={styles.passBetLabel}>PASS</Text>
          <Text style={styles.passBetOdds}>1:1</Text>
        </Pressable>
        <Pressable
          style={[styles.dontPassBet, hasBet('DONT_PASS') && styles.betActive]}
          onPress={() => placeBet('DONT_PASS')}
        >
          <Text style={styles.dontPassLabel}>DON'T PASS</Text>
          <Text style={styles.passBetOdds}>1:1</Text>
        </Pressable>
      </View>

      {/* Roll Button */}
      <View style={styles.controls}>
        <PrimaryButton
          label="ROLL"
          onPress={rollDice}
          disabled={state.isRolling}
        />
      </View>

      {/* Advanced Bets Drawer */}
      {showBetDrawer && (
        <Pressable style={styles.drawerOverlay} onPress={() => setShowBetDrawer(false)}>
          <Animated.View entering={SlideInUp.duration(300)} style={styles.drawer}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>ALL BETS</Text>
            <ScrollView style={styles.drawerScroll}>
              {/* Come/Don't Come */}
              <Text style={styles.betSection}>COME BETS</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.betButton} onPress={() => placeBet('COME')}>
                  <Text style={styles.betButtonText}>COME</Text>
                </Pressable>
                <Pressable style={styles.betButton} onPress={() => placeBet('DONT_COME')}>
                  <Text style={styles.betButtonText}>DON'T COME</Text>
                </Pressable>
              </View>

              {/* Place Bets */}
              <Text style={styles.betSection}>PLACE BETS</Text>
              <View style={styles.betRow}>
                {[4, 5, 6, 8, 9, 10].map(num => (
                  <Pressable key={num} style={styles.placeButton} onPress={() => placeBet(`PLACE_${num}`)}>
                    <Text style={styles.betButtonText}>{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Hardways */}
              <Text style={styles.betSection}>HARDWAYS</Text>
              <View style={styles.betRow}>
                {[4, 6, 8, 10].map(num => (
                  <Pressable key={num} style={styles.betButton} onPress={() => placeBet(`HARD_${num}`)}>
                    <Text style={styles.betButtonText}>Hard {num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Field */}
              <Text style={styles.betSection}>FIELD</Text>
              <Pressable style={styles.fieldButton} onPress={() => placeBet('FIELD')}>
                <Text style={styles.betButtonText}>FIELD (2,3,4,9,10,11,12)</Text>
              </Pressable>

              {/* Props */}
              <Text style={styles.betSection}>PROPOSITIONS</Text>
              <View style={styles.betRow}>
                <Pressable style={styles.betButton} onPress={() => placeBet('ANY_7')}>
                  <Text style={styles.betButtonText}>Any 7</Text>
                </Pressable>
                <Pressable style={styles.betButton} onPress={() => placeBet('ANY_CRAPS')}>
                  <Text style={styles.betButtonText}>Any Craps</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>
        </Pressable>
      )}

      {showTutorial && (
        <TutorialOverlay gameId="craps" steps={CRAPS_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  pointBadge: { backgroundColor: '#FFD700', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pointLabel: { color: '#000', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  pointValue: { color: '#000', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  moreButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  moreButtonText: { color: '#888', fontSize: 18 },
  diceArea: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  die: { width: 80, height: 80, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  dieText: { fontSize: 48, fontWeight: 'bold', color: '#000' },
  total: { fontSize: 32, fontWeight: 'bold', color: '#FFD700', textAlign: 'center' },
  message: { color: '#888', fontSize: 14, textAlign: 'center', letterSpacing: 2, marginTop: 8, marginBottom: 24 },
  essentialBets: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, marginBottom: 16 },
  passBet: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: '#00ff00', alignItems: 'center' },
  dontPassBet: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: '#ff4444', alignItems: 'center' },
  betActive: { backgroundColor: 'rgba(255,215,0,0.2)', borderColor: '#FFD700' },
  passBetLabel: { color: '#00ff00', fontSize: 16, fontWeight: 'bold' },
  dontPassLabel: { color: '#ff4444', fontSize: 16, fontWeight: 'bold' },
  passBetOdds: { color: '#666', fontSize: 12, marginTop: 4 },
  controls: { padding: 24, paddingBottom: 48 },
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', padding: 24 },
  drawerHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  drawerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  drawerScroll: { flex: 1 },
  betSection: { color: '#666', fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  betRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  betButton: { flex: 1, minWidth: 80, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  placeButton: { width: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  fieldButton: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  betButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});
```

#### Casino War (Ive-redesigned)

```typescript
// mobile/src/screens/games/CasinoWarScreen.tsx (Ive-redesigned)
// Casino War is the simplest card game - embodies Ive's "reduce to essence"
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { CardComponent } from '../../components/game/Card';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

const CASINO_WAR_TUTORIAL = [
  { title: 'Higher Card Wins', description: 'You and the dealer each get one card. Higher card wins. Aces are high.' },
  { title: 'Tie = War', description: 'On a tie, you can surrender (lose half bet) or go to war (match your bet).' },
  { title: 'War Bonus', description: 'Win a war and you get a bonus payout. Simple as that.' },
];

interface Card { suit: string; rank: string; }

interface WarState {
  playerCard: Card | null;
  dealerCard: Card | null;
  phase: 'betting' | 'dealt' | 'war' | 'result';
  message: string;
  warCards: { player: Card[]; dealer: Card[] };
}

export function CasinoWarScreen() {
  const [state, setState] = useState<WarState>({
    playerCard: null,
    dealerCard: null,
    phase: 'betting',
    message: 'TAP DEAL TO START',
    warCards: { player: [], dealer: [] },
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_casinowar_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const handleDeal = async () => {
    await haptics.betConfirm();
    setState(s => ({ ...s, phase: 'dealt', message: 'DEALING...' }));
    send({ action: 'war_deal' });
  };

  const handleWar = async () => {
    await haptics.betConfirm();
    setState(s => ({ ...s, phase: 'war', message: 'GOING TO WAR...' }));
    send({ action: 'war_go_to_war' });
  };

  const handleSurrender = async () => {
    await haptics.chipPlace();
    send({ action: 'war_surrender' });
  };

  const canWar = state.phase === 'dealt' && state.playerCard && state.dealerCard &&
    state.playerCard.rank === state.dealerCard.rank;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        <Text style={styles.title}>CASINO WAR</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Cards Area */}
      <View style={styles.cardsArea}>
        {/* Dealer */}
        <View style={styles.cardSection}>
          <Text style={styles.cardLabel}>DEALER</Text>
          {state.dealerCard ? (
            <Animated.View entering={SlideInRight.duration(300)}>
              <CardComponent suit={state.dealerCard.suit} rank={state.dealerCard.rank} faceUp />
            </Animated.View>
          ) : (
            <View style={styles.emptyCard} />
          )}
        </View>

        {/* VS */}
        <Text style={styles.vs}>VS</Text>

        {/* Player */}
        <View style={styles.cardSection}>
          <Text style={styles.cardLabel}>YOU</Text>
          {state.playerCard ? (
            <Animated.View entering={SlideInLeft.duration(300)}>
              <CardComponent suit={state.playerCard.suit} rank={state.playerCard.rank} faceUp />
            </Animated.View>
          ) : (
            <View style={styles.emptyCard} />
          )}
        </View>
      </View>

      {/* Message */}
      <Text style={styles.message}>{state.message}</Text>

      {/* Controls */}
      <View style={styles.controls}>
        {canWar ? (
          <View style={styles.warChoices}>
            <PrimaryButton
              label="SURRENDER"
              onPress={handleSurrender}
              variant="secondary"
              style={styles.warButton}
            />
            <PrimaryButton
              label="GO TO WAR"
              onPress={handleWar}
              style={styles.warButton}
            />
          </View>
        ) : (
          <PrimaryButton
            label={state.phase === 'result' ? 'NEW GAME' : 'DEAL'}
            onPress={handleDeal}
          />
        )}
      </View>

      {showTutorial && (
        <TutorialOverlay gameId="casinowar" steps={CASINO_WAR_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  title: { color: '#888', fontSize: 12, letterSpacing: 4 },
  cardsArea: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 24 },
  cardSection: { alignItems: 'center' },
  cardLabel: { color: '#666', fontSize: 10, letterSpacing: 2, marginBottom: 12 },
  emptyCard: { width: 100, height: 140, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: '#333' },
  vs: { color: '#333', fontSize: 24, fontWeight: 'bold' },
  message: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  controls: { padding: 24, paddingBottom: 48 },
  warChoices: { flexDirection: 'row', gap: 12 },
  warButton: { flex: 1 },
});
```

#### Video Poker (Ive-redesigned)

```typescript
// mobile/src/screens/games/VideoPokerScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { CardComponent } from '../../components/game/Card';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

const VIDEO_POKER_TUTORIAL = [
  { title: 'Five Card Draw', description: 'You get 5 cards. Tap cards you want to HOLD, then draw replacements.' },
  { title: 'Poker Hands', description: 'Standard poker rankings. Jacks or Better pays out - pair of Jacks, Queens, Kings, or Aces.' },
  { title: 'Pay Table', description: 'Tap the info button anytime to see the full pay table for current game variant.' },
];

interface Card { suit: string; rank: string; }

interface VideoPokerState {
  cards: Card[];
  held: boolean[];
  phase: 'betting' | 'initial' | 'final' | 'result';
  handRank: string;
  message: string;
  payout: number;
}

export function VideoPokerScreen() {
  const [state, setState] = useState<VideoPokerState>({
    cards: [],
    held: [false, false, false, false, false],
    phase: 'betting',
    handRank: '',
    message: 'DEAL TO START',
    payout: 0,
  });
  const [showPayTable, setShowPayTable] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_videopoker_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const toggleHold = async (index: number) => {
    if (state.phase !== 'initial') return;
    await haptics.chipPlace();
    setState(s => {
      const held = [...s.held];
      held[index] = !held[index];
      return { ...s, held };
    });
  };

  const handleDeal = async () => {
    await haptics.betConfirm();
    if (state.phase === 'betting' || state.phase === 'result') {
      setState(s => ({ ...s, phase: 'initial', held: [false, false, false, false, false], message: 'SELECT CARDS TO HOLD' }));
      send({ action: 'videopoker_deal' });
    } else if (state.phase === 'initial') {
      setState(s => ({ ...s, phase: 'final', message: 'DRAWING...' }));
      send({ action: 'videopoker_draw', held: state.held });
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        <Pressable onPress={() => setShowPayTable(true)}>
          <Text style={styles.payTableLink}>PAY TABLE</Text>
        </Pressable>
      </View>

      {/* Hand Rank Display */}
      {state.handRank && (
        <Animated.View entering={FadeIn} style={styles.handRankBanner}>
          <Text style={styles.handRankText}>{state.handRank}</Text>
          {state.payout > 0 && <Text style={styles.payoutText}>+${state.payout}</Text>}
        </Animated.View>
      )}

      {/* Cards */}
      <View style={styles.cardsRow}>
        {state.cards.length > 0 ? (
          state.cards.map((card, i) => (
            <Pressable key={i} onPress={() => toggleHold(i)}>
              <View style={styles.cardWrapper}>
                {state.held[i] && (
                  <Animated.View entering={FadeIn} style={styles.holdBadge}>
                    <Text style={styles.holdText}>HOLD</Text>
                  </Animated.View>
                )}
                <CardComponent suit={card.suit} rank={card.rank} faceUp />
              </View>
            </Pressable>
          ))
        ) : (
          Array(5).fill(0).map((_, i) => (
            <View key={i} style={styles.emptyCard} />
          ))
        )}
      </View>

      {/* Message */}
      <Text style={styles.message}>{state.message}</Text>

      {/* Controls */}
      <View style={styles.controls}>
        <PrimaryButton
          label={state.phase === 'initial' ? 'DRAW' : 'DEAL'}
          onPress={handleDeal}
        />
      </View>

      {/* Pay Table Modal */}
      {showPayTable && (
        <Pressable style={styles.modalOverlay} onPress={() => setShowPayTable(false)}>
          <View style={styles.payTableModal}>
            <Text style={styles.modalTitle}>JACKS OR BETTER</Text>
            <View style={styles.payRow}><Text style={styles.payHand}>Royal Flush</Text><Text style={styles.payAmount}>800x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Straight Flush</Text><Text style={styles.payAmount}>50x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Four of a Kind</Text><Text style={styles.payAmount}>25x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Full House</Text><Text style={styles.payAmount}>9x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Flush</Text><Text style={styles.payAmount}>6x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Straight</Text><Text style={styles.payAmount}>4x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Three of a Kind</Text><Text style={styles.payAmount}>3x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Two Pair</Text><Text style={styles.payAmount}>2x</Text></View>
            <View style={styles.payRow}><Text style={styles.payHand}>Jacks or Better</Text><Text style={styles.payAmount}>1x</Text></View>
          </View>
        </Pressable>
      )}

      {showTutorial && (
        <TutorialOverlay gameId="videopoker" steps={VIDEO_POKER_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  payTableLink: { color: '#666', fontSize: 10, letterSpacing: 2 },
  handRankBanner: { backgroundColor: '#FFD700', paddingVertical: 12, alignItems: 'center', marginBottom: 24 },
  handRankText: { color: '#000', fontSize: 20, fontWeight: 'bold' },
  payoutText: { color: '#000', fontSize: 14, marginTop: 4 },
  cardsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 16, flex: 1, alignItems: 'center' },
  cardWrapper: { position: 'relative' },
  holdBadge: { position: 'absolute', top: -20, left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  holdText: { color: '#00ff00', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  emptyCard: { width: 60, height: 84, borderRadius: 6, borderWidth: 2, borderStyle: 'dashed', borderColor: '#333' },
  message: { color: '#888', fontSize: 14, textAlign: 'center', letterSpacing: 2, marginBottom: 24 },
  controls: { padding: 24, paddingBottom: 48 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  payTableModal: { backgroundColor: '#141414', borderRadius: 16, padding: 24, width: '80%', maxWidth: 300 },
  modalTitle: { color: '#FFD700', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#222' },
  payHand: { color: '#fff', fontSize: 14 },
  payAmount: { color: '#00ff00', fontSize: 14, fontWeight: 'bold' },
});
```

#### Baccarat (Ive-redesigned)

```typescript
// mobile/src/screens/games/BaccaratScreen.tsx (Ive-redesigned)
// Baccarat: Only 3 betting options - the epitome of simplicity
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { FadeIn, SlideInUp, SlideInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { CardComponent } from '../../components/game/Card';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

const BACCARAT_TUTORIAL = [
  { title: 'Three Choices', description: 'Bet on PLAYER, BANKER, or TIE. That\'s it. No strategy needed.' },
  { title: 'Closest to 9', description: 'Cards are dealt automatically. Hand closest to 9 wins. Face cards = 0.' },
  { title: 'Banker Edge', description: 'Banker has slight edge (5% commission on wins). Tie pays 8:1 but rarely hits.' },
];

interface Card { suit: string; rank: string; }

interface BaccaratState {
  playerCards: Card[];
  bankerCards: Card[];
  playerTotal: number;
  bankerTotal: number;
  selectedBet: 'PLAYER' | 'BANKER' | 'TIE' | null;
  phase: 'betting' | 'dealing' | 'result';
  winner: string;
  message: string;
}

export function BaccaratScreen() {
  const [state, setState] = useState<BaccaratState>({
    playerCards: [],
    bankerCards: [],
    playerTotal: 0,
    bankerTotal: 0,
    selectedBet: null,
    phase: 'betting',
    winner: '',
    message: 'SELECT YOUR BET',
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_baccarat_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const selectBet = async (bet: 'PLAYER' | 'BANKER' | 'TIE') => {
    await haptics.chipPlace();
    setState(s => ({ ...s, selectedBet: bet }));
  };

  const handleDeal = async () => {
    if (!state.selectedBet) {
      setState(s => ({ ...s, message: 'SELECT A BET FIRST' }));
      return;
    }
    await haptics.betConfirm();
    setState(s => ({ ...s, phase: 'dealing', message: 'DEALING...' }));
    send({ action: 'baccarat_deal', bet: state.selectedBet });
  };

  const handleNewGame = () => {
    setState({
      playerCards: [],
      bankerCards: [],
      playerTotal: 0,
      bankerTotal: 0,
      selectedBet: null,
      phase: 'betting',
      winner: '',
      message: 'SELECT YOUR BET',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        <Text style={styles.title}>BACCARAT</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Banker Hand */}
      <View style={styles.handSection}>
        <Text style={styles.handLabel}>BANKER · {state.bankerTotal}</Text>
        <View style={styles.cardsRow}>
          {state.bankerCards.length > 0 ? (
            state.bankerCards.map((card, i) => (
              <Animated.View key={i} entering={SlideInUp.delay(i * 200)}>
                <CardComponent suit={card.suit} rank={card.rank} faceUp />
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyCard} />
          )}
        </View>
      </View>

      {/* Result */}
      {state.winner && (
        <Animated.View entering={FadeIn} style={styles.resultBanner}>
          <Text style={styles.resultText}>{state.winner} WINS</Text>
        </Animated.View>
      )}

      {/* Player Hand */}
      <View style={styles.handSection}>
        <Text style={styles.handLabel}>PLAYER · {state.playerTotal}</Text>
        <View style={styles.cardsRow}>
          {state.playerCards.length > 0 ? (
            state.playerCards.map((card, i) => (
              <Animated.View key={i} entering={SlideInDown.delay(i * 200)}>
                <CardComponent suit={card.suit} rank={card.rank} faceUp />
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyCard} />
          )}
        </View>
      </View>

      {/* Message */}
      <Text style={styles.message}>{state.message}</Text>

      {/* Bet Selection - The 3 essential choices */}
      {state.phase === 'betting' && (
        <View style={styles.betRow}>
          <Pressable
            style={[styles.betOption, state.selectedBet === 'PLAYER' && styles.betSelected]}
            onPress={() => selectBet('PLAYER')}
          >
            <Text style={styles.betLabel}>PLAYER</Text>
            <Text style={styles.betOdds}>1:1</Text>
          </Pressable>
          <Pressable
            style={[styles.betOption, styles.tieBet, state.selectedBet === 'TIE' && styles.betSelected]}
            onPress={() => selectBet('TIE')}
          >
            <Text style={styles.betLabel}>TIE</Text>
            <Text style={styles.betOdds}>8:1</Text>
          </Pressable>
          <Pressable
            style={[styles.betOption, state.selectedBet === 'BANKER' && styles.betSelected]}
            onPress={() => selectBet('BANKER')}
          >
            <Text style={styles.betLabel}>BANKER</Text>
            <Text style={styles.betOdds}>0.95:1</Text>
          </Pressable>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <PrimaryButton
          label={state.phase === 'result' ? 'NEW GAME' : 'DEAL'}
          onPress={state.phase === 'result' ? handleNewGame : handleDeal}
          disabled={state.phase === 'dealing'}
        />
      </View>

      {showTutorial && (
        <TutorialOverlay gameId="baccarat" steps={BACCARAT_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  title: { color: '#888', fontSize: 12, letterSpacing: 4 },
  handSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  handLabel: { color: '#666', fontSize: 12, letterSpacing: 2, marginBottom: 12 },
  cardsRow: { flexDirection: 'row', gap: 8 },
  emptyCard: { width: 70, height: 100, borderRadius: 8, borderWidth: 2, borderStyle: 'dashed', borderColor: '#333' },
  resultBanner: { backgroundColor: '#FFD700', paddingVertical: 16, alignItems: 'center' },
  resultText: { color: '#000', fontSize: 24, fontWeight: 'bold', letterSpacing: 4 },
  message: { color: '#888', fontSize: 14, textAlign: 'center', letterSpacing: 2, marginVertical: 16 },
  betRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 24 },
  betOption: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  tieBet: { borderColor: '#FFD700' },
  betSelected: { borderColor: '#00ff00', backgroundColor: 'rgba(0,255,0,0.1)' },
  betLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  betOdds: { color: '#666', fontSize: 12, marginTop: 4 },
  controls: { padding: 24, paddingBottom: 48 },
});
```

#### Sic Bo (Ive-redesigned)

```typescript
// mobile/src/screens/games/SicBoScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  FadeIn,
  SlideInUp,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

// Sic Bo has many bet types - show only BIG/SMALL as quick bets
const SIC_BO_TUTORIAL = [
  { title: 'Three Dice', description: 'Three dice are rolled. Bet on the outcome - totals, combinations, or specific numbers.' },
  { title: 'Big & Small', description: 'The safest bets. Small (4-10) or Big (11-17). Both pay 1:1 and lose on triples.' },
  { title: 'High Payouts', description: 'Specific triples pay 180:1. Tap "More Bets" to see all options.' },
];

interface SicBoState {
  dice: [number, number, number];
  bets: Array<{ type: string; value?: number; amount: number }>;
  isRolling: boolean;
  message: string;
  total: number;
}

export function SicBoScreen() {
  const [state, setState] = useState<SicBoState>({
    dice: [1, 1, 1],
    bets: [],
    isRolling: false,
    message: 'PLACE YOUR BETS',
    total: 3,
  });
  const [showBetDrawer, setShowBetDrawer] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const dice1Y = useSharedValue(0);
  const dice2Y = useSharedValue(0);
  const dice3Y = useSharedValue(0);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_sicbo_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const dice1Style = useAnimatedStyle(() => ({ transform: [{ translateY: dice1Y.value }] }));
  const dice2Style = useAnimatedStyle(() => ({ transform: [{ translateY: dice2Y.value }] }));
  const dice3Style = useAnimatedStyle(() => ({ transform: [{ translateY: dice3Y.value }] }));

  const handleRoll = async () => {
    if (state.bets.length === 0) {
      setState(s => ({ ...s, message: 'PLACE A BET FIRST' }));
      return;
    }
    await haptics.betConfirm();

    // Dice bounce animation
    const bounce = withSequence(
      withTiming(-30, { duration: 100 }),
      withTiming(0, { duration: 100 }),
      withTiming(-20, { duration: 80 }),
      withTiming(0, { duration: 80 })
    );
    dice1Y.value = bounce;
    dice2Y.value = withSequence(withTiming(0, { duration: 50 }), bounce);
    dice3Y.value = withSequence(withTiming(0, { duration: 100 }), bounce);

    setState(s => ({ ...s, isRolling: true, message: 'ROLLING...' }));
    send({ action: 'sicbo_roll' });
  };

  const placeBet = async (type: string, value?: number) => {
    await haptics.chipPlace();
    send({ action: 'sicbo_bet', type, value });
  };

  const hasBet = (type: string) => state.bets.some(b => b.type === type);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        <Text style={styles.total}>TOTAL: {state.total}</Text>
        <Pressable style={styles.moreButton} onPress={() => setShowBetDrawer(true)}>
          <Text style={styles.moreButtonText}>≡</Text>
        </Pressable>
      </View>

      {/* Dice Display */}
      <View style={styles.diceArea}>
        <Animated.View style={[styles.die, dice1Style]}>
          <Text style={styles.dieText}>{state.dice[0]}</Text>
        </Animated.View>
        <Animated.View style={[styles.die, dice2Style]}>
          <Text style={styles.dieText}>{state.dice[1]}</Text>
        </Animated.View>
        <Animated.View style={[styles.die, dice3Style]}>
          <Text style={styles.dieText}>{state.dice[2]}</Text>
        </Animated.View>
      </View>

      <Text style={styles.message}>{state.message}</Text>

      {/* Quick Bets - Big/Small only */}
      <View style={styles.quickBets}>
        <Pressable
          style={[styles.quickBet, hasBet('SMALL') && styles.betActive]}
          onPress={() => placeBet('SMALL')}
        >
          <Text style={styles.quickBetLabel}>SMALL</Text>
          <Text style={styles.quickBetRange}>4-10</Text>
          <Text style={styles.quickBetOdds}>1:1</Text>
        </Pressable>
        <Pressable
          style={[styles.quickBet, hasBet('BIG') && styles.betActive]}
          onPress={() => placeBet('BIG')}
        >
          <Text style={styles.quickBetLabel}>BIG</Text>
          <Text style={styles.quickBetRange}>11-17</Text>
          <Text style={styles.quickBetOdds}>1:1</Text>
        </Pressable>
      </View>

      {/* Roll Button */}
      <View style={styles.controls}>
        <PrimaryButton label="ROLL" onPress={handleRoll} disabled={state.isRolling} />
      </View>

      {/* Advanced Bets Drawer */}
      {showBetDrawer && (
        <Pressable style={styles.drawerOverlay} onPress={() => setShowBetDrawer(false)}>
          <Animated.View entering={SlideInUp.duration(300)} style={styles.drawer}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>ALL BETS</Text>
            <ScrollView style={styles.drawerScroll}>
              {/* Totals */}
              <Text style={styles.betSection}>TOTALS</Text>
              <View style={styles.betGrid}>
                {Array.from({ length: 14 }, (_, i) => i + 4).map(total => (
                  <Pressable key={total} style={styles.totalButton} onPress={() => placeBet('TOTAL', total)}>
                    <Text style={styles.betButtonText}>{total}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Singles */}
              <Text style={styles.betSection}>SINGLE NUMBER</Text>
              <View style={styles.betRow}>
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <Pressable key={num} style={styles.betButton} onPress={() => placeBet('SINGLE', num)}>
                    <Text style={styles.betButtonText}>{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Triples */}
              <Text style={styles.betSection}>SPECIFIC TRIPLE (180:1)</Text>
              <View style={styles.betRow}>
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <Pressable key={num} style={styles.betButton} onPress={() => placeBet('TRIPLE', num)}>
                    <Text style={styles.betButtonText}>{num}-{num}-{num}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Any Triple */}
              <Pressable style={styles.anyTriple} onPress={() => placeBet('ANY_TRIPLE')}>
                <Text style={styles.betButtonText}>ANY TRIPLE (30:1)</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </Pressable>
      )}

      {showTutorial && (
        <TutorialOverlay gameId="sicbo" steps={SIC_BO_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  total: { color: '#FFD700', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  moreButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  moreButtonText: { color: '#888', fontSize: 18 },
  diceArea: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  die: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 },
  dieText: { fontSize: 36, fontWeight: 'bold', color: '#000' },
  message: { color: '#888', fontSize: 14, textAlign: 'center', letterSpacing: 2, marginBottom: 24 },
  quickBets: { flexDirection: 'row', gap: 16, paddingHorizontal: 24, marginBottom: 16 },
  quickBet: { flex: 1, padding: 20, borderRadius: 12, borderWidth: 2, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  betActive: { borderColor: '#00ff00', backgroundColor: 'rgba(0,255,0,0.1)' },
  quickBetLabel: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  quickBetRange: { color: '#666', fontSize: 12, marginTop: 4 },
  quickBetOdds: { color: '#00ff00', fontSize: 12, marginTop: 4 },
  controls: { padding: 24, paddingBottom: 48 },
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', padding: 24 },
  drawerHandle: { width: 40, height: 4, backgroundColor: '#333', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  drawerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  drawerScroll: { flex: 1 },
  betSection: { color: '#666', fontSize: 10, letterSpacing: 2, marginTop: 16, marginBottom: 8 },
  betGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  betRow: { flexDirection: 'row', gap: 8 },
  totalButton: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  betButton: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a', alignItems: 'center' },
  anyTriple: { marginTop: 16, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700', backgroundColor: '#1a1a1a', alignItems: 'center' },
  betButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});
```

#### Three Card Poker (Ive-redesigned)

```typescript
// mobile/src/screens/games/ThreeCardPokerScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { CardComponent } from '../../components/game/Card';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

const THREE_CARD_TUTORIAL = [
  { title: 'Ante & Play', description: 'Place an Ante bet to receive 3 cards. Then decide: Play (match ante) or Fold (lose ante).' },
  { title: 'Beat the Dealer', description: 'Dealer needs Queen-high to qualify. If you beat a qualified dealer, both Ante and Play pay 1:1.' },
  { title: 'Pair Plus', description: 'Optional side bet that pays on your hand regardless of dealer. Pair pays 1:1, up to Straight Flush at 40:1.' },
];

interface Card { suit: string; rank: string; }

interface ThreeCardState {
  playerCards: Card[];
  dealerCards: Card[];
  handRank: string;
  dealerRank: string;
  phase: 'betting' | 'decision' | 'result';
  message: string;
  pairPlusActive: boolean;
}

export function ThreeCardPokerScreen() {
  const [state, setState] = useState<ThreeCardState>({
    playerCards: [],
    dealerCards: [],
    handRank: '',
    dealerRank: '',
    phase: 'betting',
    message: 'PLACE ANTE TO START',
    pairPlusActive: false,
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_threecardpoker_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const togglePairPlus = async () => {
    await haptics.chipPlace();
    setState(s => ({ ...s, pairPlusActive: !s.pairPlusActive }));
  };

  const handleDeal = async () => {
    await haptics.betConfirm();
    setState(s => ({ ...s, phase: 'decision', message: 'PLAY OR FOLD?' }));
    send({ action: 'threecardpoker_deal', pairPlus: state.pairPlusActive });
  };

  const handlePlay = async () => {
    await haptics.betConfirm();
    setState(s => ({ ...s, phase: 'result', message: 'REVEALING...' }));
    send({ action: 'threecardpoker_play' });
  };

  const handleFold = async () => {
    await haptics.chipPlace();
    send({ action: 'threecardpoker_fold' });
  };

  const handleNewGame = () => {
    setState({
      playerCards: [],
      dealerCards: [],
      handRank: '',
      dealerRank: '',
      phase: 'betting',
      message: 'PLACE ANTE TO START',
      pairPlusActive: false,
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        <Text style={styles.title}>THREE CARD POKER</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Dealer Hand */}
      <View style={styles.handSection}>
        <Text style={styles.handLabel}>DEALER{state.dealerRank ? ` · ${state.dealerRank}` : ''}</Text>
        <View style={styles.cardsRow}>
          {state.dealerCards.length > 0 ? (
            state.dealerCards.map((card, i) => (
              <Animated.View key={i} entering={FadeIn.delay(i * 100)}>
                <CardComponent
                  suit={card.suit}
                  rank={card.rank}
                  faceUp={state.phase === 'result'}
                />
              </Animated.View>
            ))
          ) : (
            Array(3).fill(0).map((_, i) => <View key={i} style={styles.emptyCard} />)
          )}
        </View>
      </View>

      {/* Message */}
      <Animated.Text entering={FadeIn} style={styles.message}>{state.message}</Animated.Text>

      {/* Player Hand */}
      <View style={styles.handSection}>
        <Text style={styles.handLabel}>YOUR HAND{state.handRank ? ` · ${state.handRank}` : ''}</Text>
        <View style={styles.cardsRow}>
          {state.playerCards.length > 0 ? (
            state.playerCards.map((card, i) => (
              <Animated.View key={i} entering={SlideInUp.delay(i * 100)}>
                <CardComponent suit={card.suit} rank={card.rank} faceUp />
              </Animated.View>
            ))
          ) : (
            Array(3).fill(0).map((_, i) => <View key={i} style={styles.emptyCard} />)
          )}
        </View>
      </View>

      {/* Pair Plus Toggle (only in betting phase) */}
      {state.phase === 'betting' && (
        <Pressable
          style={[styles.pairPlusToggle, state.pairPlusActive && styles.pairPlusActive]}
          onPress={togglePairPlus}
        >
          <Text style={[styles.pairPlusText, state.pairPlusActive && styles.pairPlusTextActive]}>
            PAIR PLUS {state.pairPlusActive ? '✓' : ''}
          </Text>
        </Pressable>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {state.phase === 'betting' && (
          <PrimaryButton label="ANTE & DEAL" onPress={handleDeal} />
        )}
        {state.phase === 'decision' && (
          <View style={styles.decisionRow}>
            <PrimaryButton label="FOLD" onPress={handleFold} variant="danger" style={styles.decisionButton} />
            <PrimaryButton label="PLAY" onPress={handlePlay} style={styles.decisionButton} />
          </View>
        )}
        {state.phase === 'result' && (
          <PrimaryButton label="NEW GAME" onPress={handleNewGame} />
        )}
      </View>

      {showTutorial && (
        <TutorialOverlay gameId="threecardpoker" steps={THREE_CARD_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  title: { color: '#888', fontSize: 10, letterSpacing: 3 },
  handSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  handLabel: { color: '#666', fontSize: 12, letterSpacing: 2, marginBottom: 12 },
  cardsRow: { flexDirection: 'row', gap: 8 },
  emptyCard: { width: 60, height: 84, borderRadius: 6, borderWidth: 2, borderStyle: 'dashed', borderColor: '#333' },
  message: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginVertical: 16 },
  pairPlusToggle: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20, borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  pairPlusActive: { borderColor: '#00ff00', backgroundColor: 'rgba(0,255,0,0.1)' },
  pairPlusText: { color: '#666', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  pairPlusTextActive: { color: '#00ff00' },
  controls: { padding: 24, paddingBottom: 48 },
  decisionRow: { flexDirection: 'row', gap: 12 },
  decisionButton: { flex: 1 },
});
```

#### Ultimate Texas Hold'em (Ive-redesigned)

```typescript
// mobile/src/screens/games/UltimateHoldemScreen.tsx (Ive-redesigned)
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useState, useEffect } from 'react';
import Animated, { FadeIn, SlideInUp, SlideInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HelpButton } from '../../components/ui/HelpButton';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TutorialOverlay } from '../../components/ui/TutorialOverlay';
import { CardComponent } from '../../components/game/Card';
import { haptics } from '../../services/haptics';
import { useWebSocket } from '../../hooks/useWebSocket';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'wss://api.nullspace.app/ws';

const UTH_TUTORIAL = [
  { title: 'Ante & Blind', description: 'Equal bets on Ante and Blind to start. You get 2 cards, dealer gets 2 face-down.' },
  { title: 'Four Chances', description: 'Bet 4x pre-flop, 2x after flop, or 1x after river. Check to see more cards for free.' },
  { title: 'Must Play', description: 'After the river, you must Play (1x) or Fold. Dealer needs pair to qualify.' },
];

interface Card { suit: string; rank: string; }

interface UTHState {
  playerCards: Card[];
  dealerCards: Card[];
  communityCards: Card[];
  phase: 'betting' | 'preflop' | 'flop' | 'river' | 'showdown' | 'result';
  canBet4x: boolean;
  canBet2x: boolean;
  hasBet: boolean;
  message: string;
  handRank: string;
}

export function UltimateHoldemScreen() {
  const [state, setState] = useState<UTHState>({
    playerCards: [],
    dealerCards: [],
    communityCards: [],
    phase: 'betting',
    canBet4x: true,
    canBet2x: false,
    hasBet: false,
    message: 'ANTE & BLIND TO START',
    handRank: '',
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const { send } = useWebSocket(WS_URL);

  useEffect(() => {
    AsyncStorage.getItem('tutorial_ultimateholdem_completed').then((done) => {
      if (!done) setShowTutorial(true);
    });
  }, []);

  const handleDeal = async () => {
    await haptics.betConfirm();
    setState(s => ({ ...s, phase: 'preflop', message: 'YOUR CARDS' }));
    send({ action: 'uth_deal' });
  };

  const handleBet = async (multiplier: number) => {
    await haptics.betConfirm();
    setState(s => ({ ...s, hasBet: true, message: 'BET PLACED' }));
    send({ action: 'uth_bet', multiplier });
  };

  const handleCheck = async () => {
    await haptics.chipPlace();
    send({ action: 'uth_check' });
  };

  const handleFold = async () => {
    await haptics.chipPlace();
    send({ action: 'uth_fold' });
  };

  const handleNewGame = () => {
    setState({
      playerCards: [],
      dealerCards: [],
      communityCards: [],
      phase: 'betting',
      canBet4x: true,
      canBet2x: false,
      hasBet: false,
      message: 'ANTE & BLIND TO START',
      handRank: '',
    });
  };

  const visibleCommunity = state.phase === 'preflop' ? 0 :
    state.phase === 'flop' ? 3 : 5;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HelpButton onPress={() => setShowTutorial(true)} />
        <Text style={styles.title}>ULTIMATE TEXAS HOLD'EM</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Dealer Cards */}
      <View style={styles.dealerSection}>
        <Text style={styles.sectionLabel}>DEALER</Text>
        <View style={styles.cardsRow}>
          {state.dealerCards.length > 0 ? (
            state.dealerCards.map((card, i) => (
              <CardComponent
                key={i}
                suit={card.suit}
                rank={card.rank}
                faceUp={state.phase === 'showdown' || state.phase === 'result'}
              />
            ))
          ) : (
            Array(2).fill(0).map((_, i) => <View key={i} style={styles.emptyCard} />)
          )}
        </View>
      </View>

      {/* Community Cards */}
      <View style={styles.communitySection}>
        <View style={styles.communityRow}>
          {Array(5).fill(0).map((_, i) => (
            i < state.communityCards.length && i < visibleCommunity ? (
              <Animated.View key={i} entering={FadeIn.delay(i * 150)}>
                <CardComponent
                  suit={state.communityCards[i].suit}
                  rank={state.communityCards[i].rank}
                  faceUp
                />
              </Animated.View>
            ) : (
              <View key={i} style={styles.communitySlot} />
            )
          ))}
        </View>
      </View>

      {/* Message */}
      <Text style={styles.message}>{state.message}</Text>
      {state.handRank && <Text style={styles.handRank}>{state.handRank}</Text>}

      {/* Player Cards */}
      <View style={styles.playerSection}>
        <Text style={styles.sectionLabel}>YOUR HAND</Text>
        <View style={styles.cardsRow}>
          {state.playerCards.length > 0 ? (
            state.playerCards.map((card, i) => (
              <Animated.View key={i} entering={SlideInUp.delay(i * 100)}>
                <CardComponent suit={card.suit} rank={card.rank} faceUp />
              </Animated.View>
            ))
          ) : (
            Array(2).fill(0).map((_, i) => <View key={i} style={styles.emptyCard} />)
          )}
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {state.phase === 'betting' && (
          <PrimaryButton label="ANTE & BLIND" onPress={handleDeal} />
        )}

        {state.phase === 'preflop' && !state.hasBet && (
          <View style={styles.actionRow}>
            <PrimaryButton label="CHECK" onPress={handleCheck} variant="secondary" style={styles.actionButton} />
            <PrimaryButton label="BET 4X" onPress={() => handleBet(4)} style={styles.actionButton} />
          </View>
        )}

        {state.phase === 'flop' && !state.hasBet && (
          <View style={styles.actionRow}>
            <PrimaryButton label="CHECK" onPress={handleCheck} variant="secondary" style={styles.actionButton} />
            <PrimaryButton label="BET 2X" onPress={() => handleBet(2)} style={styles.actionButton} />
          </View>
        )}

        {state.phase === 'river' && !state.hasBet && (
          <View style={styles.actionRow}>
            <PrimaryButton label="FOLD" onPress={handleFold} variant="danger" style={styles.actionButton} />
            <PrimaryButton label="PLAY 1X" onPress={() => handleBet(1)} style={styles.actionButton} />
          </View>
        )}

        {state.hasBet && state.phase !== 'result' && (
          <Text style={styles.waitMessage}>WAITING FOR REVEAL...</Text>
        )}

        {state.phase === 'result' && (
          <PrimaryButton label="NEW GAME" onPress={handleNewGame} />
        )}
      </View>

      {showTutorial && (
        <TutorialOverlay gameId="ultimateholdem" steps={UTH_TUTORIAL} onComplete={() => setShowTutorial(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 48 },
  title: { color: '#888', fontSize: 9, letterSpacing: 2 },
  dealerSection: { alignItems: 'center', paddingTop: 16 },
  sectionLabel: { color: '#666', fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  cardsRow: { flexDirection: 'row', gap: 8 },
  emptyCard: { width: 50, height: 70, borderRadius: 6, borderWidth: 2, borderStyle: 'dashed', borderColor: '#333' },
  communitySection: { alignItems: 'center', paddingVertical: 24 },
  communityRow: { flexDirection: 'row', gap: 6 },
  communitySlot: { width: 44, height: 62, borderRadius: 4, borderWidth: 1, borderColor: '#222' },
  message: { color: '#888', fontSize: 14, textAlign: 'center', letterSpacing: 2 },
  handRank: { color: '#FFD700', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
  playerSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  controls: { padding: 24, paddingBottom: 48 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1 },
  waitMessage: { color: '#666', fontSize: 14, textAlign: 'center', letterSpacing: 2 },
});
```

## Phase 3: Polish & Optimization (Week 7-8)

### 3.1 Performance Optimization

```typescript
// mobile/src/utils/performance.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// Detect device tier for adaptive quality
export function getDeviceTier(): 'low' | 'mid' | 'high' {
  if (Platform.OS === 'web') return 'high';

  // totalMemory is a synchronous property in expo-device
  const totalMemory = Device.totalMemory;

  // If we can't detect memory, default to mid tier
  if (totalMemory === null) return 'mid';

  if (totalMemory < 3 * 1024 * 1024 * 1024) return 'low';  // < 3GB
  if (totalMemory < 6 * 1024 * 1024 * 1024) return 'mid';  // < 6GB
  return 'high';
}

// Animation quality settings per tier
export const ANIMATION_CONFIG = {
  low: {
    cardFlipDuration: 400,
    diceRollDuration: 2000,
    particleCount: 0,
    use3D: false,
  },
  mid: {
    cardFlipDuration: 300,
    diceRollDuration: 2500,
    particleCount: 20,
    use3D: false,
  },
  high: {
    cardFlipDuration: 250,
    diceRollDuration: 3000,
    particleCount: 50,
    use3D: true,
  },
};
```

### 3.2 Accessibility

```typescript
// mobile/src/components/ui/AccessibleButton.tsx
import { Pressable, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

interface AccessibleButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function AccessibleButton({
  label,
  onPress,
  disabled,
  accessibilityHint,
}: AccessibleButtonProps) {
  const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setIsScreenReaderEnabled);

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setIsScreenReaderEnabled
    );

    return () => subscription.remove();
  }, []);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,   // WCAG minimum touch target
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#00ff00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: '#00ff00',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: '#00ff00',
    fontSize: 16,
    fontFamily: 'JetBrainsMono',
    fontWeight: 'bold',
  },
});
```

### 3.3 EAS Build Configuration

```json
// mobile/eas.json
{
  "cli": {
    "version": ">= 8.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "channel": "preview"
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "internal"
      }
    }
  }
}
```

```json
// mobile/app.json
{
  "expo": {
    "name": "Nullspace",
    "slug": "nullspace",
    "version": "1.0.0",
    "orientation": "default",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0a0a0a"
    },
    "assetBundlePatterns": ["**/*"],
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0a0a0a"
      },
      "package": "com.nullspace.casino",
      "versionCode": 1,
      "permissions": [
        "USE_BIOMETRIC",
        "USE_FINGERPRINT",
        "VIBRATE"
      ]
    },
    "plugins": [
      "expo-localization",
      "expo-secure-store",
      "expo-haptics",
      "expo-local-authentication",
      [
        "expo-build-properties",
        {
          "android": {
            "compileSdkVersion": 35,
            "targetSdkVersion": 35,
            "minSdkVersion": 26,
            "enableMinifyInReleaseBuilds": true,
            "enableShrinkResourcesInReleaseBuilds": true
          }
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

---

## Game Implementation Order

Implement games in order of complexity to build shared components incrementally:

### Tier 1: Simple Games (Week 3)
1. **Hi-Lo** - Single card, binary choice, minimal UI
2. **Casino War** - Single bet, card comparison

### Tier 2: Multi-Bet Games (Week 4)
3. **Roulette** - Multiple bet zones, wheel animation
4. **Sic Bo** - Dice animation, multiple bet types

### Tier 3: Decision Games (Week 5)
5. **Blackjack** - Hit/Stand/Double/Split decisions
6. **Video Poker** - Hold/Draw, hand evaluation
7. **Baccarat** - Banker/Player/Tie, side bets

### Tier 4: Complex Games (Week 6)
8. **Craps** - Most complex UI, 40+ bet types, pass line logic
9. **Three Card Poker** - Ante/Play, pair plus
10. **Ultimate Texas Hold'em** - Multi-round betting, community cards

---

## Testing Strategy

### Unit Tests (Jest)
- Game logic (bet validation, win calculation)
- Crypto functions (signing, key generation)
- State management (Zustand stores)

### Component Tests (React Native Testing Library)
- Chip selector interactions
- Card animations
- Button states

### E2E Tests (Detox)
- Complete game flow (bet → play → result)
- Auth flow (biometric → lobby)
- Network failure recovery
- Background/foreground handling

### Device Testing Matrix
| Device | Android Version | RAM | Target FPS |
|--------|-----------------|-----|------------|
| Pixel 3a | Android 12 | 4GB | 60fps |
| Galaxy A52 | Android 13 | 6GB | 60fps |
| Redmi Note 10 | Android 11 | 4GB | 60fps |
| Low-end (emulator) | Android 10 | 2GB | 30fps |

---

## Monorepo Structure (Final)

```
nullspace/
├── packages/
│   └── shared/                  # Extracted shared code
│       ├── types/               # TypeScript types from Rust
│       ├── game-logic/          # Bet validation, win calc
│       ├── api-client/          # HTTP + WebSocket client
│       └── utils/               # Chip math, formatting
├── website/                     # Existing React web app
│   └── (uses packages/shared)
├── mobile/                      # New React Native app
│   └── (uses packages/shared)
├── execution/                   # Rust game execution (unchanged)
├── types/                       # Rust types (source of truth)
└── ...
```

---

## Questions Requiring Clarification Before Implementation

### CRITICAL (Blocks Week 1)
1. **Auth flow:** Confirm biometric-only or allow PIN fallback
2. **Signing approach:** Confirm `@noble/ed25519` is acceptable (no native module)
3. **WebSocket protocol:** Confirm message schemas match web app

### IMPORTANT (Blocks Week 3)
4. **Haptic patterns:** Finalize haptic feedback for each event type
5. **Animation durations:** Confirm card flip (300ms), dice roll (2.5s), wheel spin (4s)
6. **Chip denominations:** Confirm fixed set or dynamic based on balance

### NICE-TO-HAVE (Before Release)
7. **Sound effects:** Include audio assets or v1 is silent?
8. **Landscape mode:** All games or portrait-only?
9. **Tablet layouts:** Custom UI for 10"+ screens?

---

## MVP Definition

**MVP (Week 4 checkpoint):** Android APK with:
- [ ] Biometric auth + key generation
- [ ] WebSocket connection to backend
- [ ] 3 games playable: Hi-Lo, Casino War, Blackjack
- [ ] Haptic feedback for bets/wins/losses
- [ ] 60fps animations on mid-range device
- [ ] Offline detection with retry prompt

**Full Release (Week 8):** All 10 games + polish + beta testing

---

*Plan generated: 2025-12-26*
