// MCP 服务器的管理：配置在 <数据目录>/engine/mcp.json，格式和 Claude、Cursor 一样（mcpServers）。
// pi 内核读这个文件、连服务器，工具在对话里叫 mcp__<服务器名>__<工具名>（见 agents.ts 里的 createMcpExtension）。
// 设置页加的服务器都用 "exposure": "direct"：工具直接给模型看，不走 pi 的 codemode 脚本，模型用起来最省事。
// 改完新开的对话就生效，已经开着的对话要重启 Kiki。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Cfg = Record<string, unknown>;

export const validServerName = (n: unknown): n is string => typeof n === "string" && /^[\w-]{1,40}$/.test(n);

/** 像 shell 一样把一行命令拆成参数：支持引号（也可以在参数中间，比如 --dir="a b"）和反斜杠转义。 */
export function splitCommand(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
      else if (c === "\\" && q === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      q = c;
      has = true;
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
      has = true;
    }
  }
  if (q) throw new Error("引号没配对");
  if (has) out.push(cur);
  return out;
}

/** 存之前检查字段类型，免得一条坏配置把整个列表弄挂。 */
function checkConfig(c: Cfg) {
  const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  const strMap = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");
  if (typeof c.url === "string") {
    if (!/^https?:\/\//.test(c.url)) throw new Error("url 要以 http:// 或 https:// 开头");
    if (c.headers !== undefined && !strMap(c.headers)) throw new Error("headers 要是字符串键值对");
  } else if (typeof c.command === "string" && c.command) {
    if (c.args !== undefined && !strs(c.args)) throw new Error("args 要是字符串数组");
    if (c.env !== undefined && !strMap(c.env)) throw new Error("env 要是字符串键值对");
  } else throw new Error("JSON 里要有 command 或 url");
}

/**
 * 设置页填的那一行变成配置：
 *   https://…           → 远程（HTTP）服务器
 *   cua-driver mcp      → 本机命令
 *   {"command": …}      → 原样用 JSON（也接受整段 {"mcpServers": {"名字": {…}}}，这时名字可以不填）
 */
export function parseSpec(name: string, spec: string): { name: string; config: Cfg } {
  const s = spec.trim();
  if (!s) throw new Error("填命令、网址或 JSON");
  let config: Cfg;
  if (s.startsWith("{")) {
    let j: Cfg;
    try {
      j = JSON.parse(s);
    } catch {
      throw new Error("JSON 格式不对");
    }
    if (j.mcpServers && typeof j.mcpServers === "object") {
      const entries = Object.entries(j.mcpServers as Record<string, Cfg>);
      if (entries.length !== 1) throw new Error("一次只加一个服务器");
      [name, config] = [name || entries[0][0], entries[0][1]];
    } else config = j;
    if (!config || typeof config !== "object") throw new Error("JSON 格式不对");
  } else if (/^https?:\/\//.test(s)) {
    if (/\s/.test(s)) throw new Error("网址里不能有空格");
    config = { url: s };
  } else {
    const [command, ...args] = splitCommand(s);
    config = args.length ? { command, args } : { command };
  }
  checkConfig(config);
  if (!validServerName(name)) throw new Error("名字只能用字母、数字、- 和 _，最多 40 个字");
  return { name, config: { ...config, exposure: config.exposure ?? "direct" } };
}

/** 列表里显示的一行：命令和参数，或者网址。 */
export function summary(c: Cfg): string {
  if (typeof c?.url === "string") return c.url;
  const args = Array.isArray(c?.args) ? c.args : [];
  return [c?.command, ...args].map(String).join(" ");
}

export class Mcp {
  readonly file: string;
  constructor(engineDir: string) {
    this.file = join(engineDir, "mcp.json");
  }

  private read(): { mcpServers: Record<string, Cfg>; [k: string]: unknown } {
    const j = existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) : {};
    j.mcpServers ??= {};
    return j;
  }

  private write(j: object) {
    writeFileSync(this.file, JSON.stringify(j, null, 2) + "\n");
  }

  list() {
    return Object.entries(this.read().mcpServers).map(([name, c]) => ({ name, summary: summary(c), on: c.enabled !== false }));
  }

  add(name: string, spec: string) {
    const r = parseSpec(name, spec);
    const j = this.read();
    if (j.mcpServers[r.name]) throw new Error(`已经有叫 ${r.name} 的服务器了，先删掉再加`);
    j.mcpServers[r.name] = r.config;
    this.write(j);
    return r.name;
  }

  setOn(name: string, on: boolean) {
    const j = this.read();
    const c = j.mcpServers[name];
    if (!c) throw new Error(`没有 ${name}`);
    if (on) delete c.enabled;
    else c.enabled = false;
    this.write(j);
  }

  remove(name: string) {
    const j = this.read();
    if (!j.mcpServers[name]) throw new Error(`没有 ${name}`);
    delete j.mcpServers[name];
    this.write(j);
  }
}
