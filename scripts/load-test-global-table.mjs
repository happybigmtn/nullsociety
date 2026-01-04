import WebSocket from 'ws';

const URL = process.env.URL ?? 'ws://localhost:9010';
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:9010';
const TOTAL = Number.parseInt(process.env.TOTAL ?? '1000', 10);
const RAMP_PER_SEC = Number.parseInt(process.env.RAMP_PER_SEC ?? '200', 10);
const DURATION = Number.parseInt(process.env.DURATION ?? '120', 10);
const REPORT_MS = Number.parseInt(process.env.REPORT_MS ?? '5000', 10);
const ENABLE_BETS = ['1', 'true', 'yes'].includes(String(process.env.ENABLE_BETS ?? '').toLowerCase());
const BET_FRACTION = Number.parseFloat(process.env.BET_FRACTION ?? '0');
const BET_AMOUNT = Number.parseInt(process.env.BET_AMOUNT ?? '5', 10);

const betFraction = Number.isFinite(BET_FRACTION) ? Math.min(Math.max(BET_FRACTION, 0), 1) : 0;
const totalClients = Number.isFinite(TOTAL) && TOTAL > 0 ? TOTAL : 1000;
const rampPerSec = Number.isFinite(RAMP_PER_SEC) && RAMP_PER_SEC > 0 ? RAMP_PER_SEC : 200;
const durationSec = Number.isFinite(DURATION) && DURATION > 0 ? DURATION : 120;
const reportMs = Number.isFinite(REPORT_MS) && REPORT_MS > 0 ? REPORT_MS : 5000;
const betAmount = Number.isFinite(BET_AMOUNT) && BET_AMOUNT > 0 ? BET_AMOUNT : 5;

const stats = {
  connected: 0,
  closed: 0,
  errors: 0,
  errorMessages: 0,
  messages: 0,
  state: 0,
  result: 0,
  confirmation: 0,
  betsSent: 0,
  lastStateRate: 0,
  lastMsgRate: 0,
  maxPlayerCount: 0,
};

const clients = new Map();
let created = 0;
let lastReportAt = Date.now();
let lastStateCount = 0;
let lastMessageCount = 0;
let loggedSampleState = false;

console.log('[global-table-load] starting', {
  url: URL,
  origin: ORIGIN,
  totalClients,
  rampPerSec,
  durationSec,
  reportMs,
  enableBets: ENABLE_BETS,
  betFraction,
  betAmount,
});

function connectClient(id) {
  const ws = new WebSocket(URL, {
    headers: {
      Origin: ORIGIN,
    },
  });

  const clientState = {
    id,
    ws,
    lastRoundId: null,
    shouldBet: ENABLE_BETS && Math.random() < betFraction,
    joined: false,
  };

  ws.on('open', () => {
    stats.connected += 1;
  });

  ws.on('message', (data) => {
    stats.messages += 1;
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'session_ready' && !clientState.joined) {
      clientState.joined = true;
      ws.send(JSON.stringify({ type: 'craps_live_join' }));
    } else if (payload.type === 'error') {
      stats.errorMessages += 1;
    } else if (payload.type === 'live_table_state') {
      stats.state += 1;
      if (!loggedSampleState) {
        loggedSampleState = true;
        console.log('[global-table-load] sample state', {
          roundId: payload.roundId,
          phase: payload.phase,
          timeRemainingMs: payload.timeRemainingMs,
        });
      }
      if (typeof payload.playerCount === 'number') {
        stats.maxPlayerCount = Math.max(stats.maxPlayerCount, payload.playerCount);
      }
      if (
        clientState.shouldBet
        && payload.phase === 'betting'
        && typeof payload.roundId === 'number'
        && clientState.lastRoundId !== payload.roundId
      ) {
        clientState.lastRoundId = payload.roundId;
        stats.betsSent += 1;
        ws.send(JSON.stringify({
          type: 'craps_live_bet',
          bets: [{ type: 'PASS', amount: betAmount }],
        }));
      }
    } else if (payload.type === 'live_table_result') {
      stats.result += 1;
    } else if (payload.type === 'live_table_confirmation') {
      stats.confirmation += 1;
    }
  });

  ws.on('close', () => {
    stats.closed += 1;
  });

  ws.on('error', () => {
    stats.errors += 1;
  });

  clients.set(id, clientState);
}

const rampInterval = setInterval(() => {
  const batch = Math.min(rampPerSec, totalClients - created);
  for (let i = 0; i < batch; i += 1) {
    connectClient(created + i);
  }
  created += batch;
  if (created >= totalClients) {
    clearInterval(rampInterval);
  }
}, 1000);

const reportInterval = setInterval(() => {
  const now = Date.now();
  const elapsedMs = Math.max(1, now - lastReportAt);
  const stateDelta = stats.state - lastStateCount;
  const messageDelta = stats.messages - lastMessageCount;
  stats.lastStateRate = Math.round((stateDelta / elapsedMs) * 1000);
  stats.lastMsgRate = Math.round((messageDelta / elapsedMs) * 1000);
  lastStateCount = stats.state;
  lastMessageCount = stats.messages;
  lastReportAt = now;

  console.log('[global-table-load] report', {
    connected: stats.connected,
    closed: stats.closed,
    errors: stats.errors,
    messages: stats.messages,
    state: stats.state,
    result: stats.result,
    confirmation: stats.confirmation,
    errorMessages: stats.errorMessages,
    betsSent: stats.betsSent,
    msgPerSec: stats.lastMsgRate,
    statePerSec: stats.lastStateRate,
    maxPlayerCount: stats.maxPlayerCount,
  });
}, reportMs);

function shutdown(reason) {
  console.log('[global-table-load] shutting down', { reason });
  clearInterval(reportInterval);
  clearInterval(rampInterval);
  for (const client of clients.values()) {
    try {
      client.ws.close();
    } catch {
      // Ignore close errors.
    }
  }
  setTimeout(() => process.exit(0), 1000);
}

setTimeout(() => shutdown('duration_elapsed'), durationSec * 1000);

process.on('SIGINT', () => shutdown('sigint'));
process.on('SIGTERM', () => shutdown('sigterm'));
