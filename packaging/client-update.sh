#!/bin/bash
# 客户端自更新：给"只当界面、连远程"的 Kiki，或者本机后台起不来时用。
# 由 Kiki 窗口程序调用：client-update.sh <App 路径> <窗口进程 PID> <local|remote>
# 下载最新版 → 核对校验和 → 等窗口退出 → 换 App（旧的留在 .Kiki-previous.app）→ 重新打开。
# 本机模式会先停掉旧的后台服务，新 App 打开时会重新登记。
set -euo pipefail
APP="$1"; PID="$2"; MODE="${3:-remote}"
REPO="${KIKI_REPO:-lkyxuan/kiki}"
LABEL=com.lkyxuan.kiki
ARCH=$(uname -m); [ "$ARCH" = x86_64 ] && ARCH=x64
ZIPNAME="Kiki-mac-$ARCH.zip"
DIR=$(dirname "$APP")
LOGDIR="$HOME/Library/Logs/Kiki"; mkdir -p "$LOGDIR"
exec >>"$LOGDIR/client-update.log" 2>&1
echo "[$(date '+%F %T')] 客户端更新开始（$MODE）"
TMP=$(mktemp -d); trap 'rm -rf "$TMP" "$DIR/.Kiki-client-update"' EXIT

fail() { echo "失败：$1"; open "$APP" 2>/dev/null || true; exit 1; }

curl -fsSL -m 600 -o "$TMP/$ZIPNAME" "https://github.com/$REPO/releases/latest/download/$ZIPNAME" || fail "下载失败"
curl -fsSL -m 60 -o "$TMP/SHA256SUMS" "https://github.com/$REPO/releases/latest/download/SHA256SUMS" || fail "下载校验和失败"
(cd "$TMP" && grep " $ZIPNAME\$" SHA256SUMS | shasum -a 256 -c - >/dev/null) || fail "校验和对不上"

STAGE="$DIR/.Kiki-client-update"
rm -rf "$STAGE"; mkdir -p "$STAGE"
ditto -x -k "$TMP/$ZIPNAME" "$STAGE" || fail "解压失败"
[ -d "$STAGE/Kiki.app" ] || fail "包里没有 Kiki.app"
xattr -dr com.apple.quarantine "$STAGE/Kiki.app" 2>/dev/null || true

# 等窗口程序退出（最多 30 秒）
for _ in $(seq 1 60); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done

if [ "$MODE" = local ]; then launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true; fi
rm -rf "$DIR/.Kiki-previous.app"
mv "$APP" "$DIR/.Kiki-previous.app" || fail "换不掉旧的 App"
if ! mv "$STAGE/Kiki.app" "$APP"; then
  mv "$DIR/.Kiki-previous.app" "$APP"
  fail "放不进新的 App，已换回旧版"
fi
echo "[$(date '+%F %T')] 已换成 $(defaults read "$APP/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo 新版)"
open "$APP"
