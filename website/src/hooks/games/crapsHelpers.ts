import type { CrapsBet } from '../../types';
import { encodeCrapsBet, type CrapsBetName } from '@nullspace/constants/bet-types';

export const CRAPS_BONUS_BET_TYPES = new Set<CrapsBet['type']>([
  'FIRE',
  'ATS_SMALL',
  'ATS_TALL',
  'ATS_ALL',
  'MUGGSY',
  'DIFF_DOUBLES',
  'RIDE_LINE',
  'REPLAY',
  'HOT_ROLLER',
]);

export const getEncodedBet = (bet: CrapsBet): { betType: number; target: number } => {
  return encodeCrapsBet(bet.type as CrapsBetName, bet.target);
};

export const getBetTypeNum = (bet: CrapsBet): number => getEncodedBet(bet).betType;

export const getTargetForBackend = (bet: CrapsBet): number => getEncodedBet(bet).target;

export const isValidCrapsTarget = (type: CrapsBet['type'], target?: number): boolean => {
  if (type === 'YES' || type === 'NO') {
    return target !== undefined && target >= 2 && target <= 12 && target !== 7;
  }
  if (type === 'NEXT') {
    return target !== undefined && target >= 2 && target <= 12;
  }
  if (type === 'HARDWAY') {
    return target === 4 || target === 6 || target === 8 || target === 10;
  }
  return true;
};

export const invalidTargetMessage = (type: CrapsBet['type']): string => {
  if (type === 'YES') return 'SELECT YES NUMBER (2-12, NOT 7)';
  if (type === 'NO') return 'SELECT NO NUMBER (2-12, NOT 7)';
  if (type === 'NEXT') return 'SELECT NEXT NUMBER (2-12)';
  if (type === 'HARDWAY') return 'SELECT HARDWAY (4/6/8/10)';
  return 'INVALID TARGET';
};
