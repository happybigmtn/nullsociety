import { useEffect, useRef } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { LeaderboardEntry, PlayerStats, TournamentPhase } from '../../types';
import type { CasinoClient } from '../../api/client';
import { FREEROLL_CYCLE_MS, FREEROLL_DAILY_LIMIT_FREE, FREEROLL_REGISTRATION_MS, getFreerollSchedule } from './freeroll';
import { buildLeaderboard } from './leaderboard';
import { logDebug } from '../../utils/logger';

type UseFreerollSchedulerArgs = {
  playMode: 'CASH' | 'FREEROLL' | null;
  clientRef: MutableRefObject<CasinoClient | null>;
  publicKeyBytesRef: MutableRefObject<Uint8Array | null>;
  awaitingChainResponseRef: MutableRefObject<boolean>;
  isPendingRef: MutableRefObject<boolean>;
  lastBalanceUpdateRef: MutableRefObject<number>;
  balanceUpdateCooldownMs: number;
  currentChipsRef: MutableRefObject<number>;
  lastLeaderboardUpdateRef: MutableRefObject<number>;
  setStats: Dispatch<SetStateAction<PlayerStats>>;
  setLeaderboard: Dispatch<SetStateAction<LeaderboardEntry[]>>;
  setIsRegistered: Dispatch<SetStateAction<boolean>>;
  hasRegisteredRef: MutableRefObject<boolean | null>;
  setWalletRng: Dispatch<SetStateAction<number | null>>;
  setWalletVusdt: Dispatch<SetStateAction<number | null>>;
  setWalletCredits: Dispatch<SetStateAction<number | null>>;
  setWalletCreditsLocked: Dispatch<SetStateAction<number | null>>;
  setTournamentTime: Dispatch<SetStateAction<number>>;
  setPhase: Dispatch<SetStateAction<TournamentPhase>>;
  setManualTournamentEndTime: Dispatch<SetStateAction<number | null>>;
  setFreerollActiveTournamentId: Dispatch<SetStateAction<number | null>>;
  setFreerollActiveTimeLeft: Dispatch<SetStateAction<number>>;
  setFreerollActivePrizePool: Dispatch<SetStateAction<number | null>>;
  setFreerollActivePlayerCount: Dispatch<SetStateAction<number | null>>;
  setPlayerActiveTournamentId: Dispatch<SetStateAction<number | null>>;
  setFreerollNextTournamentId: Dispatch<SetStateAction<number | null>>;
  setFreerollNextStartIn: Dispatch<SetStateAction<number>>;
  setFreerollIsJoinedNext: Dispatch<SetStateAction<boolean>>;
  setTournamentsPlayedToday: Dispatch<SetStateAction<number>>;
  setTournamentDailyLimit: Dispatch<SetStateAction<number>>;
  setIsTournamentStarting: Dispatch<SetStateAction<boolean>>;
  setLastTxSig: Dispatch<SetStateAction<string | null>>;
  manualTournamentEndTime: number | null;
  phase: TournamentPhase;
  freerollNextTournamentId: number | null;
  isRegistered: boolean;
};

const NETWORK_POLL_FAST_MS = 2000;
const NETWORK_POLL_IDLE_MS = 8000;
const NETWORK_POLL_HIDDEN_MS = 30000;
const WS_IDLE_FAST_MS = 4000;
const WS_IDLE_SLOW_MS = 15000;
const WS_IDLE_HIDDEN_MS = 60000;
const LEADERBOARD_POLL_MIN_MS = 15000;

