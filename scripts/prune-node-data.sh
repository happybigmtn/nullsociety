#!/bin/bash
#
# Prune local validator data directories (dev-only).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$REPO_DIR/data"

if [ ! -d "$DATA_DIR" ]; then
    echo "No data directory found at $DATA_DIR"
    exit 0
fi

echo "Pruning validator data in $DATA_DIR"
rm -rf "$DATA_DIR"/node* 2>/dev/null || true
echo "Done."
