export type TelemetryEvent = {
  ts: number;
  name: string;
  props?: Record<string, unknown>;
};

const STORAGE_KEY = 'nullspace_telemetry_v1';
const ENABLE_KEY = 'nullspace_telemetry_enabled';
const MAX_EVENTS = 500;
const DEVICE_KEY = 'nullspace_telemetry_device_id';
const SESSION_KEY = 'nullspace_telemetry_session_id';
const MAX_BATCH = 25;
const FLUSH_MS = 5000;

const analyticsBase =
  ((import.meta as any)?.env?.VITE_OPS_URL as string | undefined)?.replace(/\/$/, '') ??
  ((import.meta as any)?.env?.VITE_ANALYTICS_URL as string | undefined)?.replace(/\/$/, '') ??
  '';
const analyticsUrl = analyticsBase ? `${analyticsBase}/analytics/events` : '';

let cache: TelemetryEvent[] | null = null;
let pendingQueue: TelemetryEvent[] = [];
let flushTimer: number | null = null;
let handlersRegistered = false;

function parseBool(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return null;
}

function load(): TelemetryEvent[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = [];
      return cache;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cache = [];
      return cache;
    }
    cache = parsed
      .filter((e) => e && typeof e === 'object')
      .map((e: any) => ({
        ts: typeof e.ts === 'number' ? e.ts : Date.now(),
        name: typeof e.name === 'string' ? e.name : 'unknown',
        props: e.props && typeof e.props === 'object' ? e.props : undefined,
      }))
      .slice(-MAX_EVENTS);
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

function save(next: TelemetryEvent[]) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const id = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function getPublicKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('casino_public_key_hex');
    return stored ? stored.toLowerCase() : null;
  } catch {
    return null;
  }
}

function getLocale(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.language ?? null;
}

function sendToOps(events: TelemetryEvent[]) {
  if (!analyticsUrl || events.length === 0) return;
  const payload = {
    events,
    actor: {
      publicKey: getPublicKey(),
      deviceId: getDeviceId(),
      platform: 'web',
      appVersion: ((import.meta as any)?.env?.VITE_APP_VERSION as string | undefined) ?? undefined,
      locale: getLocale() ?? undefined,
    },
    source: {
      app: 'website',
      env: ((import.meta as any)?.env?.MODE as string | undefined) ?? undefined,
    },
    session: {
      id: getSessionId() ?? undefined,
    },
  };

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(analyticsUrl, blob);
      return;
    }
  } catch {
    // ignore sendBeacon errors
  }

  try {
    void fetch(analyticsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // ignore network errors
  }
}

function flushQueue() {
  if (pendingQueue.length === 0) return;
  const batch = pendingQueue.slice(0, MAX_BATCH);
  pendingQueue = pendingQueue.slice(batch.length);
  sendToOps(batch);
  if (pendingQueue.length > 0) {
    scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, FLUSH_MS);
}

function ensureHandlers() {
  if (handlersRegistered || typeof window === 'undefined') return;
  handlersRegistered = true;
  window.addEventListener('beforeunload', () => flushQueue());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushQueue();
    }
  });
}

export function isTelemetryEnabled(): boolean {
  try {
    const stored = parseBool(localStorage.getItem(ENABLE_KEY));
    if (stored !== null) return stored;
  } catch {
    // ignore
  }
  try {
    const envOverride =
      parseBool((import.meta as any)?.env?.VITE_TELEMETRY_ENABLED) ??
      parseBool((import.meta as any)?.env?.VITE_ANALYTICS_ENABLED);
    if (envOverride !== null) return envOverride;
    return !!(import.meta as any)?.env?.DEV;
  } catch {
    return false;
  }
}

export function setTelemetryEnabled(enabled: boolean) {
  try {
    localStorage.setItem(ENABLE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

export function track(name: string, props?: Record<string, unknown>) {
  if (!isTelemetryEnabled()) return;
  const safeName = String(name || '').trim();
  if (!safeName) return;

  const entry: TelemetryEvent = {
    ts: Date.now(),
    name: safeName,
    props: props && typeof props === 'object' ? props : undefined,
  };

  const next = [...load(), entry].slice(-MAX_EVENTS);
  save(next);

  if (analyticsUrl) {
    ensureHandlers();
    pendingQueue.push(entry);
    if (pendingQueue.length >= MAX_BATCH) {
      flushQueue();
    } else if (typeof window !== 'undefined') {
      scheduleFlush();
    }
  }
}

export function getTelemetryEvents(): TelemetryEvent[] {
  return [...load()];
}

export function clearTelemetry() {
  save([]);
}

export function exportTelemetryJson(pretty = false): string {
  const data = load();
  return JSON.stringify(data, null, pretty ? 2 : 0);
}
