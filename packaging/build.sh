#!/bin/bash
# 打包 Kiki.app：自带 Node + 编译好的 Kiki + 生产依赖（含锁定的 pi 1.4.0）+ 网页。
# 在 Mac 上打包才有原生窗口（GitHub Actions 用 macOS 机器）；Linux 上也能打，但界面会用浏览器打开。
# 用法：packaging/build.sh [arm64|x64]      产物：out/Kiki-mac-<arch>.zip、（Mac 上）out/Kiki-mac-<arch>.dmg 和 out/SHA256SUMS
set -euo pipefail
ARCH="${1:-arm64}"
NODE_VERSION="${NODE_VERSION:-22.23.4}"   # pi 要求 Node >= 22.19
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION=$(node -p 'require("./package.json").version')
OUT="$ROOT/out"
APP="$OUT/build-$ARCH/Kiki.app"
RES="$APP/Contents/Resources"
echo "打包 Kiki ${VERSION}（mac-${ARCH}，Node ${NODE_VERSION}）"

rm -rf "$OUT/build-$ARCH"
mkdir -p "$APP/Contents/MacOS" "$RES/app" "$RES/node/bin"

# 1. 编译 TypeScript
rm -rf dist
npx tsc -p tsconfig.build.json
cp -R dist public data-template package.json package-lock.json "$RES/app/"

# 2. 只装生产依赖，按 macOS 平台挑可选依赖；不跑安装脚本（这些依赖都不需要）
(cd "$RES/app" && npm ci --omit=dev --ignore-scripts --os=darwin --cpu="$ARCH" --no-audit --no-fund --loglevel=error)
rm -f "$RES/app/package-lock.json"

# 3. 官方 Node（带 Node 项目的签名），校验后只取 node 本体
CACHE="$OUT/cache"; mkdir -p "$CACHE"
TGZ="node-v$NODE_VERSION-darwin-$ARCH.tar.gz"
[ -f "$CACHE/$TGZ" ] || curl -fsSL -o "$CACHE/$TGZ" "https://nodejs.org/dist/v$NODE_VERSION/$TGZ"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" | grep " $TGZ\$" > "$CACHE/$TGZ.sha256"
(cd "$CACHE" && { command -v sha256sum >/dev/null && sha256sum -c "$TGZ.sha256" || shasum -a 256 -c "$TGZ.sha256"; } >/dev/null)
tar -xzf "$CACHE/$TGZ" -C "$RES/node" --strip-components=1 "node-v$NODE_VERSION-darwin-$ARCH/bin/node" "node-v$NODE_VERSION-darwin-$ARCH/LICENSE"

# 4. App 外壳
sed "s/__VERSION__/$VERSION/g" packaging/Info.plist > "$APP/Contents/Info.plist"
cp packaging/kiki-server "$APP/Contents/MacOS/"
cp packaging/kiki-setup packaging/swap.sh packaging/AppIcon.icns "$RES/"
# 原生窗口：在 Mac 上用 swiftc 编译；别的系统上编不了，退回到"用浏览器打开"的脚本
if command -v swiftc >/dev/null && [ "$(uname)" = Darwin ]; then
  T=$([ "$ARCH" = x64 ] && echo x86_64 || echo arm64)
  swiftc -O -target "$T-apple-macos12" -framework Cocoa -framework WebKit \
    -o "$APP/Contents/MacOS/Kiki" packaging/mac/main.swift
else
  echo "（这台机器编译不了原生窗口，Kiki.app 会用浏览器打开界面）"
  cp packaging/mac/launcher.sh "$APP/Contents/MacOS/Kiki"
fi
chmod +x "$APP/Contents/MacOS/"* "$RES/kiki-setup" "$RES/swap.sh" "$RES/node/bin/node"

# 在 Mac 上打包时顺手做个本地签名（没有开发者证书也行）
if command -v codesign >/dev/null; then codesign --force --deep --sign - "$APP" 2>/dev/null || true; fi

# 5. 压缩（保留符号链接和执行权限）+ 校验和
ZIP="Kiki-mac-$ARCH.zip"
rm -f "$OUT/$ZIP"
if command -v ditto >/dev/null; then
  ditto -c -k --keepParent "$APP" "$OUT/$ZIP"
else
  (cd "$OUT/build-$ARCH" && zip -qry "$OUT/$ZIP" Kiki.app)
fi
(cd "$OUT" && { command -v sha256sum >/dev/null && sha256sum "$ZIP" || shasum -a 256 "$ZIP"; }) > "$OUT/$ZIP.sha256"

# 6. 在 Mac 上再做一个 .dmg：给第一次安装的人用，打开后把 Kiki 拖进「应用程序」。
#    自动更新仍然下载 zip（更小，解压不需要挂载）。
if command -v hdiutil >/dev/null; then
  DMG="Kiki-mac-$ARCH.dmg"
  STAGE="$OUT/dmg-$ARCH"
  rm -rf "$STAGE" "$OUT/$DMG"
  mkdir -p "$STAGE"
  ditto "$APP" "$STAGE/Kiki.app"
  ln -s /Applications "$STAGE/应用程序"
  hdiutil create -quiet -volname "Kiki ${VERSION}" -srcfolder "$STAGE" -ov -format UDZO "$OUT/$DMG"
  rm -rf "$STAGE"
  (cd "$OUT" && shasum -a 256 "$DMG") > "$OUT/$DMG.sha256"
  echo "完成：$OUT/${DMG}（$(du -h "$OUT/$DMG" | cut -f1)）"
fi
cat "$OUT"/Kiki-mac-*.sha256 > "$OUT/SHA256SUMS"
echo "完成：$OUT/${ZIP}（$(du -h "$OUT/$ZIP" | cut -f1)）"
