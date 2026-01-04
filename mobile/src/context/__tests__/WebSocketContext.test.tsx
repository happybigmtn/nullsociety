import React from 'react';
import { act, create } from 'react-test-renderer';
import { WebSocketProvider, useWebSocketContext } from '../WebSocketContext';

const mockManager = {
  isConnected: true,
  connectionState: 'connected',
  reconnectAttempt: 0,
  maxReconnectAttempts: 5,
  lastMessage: null,
  send: jest.fn(),
  reconnect: jest.fn(),
};

jest.mock('../../services/websocket', () => ({
  useWebSocket: jest.fn(() => mockManager),
  getWebSocketUrl: jest.fn(() => 'ws://test'),
}));

describe('WebSocketContext', () => {
  it('provides manager from hook', () => {
    let value: unknown;
    const Consumer = () => {
      value = useWebSocketContext();
      return null;
    };

    act(() => {
      create(
        <WebSocketProvider>
          <Consumer />
        </WebSocketProvider>
      );
    });

    expect(value).toBe(mockManager);
  });
});
