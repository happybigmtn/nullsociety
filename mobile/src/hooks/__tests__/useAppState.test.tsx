import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useAppState } from '../useAppState';
import { useGameStore } from '../../stores/gameStore';
import { STORAGE_KEYS } from '../../services/storage';

const mockInitializeStorage = jest.fn();
const mockGetStorage = jest.fn();

jest.mock('../../services/storage', () => ({
  STORAGE_KEYS: {
    CACHED_BALANCE: 'cache.balance',
    SELECTED_CHIP: 'user.selected_chip',
    LAST_SYNC: 'cache.last_sync',
  },
  initializeStorage: (...args: unknown[]) => mockInitializeStorage(...args),
  getStorage: (...args: unknown[]) => mockGetStorage(...args),
}));

function renderHook(hook: () => void) {
  const TestComponent = () => {
    hook();
    return null;
  };
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TestComponent />);
  });
  return {
    unmount: () => act(() => renderer.unmount()),
  };
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('useAppState', () => {
  const initialState = useGameStore.getState();
  const originalAppState = AppState.currentState;
  let changeHandler: ((state: string) => void) | null = null;
  let removeSpy: jest.Mock;
  let storageData: Map<string, number>;
  let storage: { set: jest.Mock; getNumber: jest.Mock };

  beforeEach(() => {
    storageData = new Map();
    storage = {
      set: jest.fn((key: string, value: number) => {
        storageData.set(key, value);
      }),
      getNumber: jest.fn((key: string) => storageData.get(key)),
    };
    mockInitializeStorage.mockResolvedValue(storage);
    mockGetStorage.mockReturnValue(storage);
    removeSpy = jest.fn();
    changeHandler = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      changeHandler = handler;
      return { remove: removeSpy };
    });
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: originalAppState,
    });
    useGameStore.setState(initialState, true);
  });

  it('persists and restores game state on app transitions', async () => {
    useGameStore.setState({ balance: 500, selectedChip: 25 }, false);
    renderHook(() => useAppState());
    await act(async () => {
      await flushPromises();
    });

    expect(changeHandler).toBeTruthy();
    changeHandler?.('background');

    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.CACHED_BALANCE, 500);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.SELECTED_CHIP, 25);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.LAST_SYNC, expect.any(Number));

    storageData.set(STORAGE_KEYS.CACHED_BALANCE, 750);
    storageData.set(STORAGE_KEYS.SELECTED_CHIP, 100);

    useGameStore.setState({ balance: 0, selectedChip: 1 }, false);
    changeHandler?.('active');

    const state = useGameStore.getState();
    expect(state.balance).toBe(750);
    expect(state.selectedChip).toBe(100);
  });

  it('ignores invalid cached chip values and handles missing storage', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetStorage.mockImplementation(() => {
      throw new Error('not ready');
    });
    renderHook(() => useAppState());
    await act(async () => {
      await flushPromises();
    });

    expect(changeHandler).toBeTruthy();
    changeHandler?.('background');
    changeHandler?.('active');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips invalid cached chip values on restore', async () => {
    renderHook(() => useAppState());
    await act(async () => {
      await flushPromises();
    });

    changeHandler?.('background');
    storageData.set(STORAGE_KEYS.CACHED_BALANCE, 250);
    storageData.set(STORAGE_KEYS.SELECTED_CHIP, 9999);
    changeHandler?.('active');

    const state = useGameStore.getState();
    expect(state.balance).toBe(250);
    expect(state.selectedChip).not.toBe(9999);
  });
});
