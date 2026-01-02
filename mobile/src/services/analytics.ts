import { Platform } from 'react-native';
import { getString, setString, STORAGE_KEYS, initializeStorage } from './storage';
import { stripTrailingSlash } from '../utils/url';

export type AnalyticsEvent = {
  ts: number;
  name: string;
  props?: Record<string, unknown>;
};

const opsBase =
  process.env.EXPO_PUBLIC_OPS_URL ??
  process.env.EXPO_PUBLIC_ANALYTICS_URL ??
  '';
const analyticsUrl = opsBase ? `${stripTrailingSlash(opsBase)}/analytics/events` : '';

let sessionId = '';
let publicKey: string | null = null;

const generateId = (bytes = 12): string => {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const getDeviceId = (): string => {
  const existing = getString(STORAGE_KEYS.ANALYTICS_DEVICE_ID, '');
  if (existing) return existing;
  const id = generateId(16);
  setString(STORAGE_KEYS.ANALYTICS_DEVICE_ID, id);
  return id;
};

export const setAnalyticsContext = (ctx: { publicKey?: string | null }) => {
  if (ctx.publicKey) {
    publicKey = ctx.publicKey.toLowerCase();
  }
};

export const initAnalytics = async () => {
  if (!sessionId) sessionId = generateId(12);
  try {
    await initializeStorage();
    void getDeviceId();
  } catch {
    // ignore storage init errors
  }
};

export const track = async (name: string, props?: Record<string, unknown>) => {
  if (!analyticsUrl) return;
  let deviceId = '';
  try {
    await initializeStorage();
    deviceId = getDeviceId();
  } catch {
    // ignore storage init errors
  }
  const event: AnalyticsEvent = {
    ts: Date.now(),
    name: String(name || '').trim(),
    props: props && typeof props === 'object' ? props : undefined,
  };
  if (!event.name) return;

  const payload = {
    events: [event],
    actor: {
      publicKey,
      deviceId,
      platform: Platform.OS,
      appVersion: process.env.EXPO_PUBLIC_APP_VERSION,
    },
    source: {
      app: 'mobile',
      env: process.env.EXPO_PUBLIC_ENV,
    },
    session: {
      id: sessionId,
    },
  };

  try {
    await fetch(analyticsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore network errors
  }
};
