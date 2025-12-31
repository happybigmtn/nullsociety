/**
 * Nonce management with recovery mechanism
 * Per-player nonce tracking to prevent replay attacks
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
const DEFAULT_DATA_DIR = '.gateway-data';
const DEFAULT_NONCE_FILE = 'nonces.json';
const LEGACY_NONCE_FILE = '.gateway-nonces.json';
export class NonceManager {
    nonces = new Map();
    pending = new Map();
    locks = new Map();
    persistPath;
    dataDir;
    legacyPath;
    constructor(options = {}) {
        this.dataDir = resolve(options.dataDir ?? process.env.GATEWAY_DATA_DIR ?? DEFAULT_DATA_DIR);
        this.persistPath = join(this.dataDir, DEFAULT_NONCE_FILE);
        this.legacyPath = resolve(options.legacyPath ?? LEGACY_NONCE_FILE);
        this.ensureDataDir();
        this.migrateLegacyFile();
    }
    ensureDataDir() {
        try {
            if (!existsSync(this.dataDir)) {
                mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
            }
            chmodSync(this.dataDir, 0o700);
        }
        catch (err) {
            console.error('Failed to prepare nonce data directory:', err);
        }
    }
    migrateLegacyFile() {
        if (!existsSync(this.legacyPath) || existsSync(this.persistPath)) {
            return;
        }
        try {
            const legacyData = readFileSync(this.legacyPath, 'utf8');
            writeFileSync(this.persistPath, legacyData, { mode: 0o600 });
            chmodSync(this.persistPath, 0o600);
            unlinkSync(this.legacyPath);
        }
        catch (err) {
            console.warn('Failed to migrate legacy nonce file:', err);
        }
    }
    /**
     * Get current nonce and increment for next use
     * Marks nonce as pending until confirmed
     */
    getAndIncrement(publicKeyHex) {
        const current = this.nonces.get(publicKeyHex) ?? 0n;
        this.nonces.set(publicKeyHex, current + 1n);
        // Track as pending until confirmed
        if (!this.pending.has(publicKeyHex)) {
            this.pending.set(publicKeyHex, new Set());
        }
        this.pending.get(publicKeyHex).add(current);
        return current;
    }
    /**
     * Get current nonce without incrementing
     */
    getCurrentNonce(publicKeyHex) {
        return this.nonces.get(publicKeyHex) ?? 0n;
    }
    /**
     * Set current nonce explicitly (e.g., after sync or successful submission)
     */
    setCurrentNonce(publicKeyHex, nonce) {
        this.nonces.set(publicKeyHex, nonce);
    }
    /**
     * Serialize nonce usage per public key to avoid concurrent nonce races
     */
    async withLock(publicKeyHex, fn) {
        const pendingLock = this.locks.get(publicKeyHex);
        if (pendingLock) {
            await pendingLock;
        }
        let releaseLock;
        const lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        this.locks.set(publicKeyHex, lockPromise);
        try {
            return await fn(this.getCurrentNonce(publicKeyHex));
        }
        finally {
            this.locks.delete(publicKeyHex);
            releaseLock();
        }
    }
    /**
     * Mark nonce as confirmed (received in block)
     */
    confirmNonce(publicKeyHex, nonce) {
        const pendingSet = this.pending.get(publicKeyHex);
        if (pendingSet) {
            pendingSet.delete(nonce);
            if (pendingSet.size === 0) {
                this.pending.delete(publicKeyHex);
            }
        }
    }
    /**
     * Check if there are pending transactions for a key
     */
    hasPending(publicKeyHex) {
        const pendingSet = this.pending.get(publicKeyHex);
        return pendingSet !== undefined && pendingSet.size > 0;
    }
    /**
     * Get all pending nonces for a key
     */
    getPendingNonces(publicKeyHex) {
        const pendingSet = this.pending.get(publicKeyHex);
        return pendingSet ? Array.from(pendingSet) : [];
    }
    /**
     * Sync nonce from backend account state
     * Call this when nonce mismatch is detected
     */
    async syncFromBackend(publicKeyHex, backendUrl) {
        try {
            const response = await fetch(`${backendUrl}/account/${publicKeyHex}`);
            if (response.ok) {
                const account = await response.json();
                const onChainNonce = BigInt(account.nonce);
                // Set to on-chain nonce (transactions will use this + 1)
                this.nonces.set(publicKeyHex, onChainNonce);
                // Clear pending - if tx was accepted, it's confirmed; if not, retry with new nonce
                this.pending.delete(publicKeyHex);
                return true;
            }
        }
        catch (err) {
            console.error(`Failed to sync nonce for ${publicKeyHex.slice(0, 8)}:`, err);
        }
        return false;
    }
    /**
     * Check if error indicates nonce mismatch
     */
    isNonceMismatch(error) {
        const lowerError = error.toLowerCase();
        return lowerError.includes('nonce') ||
            lowerError.includes('invalidnonce') ||
            lowerError.includes('replay');
    }
    /**
     * Handle transaction rejection
     * Returns true if nonce resync is needed
     */
    handleRejection(publicKeyHex, error) {
        if (this.isNonceMismatch(error)) {
            // Clear pending for this key - need to resync
            this.pending.delete(publicKeyHex);
            return true;
        }
        return false;
    }
    /**
     * Reset nonce for a key (e.g., new player)
     */
    reset(publicKeyHex) {
        this.nonces.delete(publicKeyHex);
        this.pending.delete(publicKeyHex);
    }
    /**
     * Persist nonces to disk for restart recovery
     */
    persist() {
        try {
            this.ensureDataDir();
            const data = {};
            for (const [k, v] of this.nonces.entries()) {
                data[k] = v.toString();
            }
            writeFileSync(this.persistPath, JSON.stringify(data, null, 2), { mode: 0o600 });
            chmodSync(this.persistPath, 0o600);
        }
        catch (err) {
            console.error('Failed to persist nonces:', err);
        }
    }
    /**
     * Restore nonces from disk
     */
    restore() {
        try {
            if (!existsSync(this.persistPath)) {
                return;
            }
            const data = JSON.parse(readFileSync(this.persistPath, 'utf8'));
            for (const [k, v] of Object.entries(data)) {
                if (typeof v === 'string') {
                    this.nonces.set(k, BigInt(v));
                }
            }
        }
        catch (err) {
            console.error('Failed to restore nonces:', err);
        }
    }
    /**
     * Get stats for monitoring
     */
    getStats() {
        let totalPending = 0;
        for (const pendingSet of this.pending.values()) {
            totalPending += pendingSet.size;
        }
        return {
            totalKeys: this.nonces.size,
            totalPending,
        };
    }
}
//# sourceMappingURL=nonce.js.map