#!/bin/bash
# 安装（或重装）Kiki：下载最新的 Kiki.app 放进"应用程序"，启动后台服务，打开网页。
# 已有的数据（~/kiki-data）不会动。
#
#   一行安装（国内用第一行，从 Cloudflare 的下载镜像拿；第二行从 GitHub 拿）：
#     curl -fsSL https://dl.kikibao.com/install.sh | bash
#     curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
#   用自己打的包：
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
  echo "下载最新版 Kiki…"
  # 先试下载镜像（dl.kikibao.com）：latest.json 里是最新版本号，文件在 v<版本>/ 下面。KIKI_DOWNLOAD_BASE=0 跳过
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
    echo "已从 $MIRROR 下载 $TAG"
  elif command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    gh release download --repo "$REPO" --pattern "$ZIPNAME" --pattern SHA256SUMS --dir "$TMP" --clobber
  else
    curl -fL --progress-bar -o "$TMP/$ZIPNAME" "https://github.com/$REPO/releases/latest/download/$ZIPNAME"
    curl -fsSL -o "$TMP/SHA256SUMS" "https://github.com/$REPO/releases/latest/download/SHA256SUMS"
  fi
  (cd "$TMP" && grep " $ZIPNAME\$" SHA256SUMS | shasum -a 256 -c - >/dev/null) || { echo "校验和对不上，停止安装"; exit 1; }
  ZIP="$TMP/$ZIPNAME"
fi

# 先停掉旧服务，换上新 App
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -rf "$DEST/Kiki.app"
ditto -x -k "$ZIP" "$DEST"
xattr -dr com.apple.quarantine "$DEST/Kiki.app" 2>/dev/null || true

echo "已装到 $DEST/Kiki.app，正在启动…"
open "$DEST/Kiki.app"
echo "好了。以后它会开机自启、自动更新。日志：~/Library/Logs/Kiki/"
