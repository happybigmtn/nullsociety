# Nullspace Ops Service

A lightweight ops/analytics service that stores telemetry, leaderboards, referrals, and push/CRM data on disk.

## What it does
- Ingests analytics events and computes KPIs.
- Maintains weekly league + seasonal leaderboards.
- Issues referral codes and tracks qualification.
- Registers Expo push tokens and sends campaigns.
- Serves the public economy snapshot JSON.

## Quick start
```bash
pnpm -C services/ops install
pnpm -C services/ops build
pnpm -C services/ops start
```

## Environment variables
- `OPS_PORT`: HTTP port (default `9020`).
- `OPS_DATA_DIR`: data directory (default `data/ops`).
- `OPS_ALLOWED_ORIGINS`: comma-separated CORS allowlist. Empty = allow all.
- `OPS_ALLOW_NO_ORIGIN`: allow requests without Origin header (`true/false`).
- `OPS_ADMIN_TOKEN`: if set, required for admin endpoints (`/push/send`, `/crm/*`).

Analytics + league:
- `OPS_LEAGUE_POINTS_MODE`: `wager` (default) | `net` | `net-abs`.
- `OPS_LEAGUE_INCLUDE_FREEROLL`: include freeroll events in leagues.
- `OPS_REFERRAL_MIN_GAMES`: games required to qualify referral (default `10`).
- `OPS_REFERRAL_MIN_DAYS`: unique active days required (default `3`).

Push:
- `OPS_EXPO_ENDPOINT`: Expo push endpoint (default `https://exp.host/--/api/v2/push/send`).
- `OPS_EXPO_ACCESS_TOKEN`: Expo push access token (optional).

## Endpoints
- `POST /analytics/events` – ingest events.
- `GET /analytics/kpis` – KPI summary.
- `GET /league/leaderboard` – weekly leaderboard.
- `GET /league/leaderboard?season=YYYY-MM` – seasonal leaderboard.
- `GET /economy/snapshot` – public snapshot JSON.
- `POST /referrals/code` – get/create referral code.
- `POST /referrals/claim` – claim referral.
- `GET /referrals/summary?publicKey=` – referral summary.
- `POST /push/register` – register Expo token.
- `POST /push/send` – send push (admin).
- `POST /crm/campaigns` – schedule campaign (admin).
- `GET /crm/campaigns` – list campaigns (admin).

## Admin CLI
Use `scripts/ops-admin.mjs` to query KPIs, send pushes, and manage campaigns:

```bash
OPS_URL=http://localhost:9020 OPS_ADMIN_TOKEN=secret \\
  node scripts/ops-admin.mjs campaigns
```

## Data layout
All data is stored under `OPS_DATA_DIR`:
- `events/YYYY-MM-DD.ndjson`
- `actors.json`
- `league/*.json`
- `league-season/*.json`
- `economy/latest.json`
- `referrals.json`
- `referral-progress.json`
- `push-tokens.json`
- `campaigns.json`
