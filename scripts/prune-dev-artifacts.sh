#!/bin/bash
#
# Prune local development artifacts (dev-only).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

DIST_DIR="$REPO_DIR/website/dist"
WASM_PKG_DIR="$REPO_DIR/website/wasm/pkg"

REMOVE_DATA=false
REMOVE_DIST=false
REMOVE_WASM=false

usage() {
    cat <<'EOF'
Usage: ./scripts/prune-dev-artifacts.sh [--data] [--dist] [--wasm] [--all]

Defaults to --data --dist when no flags are provided.

  --data  Remove local node data directories
  --dist  Remove website build output (website/dist)
  --wasm  Remove wasm-pack output (website/wasm/pkg)
  --all   Remove all of the above
EOF
}

if [ "$#" -eq 0 ]; then
    REMOVE_DATA=true
    REMOVE_DIST=true
else
    for arg in "$@"; do
        case "$arg" in
            --data)
                REMOVE_DATA=true
                ;;
            --dist)
                REMOVE_DIST=true
                ;;
            --wasm)
                REMOVE_WASM=true
                ;;
            --all)
                REMOVE_DATA=true
                REMOVE_DIST=true
                REMOVE_WASM=true
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                echo "Unknown option: $arg"
                usage
                exit 1
                ;;
        esac
    done
fi

if [ "$REMOVE_DATA" = true ]; then
    "$SCRIPT_DIR/prune-node-data.sh"
fi

if [ "$REMOVE_DIST" = true ]; then
    echo "Removing frontend build output at $DIST_DIR"
    rm -rf "$DIST_DIR" 2>/dev/null || true
fi

if [ "$REMOVE_WASM" = true ]; then
    echo "Removing wasm-pack output at $WASM_PKG_DIR"
    rm -rf "$WASM_PKG_DIR" 2>/dev/null || true
fi

echo "Done."
