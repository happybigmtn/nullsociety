import React from 'react';
import { act, create } from 'react-test-renderer';
import { useWebSocketReconnectOnForeground } from '../useWebSocketReconnectOnForeground';
import { useWebSocketContext } from '../../context/WebSocketContext';

jest.mock('../../context/WebSocketContext', () => ({
  useWebSocketContext: jest.fn(),
}));

let appStateHandler: ((state: string) => void) | null = null;

jest.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: (_event: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    },
  },
}));

const mockUseWebSocketContext = useWebSocketContext as jest.Mock;

describe('useWebSocketReconnectOnForeground', () => {
  beforeEach(() => {
    appStateHandler = null;
  });

  it('reconnects when returning to foreground while disconnected', () => {
    const reconnect = jest.fn();
    mockUseWebSocketContext.mockReturnValue({
      reconnect,
      connectionState: 'disconnected',
    });

    const TestComponent = () => {
      useWebSocketReconnectOnForeground();
      return null;
    };

    act(() => {
      create(<TestComponent />);
    });

    act(() => {
      appStateHandler?.('active');
    });

    expect(reconnect).toHaveBeenCalled();
  });
});
