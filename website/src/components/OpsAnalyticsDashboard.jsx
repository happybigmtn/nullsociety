import React, { useCallback, useEffect, useState } from 'react';
import StatsCard from './StatsCard';

const opsBase = (import.meta.env.VITE_OPS_URL || import.meta.env.VITE_ANALYTICS_URL || '').replace(/\/$/, '');

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;

const OpsAnalyticsDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchKpis = useCallback(async () => {
    if (!opsBase) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${opsBase}/analytics/kpis`);
      if (!res.ok) throw new Error(`KPI fetch failed (${res.status})`);
      const payload = await res.json();
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load KPIs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKpis();
  }, [fetchKpis]);

  if (!opsBase) {
    return (
      <div className="text-gray-100 p-8 text-center bg-gray-950 min-h-screen">
        Missing VITE_OPS_URL / VITE_ANALYTICS_URL — ops analytics unavailable.
      </div>
    );
  }

  if (loading) {
    return <div className="text-gray-100 p-8 text-center bg-gray-950 min-h-screen">Loading KPIs...</div>;
  }

  if (error) {
    return (
      <div className="text-gray-100 p-8 text-center bg-gray-950 min-h-screen">
        {error}
        <div className="mt-4">
          <button
            className="text-[10px] border px-3 py-2 rounded bg-gray-900 border-gray-700 text-gray-200 hover:border-gray-500"
            onClick={fetchKpis}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-gray-100 p-8 text-center bg-gray-950 min-h-screen">No KPI data yet.</div>;
  }

  const d7 = data.d7 ?? { cohort: 0, retained: 0, rate: 0 };
  const d30 = data.d30 ?? { cohort: 0, retained: 0, rate: 0 };
  const conversion = data.conversion ?? { converted: 0, rate: 0 };

  return (
    <div className="bg-gray-950 min-h-screen text-gray-100 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">Product Analytics</h1>
            <p className="text-gray-400">Live KPIs from ops telemetry</p>
          </div>
          <button
            className="text-[10px] border px-3 py-2 rounded bg-gray-900 border-gray-700 text-gray-200 hover:border-gray-500"
            onClick={fetchKpis}
          >
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="DAU" value={Number(data.dau ?? 0).toLocaleString()} subtext="Today" />
          <StatsCard title="WAU" value={Number(data.wau ?? 0).toLocaleString()} subtext="7d" />
          <StatsCard title="MAU" value={Number(data.mau ?? 0).toLocaleString()} subtext="30d" />
          <StatsCard title="Active Users" value={Number(data.activeUsers ?? 0).toLocaleString()} subtext="Range" />
          <StatsCard title="New Users" value={Number(data.newUsers ?? 0).toLocaleString()} subtext="Range" />
          <StatsCard title="D7 Retention" value={formatPercent(d7.rate ?? 0)} subtext={`${d7.retained}/${d7.cohort}`} />
          <StatsCard title="D30 Retention" value={formatPercent(d30.rate ?? 0)} subtext={`${d30.retained}/${d30.cohort}`} />
          <StatsCard title="Conversion" value={formatPercent(conversion.rate ?? 0)} subtext={`${conversion.converted} users`} />
          <StatsCard title="Revenue" value={formatCurrency(data.revenue ?? 0)} subtext="Range" />
          <StatsCard title="ARPDAU" value={formatCurrency(data.arpDau ?? 0)} subtext="Avg" />
        </div>
      </div>
    </div>
  );
};

export default OpsAnalyticsDashboard;
