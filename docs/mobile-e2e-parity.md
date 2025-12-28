# Mobile End-to-End Parity Runbook

Goal: validate 1:1 parity between mobile native and mobile web across bet types, placement, logic, and presentation using a full local chain + gateway + Expo.

## Start the local chain
1. Generate configs if needed:
   `cargo run --bin generate-keys -- --nodes 4 --output configs/local`

2. **Set required environment variables** for CORS/origin handling:
   ```bash
   # Required for gateway to communicate with simulator
   export ALLOW_HTTP_NO_ORIGIN=true
   export ALLOWED_HTTP_ORIGINS="http://localhost:9010"
   export ALLOW_WS_NO_ORIGIN=true
   export ALLOWED_WS_ORIGINS="http://localhost:9010"
   ```

   Without these variables:
   - HTTP requests from the gateway will be rejected (403)
   - WebSocket connections for the updates stream will fail

3. Start the local network:
   `./scripts/start-local-network.sh --fresh`

   **Note:** The network script starts both the simulator AND consensus nodes. The simulator alone (without nodes) only accepts transactions but does not execute them - you won't receive game events.

4. Confirm the simulator is healthy:
   `curl -s http://localhost:8080/healthz`

## Start the mobile gateway
1. `cd gateway`
2. `npm install`
3. `BACKEND_URL=http://localhost:8080 GATEWAY_PORT=9010 npm run dev`

## Start the Expo dev server
1. `cd mobile`
2. `npm install`
3. Set the WebSocket URL and start Expo:
   `EXPO_PUBLIC_WS_URL=ws://<host-ip>:9010 npm start`

WebSocket URL cheatsheet:
- iOS simulator: `ws://localhost:9010`
- Android emulator: `ws://10.0.2.2:9010`
- Physical device: `ws://<LAN-IP>:9010`

## Parity checklist (mobile native vs mobile web)

Baccarat
- [ ] Main bets: PLAYER, BANKER
- [ ] Side bets: TIE, P_PAIR, B_PAIR, LUCKY6, P_DRAGON, B_DRAGON, PANDA8, P_PERFECT_PAIR, B_PERFECT_PAIR
- [ ] Result messaging + payouts match

Roulette
- [ ] Straight 0-36 (validate 0/00 behavior if enabled)
- [ ] RED, BLACK, ODD, EVEN, LOW, HIGH
- [ ] DOZEN_1, DOZEN_2, DOZEN_3
- [ ] COL_1, COL_2, COL_3
- [ ] SPLIT_H, SPLIT_V, STREET, CORNER, SIX_LINE
- [ ] Result color and win amounts match

Craps
- [ ] PASS, DONT_PASS
- [ ] COME, DONT_COME
- [ ] FIELD
- [ ] YES (4/5/6/8/9/10)
- [ ] NO (4/5/6/8/9/10)
- [ ] NEXT (2-12)
- [ ] HARDWAY (4/6/8/10)
- [ ] FIRE, ATS_SMALL, ATS_TALL, ATS_ALL
- [ ] MUGGSY, DIFF_DOUBLES, RIDE_LINE, REPLAY, HOT_ROLLER
- [ ] Point updates and roll outcomes match

Sic Bo
- [ ] SMALL, BIG, ODD, EVEN
- [ ] TRIPLE_ANY, TRIPLE_SPECIFIC (1-6)
- [ ] DOUBLE_SPECIFIC (1-6)
- [ ] SUM (4-17)
- [ ] SINGLE_DIE (1-6)
- [ ] DOMINO
- [ ] HOP3_EASY, HOP3_HARD, HOP4_EASY
- [ ] Result payout/labels match

Three Card Poker
- [ ] Ante + Pair Plus placement
- [ ] Deal, Play, Fold flows
- [ ] Hand resolution and payouts match

Ultimate Texas Hold'em
- [ ] Ante + Blind + Trips placement
- [ ] Deal, Check, Bet (1x/2x/3x/4x), Fold
- [ ] Stage transitions and payouts match

Blackjack
- [ ] Deal, Hit, Stand
- [ ] Double, Split
- [ ] Balance updates and messages match

Casino War
- [ ] Deal
- [ ] War vs Surrender flow on tie
- [ ] Payouts match

Video Poker
- [ ] Deal, Hold, Draw
- [ ] Hand ranking + payout match

Hi-Lo
- [ ] Deal, Higher, Lower
- [ ] Balance + messaging match

## UI alignment checks
- [ ] Typography and palette match the terminal styling
- [ ] Buttons and chips share the same hierarchy/contrast
- [ ] Mobile web view and native view layouts feel consistent (spacing, headers, controls)

## Troubleshooting

### HTTP 403 errors from simulator
**Symptom:** `curl http://localhost:8080/healthz` returns 403
**Cause:** Missing HTTP origin configuration
**Fix:** Export `ALLOW_HTTP_NO_ORIGIN=true` and `ALLOWED_HTTP_ORIGINS="http://localhost:9010"` before starting the network

### WebSocket connection rejected (403) for updates stream
**Symptom:** Gateway logs show `WebSocket origin rejected: http://localhost:9010 (allowed: )`
**Cause:** Missing WebSocket origin configuration (separate from HTTP)
**Fix:** Export `ALLOW_WS_NO_ORIGIN=true` and `ALLOWED_WS_ORIGINS="http://localhost:9010"` before starting the network

### Timeout waiting for game events
**Symptom:** Tests connect successfully but timeout waiting for `started`, `move`, or `complete` events
**Cause:** Only the simulator is running - game logic requires consensus nodes to execute transactions
**Fix:** Ensure you're running `./scripts/start-local-network.sh` (not just the simulator binary alone)

### All environment variables at once
```bash
export ALLOW_HTTP_NO_ORIGIN=true
export ALLOWED_HTTP_ORIGINS="http://localhost:9010"
export ALLOW_WS_NO_ORIGIN=true
export ALLOWED_WS_ORIGINS="http://localhost:9010"
./scripts/start-local-network.sh --fresh
```
