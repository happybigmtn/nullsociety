/**
 * useGameConnection - Shared hook for game WebSocket connection status
 * Wraps WebSocket context with connection status props for GameLayout
 */
import { useMemo } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';
import type { GameMessage } from '../services/websocket';

interface ConnectionStatus {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'failed';
  reconnectAttempt: number;
  maxReconnectAttempts: number;
  onRetry: () => void;
}

interface GameConnectionResult<T extends GameMessage = GameMessage> {
  /** Whether the WebSocket is disconnected (for disabling actions) */
  isDisconnected: boolean;
  /** Send a message over WebSocket */
  send: (message: object) => boolean;
  /** Latest message received from server */
  lastMessage: T | null;
  /** Props object ready to pass to GameLayout's connectionStatus prop */
  connectionStatusProps: ConnectionStatus;
}

/**
 * Hook that provides WebSocket connection state formatted for game screens
 *
 * @example
 * const { isDisconnected, send, lastMessage, connectionStatusProps } = useGameConnection<HiLoMessage>();
 *
 * // Pass to GameLayout
 * <GameLayout connectionStatus={connectionStatusProps} ... />
 *
 * // Check connection before actions
 * <Button disabled={isDisconnected} onPress={handleBet} />
 */
export function useGameConnection<T extends GameMessage = GameMessage>(): GameConnectionResult<T> {
  const {
    connectionState,
    reconnectAttempt,
    maxReconnectAttempts,
    send,
    lastMessage,
    reconnect,
  } = useWebSocketContext<T>();

  const isDisconnected = connectionState !== 'connected';

  // Memoize to prevent unnecessary re-renders of GameLayout
  const connectionStatusProps = useMemo<ConnectionStatus>(() => ({
    connectionState,
    reconnectAttempt,
    maxReconnectAttempts,
    onRetry: reconnect,
  }), [connectionState, reconnectAttempt, maxReconnectAttempts, reconnect]);

  return {
    isDisconnected,
    send,
    lastMessage,
    connectionStatusProps,
  };
}
