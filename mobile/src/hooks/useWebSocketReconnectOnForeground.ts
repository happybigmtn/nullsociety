import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useWebSocketContext } from '../context/WebSocketContext';
import type { GameMessage } from '@nullspace/protocol/mobile';

export function useWebSocketReconnectOnForeground(): void {
  const { reconnect, connectionState } = useWebSocketContext<GameMessage>();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const connectionStateRef = useRef(connectionState);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      const wasBackground = previousState === 'background' || previousState === 'inactive';

      if (wasBackground && nextAppState === 'active') {
        if (connectionStateRef.current !== 'connected') {
          reconnect();
        }
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [reconnect]);
}
