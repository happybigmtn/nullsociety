/**
 * Mobile Gateway WebSocket Server
 *
 * Bridges mobile JSON protocol to Rust backend binary protocol.
 * Enables full-stack testing with real on-chain game execution.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { createHandlerRegistry, type HandlerContext } from './handlers/index.js';
import { SessionManager, NonceManager } from './session/index.js';
import { SubmitClient } from './backend/index.js';
import { GameType } from './codec/index.js';
import { ErrorCodes, createError } from './types/errors.js';

// Configuration from environment
const PORT = parseInt(process.env.GATEWAY_PORT || '9001', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

// Core services
const nonceManager = new NonceManager();
const submitClient = new SubmitClient(BACKEND_URL);
const sessionManager = new SessionManager(submitClient, nonceManager);
const handlers = createHandlerRegistry();

// Message type to GameType mapping
const messageGameTypeMap: Record<string, number> = {
  // Baccarat
  baccarat_deal: GameType.Baccarat,

  // Blackjack
  blackjack_deal: GameType.Blackjack,
  blackjack_hit: GameType.Blackjack,
  blackjack_stand: GameType.Blackjack,
  blackjack_double: GameType.Blackjack,
  blackjack_split: GameType.Blackjack,

  // Casino War
  casinowar_deal: GameType.CasinoWar,
  casinowar_war: GameType.CasinoWar,
  casinowar_surrender: GameType.CasinoWar,

  // Craps
  craps_bet: GameType.Craps,
  craps_roll: GameType.Craps,

  // Hi-Lo
  hilo_deal: GameType.HiLo,
  hilo_higher: GameType.HiLo,
  hilo_lower: GameType.HiLo,
  hilo_same: GameType.HiLo,
  hilo_cashout: GameType.HiLo,

  // Roulette
  roulette_spin: GameType.Roulette,

  // Sic Bo
  sicbo_roll: GameType.SicBo,

  // Three Card Poker
  threecardpoker_deal: GameType.ThreeCard,
  threecardpoker_play: GameType.ThreeCard,
  threecardpoker_fold: GameType.ThreeCard,

  // Ultimate Texas Hold'em
  ultimateholdem_deal: GameType.UltimateHoldem,
  ultimateholdem_bet: GameType.UltimateHoldem,
  ultimateholdem_check: GameType.UltimateHoldem,
  ultimateholdem_fold: GameType.UltimateHoldem,

  // Video Poker
  videopoker_deal: GameType.VideoPoker,
  videopoker_hold: GameType.VideoPoker,
};

/**
 * Send JSON message to client
 */
function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Send error to client
 */
function sendError(ws: WebSocket, code: string, message: string): void {
  send(ws, { type: 'error', code, message });
}

/**
 * Handle incoming message from mobile client
 */
async function handleMessage(ws: WebSocket, rawData: Buffer): Promise<void> {
  // Parse JSON
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(rawData.toString());
  } catch {
    sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Invalid JSON');
    return;
  }

  const msgType = msg.type as string | undefined;
  if (!msgType) {
    sendError(ws, ErrorCodes.INVALID_MESSAGE, 'Missing message type');
    return;
  }

  // Handle system messages
  if (msgType === 'ping') {
    send(ws, { type: 'pong', timestamp: Date.now() });
    return;
  }

  if (msgType === 'get_balance') {
    const session = sessionManager.getSession(ws);
    if (session) {
      send(ws, {
        type: 'balance',
        registered: session.registered,
        hasBalance: session.hasBalance,
        publicKey: session.publicKeyHex,
      });
    } else {
      sendError(ws, ErrorCodes.SESSION_EXPIRED, 'No active session');
    }
    return;
  }

  // Get session
  const session = sessionManager.getSession(ws);
  if (!session) {
    sendError(ws, ErrorCodes.SESSION_EXPIRED, 'Session not found');
    return;
  }

  // Map message type to game type
  const gameType = messageGameTypeMap[msgType];
  if (gameType === undefined) {
    sendError(ws, ErrorCodes.INVALID_MESSAGE, `Unknown message type: ${msgType}`);
    return;
  }

  // Get handler for game type
  const handler = handlers.get(gameType);
  if (!handler) {
    sendError(ws, ErrorCodes.INVALID_GAME_TYPE, `No handler for game type: ${gameType}`);
    return;
  }

  // Build handler context
  const ctx: HandlerContext = {
    session,
    submitClient,
    nonceManager,
    backendUrl: BACKEND_URL,
  };

  // Execute handler
  const result = await handler.handleMessage(ctx, msg);

  if (result.success) {
    if (result.response) {
      send(ws, result.response);
    }
  } else if (result.error) {
    sendError(ws, result.error.code, result.error.message);
  }
}

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', async (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[Gateway] Client connected from ${clientIp}`);

  try {
    // Create session with auto-registration
    const session = await sessionManager.createSession(ws);

    // Send session ready message
    send(ws, {
      type: 'session_ready',
      sessionId: session.id,
      publicKey: session.publicKeyHex,
      registered: session.registered,
      hasBalance: session.hasBalance,
    });

    // Handle messages
    ws.on('message', async (data: Buffer) => {
      try {
        await handleMessage(ws, data);
      } catch (err) {
        console.error('[Gateway] Message handling error:', err);
        sendError(
          ws,
          ErrorCodes.BACKEND_UNAVAILABLE,
          err instanceof Error ? err.message : 'Internal error'
        );
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      console.log(`[Gateway] Client disconnected: ${session.id}`);
      sessionManager.destroySession(ws);
    });

    // Handle errors
    ws.on('error', (err) => {
      console.error(`[Gateway] WebSocket error for ${session.id}:`, err);
    });
  } catch (err) {
    console.error('[Gateway] Session creation error:', err);
    sendError(
      ws,
      ErrorCodes.BACKEND_UNAVAILABLE,
      'Failed to create session'
    );
    ws.close();
  }
});

wss.on('error', (err) => {
  console.error('[Gateway] Server error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Gateway] Shutting down...');
  nonceManager.persist();
  wss.close(() => {
    console.log('[Gateway] Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('[Gateway] Terminating...');
  nonceManager.persist();
  wss.close(() => {
    process.exit(0);
  });
});

// Restore nonces on startup
nonceManager.restore();

console.log(`[Gateway] Mobile gateway listening on ws://0.0.0.0:${PORT}`);
console.log(`[Gateway] Backend URL: ${BACKEND_URL}`);
console.log(`[Gateway] Registered handlers for ${handlers.size} game types`);
