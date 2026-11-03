// 接入 Claude Code / Codex：在设置页点一下，Kiki 把 hook 写进它们的配置。
//   - 一个小脚本 kiki-hook.sh（只用系统自带的 sh 和 curl）：把 hook 收到的 JSON 原样发给 Kiki，
//     发不通就先写进 spool 文件，下次发通时一起补上。整理字段在 Kiki 这边做，以后改格式不用重装。
//   - Claude Code：往 ~/.claude/settings.json 的 hooks 里加几条（异步，不拖慢它）；
//   - Codex：往 ~/.codex/config.toml 加 notify。原来就有 notify 的，脚本先调原来的再报 Kiki，不抢。
// 改之前都先备份；关掉时只删自己加的（认 kiki-hook 这个名字），不碰你原有的 hook。
// 别的电脑：设置页给一行命令，下载 install.sh 跑一下。那边没有 Node 也行：配置文件发给 Kiki 合并好再拿回去。
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { shq } from "./coders.js";

export const HOOK_NAME = "kiki-hook";
/** Claude Code 里要挂的事件。PostToolUse 只为把“等你批准”改回“在干活”，Kiki 收到后多数直接丢掉 */
export const CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "Notification", "PostToolUse", "Stop", "SessionEnd"] as const;

/** hook 脚本。url：Kiki 的地址；spool：发不通时先写在哪；prev：Codex 原来的 notify 命令 */
export function hookScript(o: { url: string; spool: string; prev?: string[] }): string {
  const prev = o.prev?.length ? `  ${o.prev.map(shq).join(" ")} "$2" >/dev/null 2>&1 &\n` : "";
  return `#!/bin/sh
# Kiki：把 Claude Code / Codex 做到哪了报给 Kiki。由 Kiki 设置 →「接入 Claude Code / Codex」生成，关掉开关会撤掉。
# 用法：Claude Code 的 hook 里  kiki-hook.sh claude-code  （JSON 从标准输入来）
#       Codex 的 notify 里      kiki-hook.sh codex '<JSON>'
KIKI_URL=${shq(o.url)}
SPOOL=${o.spool.startsWith("$HOME/") ? `"${o.spool}"` : shq(o.spool)}
tool="$1"
if [ "$tool" = codex ]; then
${prev}  body="$2"
else
  body=$(cat)
fi
[ -n "$body" ] || exit 0
body=$(printf '%s' "$body" | tr -d '\\n\\r')
host=$(hostname -s 2>/dev/null || hostname)
line() { printf '{"tool":"%s","host":"%s","at":"%s","event":%s}\\n' "$tool" "$host" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$body"; }
mkdir -p "$SPOOL"
# 之前有没发出去的：把这条接在后面一起按顺序发，免得新的状态先到、旧的后到把它盖掉
if [ -s "$SPOOL/pending.jsonl" ] && mv "$SPOOL/pending.jsonl" "$SPOOL/sending.$$" 2>/dev/null; then
  case "$body" in *'"PostToolUse"'*) ;; *) line >> "$SPOOL/sending.$$" ;; esac
  if curl -sf --noproxy '*' -m 10 -H 'content-type: application/x-ndjson' --data-binary @"$SPOOL/sending.$$" "$KIKI_URL/api/coders/batch" >/dev/null 2>&1; then
    rm -f "$SPOOL/sending.$$"
  else
    cat "$SPOOL/sending.$$" >> "$SPOOL/pending.jsonl" && rm -f "$SPOOL/sending.$$"
  fi
  exit 0
fi
if printf '%s' "$body" | curl -sf --noproxy '*' -m 2 -H 'content-type: application/json' --data-binary @- "$KIKI_URL/api/coders/event?tool=$tool&host=$host" >/dev/null 2>&1; then
  exit 0
fi
# Kiki 没开或连不上：先记下来（工具调用这种很勤的不记）
case "$body" in *'"PostToolUse"'*) exit 0 ;; esac
line >> "$SPOOL/pending.jsonl"
exit 0
`;
}

const isOurs = (h: any) => typeof h?.command === "string" && h.command.includes(HOOK_NAME);

