#!/bin/bash
# Install (or reinstall) Kiki: download the latest Kiki.app into Applications and launch it.
# Existing data (~/kiki-data) is left untouched.
#
#   One-line install (the first uses the Cloudflare mirror, faster in mainland China; the second uses GitHub):
#     curl -fsSL https://dl.kikibao.com/install.sh | bash
#     curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
#   Install a local build:
#     packaging/install.sh out/Kiki-mac-arm64.zip
set -euo pipefail
REPO="${KIKI_REPO:-lkyxuan/kiki}"
LABEL=com.lkyxuan.kiki
ARCH=$(uname -m); [ "$ARCH" = x86_64 ] && ARCH=x64
ZIPNAME="Kiki-mac-$ARCH.zip"
DEST=/Applications; [ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

if [ $# -ge 1 ]; then
  ZIP="$1"
else
  echo "Downloading the latest Kiki…"
  # Try the mirror first (dl.kikibao.com): latest.json holds the newest tag, files live under v<version>/. KIKI_DOWNLOAD_BASE=0 skips it
  MIRROR="${KIKI_DOWNLOAD_BASE:-https://dl.kikibao.com}"; MIRROR="${MIRROR%/}"
  TAG=""
  if [ "$MIRROR" != 0 ]; then
    TAG=$(curl -fsSL -H 'Cache-Control: no-cache' -m 15 "$MIRROR/latest.json" 2>/dev/null \
      | sed -n 's/.*"tag" *: *"\(v[0-9][^"]*\)".*/\1/p' | head -1 || true)
  fi
  if [ -n "$TAG" ] \
    && curl -fL --retry 3 --progress-bar -o "$TMP/$ZIPNAME" "$MIRROR/$TAG/$ZIPNAME" \
    && curl -fsSL --retry 3 -o "$TMP/SHA256SUMS" "$MIRROR/$TAG/SHA256SUMS" \
    && (cd "$TMP" && grep " $ZIPNAME\$" SHA256SUMS | shasum -a 256 -c - >/dev/null); then
    echo "Downloaded $TAG from $MIRROR"
  elif command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    gh release download --repo "$REPO" --pattern "$ZIPNAME" --pattern SHA256SUMS --dir "$TMP" --clobber
  else
    curl -fL --progress-bar -o "$TMP/$ZIPNAME" "https://github.com/$REPO/releases/latest/download/$ZIPNAME"
    curl -fsSL -o "$TMP/SHA256SUMS" "https://github.com/$REPO/releases/latest/download/SHA256SUMS"
  fi
  (cd "$TMP" && grep " $ZIPNAME\$" SHA256SUMS | shasum -a 256 -c - >/dev/null) || { echo "Checksum mismatch, aborting"; exit 1; }
  ZIP="$TMP/$ZIPNAME"
fi

# Stop the running service, then swap in the new app
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -rf "$DEST/Kiki.app"
ditto -x -k "$ZIP" "$DEST"
xattr -dr com.apple.quarantine "$DEST/Kiki.app" 2>/dev/null || true

echo "Installed to $DEST/Kiki.app, launching…"
open "$DEST/Kiki.app"
echo "Done. Kiki starts at login and updates itself. Logs: ~/Library/Logs/Kiki/"
