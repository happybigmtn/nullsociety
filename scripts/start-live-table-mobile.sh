#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

LIVE_TABLE_HOST="${LIVE_TABLE_HOST:-127.0.0.1}"
LIVE_TABLE_PORT="${LIVE_TABLE_PORT:-9123}"
LIVE_TABLE_BOT_COUNT="${LIVE_TABLE_BOT_COUNT:-100}"
LIVE_TABLE_BOT_BALANCE="${LIVE_TABLE_BOT_BALANCE:-1000000}"
LIVE_TABLE_BOT_BET_MIN="${LIVE_TABLE_BOT_BET_MIN:-10}"
LIVE_TABLE_BOT_BET_MAX="${LIVE_TABLE_BOT_BET_MAX:-200}"
LIVE_TABLE_BOT_BETS_MIN="${LIVE_TABLE_BOT_BETS_MIN:-1}"
LIVE_TABLE_BOT_BETS_MAX="${LIVE_TABLE_BOT_BETS_MAX:-3}"
LIVE_TABLE_BOT_MAX_ACTIVE_BETS="${LIVE_TABLE_BOT_MAX_ACTIVE_BETS:-12}"

GATEWAY_LIVE_TABLE_CRAPS="${GATEWAY_LIVE_TABLE_CRAPS:-1}"
GATEWAY_LIVE_TABLE_CRAPS_URL="${GATEWAY_LIVE_TABLE_CRAPS_URL:-ws://${LIVE_TABLE_HOST}:${LIVE_TABLE_PORT}/ws}"

mkdir -p "${ROOT_DIR}/logs"

if [[ -f "${ROOT_DIR}/live-table.pid" ]]; then
  if kill -0 "$(cat "${ROOT_DIR}/live-table.pid")" >/dev/null 2>&1; then
    echo "Live-table service already running (pid $(cat "${ROOT_DIR}/live-table.pid"))."
  else
    rm -f "${ROOT_DIR}/live-table.pid"
  fi
fi

if [[ ! -f "${ROOT_DIR}/live-table.pid" ]]; then
  echo "Starting live-table service on ${LIVE_TABLE_HOST}:${LIVE_TABLE_PORT} with ${LIVE_TABLE_BOT_COUNT} bots..."
  (cd "${ROOT_DIR}" && \
    LIVE_TABLE_HOST="${LIVE_TABLE_HOST}" \
    LIVE_TABLE_PORT="${LIVE_TABLE_PORT}" \
    LIVE_TABLE_BOT_COUNT="${LIVE_TABLE_BOT_COUNT}" \
    LIVE_TABLE_BOT_BALANCE="${LIVE_TABLE_BOT_BALANCE}" \
    LIVE_TABLE_BOT_BET_MIN="${LIVE_TABLE_BOT_BET_MIN}" \
    LIVE_TABLE_BOT_BET_MAX="${LIVE_TABLE_BOT_BET_MAX}" \
    LIVE_TABLE_BOT_BETS_MIN="${LIVE_TABLE_BOT_BETS_MIN}" \
    LIVE_TABLE_BOT_BETS_MAX="${LIVE_TABLE_BOT_BETS_MAX}" \
    LIVE_TABLE_BOT_MAX_ACTIVE_BETS="${LIVE_TABLE_BOT_MAX_ACTIVE_BETS}" \
    cargo run -p nullspace-live-table > "${ROOT_DIR}/logs/live-table.log" 2>&1 & echo $! > "${ROOT_DIR}/live-table.pid")
fi

echo "Starting gateway with live-table enabled..."
(cd "${ROOT_DIR}" && \
  GATEWAY_LIVE_TABLE_CRAPS="${GATEWAY_LIVE_TABLE_CRAPS}" \
  GATEWAY_LIVE_TABLE_CRAPS_URL="${GATEWAY_LIVE_TABLE_CRAPS_URL}" \
  pnpm -C gateway start)