/** 往 Claude Code 的 settings.json 里加上 Kiki 的 hook（已经有了就不重复加）。返回新的 JSON 文本。 */
export function mergeClaude(text: string, script: string): string {
  const cfg = parseJsonObject(text);
  const hooks = (cfg.hooks && typeof cfg.hooks === "object" ? cfg.hooks : (cfg.hooks = {})) as Record<string, any[]>;
  for (const ev of CLAUDE_EVENTS) {
    const list = Array.isArray(hooks[ev]) ? hooks[ev] : (hooks[ev] = []);
    if (list.some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurs))) continue;
    list.push({ hooks: [{ type: "command", command: `${shq(script)} claude-code`, async: true, timeout: 10 }] });
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}

/** 撤掉 Kiki 加的 hook，别的原样留着。 */
export function unmergeClaude(text: string): string {
  const cfg = parseJsonObject(text);
  const hooks = cfg.hooks as Record<string, any[]> | undefined;
  if (hooks && typeof hooks === "object") {
    for (const [ev, list] of Object.entries(hooks)) {
      if (!Array.isArray(list)) continue;
      const kept = list
        .map((g) => (Array.isArray(g?.hooks) ? { ...g, hooks: g.hooks.filter((h: any) => !isOurs(h)) } : g))
        .filter((g) => !Array.isArray(g?.hooks) || g.hooks.length);
      if (kept.length) hooks[ev] = kept;
      else delete hooks[ev];
    }
    if (!Object.keys(hooks).length) delete cfg.hooks;
  }
  return JSON.stringify(cfg, null, 2) + "\n";
}

export const claudeInstalled = (text: string) => {
  try {
    const hooks = parseJsonObject(text).hooks as Record<string, any[]> | undefined;
    return !!hooks && CLAUDE_EVENTS.every((ev) => Array.isArray(hooks[ev]) && hooks[ev].some((g) => Array.isArray(g?.hooks) && g.hooks.some(isOurs)));
  } catch {
    return false;
  }
};

function parseJsonObject(text: string): Record<string, any> {
  if (!text.trim()) return {};
  const v = JSON.parse(text);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("settings.json 不是一个 JSON 对象");
  return v;
}

// ---------- Codex：config.toml 里顶层的 notify = [...] ----------

/** 顶层（第一个 [表] 之前）的 notify 那一行 */
function notifyLine(text: string): { index: number; line: string; args?: string[] } | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^\[/.test(l)) return undefined;
    const m = /^notify\s*=\s*(\[.*\])\s*(#.*)?$/.exec(l);
    if (m) {
      let args: string[] | undefined;
      try {
        // TOML 的字符串数组：双引号的和 JSON 一样；单引号（字面量）换成双引号再读
        const v = JSON.parse(m[1].replace(/'([^']*)'/g, (_, s) => JSON.stringify(s)));
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) args = v;
      } catch {}
      return { index: i, line: lines[i], args };
    }
    if (/^notify\s*=/.test(l)) return { index: i, line: lines[i] }; // 跨行写的，读不懂
  }
  return undefined;
}

export const codexInstalled = (text: string) => !!notifyLine(text)?.line.includes(HOOK_NAME);

/** 装上：返回新的 config.toml 和原来的 notify 命令（要接在 Kiki 的脚本里先调） */
export function mergeCodex(text: string, script: string): { text: string; prev?: string[] } {
  const ours = `notify = ${JSON.stringify([script, "codex"])}`;
  const cur = notifyLine(text);
  if (!cur) return { text: `${ours}\n${text}` }; // 顶层的键要写在所有 [表] 之前，放第一行最稳
  if (cur.line.includes(HOOK_NAME)) return { text };
  if (!cur.args) throw new Error("config.toml 里的 notify 写法读不懂，没敢改。可以先把它写成一行 notify = [\"命令\", \"参数\"]");
  const lines = text.split("\n");
  lines[cur.index] = ours;
  return { text: lines.join("\n"), prev: cur.args };
}

/** 撤掉：有原来的 notify 就放回去，没有就删掉这一行 */
export function unmergeCodex(text: string, prev?: string[]): string {
  const cur = notifyLine(text);
  if (!cur || !cur.line.includes(HOOK_NAME)) return text;
  const lines = text.split("\n");
  if (prev?.length) lines[cur.index] = `notify = ${JSON.stringify(prev)}`;
  else lines.splice(cur.index, 1);
  return lines.join("\n");
}

// ---------- 本机：设置页的两个开关 ----------

