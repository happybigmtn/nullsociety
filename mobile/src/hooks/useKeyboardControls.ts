/**
 * Keyboard Controls Hook
 * Hardware keyboard support for tablets/desktop testing
 */
import { useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';

// Common key mappings for casino games
export const KEY_ACTIONS = {
  // Universal
  SPACE: 'deal_action', // Primary action (deal, spin, roll)
  ENTER: 'confirm', // Confirm bet/action
  ESCAPE: 'cancel', // Cancel/clear bet
  BACKSPACE: 'undo', // Undo last action

  // Blackjack
  H: 'hit',
  S: 'stand',
  D: 'double',
  P: 'split',

  // Hi-Lo / Binary choices
  UP: 'higher',
  DOWN: 'lower',
  LEFT: 'player', // Baccarat
  RIGHT: 'banker', // Baccarat

  // Chip selection (number keys)
  ONE: 'chip_1',
  TWO: 'chip_5',
  THREE: 'chip_25',
  FOUR: 'chip_100',
  FIVE: 'chip_500',

  // Roulette colors
  R: 'red',
  B: 'black',
  G: 'green',

  // Help
  QUESTION: 'help',
} as const;

export type KeyAction = (typeof KEY_ACTIONS)[keyof typeof KEY_ACTIONS];

interface KeyboardControlsOptions {
  onAction?: (action: KeyAction) => void;
  enabled?: boolean;
}

/**
 * Hook for handling hardware keyboard input
 * Primarily useful for tablet users with Bluetooth keyboards
 * and for desktop web development/testing
 */
export function useKeyboardControls(options: KeyboardControlsOptions = {}) {
  const { onAction, enabled = true } = options;
  const handlersRef = useRef<Map<KeyAction, () => void>>(new Map());

  // Register a handler for a specific action
  const registerHandler = useCallback((action: KeyAction, handler: () => void) => {
    handlersRef.current.set(action, handler);
    return () => {
      handlersRef.current.delete(action);
    };
  }, []);

  // Handle key press
  const handleKeyPress = useCallback((event: { key: string }) => {
    if (!enabled) return;

    const key = event.key.toUpperCase();
    let action: KeyAction | null = null;

    // Map key to action
    switch (key) {
      case ' ':
        action = KEY_ACTIONS.SPACE;
        break;
      case 'ENTER':
        action = KEY_ACTIONS.ENTER;
        break;
      case 'ESCAPE':
        action = KEY_ACTIONS.ESCAPE;
        break;
      case 'BACKSPACE':
        action = KEY_ACTIONS.BACKSPACE;
        break;
      case 'H':
        action = KEY_ACTIONS.H;
        break;
      case 'S':
        action = KEY_ACTIONS.S;
        break;
      case 'D':
        action = KEY_ACTIONS.D;
        break;
      case 'P':
        action = KEY_ACTIONS.P;
        break;
      case 'ARROWUP':
        action = KEY_ACTIONS.UP;
        break;
      case 'ARROWDOWN':
        action = KEY_ACTIONS.DOWN;
        break;
      case 'ARROWLEFT':
        action = KEY_ACTIONS.LEFT;
        break;
      case 'ARROWRIGHT':
        action = KEY_ACTIONS.RIGHT;
        break;
      case '1':
        action = KEY_ACTIONS.ONE;
        break;
      case '2':
        action = KEY_ACTIONS.TWO;
        break;
      case '3':
        action = KEY_ACTIONS.THREE;
        break;
      case '4':
        action = KEY_ACTIONS.FOUR;
        break;
      case '5':
        action = KEY_ACTIONS.FIVE;
        break;
      case 'R':
        action = KEY_ACTIONS.R;
        break;
      case 'B':
        action = KEY_ACTIONS.B;
        break;
      case 'G':
        action = KEY_ACTIONS.G;
        break;
      case '?':
        action = KEY_ACTIONS.QUESTION;
        break;
      default:
        break;
    }

    if (action) {
      // Call registered handler if exists
      const handler = handlersRef.current.get(action);
      if (handler) {
        handler();
      }

      // Also call global callback
      onAction?.(action);
    }
  }, [enabled, onAction]);

  useEffect(() => {
    // Note: React Native doesn't have native keyboard event listeners
    // like web. This would need to be implemented with native modules
    // or using a library like react-native-keyevent for full support.
    // For now, this is a placeholder that could be extended.

    // On web (Expo Web), we could use:
    if (Platform.OS === 'web') {
      const webHandler = (e: globalThis.KeyboardEvent) => {
        handleKeyPress({ key: e.key });
      };
      window.addEventListener('keydown', webHandler);
      return () => window.removeEventListener('keydown', webHandler);
    }

    // For native, this would need native module integration
    // Libraries like react-native-keyevent could be added
    return undefined;
  }, [handleKeyPress]);

  return {
    registerHandler,
    KEY_ACTIONS,
  };
}

/**
 * Simplified hook for common game shortcuts
 * Uses a ref to avoid re-registration when handlers change reference
 */
export function useGameKeyboard(handlers: Partial<Record<KeyAction, () => void>>) {
  const { registerHandler } = useKeyboardControls({ enabled: true });
  const handlersRef = useRef(handlers);

  // Keep ref in sync with latest handlers (avoids stale closures)
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Get handler keys once at registration time
    const actionKeys = Object.keys(handlersRef.current) as KeyAction[];

    actionKeys.forEach((action) => {
      // Create stable wrapper that reads from ref
      const unsubscribe = registerHandler(action, () => {
        handlersRef.current[action]?.();
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [registerHandler]);
}
