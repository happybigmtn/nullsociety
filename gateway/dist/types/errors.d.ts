/**
 * Error code taxonomy for gateway responses
 */
export declare const ErrorCodes: {
    readonly INVALID_MESSAGE: "INVALID_MESSAGE";
    readonly INVALID_GAME_TYPE: "INVALID_GAME_TYPE";
    readonly INVALID_BET: "INVALID_BET";
    readonly NO_ACTIVE_GAME: "NO_ACTIVE_GAME";
    readonly INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE";
    readonly NOT_REGISTERED: "NOT_REGISTERED";
    readonly BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE";
    readonly TRANSACTION_REJECTED: "TRANSACTION_REJECTED";
    readonly NONCE_MISMATCH: "NONCE_MISMATCH";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly SESSION_EXPIRED: "SESSION_EXPIRED";
    readonly GAME_IN_PROGRESS: "GAME_IN_PROGRESS";
    readonly REGISTRATION_FAILED: "REGISTRATION_FAILED";
};
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
/**
 * Structured error response
 */
export interface ErrorResponse {
    type: 'error';
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
}
/**
 * Create error response
 */
export declare function createError(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorResponse;
//# sourceMappingURL=errors.d.ts.map