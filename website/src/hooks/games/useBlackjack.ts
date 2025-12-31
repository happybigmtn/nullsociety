import { Dispatch, SetStateAction, MutableRefObject, useCallback } from 'react';
import { GameState, PlayerStats, GameType } from '../../types';
import { CasinoChainService } from '../../services/CasinoChainService';
import { BlackjackMove } from '@nullspace/constants';

interface UseBlackjackProps {
  gameState: GameState;
  setGameState: Dispatch<SetStateAction<GameState>>;
  stats: PlayerStats;
  setStats: Dispatch<SetStateAction<PlayerStats>>;
  chainService: CasinoChainService | null;
  isOnChain: boolean;
  currentSessionIdRef: MutableRefObject<bigint | null>;
  isPendingRef: MutableRefObject<boolean>;
  setLastTxSig: (sig: string | null) => void;
}

export const useBlackjack = ({
  gameState,
  setGameState,
  stats,
  chainService,
  isOnChain,
  currentSessionIdRef,
  isPendingRef,
  setLastTxSig
}: UseBlackjackProps) => {

  const bjHit = useCallback(async () => {
    if (isPendingRef.current) {
      return;
    }
    if (!gameState.blackjackActions?.canHit) {
      setGameState(prev => ({ ...prev, message: 'CANNOT HIT' }));
      return;
    }

    if (isOnChain && chainService && currentSessionIdRef.current) {
      try {
        isPendingRef.current = true;
        const result = await chainService.sendMove(currentSessionIdRef.current, new Uint8Array([BlackjackMove.Hit]));
        if (result.txHash) setLastTxSig(result.txHash);
        setGameState(prev => ({ ...prev, message: 'HITTING...' }));
        return;
      } catch (error) {
        console.error('[useBlackjack] Hit failed:', error);
        setGameState(prev => ({ ...prev, message: 'MOVE FAILED' }));
        isPendingRef.current = false;
        return;
      }
    }

    // Local mode not supported - require on-chain session
    setGameState(prev => ({ ...prev, message: 'OFFLINE - CHECK CONNECTION' }));
  }, [gameState.blackjackActions, isPendingRef, isOnChain, chainService, currentSessionIdRef, setLastTxSig, setGameState]);

  const bjStand = useCallback(async () => {
    if (isPendingRef.current) {
      return;
    }
    if (!gameState.blackjackActions?.canStand) {
      setGameState(prev => ({ ...prev, message: 'CANNOT STAND' }));
      return;
    }

    if (isOnChain && chainService && currentSessionIdRef.current) {
      try {
        isPendingRef.current = true;
        const result = await chainService.sendMove(currentSessionIdRef.current, new Uint8Array([BlackjackMove.Stand]));
        if (result.txHash) setLastTxSig(result.txHash);
        setGameState(prev => ({ ...prev, message: 'STANDING...' }));
        return;
      } catch (error) {
        console.error('[useBlackjack] Stand failed:', error);
        setGameState(prev => ({ ...prev, message: 'MOVE FAILED' }));
        isPendingRef.current = false;
        return;
      }
    }

    // Local mode not supported - require on-chain session
    setGameState(prev => ({ ...prev, message: 'OFFLINE - CHECK CONNECTION' }));
  }, [gameState.blackjackActions, isPendingRef, isOnChain, chainService, currentSessionIdRef, setLastTxSig, setGameState]);

  const bjDouble = useCallback(async () => {
    if (isPendingRef.current) {
      return;
    }
    if (!gameState.blackjackActions?.canDouble) {
      setGameState(prev => ({ ...prev, message: 'CANNOT DOUBLE' }));
      return;
    }

    if (isOnChain && chainService && currentSessionIdRef.current) {
      try {
        isPendingRef.current = true;
        const result = await chainService.sendMove(currentSessionIdRef.current, new Uint8Array([BlackjackMove.Double]));
        if (result.txHash) setLastTxSig(result.txHash);
        setGameState(prev => ({ ...prev, message: 'DOUBLING...' }));
        return;
      } catch (error) {
        console.error('[useBlackjack] Double failed:', error);
        setGameState(prev => ({ ...prev, message: 'MOVE FAILED' }));
        isPendingRef.current = false;
        return;
      }
    }

    // Local mode not supported - require on-chain session
    setGameState(prev => ({ ...prev, message: 'OFFLINE - CHECK CONNECTION' }));
  }, [gameState.blackjackActions, isPendingRef, isOnChain, chainService, currentSessionIdRef, setLastTxSig, setGameState]);

  const bjSplit = useCallback(async () => {
    if (!gameState.blackjackActions?.canSplit) {
      setGameState(prev => ({ ...prev, message: 'CANNOT SPLIT' }));
      return;
    }
    if (stats.chips < gameState.bet) {
      setGameState(prev => ({ ...prev, message: 'INSUFFICIENT FUNDS TO SPLIT' }));
      return;
    }

    if (isOnChain && chainService && currentSessionIdRef.current) {
      try {
        if (isPendingRef.current) {
          return;
        }
        isPendingRef.current = true;
        const result = await chainService.sendMove(currentSessionIdRef.current, new Uint8Array([BlackjackMove.Split]));
        if (result.txHash) setLastTxSig(result.txHash);
        setGameState(prev => ({ ...prev, message: 'SPLITTING...' }));
        return;
      } catch (error) {
        console.error('[useBlackjack] Split failed:', error);
        isPendingRef.current = false;
        setGameState(prev => ({ ...prev, message: 'SPLIT FAILED' }));
        return;
      }
    }

    // Local mode not supported - require on-chain session
    setGameState(prev => ({ ...prev, message: 'OFFLINE - CHECK CONNECTION' }));
  }, [gameState.blackjackActions, gameState.bet, stats.chips, isOnChain, chainService, currentSessionIdRef, isPendingRef, setLastTxSig, setGameState]);

  const bjInsurance = useCallback((take: boolean) => {
    // Insurance is only available on-chain via chain events
    if (!isOnChain) {
      setGameState(prev => ({ ...prev, message: 'OFFLINE - CHECK CONNECTION' }));
      return;
    }
    // On-chain insurance is handled via game flow, just acknowledge the choice
    setGameState(prev => ({ ...prev, message: take ? "INSURANCE TAKEN" : "INSURANCE DECLINED" }));
  }, [isOnChain, setGameState]);

  const bjToggle21Plus3 = useCallback(async () => {
    if (gameState.type !== GameType.BLACKJACK) return;

    const prevAmount = gameState.blackjack21Plus3Bet || 0;
    const nextAmount = prevAmount > 0 ? 0 : gameState.bet;

    // Side bet toggle - only UI state update, sent atomically with Deal
    if (gameState.stage !== 'BETTING') {
      setGameState(prev => ({ ...prev, message: '21+3 CLOSED' }));
      return;
    }

    setGameState(prev => ({
        ...prev,
        blackjack21Plus3Bet: nextAmount,
        message: nextAmount > 0 ? `21+3 +$${nextAmount}` : '21+3 OFF',
      }));
  }, [gameState.type, gameState.blackjack21Plus3Bet, gameState.bet, gameState.stage, setGameState]);

  return {
    bjHit,
    bjStand,
    bjDouble,
    bjSplit,
    bjInsurance,
    bjToggle21Plus3
  };
};
