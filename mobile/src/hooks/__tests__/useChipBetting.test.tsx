import React from 'react';
import { act, create } from 'react-test-renderer';
import { useChipBetting } from '../useChipBetting';
import { useGameStore } from '../../stores/gameStore';
import { haptics } from '../../services/haptics';

type HookResult<T> = {
  getResult: () => T;
  rerender: () => void;
  unmount: () => void;
};

function renderHook<T>(hook: () => T): HookResult<T> {
  let result!: T;
  const TestComponent = () => {
    result = hook();
    return null;
  };

  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<TestComponent />);
  });

  return {
    getResult: () => result,
    rerender: () => act(() => renderer.update(<TestComponent />)),
    unmount: () => act(() => renderer.unmount()),
  };
}

jest.mock('../../services/haptics', () => ({
  haptics: {
    chipPlace: jest.fn(),
    error: jest.fn(),
  },
}));

const initialState = {
  balance: 0,
  balanceReady: false,
  selectedChip: 25,
  sessionId: null,
  publicKey: null,
  registered: false,
  hasBalance: false,
  faucetStatus: 'idle' as const,
  faucetMessage: null,
};

beforeEach(() => {
  useGameStore.setState(initialState);
  (haptics.chipPlace as jest.Mock).mockClear();
  (haptics.error as jest.Mock).mockClear();
});

describe('useChipBetting', () => {
  it('initializes with defaults and updates selected chip', () => {
    useGameStore.setState({ balance: 100 });
    const { getResult, unmount } = renderHook(() => useChipBetting());

    expect(getResult().bet).toBe(0);
    expect(getResult().selectedChip).toBe(25);
    expect(getResult().balance).toBe(100);

    act(() => {
      getResult().setSelectedChip(100);
    });

    expect(getResult().selectedChip).toBe(100);
    unmount();
  });

  it('places chips within balance and notifies bet changes', () => {
    useGameStore.setState({ balance: 75 });
    const onBetChange = jest.fn();
    const { getResult, unmount } = renderHook(() =>
      useChipBetting({ initialChip: 5, onBetChange })
    );

    let ok = false;
    act(() => {
      ok = getResult().placeChip(25);
    });

    expect(ok).toBe(true);
    expect(haptics.chipPlace).toHaveBeenCalledTimes(1);
    expect(getResult().bet).toBe(25);
    expect(onBetChange).toHaveBeenCalledWith(25);

    act(() => {
      getResult().placeChip(50);
    });

    expect(getResult().bet).toBe(75);
    expect(onBetChange).toHaveBeenCalledWith(75);
    unmount();
  });

  it('rejects chips that exceed balance', () => {
    useGameStore.setState({ balance: 20 });
    const { getResult, unmount } = renderHook(() => useChipBetting());

    let ok = true;
    act(() => {
      ok = getResult().placeChip(25);
    });

    expect(ok).toBe(false);
    expect(getResult().bet).toBe(0);
    expect(haptics.error).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('clears and sets bets explicitly', () => {
    useGameStore.setState({ balance: 300 });
    const onBetChange = jest.fn();
    const { getResult, unmount } = renderHook(() => useChipBetting({ onBetChange }));

    act(() => {
      getResult().setBet(120);
    });

    expect(getResult().bet).toBe(120);
    expect(onBetChange).toHaveBeenCalledWith(120);

    act(() => {
      getResult().clearBet();
    });

    expect(getResult().bet).toBe(0);
    expect(onBetChange).toHaveBeenCalledWith(0);
    unmount();
  });
});
