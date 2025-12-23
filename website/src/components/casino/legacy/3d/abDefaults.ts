import { track } from '../../../services/telemetry';

export type AbBucket = '3d' | '2d';

const AB_BUCKET_KEY = 'casino-3d-ab-bucket';
const AB_BUCKET_TRACKED_KEY = 'casino-3d-ab-bucket-tracked';

export const getAbBucket = (): AbBucket => {
  if (typeof window === 'undefined') return '3d';
  const stored = localStorage.getItem(AB_BUCKET_KEY);
  if (stored === '3d') return stored;
  localStorage.setItem(AB_BUCKET_KEY, '3d');
  return '3d';
};

export const getInitial3DMode = (storageKey: string) => {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(storageKey);
  if (stored === 'true') return true;
  localStorage.setItem(storageKey, 'true');
  return true;
};

export const trackAbBucket = (game?: string) => {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(AB_BUCKET_TRACKED_KEY) === '1') return;
  const bucket = getAbBucket();
  track('casino.3d.ab_bucket', { bucket, game });
  localStorage.setItem(AB_BUCKET_TRACKED_KEY, '1');
};
