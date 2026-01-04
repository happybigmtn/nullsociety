import React from 'react';
import { act, create } from 'react-test-renderer';
import { GameLayout } from '../GameLayout';

const mockGameHeader = jest.fn(() => null);
const mockConnectionStatusBanner = jest.fn(() => null);

jest.mock('../GameHeader', () => ({
  GameHeader: (props: Record<string, unknown>) => mockGameHeader(props),
}));

jest.mock('../../ui/ConnectionStatusBanner', () => ({
  ConnectionStatusBanner: (props: Record<string, unknown>) => mockConnectionStatusBanner(props),
}));

describe('GameLayout', () => {
  beforeEach(() => {
    mockGameHeader.mockClear();
    mockConnectionStatusBanner.mockClear();
  });

  it('passes session delta to header and renders connection status', () => {
    const connectionStatus = {
      connectionState: 'connected',
      reconnectAttempt: 1,
      maxReconnectAttempts: 3,
      onRetry: jest.fn(),
    };

    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <GameLayout title="Test" balance={100} connectionStatus={connectionStatus}>
          {null}
        </GameLayout>
      );
    });

    expect(mockConnectionStatusBanner).toHaveBeenCalled();
    expect(mockGameHeader.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ title: 'Test', balance: 100, sessionDelta: 0 })
    );

    act(() => {
      tree.update(
        <GameLayout title="Test" balance={150} connectionStatus={connectionStatus}>
          {null}
        </GameLayout>
      );
    });

    const lastCall = mockGameHeader.mock.calls[mockGameHeader.mock.calls.length - 1];
    expect(lastCall?.[0]).toEqual(
      expect.objectContaining({ title: 'Test', balance: 150, sessionDelta: 50 })
    );
  });
});
