/**
 * WebSocket Context - Global singleton provider for WebSocket connection
 * Prevents multiple WebSocket instances across game screens
 */
import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket, getWebSocketUrl, type WebSocketManager, type GameMessage } from '../services/websocket';

const WebSocketContext = createContext<WebSocketManager | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
  url?: string;
}

/**
 * Provider that creates a single WebSocket connection shared across all game screens
 */
export function WebSocketProvider({ children, url }: WebSocketProviderProps) {
  const wsUrl = url ?? getWebSocketUrl();
  const manager = useWebSocket<GameMessage>(wsUrl);

  return (
    <WebSocketContext.Provider value={manager}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to access the shared WebSocket connection
 * Must be used within a WebSocketProvider
 */
export function useWebSocketContext<T extends GameMessage = GameMessage>(): WebSocketManager<T> {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context as WebSocketManager<T>;
}
