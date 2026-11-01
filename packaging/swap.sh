#!/bin/bash
# 自动更新的最后一步，由"旧版本"运行（先拷到临时目录，不依赖被替换的 App）：
#   换上新 App → 重启服务 → 等新版本报出正确版本号 → 45 秒内没起来就换回旧的。
# 用法：swap.sh <App路径> <新App路径> <旧版本> <新版本> <端口> <日志目录>
set -u
APP="$1"; NEW="$2"; FROM="$3"; TO="$4"; PORT="$5"; LOGDIR="$6"
LABEL=com.lkyxuan.kiki
DIR="$(dirname "$APP")"
PREV="$DIR/.Kiki-previous.app"   # 留一份上个版本，手动回退也能用
RECEIPT="$LOGDIR/last-update.json"

log() { echo "[$(date '+%F %T')] $*"; }
receipt() {
  printf '{"from":"%s","to":"%s","result":"%s","at":"%s"}\n' "$FROM" "$TO" "$1" "$(date -u +%FT%TZ)" > "$RECEIPT"
  log "回执：$1"
}
restart() { launchctl kickstart -k "gui/$(id -u)/$LABEL"; }
healthy() {
  for _ in $(seq 1 45); do
    v=$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
    [ "$v" = "$1" ] && return 0
    sleep 1
  done
  return 1
}

log "开始更新 $FROM → $TO"
sleep 1
rm -rf "$PREV"
if ! mv "$APP" "$PREV"; then log "挪不动旧版本"; receipt failed; exit 1; fi
if ! mv "$NEW" "$APP"; then mv "$PREV" "$APP"; log "放不进新版本"; receipt failed; exit 1; fi
rmdir "$(dirname "$NEW")" 2>/dev/null
restart
if healthy "$TO"; then receipt ok; exit 0; fi

log "新版本 $TO 没起来，回滚到 $FROM"
rm -rf "$DIR/.Kiki-failed.app"
mv "$APP" "$DIR/.Kiki-failed.app"
mv "$PREV" "$APP"
restart
if healthy "$FROM"; then receipt rolled_back; else receipt rollback_failed; fi
