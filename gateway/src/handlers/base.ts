/**
 * Base game handler interface and utilities
 */
import type { Session } from '../types/session.js';
import type { GameType } from '../codec/constants.js';
import {
  encodeCasinoStartGame,
  encodeCasinoGameMove,
  buildTransaction,
  wrapSubmission,
} from '../codec/index.js';
import type { SubmitClient } from '../backend/http.js';
import type { NonceManager } from '../session/nonce.js';
import { ErrorCodes, createError, type ErrorResponse } from '../types/errors.js';

/**
 * Result of handling a message
 */
export interface HandleResult {
  success: boolean;
  response?: Record<string, unknown>;
  error?: ErrorResponse;
}

/**
 * Context passed to handlers
 */
export interface HandlerContext {
  session: Session;
  submitClient: SubmitClient;
  nonceManager: NonceManager;
  backendUrl: string;
}

/**
 * Base game handler class
 */
export abstract class GameHandler {
  protected gameType: GameType;

  constructor(gameType: GameType) {
    this.gameType = gameType;
  }

  /**
   * Handle a message for this game type
   */
  abstract handleMessage(
    ctx: HandlerContext,
    msg: Record<string, unknown>
  ): Promise<HandleResult>;

  /**
   * Start a new game
   */
  protected async startGame(
    ctx: HandlerContext,
    bet: bigint,
    gameSessionId: bigint
  ): Promise<HandleResult> {
    const { session, submitClient, nonceManager, backendUrl } = ctx;

    // Check if already in a game
    if (session.activeGameId !== null) {
      return {
        success: false,
        error: createError(ErrorCodes.GAME_IN_PROGRESS, 'A game is already in progress'),
      };
    }

    // Check registration
    if (!session.registered) {
      return {
        success: false,
        error: createError(ErrorCodes.NOT_REGISTERED, 'Player not registered'),
      };
    }

    // Encode and submit
    const instruction = encodeCasinoStartGame(this.gameType, bet, gameSessionId);
    const nonce = nonceManager.getAndIncrement(session.publicKeyHex);
    const tx = buildTransaction(nonce, instruction, session.privateKey);
    const submission = wrapSubmission(tx);

    const result = await submitClient.submit(submission);

    if (result.accepted) {
      session.activeGameId = gameSessionId;
      session.gameType = this.gameType;
      nonceManager.confirmNonce(session.publicKeyHex, nonce);

      return {
        success: true,
        response: {
          type: 'game_started',
          gameType: this.gameType,
          sessionId: gameSessionId.toString(),
          bet: bet.toString(),
        },
      };
    }

    // Handle nonce mismatch
    if (result.error && nonceManager.handleRejection(session.publicKeyHex, result.error)) {
      await nonceManager.syncFromBackend(session.publicKeyHex, backendUrl);
      // Retry once
      return this.startGame(ctx, bet, gameSessionId);
    }

    return {
      success: false,
      error: createError(
        ErrorCodes.TRANSACTION_REJECTED,
        result.error ?? 'Transaction rejected'
      ),
    };
  }

  /**
   * Make a move in the current game
   */
  protected async makeMove(
    ctx: HandlerContext,
    payload: Uint8Array
  ): Promise<HandleResult> {
    const { session, submitClient, nonceManager, backendUrl } = ctx;

    // Check if in a game
    if (session.activeGameId === null) {
      return {
        success: false,
        error: createError(ErrorCodes.NO_ACTIVE_GAME, 'No game in progress'),
      };
    }

    // Encode and submit
    const instruction = encodeCasinoGameMove(session.activeGameId, payload);
    const nonce = nonceManager.getAndIncrement(session.publicKeyHex);
    const tx = buildTransaction(nonce, instruction, session.privateKey);
    const submission = wrapSubmission(tx);

    const result = await submitClient.submit(submission);

    if (result.accepted) {
      nonceManager.confirmNonce(session.publicKeyHex, nonce);
      return {
        success: true,
        response: {
          type: 'move_accepted',
          sessionId: session.activeGameId.toString(),
        },
      };
    }

    // Handle nonce mismatch
    if (result.error && nonceManager.handleRejection(session.publicKeyHex, result.error)) {
      await nonceManager.syncFromBackend(session.publicKeyHex, backendUrl);
      // Retry once
      return this.makeMove(ctx, payload);
    }

    return {
      success: false,
      error: createError(
        ErrorCodes.TRANSACTION_REJECTED,
        result.error ?? 'Transaction rejected'
      ),
    };
  }
}
