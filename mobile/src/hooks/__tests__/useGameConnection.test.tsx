import React from 'react';
import { act, create } from 'react-test-renderer';
import { useGameConnection } from '../useGameConnection';
import { useWebSocketContext } from '../../context/WebSocketContext';

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

jest.mock('../../context/WebSocketContext', () => ({
  useWebSocketContext: jest.fn(),
}));

const mockUseWebSocketContext = useWebSocketContext as jest.Mock;

describe('useGameConnection', () => {
  beforeEach(() => {
    mockUseWebSocketContext.mockReset();
  });

  it('exposes connection props from context', () => {
    const send = jest.fn();
    const reconnect = jest.fn();
    const lastMessage = { type: 'ping' };

    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'connected',
      reconnectAttempt: 2,
      maxReconnectAttempts: 10,
      send,
      lastMessage,
      reconnect,
    });

    const { getResult, unmount } = renderHook(() => useGameConnection());

    expect(getResult().isDisconnected).toBe(false);
    expect(getResult().send).toBe(send);
    expect(getResult().lastMessage).toBe(lastMessage);
    expect(getResult().connectionStatusProps).toEqual({
      connectionState: 'connected',
      reconnectAttempt: 2,
      maxReconnectAttempts: 10,
      onRetry: reconnect,
    });
    unmount();
  });

  it('marks non-connected states as disconnected', () => {
    mockUseWebSocketContext.mockReturnValue({
      connectionState: 'failed',
      reconnectAttempt: 0,
      maxReconnectAttempts: 10,
      send: jest.fn(),
      lastMessage: null,
      reconnect: jest.fn(),
    });

    const { getResult, unmount } = renderHook(() => useGameConnection());

    expect(getResult().isDisconnected).toBe(true);
    unmount();
  });
});
