#!/usr/bin/env node

const args = process.argv.slice(2);

const usage = () => {
  console.log(`Usage:
  node scripts/ops-admin.mjs kpis [--since <date|ms>] [--until <date|ms>]
  node scripts/ops-admin.mjs leaderboard [--week YYYY-W##] [--season YYYY-MM]
  node scripts/ops-admin.mjs push --title "..." --body "..." [--tokens token1,token2] [--inactive-days N] [--active-within-days N] [--public-keys pk1,pk2]
  node scripts/ops-admin.mjs campaign --title "..." --body "..." [--name "..."] [--send-at "2026-01-05T12:00:00Z"] [--inactive-days N] [--active-within-days N] [--public-keys pk1,pk2]
  node scripts/ops-admin.mjs campaigns
  node scripts/ops-admin.mjs referral-code --public-key <hex>
  node scripts/ops-admin.mjs referral-summary --public-key <hex>

Env:
  OPS_URL or OPS_ANALYTICS_URL (base URL)
  OPS_ADMIN_TOKEN (for admin endpoints)
`);
};

const parseFlags = (list) => {
  const flags = {};
  for (let i = 0; i < list.length; i += 1) {
    const token = list[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = list[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
};

const opsBase = (process.env.OPS_URL ?? process.env.OPS_ANALYTICS_URL ?? '').trim().replace(/\/$/, '');
if (!opsBase) {
  console.error('Missing OPS_URL or OPS_ANALYTICS_URL');
  process.exit(1);
}

const adminToken = process.env.OPS_ADMIN_TOKEN ?? '';

const request = async (path, init = {}, needsAuth = false) => {
  const headers = { 'Content-Type': 'application/json', ...(init.headers ?? {}) };
  if (needsAuth && adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }
  const res = await fetch(`${opsBase}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 200)}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
};

const cmd = args[0];
const flags = parseFlags(args.slice(1));

const parseList = (value) => (value ? String(value).split(',').map((v) => v.trim()).filter(Boolean) : []);
const buildSegment = () => {
  const segment = {};
  if (flags['inactive-days']) {
    const value = Number(flags['inactive-days']);
    if (Number.isFinite(value) && value > 0) segment.inactiveDays = value;
  }
  if (flags['active-within-days']) {
    const value = Number(flags['active-within-days']);
    if (Number.isFinite(value) && value > 0) segment.activeWithinDays = value;
  }
  const publicKeys = parseList(flags['public-keys']);
  if (publicKeys.length > 0) segment.publicKeys = publicKeys;
  return Object.keys(segment).length > 0 ? segment : undefined;
};

const main = async () => {
  switch (cmd) {
    case 'kpis': {
      const params = new URLSearchParams();
      if (flags.since) params.set('since', flags.since);
      if (flags.until) params.set('until', flags.until);
      const data = await request(`/analytics/kpis?${params.toString()}`);
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'leaderboard': {
      const params = new URLSearchParams();
      if (flags.week) params.set('week', flags.week);
      if (flags.season) params.set('season', flags.season);
      const data = await request(`/league/leaderboard?${params.toString()}`);
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'push': {
      if (!flags.title || !flags.body) throw new Error('Missing --title or --body');
      const tokens = parseList(flags.tokens);
      const payload = {
        title: flags.title,
        body: flags.body,
        tokens: tokens.length > 0 ? tokens : undefined,
        segment: buildSegment(),
      };
      const data = await request('/push/send', { method: 'POST', body: JSON.stringify(payload) }, true);
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'campaign': {
      if (!flags.title || !flags.body) throw new Error('Missing --title or --body');
      const sendAt = flags['send-at'] ? Date.parse(flags['send-at']) : Date.now();
      if (!Number.isFinite(sendAt)) throw new Error('Invalid --send-at');
      const payload = {
        name: flags.name,
        title: flags.title,
        body: flags.body,
        sendAtMs: sendAt,
        segment: buildSegment(),
      };
      const data = await request('/crm/campaigns', { method: 'POST', body: JSON.stringify(payload) }, true);
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'campaigns': {
      const data = await request('/crm/campaigns', {}, true);
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'referral-code': {
      if (!flags['public-key']) throw new Error('Missing --public-key');
      const payload = { publicKey: flags['public-key'] };
      const data = await request('/referrals/code', { method: 'POST', body: JSON.stringify(payload) });
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    case 'referral-summary': {
      if (!flags['public-key']) throw new Error('Missing --public-key');
      const params = new URLSearchParams({ publicKey: flags['public-key'] });
      const data = await request(`/referrals/summary?${params.toString()}`);
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    default:
      usage();
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
