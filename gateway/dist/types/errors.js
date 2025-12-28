/**
 * Error code taxonomy for gateway responses
 */
export const ErrorCodes = {
    // Client errors (4xx equivalent)
    INVALID_MESSAGE: 'INVALID_MESSAGE', // Malformed JSON or unknown type
    INVALID_GAME_TYPE: 'INVALID_GAME_TYPE', // Unknown game type
    INVALID_BET: 'INVALID_BET', // Bet amount out of range
    NO_ACTIVE_GAME: 'NO_ACTIVE_GAME', // Move without active game
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE', // Not enough chips
    NOT_REGISTERED: 'NOT_REGISTERED', // Player not registered
    // Backend errors (5xx equivalent)
    BACKEND_UNAVAILABLE: 'BACKEND_UNAVAILABLE', // Can't reach simulator
    TRANSACTION_REJECTED: 'TRANSACTION_REJECTED', // Backend rejected tx
    NONCE_MISMATCH: 'NONCE_MISMATCH', // Nonce out of sync
    INTERNAL_ERROR: 'INTERNAL_ERROR', // Unexpected error
    // Session errors
    SESSION_EXPIRED: 'SESSION_EXPIRED', // Session timed out
    GAME_IN_PROGRESS: 'GAME_IN_PROGRESS', // Can't start new game
    REGISTRATION_FAILED: 'REGISTRATION_FAILED', // Failed to register player
};
/**
 * Create error response
 */
export function createError(code, message, details) {
    return {
        type: 'error',
        code,
        message,
        ...(details && { details }),
    };
}
//# sourceMappingURL=errors.js.map