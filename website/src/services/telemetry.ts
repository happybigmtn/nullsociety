export type TelemetryEvent = {
  ts: number;
  name: string;
  props?: Record<string, unknown>;
};

const STORAGE_KEY = 'nullspace_telemetry_v1';
const ENABLE_KEY = 'nullspace_telemetry_enabled';
const MAX_EVENTS = 500;

let cache: TelemetryEvent[] | null = null;

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

export function isTelemetryEnabled(): boolean {
  try {
    const stored = parseBool(localStorage.getItem(ENABLE_KEY));
    if (stored !== null) return stored;
  } catch {
    // ignore
  }
  try {
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

