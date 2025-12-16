export const STORAGE_KEY = 'nullspace_tx_tracker_v1';
export const MAX_ITEMS = 200;

let cache = null;
const listeners = new Set();

function normalizeHex(hex) {
  if (!hex) return undefined;
  const cleaned = String(hex).trim().toLowerCase();
  return cleaned.startsWith('0x') ? cleaned.slice(2) : cleaned;
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sortKey(item) {
  if (item?.type === 'tx') return typeof item.updatedTs === 'number' ? item.updatedTs : item.ts;
  return item.ts;
}

function load() {
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
      .filter((x) => x && typeof x === 'object')
      .map((x) => {
        const base = {
          id: typeof x.id === 'string' ? x.id : genId('a'),
          ts: typeof x.ts === 'number' ? x.ts : Date.now(),
          surface: typeof x.surface === 'string' ? x.surface : 'system',
        };
        if (x.type === 'tx') {
          return {
            ...base,
            type: 'tx',
            kind: typeof x.kind === 'string' ? x.kind : 'swap',
            status: typeof x.status === 'string' ? x.status : 'submitted',
            message: typeof x.message === 'string' ? x.message : 'Transaction',
            finalMessage: typeof x.finalMessage === 'string' ? x.finalMessage : undefined,
            updatedTs: typeof x.updatedTs === 'number' ? x.updatedTs : base.ts,
            pubkeyHex: typeof x.pubkeyHex === 'string' ? x.pubkeyHex : undefined,
            nonce: typeof x.nonce === 'number' ? x.nonce : undefined,
            txHash: typeof x.txHash === 'string' ? x.txHash : undefined,
            txDigest: typeof x.txDigest === 'string' ? x.txDigest : undefined,
            error: typeof x.error === 'string' ? x.error : undefined,
          };
        }
        return {
          ...base,
          type: 'log',
          level: typeof x.level === 'string' ? x.level : 'info',
          message: typeof x.message === 'string' ? x.message : '',
        };
      })
      .slice(-MAX_ITEMS)
      .sort((a, b) => sortKey(b) - sortKey(a));
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

function save(next) {
  const sorted = [...next].slice(0, MAX_ITEMS).sort((a, b) => sortKey(b) - sortKey(a));
  cache = sorted;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  } catch {
    // ignore
  }
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch {
      // ignore
    }
  }
}

function pushItem(item) {
  const items = load();
  const last = items[0];
  if (last && last.type === item.type && last.surface === item.surface) {
    if (item.type === 'log' && last.type === 'log' && last.message === item.message && last.level === item.level) {
      return;
    }
    if (
      item.type === 'tx' &&
      last.type === 'tx' &&
      last.kind === item.kind &&
      last.status === item.status &&
      last.message === item.message &&
      last.txDigest === item.txDigest
    ) {
      return;
    }
  }
  const next = [item, ...items].slice(0, MAX_ITEMS);
  save(next);
}

export function subscribeActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActivityItems(surface) {
  const items = load();
  if (!surface) return [...items];
  return items.filter((i) => i.surface === surface);
}

export function clearActivity(surface) {
  if (!surface) {
    save([]);
    return;
  }
  const items = load().filter((i) => i.surface !== surface);
  save(items);
}

export function logActivity(surface, message, level = 'info') {
  const item = {
    id: genId('log'),
    type: 'log',
    ts: Date.now(),
    surface,
    level,
    message: String(message ?? ''),
  };
  pushItem(item);
  return item.id;
}

export function trackTxSubmitted(args) {
  const item = {
    id: genId('tx'),
    type: 'tx',
    ts: Date.now(),
    surface: args.surface,
    kind: args.kind,
    status: 'submitted',
    message: String(args.message ?? 'Submitted'),
    updatedTs: Date.now(),
    pubkeyHex: args.pubkeyHex,
    nonce: args.nonce,
    txHash: args.txHash,
    txDigest: args.txDigest,
  };
  pushItem(item);
  return item.id;
}

function findLatestPending(surface, kind, pubkeyHex) {
  const pkNorm = normalizeHex(pubkeyHex);
  return load().find((i) => {
    if (i.type !== 'tx') return false;
    if (i.surface !== surface) return false;
    if (i.status !== 'submitted') return false;
    if (kind && i.kind !== kind) return false;
    if (pkNorm && normalizeHex(i.pubkeyHex) !== pkNorm) return false;
    return true;
  });
}

export function trackTxConfirmed(args) {
  const existing = findLatestPending(args.surface, args.kind, args.pubkeyHex);
  if (!existing) {
    const item = {
      id: genId('tx'),
      type: 'tx',
      ts: Date.now(),
      surface: args.surface,
      kind: args.kind,
      status: 'confirmed',
      message: String(args.finalMessage ?? 'Confirmed'),
      updatedTs: Date.now(),
      pubkeyHex: args.pubkeyHex,
      txHash: args.txHash,
      txDigest: args.txDigest,
    };
    pushItem(item);
    return item.id;
  }

  const items = load();
  const updated = {
    ...existing,
    status: 'confirmed',
    finalMessage: String(args.finalMessage ?? existing.finalMessage ?? existing.message),
    updatedTs: Date.now(),
    txHash: args.txHash ?? existing.txHash,
    txDigest: args.txDigest ?? existing.txDigest,
  };

  save(items.map((i) => (i.type === 'tx' && i.id === existing.id ? updated : i)));
  return existing.id;
}

export function trackTxFailed(args) {
  const existing = findLatestPending(args.surface, args.kind, args.pubkeyHex);
  if (!existing) {
    if (args.kind) {
      const item = {
        id: genId('tx'),
        type: 'tx',
        ts: Date.now(),
        surface: args.surface,
        kind: args.kind,
        status: 'failed',
        message: String(args.finalMessage ?? 'Failed'),
        updatedTs: Date.now(),
        pubkeyHex: args.pubkeyHex,
        error: args.error,
      };
      pushItem(item);
      return item.id;
    }
    return logActivity(args.surface, String(args.finalMessage ?? args.error ?? 'Transaction failed'), 'error');
  }

  const items = load();
  const updated = {
    ...existing,
    status: 'failed',
    finalMessage: String(args.finalMessage ?? existing.finalMessage ?? existing.message),
    error: args.error ?? existing.error,
    updatedTs: Date.now(),
  };

  save(items.map((i) => (i.type === 'tx' && i.id === existing.id ? updated : i)));
  return existing.id;
}

export function exportActivityJson(pretty = false, surface) {
  const items = getActivityItems(surface);
  return JSON.stringify(items, null, pretty ? 2 : 0);
}
