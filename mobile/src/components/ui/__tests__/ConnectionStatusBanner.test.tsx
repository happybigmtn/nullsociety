import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ConnectionStatusBanner } from '../ConnectionStatusBanner';

describe('ConnectionStatusBanner', () => {
  it('renders nothing when connected', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ConnectionStatusBanner
          connectionState="connected"
          reconnectAttempt={0}
          maxReconnectAttempts={3}
        />
      );
    });

    expect(tree?.toJSON()).toBeNull();
  });

  it('renders retry when failed', () => {
    const onRetry = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ConnectionStatusBanner
          connectionState="failed"
          reconnectAttempt={2}
          maxReconnectAttempts={3}
          onRetry={onRetry}
        />
      );
    });

    const json = JSON.stringify(tree?.toJSON());
    expect(json).toContain('Reconnect');
  });

  it('shows connecting state and attempt count', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ConnectionStatusBanner
          connectionState="connecting"
          reconnectAttempt={1}
          maxReconnectAttempts={5}
        />
      );
    });

    const textNodes = tree?.root.findAllByType(Text) ?? [];
    const textContent = textNodes.map((node) => {
      const { children } = node.props;
      if (Array.isArray(children)) {
        return children.join('');
      }
      return String(children);
    });
    expect(textContent.join(' ')).toContain('Connecting');
    expect(textContent).toContain('(1/5)');
  });

  it('invokes retry when pressed', () => {
    const onRetry = jest.fn();
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ConnectionStatusBanner
          connectionState="failed"
          reconnectAttempt={0}
          maxReconnectAttempts={3}
          onRetry={onRetry}
        />
      );
    });

    const button = tree?.root.find((node) => typeof node.props.onPress === 'function');
    act(() => {
      button?.props.onPress();
    });
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders status unknown when disconnected without failure', () => {
    let tree: ReturnType<typeof create> | null = null;
    act(() => {
      tree = create(
        <ConnectionStatusBanner
          connectionState="disconnected"
          reconnectAttempt={0}
          maxReconnectAttempts={3}
        />
      );
    });

    const json = JSON.stringify(tree?.toJSON());
    expect(json).toContain('Status Unknown');
  });
});
