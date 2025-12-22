/**
 * GuidedStore - Zustand store with transient updates for 60 FPS physics
 *
 * Key design:
 * - Transient updates: useFrame subscribes without causing React re-renders
 * - Per-game slices: Each game type has its own round state
 * - Chain integration: Actions for receiving chain events
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Vector3 } from 'three';
import type {
  GuidedRound,
  RoundPhase,
  RouletteOutcome,
  CrapsOutcome,
  SicBoOutcome,
  BlackjackOutcome,
  BaccaratOutcome,
} from './GuidedRound';
import { createIdleRound, transitionPhase } from './GuidedRound';
import { generateRoundSeed } from './deterministicRng';
import { getPhaseTimings } from './timeStep';

// ─────────────────────────────────────────────────────────────────────────────
// Store State Type
// ─────────────────────────────────────────────────────────────────────────────

export interface GuidedStoreState {
  // Per-game round state
  roulette: GuidedRound<RouletteOutcome>;
  craps: GuidedRound<CrapsOutcome>;
  sicbo: GuidedRound<SicBoOutcome>;
  blackjack: GuidedRound<BlackjackOutcome>;
  baccarat: GuidedRound<BaccaratOutcome>;

  // Global state
  globalMuted: boolean;
  debugMode: boolean;

  // Transient subscribers (for useFrame without React re-renders)
  transientSubscribers: Set<() => void>;
}

export interface GuidedStoreActions {
  // Round lifecycle
  startRound: <T>(
    gameType: keyof GameRoundTypes,
    roundId: number,
    launchImpulse?: Vector3
  ) => void;

  setPhase: (gameType: keyof GameRoundTypes, phase: RoundPhase) => void;

  receiveOutcome: <T>(gameType: keyof GameRoundTypes, outcome: T) => void;

  requestSkip: (gameType: keyof GameRoundTypes) => void;

  setAnimationBlocking: (gameType: keyof GameRoundTypes, blocking: boolean) => void;

  resetRound: (gameType: keyof GameRoundTypes, roundId: number) => void;

  // Global controls
  setGlobalMuted: (muted: boolean) => void;
  setDebugMode: (debug: boolean) => void;

  // Transient updates (call from useFrame)
  notifyTransient: () => void;
  subscribeTransient: (callback: () => void) => () => void;
}

// Type mapping for game-specific outcomes
type GameRoundTypes = {
  roulette: RouletteOutcome;
  craps: CrapsOutcome;
  sicbo: SicBoOutcome;
  blackjack: BlackjackOutcome;
  baccarat: BaccaratOutcome;
};

export type GuidedStore = GuidedStoreState & GuidedStoreActions;

// ─────────────────────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────────────────────

const createInitialState = (): GuidedStoreState => ({
  roulette: createIdleRound<RouletteOutcome>(0, generateRoundSeed('roulette', 0)),
  craps: createIdleRound<CrapsOutcome>(0, generateRoundSeed('craps', 0)),
  sicbo: createIdleRound<SicBoOutcome>(0, generateRoundSeed('sicbo', 0)),
  blackjack: createIdleRound<BlackjackOutcome>(0, generateRoundSeed('blackjack', 0)),
  baccarat: createIdleRound<BaccaratOutcome>(0, generateRoundSeed('baccarat', 0)),
  globalMuted: false,
  debugMode: false,
  transientSubscribers: new Set(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Store Implementation
// ─────────────────────────────────────────────────────────────────────────────

export const useGuidedStore = create<GuidedStore>()(
  subscribeWithSelector((set, get) => ({
    ...createInitialState(),

    // ─────────────────────────────────────────────────────────────────────────
    // Round Lifecycle Actions
    // ─────────────────────────────────────────────────────────────────────────

    startRound: (gameType, roundId, launchImpulse) => {
      const timings = getPhaseTimings(gameType);
      const seed = generateRoundSeed(gameType, roundId);
      const now = Date.now();

      set((state) => ({
        [gameType]: {
          roundId,
          phase: 'launch' as RoundPhase,
          seed,
          startTime: now,
          phaseStartTime: now,
          launchImpulse,
          targetOutcome: undefined,
          pendingOutcome: undefined,
          actualOutcome: undefined,
          minAnimationDuration: timings.minDuration,
          maxAnimationDuration: timings.maxDuration,
          isAnimationBlocking: true,
          skipRequested: false,
        },
      }));

      get().notifyTransient();
    },

    setPhase: (gameType, phase) => {
      set((state) => ({
        [gameType]: transitionPhase(state[gameType] as GuidedRound<unknown>, phase),
      }));
      get().notifyTransient();
    },

    receiveOutcome: (gameType, outcome) => {
      set((state) => {
        const round = state[gameType];
        const now = Date.now();
        const elapsed = now - round.startTime;

        // If still in early animation, store as pending
        if (elapsed < round.minAnimationDuration && round.phase !== 'settle') {
          return {
            [gameType]: {
              ...round,
              pendingOutcome: outcome,
            },
          };
        }

        // Otherwise set as target and transition to settle
        return {
          [gameType]: {
            ...round,
            targetOutcome: outcome,
            phase: round.phase === 'reveal' ? 'reveal' : 'settle',
            phaseStartTime: now,
          },
        };
      });

      get().notifyTransient();
    },

    requestSkip: (gameType) => {
      set((state) => ({
        [gameType]: {
          ...state[gameType],
          skipRequested: true,
        },
      }));
      get().notifyTransient();
    },

    setAnimationBlocking: (gameType, blocking) => {
      set((state) => ({
        [gameType]: {
          ...state[gameType],
          isAnimationBlocking: blocking,
        },
      }));
      get().notifyTransient();
    },

    resetRound: (gameType, roundId) => {
      const seed = generateRoundSeed(gameType, roundId);
      set({
        [gameType]: createIdleRound(roundId, seed),
      });
      get().notifyTransient();
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Global Controls
    // ─────────────────────────────────────────────────────────────────────────

    setGlobalMuted: (muted) => set({ globalMuted: muted }),

    setDebugMode: (debug) => set({ debugMode: debug }),

    // ─────────────────────────────────────────────────────────────────────────
    // Transient Updates (for useFrame subscription)
    // ─────────────────────────────────────────────────────────────────────────

    notifyTransient: () => {
      const { transientSubscribers } = get();
      transientSubscribers.forEach((callback) => callback());
    },

    subscribeTransient: (callback) => {
      const { transientSubscribers } = get();
      transientSubscribers.add(callback);
      return () => transientSubscribers.delete(callback);
    },
  }))
);

// ─────────────────────────────────────────────────────────────────────────────
// Selector Hooks (for React components that need specific slices)
// ─────────────────────────────────────────────────────────────────────────────

export const useRouletteRound = () => useGuidedStore((s) => s.roulette);
export const useCrapsRound = () => useGuidedStore((s) => s.craps);
export const useSicBoRound = () => useGuidedStore((s) => s.sicbo);
export const useBlackjackRound = () => useGuidedStore((s) => s.blackjack);
export const useBaccaratRound = () => useGuidedStore((s) => s.baccarat);

// ─────────────────────────────────────────────────────────────────────────────
// Transient Hook (for useFrame - no React re-renders)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Use in useFrame to get current state without React re-renders.
 * Returns a getter function, not the state directly.
 */
export function useTransientRound<T extends keyof GameRoundTypes>(
  gameType: T
): () => GuidedRound<GameRoundTypes[T]> {
  return () => useGuidedStore.getState()[gameType] as GuidedRound<GameRoundTypes[T]>;
}

/**
 * Subscribe to transient updates (use in useEffect)
 */
export function useTransientSubscription(callback: () => void): void {
  const subscribe = useGuidedStore((s) => s.subscribeTransient);
  // Note: Caller should wrap in useEffect
  subscribe(callback);
}
