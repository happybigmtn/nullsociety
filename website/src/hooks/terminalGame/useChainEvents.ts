import { useEffect } from 'react';
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import type { CasinoChainService } from '../../services/CasinoChainService';
import type { CasinoClient } from '../../api/client';
import { GameState, GameType, LeaderboardEntry, PlayerStats } from '../../types';
import { logDebug } from '../../utils/logger';
import type { CrapsChainRollLog } from '../../services/games';
import { createGameStartedHandler } from './chainEvents/handleGameStarted';
import { createGameMovedHandler } from './chainEvents/handleGameMoved';
import { createGameCompletedHandler } from './chainEvents/handleGameCompleted';

type CrapsPendingRollLog = {
  sessionId: bigint;
  prevDice: [number, number] | null;
  point: number | null;
  bets: any[];
} | null;

type CrapsChainRollRef = MutableRefObject<{ sessionId: bigint; roll: CrapsChainRollLog } | null>;
export type UseChainEventsArgs = {
  chainService: CasinoChainService | null;
  isOnChain: boolean;
  currentSessionId: bigint | null;
  currentSessionIdRef: MutableRefObject<bigint | null>;
  setCurrentSessionId: Dispatch<SetStateAction<bigint | null>>;
  gameTypeRef: MutableRefObject<GameType>;
  gameStateRef: MutableRefObject<GameState>;
  setGameState: Dispatch<SetStateAction<GameState>>;
  setStats: Dispatch<SetStateAction<PlayerStats>>;
  stats: PlayerStats;
  setLeaderboard: Dispatch<SetStateAction<LeaderboardEntry[]>>;
  isRegisteredRef: MutableRefObject<boolean>;
  isPendingRef: MutableRefObject<boolean>;
  pendingMoveCountRef: MutableRefObject<number>;
  crapsPendingRollLogRef: MutableRefObject<CrapsPendingRollLog>;
  crapsChainRollLogRef: CrapsChainRollRef;
  applySessionMeta: (sessionId: bigint | null, moveNumber?: number) => void;
  parseGameState: (stateBlob: Uint8Array, gameType?: GameType) => void;
  clearChainResponseTimeout: () => void;
  runAutoPlayForSession: (sessionId: bigint, frontendGameType: GameType) => void;
  clientRef: MutableRefObject<CasinoClient | null>;
  playModeRef: MutableRefObject<'instant' | 'animated'>;
  publicKeyBytesRef: MutableRefObject<Uint8Array | null>;
  lastBalanceUpdateRef: MutableRefObject<number>;
  currentChipsRef: MutableRefObject<number>;
  lastLeaderboardUpdateRef: MutableRefObject<number>;
  sessionStartChipsRef: MutableRefObject<Map<bigint, number>>;
  lastPlayerSyncRef: MutableRefObject<number>;
  playerSyncMinIntervalMs: number;
  setLastTxSig: Dispatch<SetStateAction<string | null>>;
  setWalletRng: Dispatch<SetStateAction<number | null>>;
  setWalletVusdt: Dispatch<SetStateAction<number | null>>;
  setWalletCredits: Dispatch<SetStateAction<number | null>>;
  setWalletCreditsLocked: Dispatch<SetStateAction<number | null>>;
};