export class CoderSetup {
  readonly script: string;
  private prevFile: string;
  constructor(
    private o: { dataDir: string; port: number; home?: string },
  ) {
    this.script = join(o.dataDir, "coders", `${HOOK_NAME}.sh`);
    this.prevFile = join(o.dataDir, "coders", "codex-prev-notify.json");
  }
  private get home() {
    return this.o.home ?? homedir();
  }
  get claudeFile() {
    return join(this.home, ".claude", "settings.json");
  }
  get codexFile() {
    return join(this.home, ".codex", "config.toml");
  }

  status() {
    const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "");
    return {
      claude: { found: existsSync(join(this.home, ".claude")), on: claudeInstalled(read(this.claudeFile)), file: this.claudeFile },
      codex: { found: existsSync(join(this.home, ".codex")), on: codexInstalled(read(this.codexFile)), file: this.codexFile },
    };
  }

  private prev(): string[] | undefined {
    try {
      return JSON.parse(readFileSync(this.prevFile, "utf8"));
    } catch {
      return undefined;
    }
  }

  /** 本机用的脚本：发到 127.0.0.1，发不通写进数据目录的 spool（Kiki 启动时补收） */
  writeScript() {
    mkdirSync(dirname(this.script), { recursive: true });
    writeFileSync(this.script, hookScript({ url: `http://127.0.0.1:${this.o.port}`, spool: join(this.o.dataDir, "coders", "spool"), prev: this.prev() }));
    chmodSync(this.script, 0o755);
  }

  set(target: "claude" | "codex", on: boolean): string {
    const file = target === "claude" ? this.claudeFile : this.codexFile;
    const cur = existsSync(file) ? readFileSync(file, "utf8") : "";
    let next: string;
    if (target === "claude") next = on ? mergeClaude(cur, this.script) : unmergeClaude(cur);
    else if (on) {
      const r = mergeCodex(cur, this.script);
      next = r.text;
      if (r.prev) writeFileSync(this.prevFile, JSON.stringify(r.prev));
    } else {
      next = unmergeCodex(cur, this.prev());
      if (existsSync(this.prevFile)) writeFileSync(this.prevFile, "null");
    }
    if (on) this.writeScript();
    if (next === cur) return on ? "已经接好了" : "本来就没接";
    mkdirSync(dirname(file), { recursive: true });
    if (cur) copyFileSync(file, `${file}.kiki-bak`); // 先备份一份
    writeFileSync(file, next);
    const name = target === "claude" ? "Claude Code" : "Codex";
    return on ? `${name} 接好了，新开的会话生效（原配置备份在 ${file}.kiki-bak）` : `已从 ${name} 撤掉`;
  }
}

/** 别的电脑上跑的安装脚本：下载 hook 脚本，把配置文件发给 Kiki 合并好再写回去（那边不需要 Node） */
export function remoteInstallScript(kiki: string): string {
  return `#!/bin/sh
# Kiki：在这台电脑上接入 Claude Code / Codex，进展报给 ${kiki}
set -e
K=${shq(kiki)}
D="$HOME/.kiki"
mkdir -p "$D/spool"
curl -sf --noproxy "*" "$K/api/coders/hook.sh" -o "$D/${HOOK_NAME}.sh"
chmod +x "$D/${HOOK_NAME}.sh"
merge() { # $1 目标 $2 配置文件
  [ -f "$2" ] || : > "$2"
  if curl -sf --noproxy "*" -H "x-kiki-script: $D/${HOOK_NAME}.sh" --data-binary @"$2" "$K/api/coders/merge?target=$1" -o "$2.kiki-new"; then
    cp "$2" "$2.kiki-bak" && mv "$2.kiki-new" "$2" && return 0
  fi
  rm -f "$2.kiki-new"; return 1
}
ok=""
if [ -d "$HOME/.claude" ]; then
  merge claude "$HOME/.claude/settings.json" && ok="$ok Claude Code" || echo "Claude Code 没接上（settings.json 可能不是合法 JSON）"
fi
if [ -d "$HOME/.codex" ]; then
  merge codex "$HOME/.codex/config.toml" && ok="$ok Codex" || echo "Codex 没接上（config.toml 里已有别的 notify，或写法读不懂）"
fi
[ -n "$ok" ] && echo "接好了：$ok。新开的会话生效，原配置备份成 .kiki-bak" || echo "这台电脑上没找到 Claude Code（~/.claude）或 Codex（~/.codex）"
`;
}
