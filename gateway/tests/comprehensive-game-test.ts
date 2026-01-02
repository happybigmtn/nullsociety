/**
 * Comprehensive Game Testing
 * Tests all 10 game types with proper parameters
 */
import WebSocket from 'ws';

const GATEWAY_URL = 'ws://localhost:9010';

interface GameResult {
  name: string;
  status: 'success' | 'failed';
  startResponse?: string;
  moveResponse?: string;
  error?: string;
}

// Game configurations with CORRECT message types matching handlers
const GAMES = [
  // Standard games - use amount parameter
  { name: 'Blackjack', start: { type: 'blackjack_deal', amount: 100 }, move: { type: 'blackjack_stand' } },
  // Hi-Lo: Use cashout (always valid) since higher/lower can be invalid depending on dealt card
  { name: 'Hi-Lo', start: { type: 'hilo_deal', amount: 100 }, move: { type: 'hilo_cashout' } },
  { name: 'Video Poker', start: { type: 'videopoker_deal', amount: 100 }, move: { type: 'videopoker_hold', holds: [true, true, false, false, true] } },
  { name: 'Casino War', start: { type: 'casinowar_deal', amount: 100 }, move: null },

  // Games with special parameters
  { name: 'Baccarat', start: { type: 'baccarat_deal', bets: [{ type: 'PLAYER', amount: 100 }] }, move: null, instant: true }, // Auto-resolves (atomic batch)
  { name: 'Three Card Poker', start: { type: 'threecardpoker_deal', ante: 100 }, move: { type: 'threecardpoker_play' } },
  { name: 'Ultimate Holdem', start: { type: 'ultimateholdem_deal', ante: 100, blind: 100 }, move: { type: 'ultimateholdem_check' } },

  // Instant games - resolve on start
  // Roulette: type 0 = straight bet on number 17
  { name: 'Roulette', start: { type: 'roulette_spin', bets: [{ type: 0, value: 17, amount: 100 }] }, move: null, instant: true },
  // Sic Bo: type 0 = small bet (total 4-10)
  { name: 'Sic Bo', start: { type: 'sicbo_roll', bets: [{ type: 0, amount: 100 }] }, move: null, instant: true },
  // Craps: type 4 = Field bet (always resolves on one roll)
  { name: 'Craps', start: { type: 'craps_bet', betType: 4, amount: 100 }, move: null, instant: true },
];

function createConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

function sendAndReceive(ws: WebSocket, msg: unknown, timeout = 35000): Promise<Record<string, unknown>> {
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

async function waitForReady(ws: WebSocket): Promise<void> {
  // Wait for session_ready
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

  // Poll for registration completion
  for (let i = 0; i < 30; i++) {
    const balance = await sendAndReceive(ws, { type: 'get_balance' });
    if (balance.registered && balance.hasBalance) {
      return;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Registration timeout');
}

async function testGame(game: typeof GAMES[0]): Promise<GameResult> {
  let ws: WebSocket | null = null;

  try {
    ws = await createConnection();
    await waitForReady(ws);

    // Start game
    const startResponse = await sendAndReceive(ws, game.start);

    if (game.instant) {
      // Instant games return move_accepted directly (or game_result)
      if (startResponse.type === 'move_accepted' || startResponse.type === 'game_result') {
        return {
          name: game.name,
          status: 'success',
          startResponse: startResponse.type
        };
      }
    } else {
      // Regular games return game_started
      if (startResponse.type !== 'game_started') {
        return {
          name: game.name,
          status: 'failed',
          startResponse: startResponse.type,
          error: `Expected game_started, got ${startResponse.type}`
        };
      }

      // Make a move if defined
      if (game.move) {
        const moveResponse = await sendAndReceive(ws, game.move);
        if (moveResponse.type === 'error') {
          return {
            name: game.name,
            status: 'failed',
            startResponse: 'game_started',
            moveResponse: 'error',
            error: (moveResponse as { message?: string }).message
          };
        }
        return {
          name: game.name,
          status: 'success',
          startResponse: 'game_started',
          moveResponse: moveResponse.type as string
        };
      }
    }

    return { name: game.name, status: 'success', startResponse: startResponse.type as string };
  } catch (err) {
    return {
      name: game.name,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err)
    };
  } finally {
    if (ws) {
      ws.close();
    }
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       COMPREHENSIVE GATEWAY GAME TESTING                   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('');

  const results: GameResult[] = [];

  for (const game of GAMES) {
    process.stdout.write(`Testing ${game.name.padEnd(20)}... `);
    const result = await testGame(game);
    results.push(result);

    if (result.status === 'success') {
      console.log(`✅ ${result.startResponse}${result.moveResponse ? ' → ' + result.moveResponse : ''}`);
    } else {
      console.log(`❌ ${result.error}`);
    }
  }

  console.log('');
  console.log('╠════════════════════════════════════════════════════════════╣');
  const passed = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'failed').length;
  console.log(`║  Results: ${passed} passed, ${failed} failed                               ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\nFailed games:');
    for (const result of results.filter(r => r.status === 'failed')) {
      console.log(`  - ${result.name}: ${result.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
