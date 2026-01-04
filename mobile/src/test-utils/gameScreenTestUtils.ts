import type { ReactTestRenderer } from 'react-test-renderer';
import { act } from 'react-test-renderer';

const resolved = () => Promise.resolve();

export const mockHaptics = {
  betConfirm: jest.fn(resolved),
  buttonPress: jest.fn(resolved),
  chipPlace: jest.fn(resolved),
  diceRoll: jest.fn(resolved),
  error: jest.fn(resolved),
  jackpot: jest.fn(resolved),
  loss: jest.fn(resolved),
  push: jest.fn(resolved),
  selectionChange: jest.fn(resolved),
  wheelSpin: jest.fn(resolved),
  win: jest.fn(resolved),
};

const gameConnectionState = {
  isDisconnected: false,
  send: jest.fn(),
  lastMessage: null as unknown,
  connectionStatusProps: {
    connectionState: 'connected' as const,
    reconnectAttempt: 0,
    maxReconnectAttempts: 3,
    onRetry: jest.fn(),
  },
};

export const mockUseGameConnection = jest.fn(() => gameConnectionState);

export function setGameConnectionMessage(message: unknown) {
  gameConnectionState.lastMessage = message;
}

export function resetGameConnection() {
  gameConnectionState.lastMessage = null;
  gameConnectionState.send.mockClear();
  gameConnectionState.connectionStatusProps.onRetry.mockClear();
}

export const mockUseChipBetting = jest.fn(() => ({
  bet: 0,
  selectedChip: 25,
  balance: 1000,
  setSelectedChip: jest.fn(),
  placeChip: jest.fn(() => true),
  clearBet: jest.fn(),
  setBet: jest.fn(),
}));

export const mockUseGameKeyboard = jest.fn();
export const mockUseModalBackHandler = jest.fn();

jest.mock('../services/haptics', () => ({
  haptics: mockHaptics,
}));

jest.mock('../services/storage', () => ({
  isTutorialCompleted: jest.fn(() => true),
  markTutorialCompleted: jest.fn(),
}));

const mockGameStoreState = { balance: 1000, publicKey: null };

jest.mock('../stores/gameStore', () => ({
  useGameStore: jest.fn((selector?: (state: typeof mockGameStoreState) => unknown) => {
    if (selector) {
      return selector(mockGameStoreState);
    }
    return mockGameStoreState;
  }),
}));

jest.mock('../hooks', () => {
  const actual = jest.requireActual('../hooks');
  return {
    ...actual,
    useGameConnection: (...args: unknown[]) => mockUseGameConnection(...args),
    useChipBetting: (...args: unknown[]) => mockUseChipBetting(...args),
    useGameKeyboard: (...args: unknown[]) => mockUseGameKeyboard(...args),
    useModalBackHandler: (...args: unknown[]) => mockUseModalBackHandler(...args),
  };
});

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      goBack: jest.fn(),
      navigate: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

jest.mock('../components/game/EventBadge', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { EventBadge: () => React.createElement(Text, null, 'Event') };
});

export async function pressAll(tree: ReactTestRenderer) {
  const handlers = tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .map((node) => node.props.onPress);
  for (const handler of handlers) {
    await act(async () => {
      await handler();
    });
  }
}
