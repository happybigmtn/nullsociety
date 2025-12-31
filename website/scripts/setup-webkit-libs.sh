#!/usr/bin/env bash
set -euo pipefail

CACHE_ROOT="${PW_WEBKIT_LIB_DIR:-$HOME/.cache/nullspace-webkit-libs}"
DEB_DIR="$CACHE_ROOT/debs"
EXTRACT_DIR="$CACHE_ROOT/extracted"
LIB_DIR="$CACHE_ROOT/lib"

mkdir -p "$DEB_DIR" "$EXTRACT_DIR" "$LIB_DIR"

for tool in ar curl tar; do
  if ! command -v "$tool" >/dev/null; then
    echo "Missing required tool: $tool" >&2
    exit 1
  fi
done

deb_urls=(
  "http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu66_66.1-2ubuntu2.1_amd64.deb"
  "http://archive.ubuntu.com/ubuntu/pool/main/libx/libxml2/libxml2_2.9.10+dfsg-5ubuntu0.20.04.10_amd64.deb"
  "http://archive.ubuntu.com/ubuntu/pool/main/j/json-glib/libjson-glib-1.0-0_1.4.4-2ubuntu2_amd64.deb"
  "http://archive.ubuntu.com/ubuntu/pool/main/w/woff2/libwoff1_1.0.2-1build0.1_amd64.deb"
  "http://archive.ubuntu.com/ubuntu/pool/main/libw/libwebp/libwebp6_0.6.1-2ubuntu0.20.04.3_amd64.deb"
  "http://archive.ubuntu.com/ubuntu/pool/main/libf/libffi/libffi7_3.3-4_amd64.deb"
)

download_deb() {
  local url="$1"
  local target="$DEB_DIR/$(basename "$url")"
  if [ ! -f "$target" ]; then
    echo "Downloading $(basename "$url")"
    curl -L -o "$target" "$url"
  fi
}

extract_deb() {
  local deb="$1"
  local tmpdir
  tmpdir="$(mktemp -d)"
  (cd "$tmpdir" && ar x "$deb" data.tar.xz data.tar.zst data.tar.gz >/dev/null 2>&1 || true)
  if [ -f "$tmpdir/data.tar.xz" ]; then
    tar -xf "$tmpdir/data.tar.xz" -C "$EXTRACT_DIR"
  elif [ -f "$tmpdir/data.tar.zst" ]; then
    tar -xf "$tmpdir/data.tar.zst" -C "$EXTRACT_DIR"
  elif [ -f "$tmpdir/data.tar.gz" ]; then
    tar -xf "$tmpdir/data.tar.gz" -C "$EXTRACT_DIR"
  else
    echo "No data archive found in $deb" >&2
  fi
  rm -rf "$tmpdir"
}

for url in "${deb_urls[@]}"; do
  download_deb "$url"
done

for deb in "$DEB_DIR"/*.deb; do
  extract_deb "$deb"
done

lib_src="$EXTRACT_DIR/usr/lib/x86_64-linux-gnu"
if [ ! -d "$lib_src" ]; then
  echo "Expected libs not found in $lib_src" >&2
  exit 1
fi

shopt -s nullglob
for pattern in libicu*.so* libxml2.so* libwoff2*.so* libwebp.so* libffi.so*; do
  for file in "$lib_src"/$pattern; do
    cp -av "$file" "$LIB_DIR"/
  done
done
for file in "$lib_src"/libjson-glib-1.0.so*; do
  [ -e "$file" ] && cp -av "$file" "$LIB_DIR"/
done

if [ -z "${PW_WEBKIT_DIR:-}" ]; then
  PW_WEBKIT_DIR="$(ls -d "$HOME"/.cache/ms-playwright/webkit_*/minibrowser-gtk 2>/dev/null | head -n 1 || true)"
fi

if [ -z "${PW_WEBKIT_DIR:-}" ] || [ ! -d "$PW_WEBKIT_DIR" ]; then
  echo "Playwright WebKit not found. Set PW_WEBKIT_DIR to the minibrowser-gtk directory." >&2
  exit 1
fi

sys_lib="$PW_WEBKIT_DIR/sys/lib"
for pattern in libavif.so* libjxl.so* libopenh264.so* libmanette-0.2.so* libspiel-1.0.so* libspeech-provider-1.0.so*; do
  for file in "$sys_lib"/$pattern; do
    [ -e "$file" ] && cp -av "$file" "$LIB_DIR"/
  done
done
shopt -u nullglob

if [ ! -f "$LIB_DIR/libicudata.so.66" ]; then
  echo "Expected ICU libs missing in $LIB_DIR; check extraction or URL versions." >&2
  exit 1
fi

echo "WebKit libs staged at: $LIB_DIR"
echo "Use:"
echo "  export PW_WEBKIT_LIB_PATH=\"$LIB_DIR\""
echo "  PW_BROWSERS=webkit PW_WEBKIT_PATH=\"$PW_WEBKIT_DIR/bin/MiniBrowser\" \\"
echo "    LAYOUT_BASE_URL=http://localhost:3000 pnpm -C website e2e:layout"
