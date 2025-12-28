import { encodeCasinoStartGame, encodeCasinoGameMove, buildTransaction, wrapSubmission, } from '../codec/index.js';
import { parseGameLog } from '../codec/events.js';
import { ErrorCodes, createError } from '../types/errors.js';
/** Timeout for waiting for game events (ms) */
const GAME_EVENT_TIMEOUT = 30000;
/**
 * Base game handler class
 */
export class GameHandler {
    gameType;
    constructor(gameType) {
        this.gameType = gameType;
    }
    /**
     * Start a new game and wait for on-chain game started event
     */
    async startGame(ctx, bet, gameSessionId) {
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
            // Wait for CasinoGameStarted or CasinoError event from backend
            const gameEvent = await this.waitForEvent(session, 'started');
            if (gameEvent) {
                if (gameEvent.type === 'error') {
                    // Backend rejected the game start
                    session.activeGameId = null;
                    session.gameType = null;
                    const errorMsg = gameEvent.errorMessage || `Game rejected (code ${gameEvent.errorCode})`;
                    console.log(`[GameHandler] Backend error: ${errorMsg}`);
                    return {
                        success: false,
                        error: createError(ErrorCodes.TRANSACTION_REJECTED, errorMsg),
                    };
                }
                // CRITICAL: Update session to use backend's actual on-chain session ID
                // The client generates a session ID but the backend may assign a different one
                if (gameEvent.sessionId && gameEvent.sessionId !== 0n) {
                    console.log(`[GameHandler] Updating activeGameId: ${session.activeGameId} -> ${gameEvent.sessionId}`);
                    session.activeGameId = gameEvent.sessionId;
                }
                return {
                    success: true,
                    response: this.buildGameStartedResponse(gameEvent, session.activeGameId, bet),
                };
            }
            // Fallback if no event received (backend may be slow)
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
            error: createError(ErrorCodes.TRANSACTION_REJECTED, result.error ?? 'Transaction rejected'),
        };
    }
    /**
     * Make a move in the current game and wait for on-chain event
     */
    async makeMove(ctx, payload) {
        const { session, submitClient, nonceManager, backendUrl } = ctx;
        // Check if in a game
        if (session.activeGameId === null) {
            return {
                success: false,
                error: createError(ErrorCodes.NO_ACTIVE_GAME, 'No game in progress'),
            };
        }
        const gameSessionId = session.activeGameId;
        console.log(`[GameHandler] Making move with sessionId=${gameSessionId} (hex=${gameSessionId.toString(16)})`);
        // Encode and submit
        const instruction = encodeCasinoGameMove(gameSessionId, payload);
        const nonce = nonceManager.getAndIncrement(session.publicKeyHex);
        const tx = buildTransaction(nonce, instruction, session.privateKey);
        const submission = wrapSubmission(tx);
        const result = await submitClient.submit(submission);
        if (result.accepted) {
            nonceManager.confirmNonce(session.publicKeyHex, nonce);
            // Wait for either CasinoGameMoved or CasinoGameCompleted event
            const gameEvent = await this.waitForMoveOrComplete(session);
            if (gameEvent) {
                if (gameEvent.type === 'error') {
                    // Move was rejected by backend
                    const errorMsg = gameEvent.errorMessage || `Move rejected (code ${gameEvent.errorCode})`;
                    console.log(`[GameHandler] Backend error during move: ${errorMsg}`);
                    return {
                        success: false,
                        error: createError(ErrorCodes.TRANSACTION_REJECTED, errorMsg),
                    };
                }
                else if (gameEvent.type === 'completed') {
                    // Game is over, clear session state
                    session.activeGameId = null;
                    session.gameType = null;
                    return {
                        success: true,
                        response: this.buildGameCompletedResponse(gameEvent),
                    };
                }
                else if (gameEvent.type === 'moved') {
                    return {
                        success: true,
                        response: this.buildGameMoveResponse(gameEvent),
                    };
                }
            }
            // Fallback if no event received
            return {
                success: true,
                response: {
                    type: 'move_accepted',
                    sessionId: gameSessionId.toString(),
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
            error: createError(ErrorCodes.TRANSACTION_REJECTED, result.error ?? 'Transaction rejected'),
        };
    }
    /**
     * Wait for a specific event type from the updates stream
     * Uses waitForAnyEvent since we filter by Account (one game per player)
     * Also checks for error events if we're waiting for 'started'
     */
    async waitForEvent(session, eventType) {
        if (!session.updatesClient) {
            console.warn('No updates client connected, skipping event wait');
            return null;
        }
        try {
            // If waiting for 'started', also accept 'error' events
            if (eventType === 'started') {
                return await session.updatesClient.waitForStartedOrError(GAME_EVENT_TIMEOUT);
            }
            return await session.updatesClient.waitForAnyEvent(eventType, GAME_EVENT_TIMEOUT);
        }
        catch (err) {
            console.warn(`Timeout waiting for ${eventType} event:`, err);
            return null;
        }
    }
    /**
     * Wait for either a move or complete event
     */
    async waitForMoveOrComplete(session) {
        if (!session.updatesClient) {
            console.warn('No updates client connected, skipping event wait');
            return null;
        }
        try {
            return await session.updatesClient.waitForMoveOrComplete(GAME_EVENT_TIMEOUT);
        }
        catch (err) {
            console.warn('Timeout waiting for move/complete event:', err);
            return null;
        }
    }
    /**
     * Build response for game started event
     */
    buildGameStartedResponse(event, sessionId, bet) {
        const response = {
            type: 'game_started',
            gameType: event.gameType ?? this.gameType,
            sessionId: sessionId.toString(),
            bet: bet.toString(),
        };
        // Include initial state if available (parsed from binary or logs)
        if (event.initialState && event.initialState.length > 0) {
            // Parse initial state based on game type
            response.initialState = this.parseInitialState(event.initialState);
        }
        return response;
    }
    /**
     * Build response for game move event
     */
    buildGameMoveResponse(event) {
        const response = {
            type: 'game_move',
            sessionId: event.sessionId.toString(),
            moveNumber: event.moveNumber,
        };
        // Parse JSON logs for game state
        if (event.logs && event.logs.length > 0) {
            const parsedLog = parseGameLog(event.logs[0]);
            if (parsedLog) {
                Object.assign(response, parsedLog);
            }
        }
        return response;
    }
    /**
     * Build response for game completed event
     */
    buildGameCompletedResponse(event) {
        const response = {
            type: 'game_result',
            sessionId: event.sessionId.toString(),
            payout: event.payout?.toString() ?? '0',
            finalChips: event.finalChips?.toString() ?? '0',
        };
        // Determine win/loss status
        const payout = event.payout ?? 0n;
        if (payout > 0n) {
            response.won = true;
            response.message = `You win ${payout}!`;
        }
        else if (payout < 0n) {
            response.won = false;
            response.message = 'You lose!';
        }
        else {
            response.won = false;
            response.push = true;
            response.message = 'Push - bet returned';
        }
        // Parse JSON logs for detailed game state
        if (event.logs && event.logs.length > 0) {
            const parsedLog = parseGameLog(event.logs[0]);
            if (parsedLog) {
                Object.assign(response, parsedLog);
            }
        }
        return response;
    }
    /**
     * Parse initial state based on game type (override in subclasses if needed)
     */
    parseInitialState(state) {
        // Default: return raw state as hex
        return { rawState: Buffer.from(state).toString('hex') };
    }
}
//# sourceMappingURL=base.js.map