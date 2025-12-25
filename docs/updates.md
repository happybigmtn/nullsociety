# Nullspace Updates

## 2025-12-25: Local Convex Development Environment

Successfully configured self-hosted Convex running locally via Docker.

### Running Services
| Service | Port | URL |
|---------|------|-----|
| Convex Backend | 3210 | http://127.0.0.1:3210 |
| Convex Site Proxy | 3211 | http://127.0.0.1:3211 |
| Convex Dashboard | 6791 | http://127.0.0.1:6791 |

### Admin Key
```
convex-self-hosted|01264135efc7d9295454a532c1ea64fbe327238bf5ebd45562f50198eb9b7586c57f2ff298
```

### Environment Variables (in Convex)
```
STRIPE_SECRET_KEY=sk_test_51SgDHo3nipX4Oc41...
STRIPE_WEBHOOK_SECRET=whsec_REDACTED
CONVEX_SERVICE_TOKEN=local-e2e-service-token
```

### Commands
```bash
# Start Convex Docker
cd docker/convex && docker-compose up -d

# Sync functions to local backend
cd website && npx convex dev --once

# Watch mode (auto-sync on changes)
cd website && npx convex dev
```

---

## 2025-12-25: Convex MCP Server Installed

Added `.mcp.json` to project root with Convex MCP server configuration.
After restarting Claude Code, you'll have access to Convex tools:
- `envList`, `envGet`, `envSet`, `envRemove` - Manage deployment env vars
- Direct Convex function introspection

---

## 2025-12-25: Stripe Sandbox Integration

### Connected Account
- **Account ID**: `acct_1SgDHo3nipX4Oc41`
- **Display Name**: Null/Society sandbox
- **Dashboard**: https://dashboard.stripe.com/acct_1SgDHo3nipX4Oc41/apikeys

### Active Product/Price
- **Product**: `prod_TfTJyBd9tB1kDS` (Nullspace Membership)
- **Price**: `price_1Si8MZ3nipX4Oc41nPRODqdn` ($5/month)
- **Tier**: `member`

---

## Stripe Setup Guide

### 1. Get API Keys
Navigate to: https://dashboard.stripe.com/acct_1SgDHo3nipX4Oc41/apikeys

Copy:
- **Secret key** (starts with `sk_test_`)
- **Publishable key** (starts with `pk_test_`)

### 2. Configure Webhook

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Set endpoint URL to your Convex HTTP endpoint:
   ```
   https://<your-convex-deployment>.convex.site/stripe/webhook
   ```
4. Select events to listen to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`)

### 3. Set Convex Environment Variables

```bash
npx convex env set STRIPE_SECRET_KEY "sk_test_..."
npx convex env set STRIPE_WEBHOOK_SECRET "whsec_..."
```

Or via Convex Dashboard: Settings > Environment Variables

### 4. Set Auth Service Environment Variables

Create `services/auth/.env`:
```env
AUTH_SECRET=<generate-32-byte-random>
AUTH_URL=http://localhost:4000
AUTH_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8080
CONVEX_URL=http://127.0.0.1:3210
CONVEX_SERVICE_TOKEN=<your-service-token>
STRIPE_PRICE_TIERS=member:price_1Si8MZ3nipX4Oc41nPRODqdn
PORT=4000
```

### 5. Set Frontend Environment Variables

Already configured in `website/.env.local`:
```env
VITE_STRIPE_TIERS=member:price_1Si8MZ3nipX4Oc41nPRODqdn
VITE_STRIPE_PRICE_ID=price_1Si8MZ3nipX4Oc41nPRODqdn
VITE_STRIPE_TIER=member
VITE_AUTH_URL=http://localhost:4000
```

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Auth Service   │────▶│     Convex      │
│  (React/Vite)   │     │   (Express)      │     │   (Stripe SDK)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │     Stripe      │
                                                 │   Checkout      │
                                                 └────────┬────────┘
                                                          │ webhook
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  Convex HTTP    │
                                                 │ /stripe/webhook │
                                                 └─────────────────┘
```

### Flow

1. User clicks "Subscribe" in `AuthStatusPill`
2. Frontend calls Auth Service `/billing/checkout`
3. Auth Service validates tier, calls Convex `createCheckoutSession`
4. Convex creates Stripe Checkout Session, returns URL
5. User redirected to Stripe Checkout
6. On success, Stripe sends webhook to Convex
7. Convex updates `entitlements` table
8. Frontend refreshes, shows "Tier member"

---

## Creating New Products

Use the helper script:
```bash
cd website
STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-membership.mjs \
  --tier pro \
  --name "Nullspace Pro" \
  --amount 1500 \
  --currency usd \
  --interval month
```

Update environment variables with the new price ID:
- `services/auth/.env`: Add to `STRIPE_PRICE_TIERS`
- `website/.env.local`: Update `VITE_STRIPE_TIERS`
