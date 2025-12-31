import { useCallback, useEffect, useRef } from 'react';
import { useWebSocketContext } from '../context/WebSocketContext';
import { useGameStore } from '../stores/gameStore';
import { parseNumeric } from '../utils';
import type { GameMessage } from '@nullspace/protocol/mobile';

export function useGatewaySession() {
  const {
    connectionState,
    send,
    lastMessage,
  } = useWebSocketContext<GameMessage>();
  const setBalance = useGameStore((state) => state.setBalance);
  const setBalanceReady = useGameStore((state) => state.setBalanceReady);
  const setSessionInfo = useGameStore((state) => state.setSessionInfo);
  const setFaucetStatus = useGameStore((state) => state.setFaucetStatus);
  const faucetStatus = useGameStore((state) => state.faucetStatus);

  const lastSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (connectionState === 'connected') {
      send({ type: 'get_balance' });
    }
  }, [connectionState, send]);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'session_ready') {
      lastSessionIdRef.current = lastMessage.sessionId;
      setSessionInfo({
        sessionId: lastMessage.sessionId,
        publicKey: lastMessage.publicKey,
        registered: lastMessage.registered,
        hasBalance: lastMessage.hasBalance,
      });
      const readyBalance = parseNumeric(lastMessage.balance);
      if (readyBalance !== null) {
        setBalance(readyBalance);
        setBalanceReady(true);
      }
      send({ type: 'get_balance' });
      return;
    }

    if (lastMessage.type === 'balance') {
      setSessionInfo({
        publicKey: lastMessage.publicKey,
        registered: lastMessage.registered,
        hasBalance: lastMessage.hasBalance,
      });
      const balanceValue = parseNumeric(lastMessage.balance);
      if (balanceValue !== null) {
        setBalance(balanceValue);
        setBalanceReady(true);
      }
      if (lastMessage.message === 'FAUCET_CLAIMED') {
        setFaucetStatus('success', 'Faucet claimed');
      }
      return;
    }

    if (lastMessage.type === 'game_started') {
      const balanceValue = parseNumeric(lastMessage.balance);
      if (balanceValue !== null) {
        setBalance(balanceValue);
        setBalanceReady(true);
      }
      return;
    }

    if (lastMessage.type === 'game_result' || lastMessage.type === 'game_move') {
      const balanceValue = parseNumeric(lastMessage.balance ?? lastMessage.finalChips);
      if (balanceValue !== null) {
        setBalance(balanceValue);
        setBalanceReady(true);
      }
    }

    if (lastMessage.type === 'error' && faucetStatus === 'pending') {
      setFaucetStatus('error', lastMessage.message ?? 'Request failed');
    }
  }, [lastMessage, send, setBalance, setBalanceReady, setSessionInfo, setFaucetStatus, faucetStatus]);

  const requestFaucet = useCallback((amount?: number) => {
    setFaucetStatus('pending', 'Requesting faucet...');
    if (typeof amount === 'number' && amount > 0) {
      send({ type: 'faucet_claim', amount });
    } else {
      send({ type: 'faucet_claim' });
    }
  }, [send, setFaucetStatus]);

  return {
    requestFaucet,
    connectionState,
    sessionId: lastSessionIdRef.current,
  };
}
