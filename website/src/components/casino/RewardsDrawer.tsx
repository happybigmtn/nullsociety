import React, { useEffect, useState } from 'react';
import { GameType, PlayerStats } from '../../types';
import { Label } from './ui/Label';
import { formatCountdownShort, useWeeklyEvent } from '../../hooks/useWeeklyEvent';

type RewardsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  playMode: 'CASH' | 'FREEROLL' | null;
  isFaucetClaiming: boolean;
  onClaimFaucet: () => void;
  faucetMessage?: string;
  stats: PlayerStats;
  gameType: GameType;
};

const STORAGE_KEYS = {
  lastClaim: 'ns_rewards_last_claim',
  streak: 'ns_rewards_streak',
  handsDate: 'ns_rewards_hands_date',
  handsBaseline: 'ns_rewards_hands_baseline',
  gamesDate: 'ns_rewards_games_date',
  gamesList: 'ns_rewards_games_list',
  clubJoined: 'ns_rewards_club_joined',
  clubWeek: 'ns_rewards_club_week',
  clubBaseline: 'ns_rewards_club_baseline',
};

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekKey = () => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const thursday = new Date(now);
  thursday.setDate(now.getDate() - day + 3);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const parseDateKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const readString = (key: string, fallback = '') => {
  if (typeof window === 'undefined') return fallback;
  const value = window.localStorage.getItem(key);
  return value ?? fallback;
};

