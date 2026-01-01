import { Platform } from 'react-native';
import { getString, setString, STORAGE_KEYS } from './storage';

export type AnalyticsEvent = {
  ts: number;
  name: string;
  props?: Record<string, unknown>;
};

const opsBase =
  process.env.EXPO_PUBLIC_OPS_URL ??
  process.env.EXPO_PUBLIC_ANALYTICS_URL ??
  '';
const analyticsUrl = opsBase ? `${opsBase.replace(/\/$/, '')}/analytics/events` : '';

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

export const initAnalytics = () => {
  if (!sessionId) sessionId = generateId(12);
  void getDeviceId();
};

export const track = async (name: string, props?: Record<string, unknown>) => {
  if (!analyticsUrl) return;
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
      deviceId: getDeviceId(),
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
