import React from 'react';
import { act, create } from 'react-test-renderer';
import { useGatewaySession } from '../useGatewaySession';
import { useWebSocketContext } from '../../context/WebSocketContext';
import { useGameStore } from '../../stores/gameStore';
import { initAnalytics, setAnalyticsContext, track } from '../../services/analytics';

jest.mock('../../context/WebSocketContext', () => ({
  useWebSocketContext: jest.fn(),
}));

jest.mock('../../services/analytics', () => ({
  initAnalytics: jest.fn(),
  setAnalyticsContext: jest.fn(),
  track: jest.fn(),
}));

jest.mock('../../stores/gameStore', () => ({
  useGameStore: jest.fn(),
}));

const mockUseWebSocketContext = useWebSocketContext as jest.Mock;
const mockUseGameStore = useGameStore as jest.Mock;

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

describe('useGatewaySession', () => {
  let store: {
    setBalance: jest.Mock;
    setBalanceReady: jest.Mock;
    setSessionInfo: jest.Mock;
    setFaucetStatus: jest.Mock;
    faucetStatus: 'idle' | 'pending' | 'success' | 'error';
  };

  beforeEach(() => {
    store = {
      setBalance: jest.fn(),
      setBalanceReady: jest.fn(),
      setSessionInfo: jest.fn(),
      setFaucetStatus: jest.fn((status: typeof store.faucetStatus) => {
        store.faucetStatus = status;
      }),
      faucetStatus: 'idle',
    };

    mockUseGameStore.mockImplementation((selector: (state: typeof store) => unknown) => selector(store));
    mockUseWebSocketContext.mockReset();
    (initAnalytics as jest.Mock).mockClear();
    (setAnalyticsContext as jest.Mock).mockClear();
    (track as jest.Mock).mockClear();
  });

  it('requests balance on connect and initializes analytics', () => {
    const send = jest.fn();
    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'connected',
      send,
      lastMessage: null,
    });

    const { unmount } = renderHook(() => useGatewaySession());

    expect(initAnalytics).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: 'get_balance' });
    unmount();
  });

  it('handles session_ready and balance updates', () => {
    const send = jest.fn();
    const sessionMessage = {
      type: 'session_ready',
      sessionId: 'session-1',
      publicKey: 'pub',
      registered: true,
      hasBalance: true,
      balance: '100',
    };
    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'connected',
      send,
      lastMessage: sessionMessage,
    });

    const { getResult, rerender, unmount } = renderHook(() => useGatewaySession());

    expect(store.setSessionInfo).toHaveBeenCalledWith({
      sessionId: 'session-1',
      publicKey: 'pub',
      registered: true,
      hasBalance: true,
    });
    expect(setAnalyticsContext).toHaveBeenCalledWith({ publicKey: 'pub' });
    expect(track).toHaveBeenCalledWith('casino.session.started', expect.objectContaining({
      source: 'mobile',
      registered: true,
      hasBalance: true,
    }));
    expect(store.setBalance).toHaveBeenCalledWith(100);
    expect(store.setBalanceReady).toHaveBeenCalledWith(true);
    expect(send).toHaveBeenCalledWith({ type: 'get_balance' });
    rerender();
    expect(getResult().sessionId).toBe('session-1');
    unmount();
  });

  it('handles faucet claim and error state', () => {
    const send = jest.fn();
    store.faucetStatus = 'pending';
    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'connected',
      send,
      lastMessage: { type: 'error', message: 'Denied' },
    });

    renderHook(() => useGatewaySession());

    expect(store.setFaucetStatus).toHaveBeenCalledWith('error', 'Denied');
  });

  it('tracks completed games and updates balance', () => {
    const send = jest.fn();
    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'connected',
      send,
      lastMessage: {
        type: 'game_result',
        gameType: 'blackjack',
        won: true,
        payout: '50',
        finalChips: '150',
        sessionId: 'session-1',
      },
    });

    renderHook(() => useGatewaySession());

    expect(track).toHaveBeenCalledWith('casino.game.completed', expect.objectContaining({
      source: 'mobile',
      gameType: 'blackjack',
      won: true,
      sessionId: 'session-1',
    }));
    expect(store.setBalance).toHaveBeenCalledWith(150);
    expect(store.setBalanceReady).toHaveBeenCalledWith(true);
  });

  it('sends faucet requests with optional amount', () => {
    const send = jest.fn();
    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'disconnected',
      send,
      lastMessage: null,
    });

    const { getResult } = renderHook(() => useGatewaySession());
    act(() => {
      getResult().requestFaucet();
    });
    act(() => {
      getResult().requestFaucet(500);
    });

    expect(store.setFaucetStatus).toHaveBeenCalledWith('pending', 'Requesting faucet...');
    expect(send).toHaveBeenCalledWith({ type: 'faucet_claim' });
    expect(send).toHaveBeenCalledWith({ type: 'faucet_claim', amount: 500 });
  });
});
