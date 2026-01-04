import WebSocket from 'ws';

const parseTimeout = (envKey: string, fallback: number): number => {
  const raw = process.env[envKey];
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const GATEWAY_PORT = process.env.TEST_GATEWAY_PORT || '9010';
export const GATEWAY_URL = `ws://localhost:${GATEWAY_PORT}`;
export const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION === 'true';
export const TEST_TIMEOUT_MS = parseTimeout('TEST_TIMEOUT_MS', 1_200_000);
export const RESPONSE_TIMEOUT_MS = parseTimeout('TEST_RESPONSE_TIMEOUT_MS', 60000);
export const BET_TIMEOUT_MS = parseTimeout('TEST_BET_TIMEOUT_MS', 0);
export const TEST_GAMES = new Set(
  (process.env.TEST_GAMES ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

export function createConnection(
  url = GATEWAY_URL,
  timeoutMs = 10000
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
  });
}

export function sendAndReceive(
  ws: WebSocket,
  msg: unknown,
  timeout = RESPONSE_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Response timeout')), timeout);

    const handler = (data: WebSocket.Data) => {
      clearTimeout(timer);
      ws.off('message', handler);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

export function waitForMessage(
  ws: WebSocket,
  type: string,
  timeout = 15000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeout);

    const handler = (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.on('message', handler);
  });
}

export async function waitForReady(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('session_ready timeout')), 60000);
    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'session_ready') {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve();
      }
    };
    ws.on('message', handler);
  });

  for (let i = 0; i < 30; i++) {
    const balance = await sendAndReceive(ws, { type: 'get_balance' });
    if (balance.registered && balance.hasBalance) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Registration timeout');
}
