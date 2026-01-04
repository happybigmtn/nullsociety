# Production Configs

Use isolated keys and endpoints for production.

- `simulator.env.example`: systemd env file for the simulator.
- `node.env.example`: systemd env file pointing at your node YAML.
- `gateway.env.example`: systemd env file for the gateway (mobile/web).
- `ops.env.example`: systemd env file for the ops/analytics service.
- Auth service env: `services/auth/.env.example`.
- Website build env: `website/.env.production.example`.

Notes:
- `node.env` should include `NODE_CONFIG` and either `NODE_PEERS` or `NODE_HOSTS`.
- Gateway should set `GATEWAY_ALLOWED_ORIGINS` and `GATEWAY_ORIGIN` in production.
- For the global craps table, set `GATEWAY_LIVE_TABLE_CRAPS=1` and `GATEWAY_LIVE_TABLE_ADMIN_KEY_FILE`.
- To report global player counts, set `GATEWAY_INSTANCE_ID` and (optionally) `GATEWAY_LIVE_TABLE_PRESENCE_TOKEN`.

Generate local configs with:
`cargo run --bin generate-keys -- --nodes 4 --output configs/local`
Then create the production node YAML by copying one of the generated configs
and replacing keys, ports, and URLs for production.
