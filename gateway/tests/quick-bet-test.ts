/**
 * Quick verification test for all game types
 * Tests that each game can be started successfully (signature verification works)
 */
import WebSocket from 'ws';

const GATEWAY_URL = 'ws://localhost:9010';

interface TestResult {
  game: string;
  status: 'success' | 'failed';
  error?: string;
}

async function createSession(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

async function waitForReady(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('session_ready timeout')), 10000);
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

  // Wait for registration
  for (let i = 0; i < 30; i++) {
    const response = await sendAndWait(ws, { type: 'get_balance' });
    if (response.registered && response.hasBalance) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Registration timeout');
}

function sendAndWait(ws: WebSocket, msg: unknown, timeout = 60000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Response timeout')), timeout);
    const handler = (data: WebSocket.Data) => {
      clearTimeout(timer);
      ws.off('message', handler);
      resolve(JSON.parse(data.toString()));
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(msg));
  });
}

async function testGame(name: string, startMsg: Record<string, unknown>): Promise<TestResult> {
  let ws: WebSocket | null = null;
  try {
    ws = await createSession();
    await waitForReady(ws);
    const response = await sendAndWait(ws, startMsg);

    if (response.type === 'error') {
      return { game: name, status: 'failed', error: response.message as string };
    }

    return { game: name, status: 'success' };
  } catch (err) {
    return { game: name, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (ws) ws.close();
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  QUICK GAME VERIFICATION TEST            ║');
  console.log('╠══════════════════════════════════════════╣\n');

  const tests = [
    { name: 'HiLo', msg: { type: 'hilo_deal', amount: 100 } },
    { name: 'Blackjack', msg: { type: 'blackjack_deal', amount: 100, bonus21Plus3: 0 } },
    { name: 'Roulette (Red)', msg: { type: 'roulette_spin', bets: [{ type: 1, value: 0, amount: 100 }] } },
    { name: 'Baccarat', msg: { type: 'baccarat_deal', bets: [{ type: 'PLAYER', amount: 100 }] } },
    { name: 'Craps (Field)', msg: { type: 'craps_bet', betType: 4, target: 0, amount: 100 } },
    { name: 'Sic Bo (Big)', msg: { type: 'sicbo_roll', bets: [{ type: 1, number: 0, amount: 100 }] } },
    { name: 'Video Poker', msg: { type: 'videopoker_deal', amount: 100 } },
    { name: 'Three Card', msg: { type: 'threecardpoker_deal', ante: 100, pairPlus: 0 } },
    { name: 'Ultimate Holdem', msg: { type: 'ultimateholdem_deal', ante: 100, blind: 100, trips: 0 } },
    { name: 'Casino War', msg: { type: 'casinowar_deal', amount: 100, bonus: 0 } },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    process.stdout.write(`  ${test.name.padEnd(20)} `);
    const result = await testGame(test.name, test.msg);
    results.push(result);
    console.log(result.status === 'success' ? '✅' : `❌ ${result.error}`);
  }

  const passed = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log('\n╠══════════════════════════════════════════╣');
  console.log(`║  Results: ${passed} passed, ${failed} failed               ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  if (failed > 0) {
    console.log('Failed games:');
    for (const r of results.filter(r => r.status === 'failed')) {
      console.log(`  - ${r.game}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch(console.error);
