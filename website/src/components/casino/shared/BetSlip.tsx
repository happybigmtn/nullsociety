import React from 'react';
import { Label } from '../ui/Label';

type BetSlipProps = {
  totalBet: number;
  oddsLabel: string;
  maxWin?: number;
  className?: string;
};

const formatAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return Math.floor(amount).toLocaleString();
};

export const BetSlip: React.FC<BetSlipProps> = ({ totalBet, oddsLabel, maxWin, className }) => (
  <div
    className={[
      'flex flex-wrap items-center gap-4 rounded-full border border-titanium-200 bg-white/70 px-4 py-2 shadow-soft backdrop-blur-md',
      'dark:border-titanium-800 dark:bg-titanium-900/70 dark:text-titanium-100',
      'motion-state',
      className ?? '',
    ]
      .join(' ')
      .trim()}
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col gap-1">
      <Label size="micro">Bet Slip</Label>
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-titanium-400">Total</span>
        <span className="text-sm font-bold tabular-nums text-titanium-900 dark:text-titanium-100">
          ${formatAmount(totalBet)}
        </span>
      </div>
    </div>

    <div className="h-6 w-px bg-titanium-200 dark:bg-titanium-800" />

    <div className="flex flex-col gap-1">
      <Label size="micro">Odds</Label>
      <div className="text-sm font-bold text-titanium-800 dark:text-titanium-100">{oddsLabel}</div>
    </div>

    {typeof maxWin === 'number' && (
      <>
        <div className="h-6 w-px bg-titanium-200 dark:bg-titanium-800" />
        <div className="flex flex-col gap-1">
          <Label size="micro">Max Win</Label>
          <div className="text-sm font-bold text-titanium-800 dark:text-titanium-100">
            ${formatAmount(maxWin)}
          </div>
        </div>
      </>
    )}
  </div>
);
