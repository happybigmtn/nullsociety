type NonceManagerOptions = {
    dataDir?: string;
    legacyPath?: string;
};
export declare class NonceManager {
    private nonces;
    private pending;
    private locks;
    private persistPath;
    private dataDir;
    private legacyPath;
    constructor(options?: NonceManagerOptions);
    private ensureDataDir;
    private migrateLegacyFile;
    /**
     * Get current nonce and increment for next use
     * Marks nonce as pending until confirmed
     */
    getAndIncrement(publicKeyHex: string): bigint;
    /**
     * Get current nonce without incrementing
     */
    getCurrentNonce(publicKeyHex: string): bigint;
    /**
     * Set current nonce explicitly (e.g., after sync or successful submission)
     */
    setCurrentNonce(publicKeyHex: string, nonce: bigint): void;
    /**
     * Serialize nonce usage per public key to avoid concurrent nonce races
     */
    withLock<T>(publicKeyHex: string, fn: (nonce: bigint) => Promise<T>): Promise<T>;
    /**
     * Mark nonce as confirmed (received in block)
     */
    confirmNonce(publicKeyHex: string, nonce: bigint): void;
    /**
     * Check if there are pending transactions for a key
     */
    hasPending(publicKeyHex: string): boolean;
    /**
     * Get all pending nonces for a key
     */
    getPendingNonces(publicKeyHex: string): bigint[];
    /**
     * Sync nonce from backend account state
     * Call this when nonce mismatch is detected
     */
    syncFromBackend(publicKeyHex: string, backendUrl: string): Promise<boolean>;
    /**
     * Check if error indicates nonce mismatch
     */
    isNonceMismatch(error: string): boolean;
    /**
     * Handle transaction rejection
     * Returns true if nonce resync is needed
     */
    handleRejection(publicKeyHex: string, error: string): boolean;
    /**
     * Reset nonce for a key (e.g., new player)
     */
    reset(publicKeyHex: string): void;
    /**
     * Persist nonces to disk for restart recovery
     */
    persist(): void;
    /**
     * Restore nonces from disk
     */
    restore(): void;
    /**
     * Get stats for monitoring
     */
    getStats(): {
        totalKeys: number;
        totalPending: number;
    };
}
export {};
//# sourceMappingURL=nonce.d.ts.map