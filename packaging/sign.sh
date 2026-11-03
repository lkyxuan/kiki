#!/bin/bash
# 签名和公证，由 build.sh 调用。没配开发者证书时只做本地签名（和以前一样）。
#   sign.sh app <Kiki.app>       签整个 App
#   sign.sh notarize-app <Kiki.app>   App 交给苹果公证，通过后把票据钉进 App
#   sign.sh dmg <Kiki.dmg>       给 .dmg 签名、公证、钉票据
#
# 环境变量（发布流程从 GitHub Secrets 里设好，见 docs/signing.md）：
#   KIKI_SIGN_IDENTITY   "Developer ID Application: 名字 (团队ID)"；设成 "-" 是 CI 自测：本地签名但开加固运行时
#   公证二选一：NOTARY_KEY_PATH + NOTARY_KEY_ID + NOTARY_ISSUER（App Store Connect API 密钥，推荐）
#              或 APPLE_ID + APPLE_APP_PASSWORD + APPLE_TEAM_ID（App 专用密码）
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ID="${KIKI_SIGN_IDENTITY:-}"
command -v codesign >/dev/null || exit 0   # 不在 Mac 上：什么都不做

# 加固运行时 + 时间戳是公证的硬性要求；CI 自测用的本地签名没法打时间戳
if [ "$ID" = "-" ]; then TS=--timestamp=none; else TS=--timestamp; fi
cs() { codesign --force $TS --options runtime --sign "$ID" "$@"; }

auth() {
  if [ -n "${NOTARY_KEY_PATH:-}" ]; then
    AUTH=(--key "$NOTARY_KEY_PATH" --key-id "${NOTARY_KEY_ID:?缺 NOTARY_KEY_ID}" --issuer "${NOTARY_ISSUER:?缺 NOTARY_ISSUER}")
  elif [ -n "${APPLE_ID:-}" ]; then
    AUTH=(--apple-id "$APPLE_ID" --password "${APPLE_APP_PASSWORD:?缺 APPLE_APP_PASSWORD}" --team-id "${APPLE_TEAM_ID:?缺 APPLE_TEAM_ID}")
  else
    return 1
  fi
  [ -n "$ID" ] && [ "$ID" != "-" ] || { echo "没有开发者证书，不能公证"; exit 1; }
}

jget() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)[process.argv[1]]??"")}catch{}})' "$1"; }

# 提交一个文件给苹果，等结果；没通过就打出苹果给的原因并失败（这一版就不会发出去）
notarize() {
  local f="$1" out status id
  echo "交给苹果公证 $(basename "$f")（一般几分钟）…"
  out=$(xcrun notarytool submit "$f" "${AUTH[@]}" --wait --timeout 1h --output-format json) || true
  echo "$out"
  status=$(printf '%s' "$out" | jget status)
  id=$(printf '%s' "$out" | jget id)
  if [ "$status" != Accepted ]; then
    echo "公证没通过（${status:-没有结果}）"
    [ -n "$id" ] && xcrun notarytool log "$id" "${AUTH[@]}" || true
    exit 1
  fi
  echo "公证通过：$(basename "$f")"
}

case "${1:-}" in
  app)
    APP="$2"
    if [ -z "$ID" ]; then
      codesign --force --deep --sign - "$APP" 2>/dev/null || true
      exit 0
    fi
    echo "签名：${ID}"
    RES="$APP/Contents/Resources"
    AGENT="$APP/Contents/Helpers/KikiAgent.app"
    # 由内向外：先签依赖里所有 Mach-O（原生模块、自带的小程序），再签「Kiki 后台」（Node，带 JIT 和隐私权限），最后签 App
    find "$RES" -type f -print0 | xargs -0 file -N -F $'\t' | { grep -F 'Mach-O' || true; } | cut -f1 |
      while IFS= read -r f; do cs "$f"; done
    cs --entitlements "$HERE/entitlements.plist" "$AGENT"
    # Contents/MacOS 里的后台脚本也要单独签（签名存在扩展属性里，ditto 和 .dmg 都会保留）
    for f in "$APP/Contents/MacOS/"*; do
      [ "$(basename "$f")" = Kiki ] || cs "$f"
    done
    cs "$APP"
    codesign --verify --deep --strict --verbose=2 "$APP"
    ;;
  notarize-app)
    APP="$2"
    auth || { echo "没配公证密钥，跳过公证"; exit 0; }
    Z="$(mktemp -d)/Kiki.zip"
    ditto -c -k --keepParent "$APP" "$Z"
    notarize "$Z"
    rm -rf "$(dirname "$Z")"
    xcrun stapler staple "$APP"
    ;;
  dmg)
    DMG="$2"
    [ -n "$ID" ] && [ "$ID" != "-" ] || exit 0
    codesign --force --timestamp --sign "$ID" "$DMG"
    auth || exit 0
    notarize "$DMG"
    xcrun stapler staple "$DMG"
    ;;
  *) echo "用法：sign.sh app|notarize-app|dmg <路径>"; exit 2 ;;
esac