export const useFreerollScheduler = ({
  playMode,
  clientRef,
  publicKeyBytesRef,
  awaitingChainResponseRef,
  isPendingRef,
  lastBalanceUpdateRef,
  balanceUpdateCooldownMs,
  currentChipsRef,
  lastLeaderboardUpdateRef,
  setStats,
  setLeaderboard,
  setIsRegistered,
  hasRegisteredRef,
  setWalletRng,
  setWalletVusdt,
  setWalletCredits,
  setWalletCreditsLocked,
  setTournamentTime,
  setPhase,
  setManualTournamentEndTime,
  setFreerollActiveTournamentId,
  setFreerollActiveTimeLeft,
  setFreerollActivePrizePool,
  setFreerollActivePlayerCount,
  setPlayerActiveTournamentId,
  setFreerollNextTournamentId,
  setFreerollNextStartIn,
  setFreerollIsJoinedNext,
  setTournamentsPlayedToday,
  setTournamentDailyLimit,
  setIsTournamentStarting,
  setLastTxSig,
  manualTournamentEndTime,
  phase,
  freerollNextTournamentId,
  isRegistered,
}: UseFreerollSchedulerArgs) => {
  const lastNetworkPollRef = useRef(0);
  const freerollStartInFlightRef = useRef(false);
  const freerollEndInFlightRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (playMode !== 'FREEROLL') {
        setTournamentTime(0);
        setFreerollActiveTournamentId(null);
        setFreerollActiveTimeLeft(0);
        setFreerollNextTournamentId(null);
        setFreerollNextStartIn(0);
        setFreerollIsJoinedNext(false);
      } else {
        const scheduleNow = getFreerollSchedule(now);
        const nextTid = scheduleNow.isRegistration ? scheduleNow.tournamentId : scheduleNow.tournamentId + 1;
        const nextStartMs = nextTid * FREEROLL_CYCLE_MS + FREEROLL_REGISTRATION_MS;
        setFreerollNextTournamentId(nextTid);
        setFreerollNextStartIn(Math.max(0, Math.ceil((nextStartMs - now) / 1000)));

        if (manualTournamentEndTime !== null && phase === 'ACTIVE') {
          const remaining = Math.max(0, manualTournamentEndTime - now);
          setTournamentTime(Math.ceil(remaining / 1000));
        }
      }

      if (!clientRef.current || !publicKeyBytesRef.current) {
        return;
      }
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const updatesStatus = clientRef.current?.getUpdatesStatus?.();
      const sessionStatus = clientRef.current?.getSessionStatus?.();
      const lastEventAt = Math.max(updatesStatus?.lastEventAt ?? 0, sessionStatus?.lastEventAt ?? 0);
      const wsConnected = Boolean(updatesStatus?.connected || sessionStatus?.connected);
      const idleThreshold = isHidden
        ? WS_IDLE_HIDDEN_MS
        : (awaitingChainResponseRef.current || isPendingRef.current ? WS_IDLE_FAST_MS : WS_IDLE_SLOW_MS);
      const wsIdle = !lastEventAt || now - lastEventAt > idleThreshold;
      if (wsConnected && !wsIdle) {
        return;
      }

      const pollInterval = isHidden
        ? NETWORK_POLL_HIDDEN_MS
        : (awaitingChainResponseRef.current || isPendingRef.current ? NETWORK_POLL_FAST_MS : NETWORK_POLL_IDLE_MS);
      if (now - lastNetworkPollRef.current < pollInterval) {
        return;
      }
      lastNetworkPollRef.current = now;

      void (async () => {
        const client: any = clientRef.current;
        if (!client) return;

        const myPublicKeyHex = publicKeyBytesRef.current
          ? Array.from(publicKeyBytesRef.current).map(b => b.toString(16).padStart(2, '0')).join('')
          : null;

        let playerState: any = null;
        try {
          playerState = await client.getCasinoPlayer(publicKeyBytesRef.current);
        } catch (e) {
          logDebug('[useFreerollScheduler] Failed to fetch player state:', e);
        }

        let shouldUpdateBalance = true;
        let playerActiveTid: number | null = null;

        if (playerState) {
          setIsRegistered(true);
          hasRegisteredRef.current = true;

          setTournamentsPlayedToday(Number(playerState.tournamentsPlayedToday ?? 0));
          const chainLimit = Number(playerState.tournamentDailyLimit ?? 0);
          setTournamentDailyLimit(chainLimit > 0 ? chainLimit : FREEROLL_DAILY_LIMIT_FREE);

          const timeSinceLastUpdate = Date.now() - lastBalanceUpdateRef.current;
          shouldUpdateBalance = timeSinceLastUpdate > balanceUpdateCooldownMs;

          playerActiveTid = playerState.activeTournament != null ? Number(playerState.activeTournament) : null;
          setPlayerActiveTournamentId(playerActiveTid);

          if (playMode === 'FREEROLL' && freerollNextTournamentId !== null) {
            setFreerollIsJoinedNext(playerActiveTid === freerollNextTournamentId);
          }
        } else {
          setIsRegistered(false);
          hasRegisteredRef.current = false;
          setTournamentsPlayedToday(0);
          setTournamentDailyLimit(FREEROLL_DAILY_LIMIT_FREE);
          setPlayerActiveTournamentId(null);
        }

        if (playMode !== 'FREEROLL') {
          if (playerState) {
            setStats(prev => ({
              ...prev,
              chips: shouldUpdateBalance ? Number(playerState.chips) : prev.chips,
              shields: Number(playerState.shields),
              doubles: Number(playerState.doubles),
            }));
            setWalletRng(prev => (shouldUpdateBalance ? Number(playerState.chips) : prev));
            setWalletVusdt(Number(playerState.vusdtBalance ?? 0));
            setWalletCredits(Number(playerState.freerollCredits ?? 0));
            setWalletCreditsLocked(Number(playerState.freerollCreditsLocked ?? 0));
          }

          const shouldPollLeaderboard = now - lastLeaderboardUpdateRef.current >= LEADERBOARD_POLL_MIN_MS;
          if (shouldPollLeaderboard) {
            try {
              const leaderboardData = await client.getCasinoLeaderboard();
              lastLeaderboardUpdateRef.current = now;
              if (leaderboardData && leaderboardData.entries) {
                const { board, rank } = buildLeaderboard({
                  entries: leaderboardData.entries,
                  myPublicKeyHex,
                  includeSelf: isRegistered,
                  selfChips: currentChipsRef.current,
                });
                setLeaderboard(board);
                if (rank > 0) {
                  setStats((s) => ({ ...s, rank }));
                }
              }
            } catch (e) {
              logDebug('[useFreerollScheduler] Failed to fetch cash leaderboard:', e);
            }
          }
          return;
        }

        const scheduleNow = getFreerollSchedule(Date.now());
        const currentSlotTid = scheduleNow.tournamentId;
        const candidateTids = [
          ...(playerActiveTid !== null ? [playerActiveTid] : []),
          currentSlotTid,
          ...(currentSlotTid > 0 ? [currentSlotTid - 1] : []),
        ].filter((tid, idx, arr) => arr.indexOf(tid) === idx);

        let activeTournament: { id: number; endTimeMs: number; state: any } | null = null;
        for (const tid of candidateTids) {
          try {
            const t = await client.getCasinoTournament(tid);
            if (t && t.phase === 'Active' && t.endTimeMs) {
              const endMs = Number(t.endTimeMs);
              activeTournament = { id: tid, endTimeMs: endMs, state: t };
              break;
            }
          } catch {
            // ignore
          }
        }

        setFreerollActiveTournamentId(activeTournament ? activeTournament.id : null);
        setFreerollActiveTimeLeft(
          activeTournament ? Math.max(0, Math.ceil((activeTournament.endTimeMs - now) / 1000)) : 0
        );
        setFreerollActivePrizePool(activeTournament ? Number(activeTournament.state?.prizePool ?? 0) : null);
        setFreerollActivePlayerCount(
          activeTournament && Array.isArray(activeTournament.state?.players)
            ? activeTournament.state.players.length
            : null
        );

        const isInActiveTournament = !!activeTournament && playerActiveTid === activeTournament.id;

        if (playerState) {
          const showTournamentStack = isInActiveTournament;
          const desiredChips = showTournamentStack ? playerState.tournamentChips : playerState.chips;
          const desiredShields = showTournamentStack ? playerState.tournamentShields : playerState.shields;
          const desiredDoubles = showTournamentStack ? playerState.tournamentDoubles : playerState.doubles;

          setStats(prev => ({
            ...prev,
            chips: shouldUpdateBalance ? Number(desiredChips) : prev.chips,
            shields: Number(desiredShields),
            doubles: Number(desiredDoubles),
          }));
          setWalletRng(prev => (shouldUpdateBalance ? Number(playerState.chips) : prev));
          setWalletVusdt(Number(playerState.vusdtBalance ?? 0));
          setWalletCredits(Number(playerState.freerollCredits ?? 0));
          setWalletCreditsLocked(Number(playerState.freerollCreditsLocked ?? 0));
        }

        if (isInActiveTournament) {
          setPhase('ACTIVE');
          setManualTournamentEndTime(activeTournament!.endTimeMs);
          setTournamentTime(Math.max(0, Math.ceil((activeTournament!.endTimeMs - now) / 1000)));
        } else {
          setPhase('REGISTRATION');
          setManualTournamentEndTime(null);
          setTournamentTime(0);
        }

        if (!scheduleNow.isRegistration && now < scheduleNow.endTimeMs && !freerollStartInFlightRef.current) {
          try {
            const t = await client.getCasinoTournament(scheduleNow.tournamentId);
            if (t && t.phase === 'Registration' && Array.isArray(t.players) && t.players.length > 0) {
              freerollStartInFlightRef.current = true;
              setIsTournamentStarting(true);
              try {
                const result = await client.nonceManager.submitCasinoStartTournament(
                  scheduleNow.tournamentId,
                  scheduleNow.startTimeMs,
                  scheduleNow.endTimeMs
                );
                if (result?.txHash) setLastTxSig(result.txHash);
              } finally {
                setIsTournamentStarting(false);
                freerollStartInFlightRef.current = false;
              }
            }
          } catch (e) {
            logDebug('[useFreerollScheduler] Auto-start tournament failed:', e);
            setIsTournamentStarting(false);
            freerollStartInFlightRef.current = false;
          }
        }

        if (activeTournament && now >= activeTournament.endTimeMs && !freerollEndInFlightRef.current) {
          freerollEndInFlightRef.current = true;
          try {
            const result = await client.nonceManager.submitCasinoEndTournament(activeTournament.id);
            if (result?.txHash) setLastTxSig(result.txHash);
          } catch (e) {
            logDebug('[useFreerollScheduler] Auto-end tournament failed:', e);
          } finally {
            freerollEndInFlightRef.current = false;
          }
        }
        if (activeTournament?.state?.leaderboard?.entries) {
          lastLeaderboardUpdateRef.current = now;
          const entries = activeTournament.state.leaderboard.entries;
          const { board, rank } = buildLeaderboard({
            entries,
            myPublicKeyHex,
            includeSelf: isInActiveTournament,
            selfChips: currentChipsRef.current,
          });
          setLeaderboard(board);
          if (rank > 0) {
            setStats((s) => ({ ...s, rank }));
          }
        } else {
          const shouldPollLeaderboard = now - lastLeaderboardUpdateRef.current >= LEADERBOARD_POLL_MIN_MS;
          if (shouldPollLeaderboard) {
            try {
              const leaderboardData = await client.getCasinoLeaderboard();
              lastLeaderboardUpdateRef.current = now;
              if (leaderboardData && leaderboardData.entries) {
                const { board } = buildLeaderboard({
                  entries: leaderboardData.entries,
                  myPublicKeyHex,
                  includeSelf: false,
                  selfChips: currentChipsRef.current,
                });
                setLeaderboard(board);
              }
            } catch (e) {
              logDebug('[useFreerollScheduler] Failed to fetch lobby leaderboard:', e);
            }
          }
        }
      })();
    }, 1000);

    return () => clearInterval(interval);
  }, [
    playMode,
    manualTournamentEndTime,
    phase,
    freerollNextTournamentId,
    isRegistered,
    clientRef,
    publicKeyBytesRef,
    awaitingChainResponseRef,
    isPendingRef,
    lastBalanceUpdateRef,
    balanceUpdateCooldownMs,
    currentChipsRef,
    lastLeaderboardUpdateRef,
    setStats,
    setLeaderboard,
    setIsRegistered,
    hasRegisteredRef,
    setWalletRng,
    setWalletVusdt,
    setWalletCredits,
    setWalletCreditsLocked,
    setTournamentTime,
    setPhase,
    setManualTournamentEndTime,
    setFreerollActiveTournamentId,
    setFreerollActiveTimeLeft,
    setFreerollActivePrizePool,
    setFreerollActivePlayerCount,
    setPlayerActiveTournamentId,
    setFreerollNextTournamentId,
    setFreerollNextStartIn,
    setFreerollIsJoinedNext,
    setTournamentsPlayedToday,
    setTournamentDailyLimit,
    setIsTournamentStarting,
    setLastTxSig,
  ]);
};
