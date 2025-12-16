export type FeatureFlag = 'new_economy_ui' | 'new_staking_ui';

const STORAGE_PREFIX = 'nullspace_flag_';

const DEFAULTS: Record<FeatureFlag, boolean> = {
  new_economy_ui: true,
  new_staking_ui: true,
};

function parseBool(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return null;
}

function readEnvFlag(flag: FeatureFlag): boolean | null {
  const key = `VITE_FLAG_${flag.toUpperCase()}`;
  try {
    const raw = (import.meta as any)?.env?.[key];
    return parseBool(raw);
  } catch {
    return null;
  }
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const storageKey = `${STORAGE_PREFIX}${flag}`;
  try {
    const stored = parseBool(localStorage.getItem(storageKey));
    if (stored !== null) return stored;
  } catch {
    // ignore
  }

  const env = readEnvFlag(flag);
  if (env !== null) return env;

  return DEFAULTS[flag];
}

export function setFeatureEnabled(flag: FeatureFlag, enabled: boolean) {
  const storageKey = `${STORAGE_PREFIX}${flag}`;
  try {
    localStorage.setItem(storageKey, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

export function getAllFeatureFlags(): Record<FeatureFlag, boolean> {
  return {
    new_economy_ui: isFeatureEnabled('new_economy_ui'),
    new_staking_ui: isFeatureEnabled('new_staking_ui'),
  };
}

