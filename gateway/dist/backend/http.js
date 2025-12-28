/**
 * HTTP client for submitting transactions to the backend
 */
export class SubmitClient {
    baseUrl;
    timeout;
    origin;
    constructor(baseUrl, timeout = 10000, origin) {
        // Remove trailing slash
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.timeout = timeout;
        // Default origin for server-to-server requests (must match ALLOWED_HTTP_ORIGINS)
        this.origin = origin || 'http://localhost:9010';
    }
    /**
     * Submit a transaction to the backend
     */
    async submit(submission) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await fetch(`${this.baseUrl}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Origin': this.origin,
                },
                body: Buffer.from(submission),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                console.log(`[SubmitClient] Transaction accepted`);
                return { accepted: true };
            }
            // Try to get error message from response
            let error = `HTTP ${response.status}`;
            try {
                const text = await response.text();
                if (text)
                    error = text;
            }
            catch {
                // Ignore parse errors
            }
            console.log(`[SubmitClient] Transaction rejected: ${error}`);
            return { accepted: false, error };
        }
        catch (err) {
            clearTimeout(timeoutId);
            if (err instanceof Error && err.name === 'AbortError') {
                return { accepted: false, error: 'Request timeout' };
            }
            return {
                accepted: false,
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }
    /**
     * Check if backend is reachable
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/health`, {
                method: 'GET',
                headers: {
                    'Origin': this.origin,
                },
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Query account state
     */
    async getAccount(publicKeyHex) {
        try {
            const response = await fetch(`${this.baseUrl}/account/${publicKeyHex}`, {
                headers: {
                    'Origin': this.origin,
                },
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok)
                return null;
            const data = await response.json();
            return {
                nonce: BigInt(data.nonce || 0),
                balance: BigInt(data.balance || 0),
            };
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=http.js.map