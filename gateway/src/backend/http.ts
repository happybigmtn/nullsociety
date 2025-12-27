/**
 * HTTP client for submitting transactions to the backend
 */

export interface SubmitResult {
  accepted: boolean;
  error?: string;
}

export class SubmitClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string, timeout: number = 10000) {
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
  }

  /**
   * Submit a transaction to the backend
   */
  async submit(submission: Uint8Array): Promise<SubmitResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: Buffer.from(submission),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { accepted: true };
      }

      // Try to get error message from response
      let error = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text) error = text;
      } catch {
        // Ignore parse errors
      }

      return { accepted: false, error };
    } catch (err) {
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
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Query account state
   */
  async getAccount(publicKeyHex: string): Promise<{
    nonce: bigint;
    balance: bigint;
  } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/account/${publicKeyHex}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return null;

      const data = await response.json();
      return {
        nonce: BigInt(data.nonce || 0),
        balance: BigInt(data.balance || 0),
      };
    } catch {
      return null;
    }
  }
}
