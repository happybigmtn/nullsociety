#!/bin/bash
set -euo pipefail

CONFIG_DIR="${1:-configs/local}"
NODES="${2:-4}"
DURATION_SECONDS="${DURATION_SECONDS:-300}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"
FRESH="${FRESH:-false}"
NO_BUILD="${NO_BUILD:-false}"
CURL_MAX_TIME="${CURL_MAX_TIME:-2}"
ALLOW_HTTP_NO_ORIGIN="${ALLOW_HTTP_NO_ORIGIN:-1}"
ALLOW_WS_NO_ORIGIN="${ALLOW_WS_NO_ORIGIN:-1}"

ARGS=("$CONFIG_DIR" "$NODES")
if [[ "$FRESH" == "true" ]]; then
  ARGS+=(--fresh)
fi
if [[ "$NO_BUILD" == "true" ]]; then
  ARGS+=(--no-build)
fi

export ALLOW_HTTP_NO_ORIGIN
export ALLOW_WS_NO_ORIGIN

./scripts/start-local-network.sh "${ARGS[@]}" &
NETWORK_PID=$!

cleanup() {
  if kill -0 "$NETWORK_PID" 2>/dev/null; then
    kill -INT "$NETWORK_PID" 2>/dev/null || true
    for _ in {1..10}; do
      if ! kill -0 "$NETWORK_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    if kill -0 "$NETWORK_PID" 2>/dev/null; then
      kill -TERM "$NETWORK_PID" 2>/dev/null || true
      sleep 1
    fi
    if kill -0 "$NETWORK_PID" 2>/dev/null; then
      kill -KILL "$NETWORK_PID" 2>/dev/null || true
    fi
    wait "$NETWORK_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Waiting for simulator health..."
READY=false
for _ in {1..60}; do
  if curl -sf --max-time "$CURL_MAX_TIME" http://localhost:8080/healthz > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [[ "$READY" != "true" ]]; then
  echo "Simulator did not become ready within 60 seconds."
  exit 1
fi

get_metrics_port() {
  local config="$1"
  awk -F: '/^metrics_port:/{gsub(/ /, "", $2); print $2}' "$config"
}

METRICS_PORTS=()
for i in $(seq 0 $((NODES - 1))); do
  port="$(get_metrics_port "$CONFIG_DIR/node$i.yaml")"
  if [[ -z "$port" ]]; then
    echo "Missing metrics_port in $CONFIG_DIR/node$i.yaml"
    exit 1
  fi
  METRICS_PORTS+=("$port")
done

wait_for_metrics() {
  local url="$1"
  local label="$2"
  local attempts=60

  for _ in $(seq 1 "$attempts"); do
    if curl -sf --max-time "$CURL_MAX_TIME" "$url" > /dev/null; then
      return 0
    fi
    sleep 1
  done

  echo "${label} did not become ready within ${attempts}s."
  return 1
}

echo "Waiting for simulator metrics..."
wait_for_metrics "http://localhost:8080/metrics/prometheus" "Simulator metrics"
for port in "${METRICS_PORTS[@]}"; do
  echo "Waiting for node metrics on port ${port}..."
  wait_for_metrics "http://localhost:${port}/metrics" "Node metrics on port ${port}"
done

echo "Running soak for ${DURATION_SECONDS}s..."
end_time=$(( $(date +%s) + DURATION_SECONDS ))
while [[ $(date +%s) -lt $end_time ]]; do
  if ! kill -0 "$NETWORK_PID" 2>/dev/null; then
    echo "Network process exited early."
    exit 1
  fi

  if ! curl -sf --max-time "$CURL_MAX_TIME" http://localhost:8080/metrics/prometheus > /dev/null; then
    echo "Simulator metrics scrape failed."
    exit 1
  fi
  for port in "${METRICS_PORTS[@]}"; do
    if ! curl -sf --max-time "$CURL_MAX_TIME" "http://localhost:${port}/metrics" > /dev/null; then
      echo "Node metrics scrape failed on port ${port}."
      exit 1
    fi
  done

  sleep "$SLEEP_SECONDS"
done

echo "Soak test completed."
