export type ToastLevel = 'info' | 'success' | 'error';

export type Toast = {
  id: string;
  ts: number;
  level: ToastLevel;
  message: string;
  href?: string;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 4500;
const MAX_TOASTS = 3;

const listeners = new Set<() => void>();
let toasts: Toast[] = [];

function genId() {
  return `toast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function notify() {
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch {
      // ignore
    }
  }
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): Toast[] {
  return [...toasts].sort((a, b) => b.ts - a.ts);
}

export function dismissToast(id: string) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  notify();
}

export function pushToast(level: ToastLevel, message: string, opts?: { href?: string; ttlMs?: number }): string {
  const safeMessage = String(message ?? '').trim();
  if (!safeMessage) return '';

  const last = toasts[toasts.length - 1];
  if (last && last.level === level && last.message === safeMessage) return last.id;

  const now = Date.now();
  const toast: Toast = {
    id: genId(),
    ts: now,
    level,
    message: safeMessage,
    href: opts?.href,
    expiresAt: now + (opts?.ttlMs ?? DEFAULT_TTL_MS),
  };
  toasts = [...toasts, toast].slice(-MAX_TOASTS);
  notify();
  return toast.id;
}