const readNumber = (key: string, fallback = 0) => {
  const raw = readString(key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readArray = (key: string) => {
  const raw = readString(key);
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStorage = (key: string, value: string | number | boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
};

const writeArray = (key: string, value: string[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const formatAmount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return Math.floor(value).toLocaleString();
};

export const RewardsDrawer: React.FC<RewardsDrawerProps> = ({
  isOpen,
  onClose,
  playMode,
  isFaucetClaiming,
  onClaimFaucet,
  faucetMessage,
  stats,
  gameType,
}) => {
  const todayKey = getLocalDateKey();
  const weekKey = getWeekKey();
  const { event, timeLeftMs } = useWeeklyEvent();

  const [lastClaim, setLastClaim] = useState(() => readString(STORAGE_KEYS.lastClaim));
  const [streak, setStreak] = useState(() => readNumber(STORAGE_KEYS.streak, 0));
  const [handsDate, setHandsDate] = useState(() => readString(STORAGE_KEYS.handsDate, todayKey));
  const [handsBaseline, setHandsBaseline] = useState(() => readNumber(STORAGE_KEYS.handsBaseline, stats.history.length));
  const [gamesDate, setGamesDate] = useState(() => readString(STORAGE_KEYS.gamesDate, todayKey));
  const [gamesToday, setGamesToday] = useState(() => readArray(STORAGE_KEYS.gamesList));
  const [clubJoined, setClubJoined] = useState(() => readString(STORAGE_KEYS.clubJoined, 'false') === 'true');
  const [clubWeek, setClubWeek] = useState(() => readString(STORAGE_KEYS.clubWeek, weekKey));
  const [clubBaseline, setClubBaseline] = useState(() => readNumber(STORAGE_KEYS.clubBaseline, stats.history.length));
  const [pendingClaim, setPendingClaim] = useState(false);

  useEffect(() => {
    if (handsDate !== todayKey) {
      setHandsDate(todayKey);
      setHandsBaseline(stats.history.length);
      writeStorage(STORAGE_KEYS.handsDate, todayKey);
      writeStorage(STORAGE_KEYS.handsBaseline, stats.history.length);
    }
  }, [handsDate, todayKey, stats.history.length]);

  useEffect(() => {
    if (gamesDate !== todayKey) {
      setGamesDate(todayKey);
      setGamesToday([]);
      writeStorage(STORAGE_KEYS.gamesDate, todayKey);
      writeArray(STORAGE_KEYS.gamesList, []);
    }
  }, [gamesDate, todayKey]);

  useEffect(() => {
    if (clubWeek !== weekKey) {
      setClubWeek(weekKey);
      setClubBaseline(stats.history.length);
      writeStorage(STORAGE_KEYS.clubWeek, weekKey);
      writeStorage(STORAGE_KEYS.clubBaseline, stats.history.length);
    }
  }, [clubWeek, weekKey, stats.history.length]);

  useEffect(() => {
    if (gameType === GameType.NONE) return;
    setGamesToday((prev) => {
      if (prev.includes(gameType)) return prev;
      const next = [...prev, gameType];
      writeArray(STORAGE_KEYS.gamesList, next);
      return next;
    });
  }, [gameType]);

  useEffect(() => {
    if (!pendingClaim) return;
    if (faucetMessage?.includes('FAUCET CLAIMED')) {
      const today = parseDateKey(todayKey);
      const last = lastClaim ? parseDateKey(lastClaim) : null;
      const diffDays = last ? Math.floor((today.getTime() - last.getTime()) / 86400000) : null;
      const nextStreak = diffDays === 1 ? streak + 1 : 1;
      setLastClaim(todayKey);
      setStreak(nextStreak);
      writeStorage(STORAGE_KEYS.lastClaim, todayKey);
      writeStorage(STORAGE_KEYS.streak, nextStreak);
      setPendingClaim(false);
    }
    if (faucetMessage?.includes('FAUCET FAILED')) {
      setPendingClaim(false);
    }
  }, [pendingClaim, faucetMessage, lastClaim, streak, todayKey]);

  const handsToday = Math.max(0, stats.history.length - handsBaseline);
  const gamesCount = gamesToday.length;
  const claimedToday = lastClaim === todayKey;
  const canClaim = playMode === 'CASH' && !claimedToday && !isFaucetClaiming;

  const nextResetMs = (() => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    return next.getTime() - Date.now();
  })();

  const clubGoal = 25;
  const clubProgress = Math.min(clubGoal, Math.max(0, stats.history.length - clubBaseline));

  const missions = [
    { id: 'daily-claim', label: 'Claim daily bonus', progress: claimedToday ? 1 : 0, target: 1 },
    { id: 'hands', label: 'Play 3 hands', progress: handsToday, target: 3 },
    { id: 'games', label: 'Try 2 tables', progress: gamesCount, target: 2 },
  ];

  return (
    <div className={`fixed inset-0 z-[120] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!isOpen}>
      <div
        className={`absolute inset-0 bg-titanium-900/40 backdrop-blur-sm transition-opacity motion-state ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-titanium-200 shadow-float transition-transform motion-state ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } dark:bg-titanium-900 dark:border-titanium-800`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-titanium-200 px-6 py-5 dark:border-titanium-800">
            <div>
              <Label size="micro" className="opacity-70">Rewards</Label>
              <div className="text-xl font-extrabold text-titanium-900 dark:text-titanium-100">Your rewards</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-titanium-200 text-titanium-400 transition-all hover:text-titanium-900 dark:border-titanium-800 dark:text-titanium-300 dark:hover:text-titanium-100"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {event ? (
              <div className="rounded-3xl border border-titanium-200 bg-titanium-50/70 p-5 dark:border-titanium-800 dark:bg-titanium-900/40">
                <Label size="micro" variant="primary" className="mb-2 block">Weekly focus</Label>
                <div className="text-lg font-bold text-titanium-900 dark:text-titanium-100">{event.label}</div>
                <div className="text-xs text-titanium-500 dark:text-titanium-300 mt-1">{event.focus}</div>
                <div className="mt-3 text-[10px] font-mono text-titanium-400 dark:text-titanium-400">
                  Ends in {formatCountdownShort(timeLeftMs)}
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-titanium-200 bg-white p-5 shadow-soft dark:border-titanium-800 dark:bg-titanium-900/60">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label size="micro" variant="gold" className="mb-1 block">Daily bonus</Label>
                  <div className="text-lg font-bold text-titanium-900 dark:text-titanium-100">+1,000 RNG</div>
                  <div className="text-[11px] text-titanium-500 dark:text-titanium-300">
                    {claimedToday ? `Next drop in ${formatCountdownShort(nextResetMs)}` : 'Ready to claim'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-[10px] font-bold text-titanium-400 uppercase tracking-widest">Streak</div>
                  <div className="text-lg font-black text-action-success">{streak}x</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!canClaim) return;
                  setPendingClaim(true);
                  onClaimFaucet();
                }}
                disabled={!canClaim}
                className={`w-full rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all motion-interaction ${
                  canClaim
                    ? 'bg-action-success text-white shadow-soft hover:scale-[1.02]'
                    : 'bg-titanium-100 text-titanium-400 dark:bg-titanium-800 dark:text-titanium-400'
                }`}
              >
                {playMode !== 'CASH' ? 'Available in Cash Mode' : claimedToday ? 'Claimed' : isFaucetClaiming ? 'Claiming…' : 'Claim now'}
              </button>
            </div>

            <div className="rounded-3xl border border-titanium-200 bg-white p-5 shadow-soft dark:border-titanium-800 dark:bg-titanium-900/60">
              <Label size="micro" variant="primary" className="mb-3 block">Missions</Label>
              <div className="space-y-4">
                {missions.map((mission) => {
                  const progress = Math.min(mission.target, mission.progress);
                  const pct = Math.round((progress / mission.target) * 100);
                  return (
                    <div key={mission.id} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-titanium-800 dark:text-titanium-100">
                        <span>{mission.label}</span>
                        <span className="tabular-nums text-titanium-500 dark:text-titanium-300">
                          {progress}/{mission.target}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-titanium-100 dark:bg-titanium-800 overflow-hidden">
                        <div
                          className="h-full bg-action-primary transition-all motion-state"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-titanium-200 bg-white p-5 shadow-soft dark:border-titanium-800 dark:bg-titanium-900/60">
              <Label size="micro" variant="success" className="mb-3 block">Clubs</Label>
              {!clubJoined ? (
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-semibold text-titanium-800 dark:text-titanium-100">
                    Join a club for weekly goals and lightweight social play.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClubJoined(true);
                      writeStorage(STORAGE_KEYS.clubJoined, true);
                      setClubBaseline(stats.history.length);
                      writeStorage(STORAGE_KEYS.clubBaseline, stats.history.length);
                      writeStorage(STORAGE_KEYS.clubWeek, weekKey);
                    }}
                    className="rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest bg-titanium-900 text-white shadow-soft hover:scale-[1.02] transition-all dark:bg-action-primary/20 dark:text-action-primary"
                  >
                    Join Club
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-titanium-800 dark:text-titanium-100">Orion Table</div>
                      <div className="text-[11px] text-titanium-500 dark:text-titanium-300">Weekly goal: 25 hands</div>
                    </div>
                    <div className="text-xs font-bold text-action-success">{clubProgress}/{clubGoal}</div>
                  </div>
                  <div className="h-2 rounded-full bg-titanium-100 dark:bg-titanium-800 overflow-hidden">
                    <div
                      className="h-full bg-action-success transition-all motion-state"
                      style={{ width: `${Math.round((clubProgress / clubGoal) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-titanium-200 px-6 py-4 text-[10px] text-titanium-400 dark:border-titanium-800 dark:text-titanium-400">
            Balance today: ${formatAmount(stats.chips)} • Rewards stay calm, no popups.
          </div>
        </div>
      </aside>
    </div>
  );
};
