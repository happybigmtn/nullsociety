import { useEffect, useMemo, useState } from 'react';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WeeklyEvent = {
  id: string;
  label: string;
  focus: string;
  className: string;
};

const EVENTS: WeeklyEvent[] = [
  {
    id: 'roulette-week',
    label: 'Roulette Week',
    focus: 'Wheel momentum and table heat.',
    className: 'border-action-primary/20 bg-action-primary/10 text-action-primary',
  },
  {
    id: 'craps-week',
    label: 'Craps Week',
    focus: 'Line bets, odds boosts, and streaks.',
    className: 'border-action-success/20 bg-action-success/10 text-action-success',
  },
  {
    id: 'sicbo-week',
    label: 'Sic Bo Week',
    focus: 'Triple chase with clean risk/reward.',
    className: 'border-action-gold/20 bg-action-gold/10 text-action-gold',
  },
  {
    id: 'blackjack-week',
    label: 'Blackjack Week',
    focus: 'Precision play, soft totals, and edge.',
    className: 'border-action-destructive/20 bg-action-destructive/10 text-action-destructive',
  },
];

const getWeekBounds = (date: Date) => {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
};

export const formatCountdownShort = (ms: number) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0h';
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const useWeeklyEvent = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { start, end } = useMemo(() => getWeekBounds(new Date(now)), [now]);
  const weekIndex = Math.floor(start.getTime() / WEEK_MS);
  const event = EVENTS[Math.abs(weekIndex) % EVENTS.length];
  const timeLeftMs = Math.max(0, end.getTime() - now);

  return { event, timeLeftMs, weekStart: start, weekEnd: end };
};