export const useChainEvents = ({
  chainService,
  isOnChain,
  currentSessionId,
  currentSessionIdRef,
  setCurrentSessionId,
  gameTypeRef,
  gameStateRef,
  setGameState,
  setStats,
  stats,
  setLeaderboard,
  isRegisteredRef,
  isPendingRef,
  pendingMoveCountRef,
  crapsPendingRollLogRef,
  crapsChainRollLogRef,
  applySessionMeta,
  parseGameState,
  clearChainResponseTimeout,
  runAutoPlayForSession,
  clientRef,
  publicKeyBytesRef,
  setLastTxSig,
  lastBalanceUpdateRef,
  currentChipsRef,
  lastLeaderboardUpdateRef,
  sessionStartChipsRef,
  playModeRef,
  lastPlayerSyncRef,
  playerSyncMinIntervalMs,
  setWalletRng,
  setWalletVusdt,
  setWalletCredits,
  setWalletCreditsLocked,
}: UseChainEventsArgs) => {
   useEffect(() => {
     if (!chainService || !isOnChain) return;

     const unsubStarted = chainService.onGameStarted(createGameStartedHandler({
       chainService,
       currentSessionIdRef,
       gameTypeRef,
       gameStateRef,
       isPendingRef,
       pendingMoveCountRef,
       applySessionMeta,
       clearChainResponseTimeout,
       clientRef,
       setGameState,
       parseGameState,
       setLastTxSig,
       runAutoPlayForSession,
     }));

     const unsubMoved = chainService.onGameMoved(createGameMovedHandler({
       chainService,
       currentSessionIdRef,
       gameTypeRef,
       gameStateRef,
       isPendingRef,
       pendingMoveCountRef,
       crapsPendingRollLogRef,
       crapsChainRollLogRef,
       applySessionMeta,
       parseGameState,
       playModeRef,
       clientRef,
       publicKeyBytesRef,
       lastBalanceUpdateRef,
       currentChipsRef,
       lastPlayerSyncRef,
       playerSyncMinIntervalMs,
       setStats,
       setGameState,
       setWalletRng,
       setWalletVusdt,
       setWalletCredits,
       setWalletCreditsLocked,
       setLastTxSig,
     }));

     const unsubCompleted = chainService.onGameCompleted(createGameCompletedHandler({
       currentSessionIdRef,
       setCurrentSessionId,
       clearChainResponseTimeout,
       gameTypeRef,
       gameStateRef,
       setGameState,
       setStats,
       stats,
       playModeRef,
       lastBalanceUpdateRef,
       currentChipsRef,
       sessionStartChipsRef,
       isPendingRef,
       pendingMoveCountRef,
       crapsPendingRollLogRef,
       crapsChainRollLogRef,
       clientRef,
       setWalletRng,
       setWalletVusdt,
     }));

     const unsubLeaderboard = chainService.onLeaderboardUpdated((leaderboardData: any) => {
       lastLeaderboardUpdateRef.current = Date.now();
       try {
         if (leaderboardData && leaderboardData.entries) {
           const myPublicKeyHex = publicKeyBytesRef.current
             ? Array.from(publicKeyBytesRef.current).map(b => b.toString(16).padStart(2, '0')).join('')
             : null;

           const newBoard = leaderboardData.entries.map((entry: { player?: string; name?: string; chips: bigint | number }) => ({
             name: entry.name || `Player_${entry.player?.substring(0, 8)}`,
             chips: Number(entry.chips),
             status: 'ALIVE' as const
           }));

           const isPlayerInBoard = myPublicKeyHex && leaderboardData.entries.some(
             (entry: { player?: string }) => entry.player && entry.player.toLowerCase() === myPublicKeyHex.toLowerCase()
           );

           if (!isPlayerInBoard && myPublicKeyHex && isRegisteredRef.current) {
             newBoard.push({ name: 'YOU', chips: currentChipsRef.current, status: 'ALIVE' });
           } else if (myPublicKeyHex) {
             const playerIdx = leaderboardData.entries.findIndex(
               (entry: { player?: string }) => entry.player && entry.player.toLowerCase() === myPublicKeyHex.toLowerCase()
             );
             if (playerIdx >= 0) {
               newBoard[playerIdx].name = `${newBoard[playerIdx].name} (YOU)`;
             }
           }

           newBoard.sort((a, b) => b.chips - a.chips);
           setLeaderboard(newBoard);

           const myRank = newBoard.findIndex(p => p.name.includes('YOU')) + 1;
           if (myRank > 0) {
             setStats(s => ({ ...s, rank: myRank }));
           }
         }
       } catch (e) {
         console.error('[useChainEvents] Failed to process leaderboard update:', e);
       }
     });

     const client: any = clientRef.current;
     const unsubError =
       client?.onEvent?.('CasinoError', (e: any) => {
         try {
           const message = (e?.message ?? 'UNKNOWN ERROR').toString();
           const sessionIdRaw = e?.sessionId ?? e?.session_id ?? null;
           const errorSessionId =
             sessionIdRaw === null || sessionIdRaw === undefined ? null : BigInt(sessionIdRaw);
           const current = currentSessionIdRef.current ? BigInt(currentSessionIdRef.current) : null;

           const lowerMessage = message.toLowerCase();
           const isRecoverableError =
             lowerMessage.includes('invalid move') ||
             lowerMessage.includes('invalidmove') ||
             lowerMessage.includes('invalid payload') ||
             lowerMessage.includes('invalidpayload');

           if (errorSessionId !== null && current !== null && errorSessionId === current && !isRecoverableError) {
             currentSessionIdRef.current = null;
             setCurrentSessionId(null);
             isPendingRef.current = false;
             pendingMoveCountRef.current = 0;
             crapsPendingRollLogRef.current = null;
             crapsChainRollLogRef.current = null;
           }

           setGameState(prev => ({
             ...prev,
             message: message.toUpperCase().slice(0, 72),
           }));
         } finally {
           clearChainResponseTimeout();
           isPendingRef.current = false;
           pendingMoveCountRef.current = 0;
           crapsPendingRollLogRef.current = null;
           crapsChainRollLogRef.current = null;
         }
       }) ?? (() => {});

     return () => {
       unsubStarted();
       unsubMoved();
       unsubCompleted();
       unsubLeaderboard();
       unsubError();
       clearChainResponseTimeout();
     };
   }, [
     chainService,
     isOnChain,
     applySessionMeta,
     clearChainResponseTimeout,
     clientRef,
     currentChipsRef,
     currentSessionIdRef,
     gameStateRef,
     gameTypeRef,
     isPendingRef,
     pendingMoveCountRef,
     playModeRef,
     publicKeyBytesRef,
     runAutoPlayForSession,
     setCurrentSessionId,
     setGameState,
     setLastTxSig,
     setLeaderboard,
     setStats,
     setWalletCredits,
     setWalletCreditsLocked,
     setWalletRng,
     setWalletVusdt,
     sessionStartChipsRef,
     stats,
     lastBalanceUpdateRef,
     lastLeaderboardUpdateRef,
     lastPlayerSyncRef,
     playerSyncMinIntervalMs,
     crapsPendingRollLogRef,
     crapsChainRollLogRef,
     isRegisteredRef,
   ]);

   useEffect(() => {
     const client = clientRef.current as any;
     if (!client) return;

     void (async () => {
       try {
         if (!isOnChain) {
           await client.disconnectSessionUpdates?.();
           return;
         }
         if (currentSessionId) {
           await client.switchSessionUpdates(currentSessionId);
         } else {
           await client.disconnectSessionUpdates?.();
         }
       } catch (e) {
         logDebug('[useChainEvents] Session updates sync failed:', e);
       }
     })();

     return () => {
       try {
         client.disconnectSessionUpdates?.();
       } catch {
         // ignore
       }
     };
   }, [currentSessionId, isOnChain, clientRef]);
};
