/**
 * HTTP client for submitting transactions to the backend
 */
export interface SubmitResult {
    accepted: boolean;
    error?: string;
}
export declare class SubmitClient {
    private baseUrl;
    private timeout;
    private origin;
    constructor(baseUrl: string, timeout?: number, origin?: string);
    /**
     * Submit a transaction to the backend
     */
    submit(submission: Uint8Array): Promise<SubmitResult>;
    /**
     * Check if backend is reachable
     */
    healthCheck(): Promise<boolean>;
    /**
     * Query account state
     */
    getAccount(publicKeyHex: string): Promise<{
        nonce: bigint;
        balance: bigint;
    } | null>;
}
//# sourceMappingURL=http.d.ts.map