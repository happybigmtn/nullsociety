import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { fetchMobileEntitlements, type Entitlement } from '../services/entitlements';

export function useEntitlements() {
  const publicKey = useGameStore((state) => state.publicKey);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      const next = await fetchMobileEntitlements(publicKey);
      setEntitlements(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entitlements');
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entitlements, loading, error, refresh, publicKey };
}
