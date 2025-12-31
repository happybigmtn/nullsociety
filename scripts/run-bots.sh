#!/bin/bash
set -euo pipefail

CONFIG_DIR="${1:-configs/local}"
URL="${2:-http://localhost:8080}"
NUM_BOTS="${NUM_BOTS:-300}"
DURATION_SECONDS="${DURATION_SECONDS:-300}"
RATE_PER_SEC="${RATE_PER_SEC:-3.0}"
NO_BUILD="${NO_BUILD:-false}"

IDENTITY="${IDENTITY_HEX:-}"
if [[ -z "$IDENTITY" ]]; then
  if [[ ! -f "$CONFIG_DIR/node0.yaml" ]]; then
    echo "Missing config: $CONFIG_DIR/node0.yaml"
    echo "Provide IDENTITY_HEX env or generate configs via scripts/bootstrap-testnet.sh"
    exit 1
  fi
  POLYNOMIAL=$(grep "^polynomial:" "$CONFIG_DIR/node0.yaml" | head -1 | awk '{print $2}' | tr -d '"')
  if [[ -z "$POLYNOMIAL" ]]; then
    echo "Could not extract polynomial from $CONFIG_DIR/node0.yaml"
    exit 1
  fi
  IDENTITY="${POLYNOMIAL:0:192}"
fi

if [[ "$NO_BUILD" == "true" ]]; then
  if [[ ! -f "target/release/stress-test" ]]; then
    echo "Missing target/release/stress-test; run without NO_BUILD to compile."
    exit 1
  fi
  ./target/release/stress-test \
    --url "$URL" \
    --identity "$IDENTITY" \
    --num-bots "$NUM_BOTS" \
    --duration "$DURATION_SECONDS" \
    --rate "$RATE_PER_SEC"
else
  cargo run --release --bin stress-test -- \
    --url "$URL" \
    --identity "$IDENTITY" \
    --num-bots "$NUM_BOTS" \
    --duration "$DURATION_SECONDS" \
    --rate "$RATE_PER_SEC"
fi
