#!/usr/bin/env node
const args = process.argv.slice(2);

const usage = () => {
  console.log(`Usage:
  node scripts/check-slo.mjs [--prom-url <url>] [--window <duration>] [--allow-missing]

Defaults:
  --prom-url  http://localhost:9090
  --window    5m
`);
};

let promUrl = process.env.PROM_URL ?? 'http://localhost:9090';
let window = process.env.SLO_WINDOW ?? '5m';
let allowMissing = ['1', 'true', 'yes'].includes(String(process.env.SLO_ALLOW_MISSING ?? '').toLowerCase());

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  }
  if (arg === '--prom-url') {
    promUrl = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--window') {
    window = args[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--allow-missing') {
    allowMissing = true;
  }
}

const checks = [
  {
    name: 'simulator_submit_p95_ms',
    expr: `histogram_quantile(0.95, sum(rate(nullspace_simulator_http_submit_latency_ms_bucket[${window}])) by (le))`,
    max: 250,
  },
  {
    name: 'simulator_submit_p99_ms',
    expr: `histogram_quantile(0.99, sum(rate(nullspace_simulator_http_submit_latency_ms_bucket[${window}])) by (le))`,
    max: 500,
  },
  {
    name: 'auth_request_avg_ms',
    expr: `avg_over_time(nullspace_auth_timing_avg_ms{key="http.request_ms"}[${window}])`,
    max: 200,
  },
  {
    name: 'ws_send_errors_rate',
    expr: `rate(nullspace_simulator_ws_updates_send_errors_total[${window}])`,
    max: 0,
  },
  {
    name: 'casino_errors_rate',
    expr: `rate(nullspace_simulator_casino_errors_total[${window}])`,
    max: 0,
  },
];

const queryProm = async (expr) => {
  const url = new URL('/api/v1/query', promUrl);
  url.searchParams.set('query', expr);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Prometheus query failed (${res.status})`);
  }
  const payload = await res.json();
  if (payload.status !== 'success') {
    throw new Error(`Prometheus query error: ${payload.error ?? 'unknown error'}`);
  }
  const results = payload?.data?.result ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  const values = results
    .map((entry) => Number(entry?.value?.[1]))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.max(...values);
};

const epsilon = 1e-9;
let failures = 0;

console.log('[slo-check] prom-url:', promUrl);
console.log('[slo-check] window:', window);

for (const check of checks) {
  let value;
  try {
    value = await queryProm(check.expr);
  } catch (err) {
    console.error(`[slo-check] ${check.name}: query failed - ${err.message}`);
    failures += 1;
    continue;
  }

  if (value === null) {
    const message = `[slo-check] ${check.name}: no data`;
    if (allowMissing) {
      console.warn(message);
    } else {
      console.error(message);
      failures += 1;
    }
    continue;
  }

  const ok = check.max === 0 ? value <= epsilon : value <= check.max;
  const formatted = Number.isFinite(value) ? value.toFixed(2) : 'NaN';
  if (ok) {
    console.log(`[slo-check] ${check.name}: ${formatted} (<= ${check.max})`);
  } else {
    console.error(`[slo-check] ${check.name}: ${formatted} (> ${check.max})`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`[slo-check] ${failures} check(s) failed.`);
  process.exit(1);
}

console.log('[slo-check] All checks passed.');
