import type { ResolvedBet } from '../../types';

export type CrapsChainBetLog = {
  type: string;
  target?: number;
  wagered: number;
  odds: number;
  returnAmount: number;
  outcome: 'WIN' | 'LOSS' | 'PUSH';
};

export type CrapsChainRollLog = {
  dice: [number, number];
  total: number;
  point: number;
  bets: CrapsChainBetLog[];
  totalWagered: number;
  totalReturn: number;
};

export const parseCrapsChainRollLog = (logs: string[]): CrapsChainRollLog | null => {
  if (!logs || logs.length === 0) return null;

  for (const entry of logs) {
    if (typeof entry !== 'string' || entry.trim().length === 0) continue;
    let data: any;
    try {
      data = JSON.parse(entry);
    } catch {
      continue;
    }
    if (!data || !Array.isArray(data.dice) || data.dice.length < 2) continue;
    const d1 = Number(data.dice[0]);
    const d2 = Number(data.dice[1]);
    if (!Number.isFinite(d1) || !Number.isFinite(d2) || d1 <= 0 || d2 <= 0) continue;

    const total = Number.isFinite(Number(data.total)) ? Number(data.total) : d1 + d2;
    const totalWagered = Number.isFinite(Number(data.totalWagered)) ? Number(data.totalWagered) : 0;
    const totalReturn = Number.isFinite(Number(data.totalReturn)) ? Number(data.totalReturn) : 0;
    const point = Number.isFinite(Number(data.point)) ? Number(data.point) : 0;

    const rawBets = Array.isArray(data.bets) ? data.bets : [];
    const bets: CrapsChainBetLog[] = rawBets
      .map((bet: any) => {
        const type = typeof bet?.type === 'string' ? bet.type : '';
        const target = typeof bet?.target === 'number' ? bet.target : undefined;
        const wagered = Number(bet?.wagered ?? 0);
        const odds = Number(bet?.odds ?? 0);
        const returnAmount = Number(bet?.return ?? 0);
        const rawOutcome = typeof bet?.outcome === 'string' ? bet.outcome : '';
        const outcome: CrapsChainBetLog['outcome'] =
          rawOutcome === 'WIN' || rawOutcome === 'LOSS' || rawOutcome === 'PUSH'
            ? rawOutcome
            : (returnAmount > wagered ? 'WIN' : returnAmount === wagered ? 'PUSH' : 'LOSS');
        return { type, target, wagered, odds, returnAmount, outcome };
      })
      .filter((bet) => bet.type);

    return {
      dice: [d1, d2],
      total,
      point,
      bets,
      totalWagered,
      totalReturn,
    };
  }

  return null;
};

const formatCrapsChainBetLabel = (type: string, target?: number): string => {
  if (type.startsWith('HARDWAY_')) {
    const hardTarget = Number(type.split('_')[1]);
    return Number.isFinite(hardTarget) ? `HARDWAY ${hardTarget}` : 'HARDWAY';
  }

  return target && target > 0 ? `${type} ${target}` : type;
};

export const formatCrapsChainResults = (roll: CrapsChainRollLog): string[] => (
  roll.bets.map((bet) => {
    const label = formatCrapsChainBetLabel(bet.type, bet.target);
    return `${label}: ${bet.outcome}`;
  })
);

export const formatCrapsChainResolvedBets = (roll: CrapsChainRollLog): ResolvedBet[] => (
  roll.bets.map((bet, idx) => {
    const label = formatCrapsChainBetLabel(bet.type, bet.target);
    return {
      id: `${label.replace(/\s+/g, '_').toLowerCase()}-${idx}`,
      label,
      pnl: Math.round(bet.returnAmount - bet.wagered - bet.odds),
    };
  })
);

export const adjustResolvedBetsForNetPnl = (resolvedBets: ResolvedBet[], netPnL: number): ResolvedBet[] => {
  if (!resolvedBets.length) return resolvedBets;
  if (!Number.isFinite(netPnL) || netPnL === 0) return resolvedBets;

  const sum = resolvedBets.reduce((acc, bet) => (
    acc + (Number.isFinite(bet.pnl) ? bet.pnl : 0)
  ), 0);

  if (!Number.isFinite(sum) || sum === 0) {
    if (resolvedBets.length === 1) {
      return [{ ...resolvedBets[0], pnl: Math.round(netPnL) }];
    }
    return resolvedBets;
  }

  if (Math.sign(sum) !== Math.sign(netPnL)) {
    return resolvedBets;
  }

  const scale = netPnL / sum;
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.01) return resolvedBets;

  return resolvedBets.map((bet) => ({
    ...bet,
    pnl: Math.round((Number.isFinite(bet.pnl) ? bet.pnl : 0) * scale),
  }));
};
