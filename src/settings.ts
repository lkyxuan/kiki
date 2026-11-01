// 设置页的接口：/api/settings*。页面是 public/settings.html。
//
// 配置写回 <数据目录>/.env：只改对应的那一行，注释和别的行原样保留。改完要重启 Kiki 才生效。
// 如果某个值是进程启动时从外面带进来的（比如 op run 注入、终端里 export），这里改了也没用，界面会标出来。
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { VERSION } from "./update.js";

/** 设置页能改的键。别的键只能手动改 .env。 */
export const KEYS = {
  MODEL: { secret: false },
  DEEPSEEK_API_KEY: { secret: true },
  DEFAULT_AGENT: { secret: false },
  KIKI_AUTO_UPDATE: { secret: false },
} as const;
type Key = keyof typeof KEYS;

export type Source = "file" | "op" | "external" | "unset";

/** 一个键的值从哪来：.env 文件、.env 里的 1Password 引用、外部注入，还是没设。 */
export function sourceOf(fileVal: string | undefined, envVal: string | undefined): Source {
  if (fileVal !== undefined && fileVal.startsWith("op://")) return "op";
  if (envVal !== undefined && envVal !== "" && envVal !== fileVal) return "external";
  if (fileVal !== undefined && fileVal !== "") return "file";
  return "unset";
}

/** 只改 .env 里 key 那一行；没有就加在末尾。value 为 undefined 时删掉这一行。 */
export function setEnvLine(src: string, key: string, value: string | undefined): string {
  const lines = src === "" ? [] : src.split("\n");
  const re = new RegExp(`^\\s*(export\\s+)?${key}\\s*=`);
  // node 的 parseEnv 不认反斜杠转义，所以挑一个值里没有的引号把它包起来
  const q = value !== undefined && /[\s#"'`\\]/.test(value) ? ["'", '"', "`"].find((c) => !value.includes(c)) : "";
  if (q === undefined) throw new Error("值里不能同时有 ' \" ` 三种引号");
  const quoted = value === undefined ? undefined : `${q}${value}${q}`;
  const idx = lines.findIndex((l) => re.test(l));
  if (value === undefined) {
    if (idx >= 0) lines.splice(idx, 1);
  } else if (idx >= 0) lines[idx] = `${key}=${quoted}`;
  else {
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(`${key}=${quoted}`, "");
  }
  return lines.join("\n");
}

export const validName = (n: unknown): n is string =>
  typeof n === "string" && /^[\p{L}\p{N}_-]{1,40}$/u.test(n);

const mask = (v: string) => (v.length <= 8 ? "••••" : `${v.slice(0, 3)}••••${v.slice(-4)}`);

function run(cmd: string, args: string[], timeout = 4000): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout }, (err, out) => (err ? reject(err) : resolve(String(out)))),
  );
}

async function runFirst(cmds: string[], args: string[]) {
  let last: unknown;
  for (const c of cmds) {
    try {
      return await run(c, args);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const TAILSCALE = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/opt/homebrew/bin/tailscale"];

/** Tailscale 的状态：装没装、连没连、手机能用的地址（tailscale serve 开着时）。 */
async function remote(port: number) {
  try {
    const st = JSON.parse(await runFirst(TAILSCALE, ["status", "--json"]));
    const dns = String(st.Self?.DNSName ?? "").replace(/\.$/, "");
    const online = st.BackendState === "Running";
    let serving = false;
    try {
      serving = (await runFirst(TAILSCALE, ["serve", "status"])).includes(String(port));
    } catch {}
    return { installed: true, online, serving, url: dns ? `https://${dns}` : undefined };
  } catch {
    return { installed: false, online: false, serving: false };
  }
}

export function settingsApi(opts: { dataDir: string; port: number }) {
  const envFile = join(opts.dataDir, ".env");
  const aboutFile = join(opts.dataDir, "AGENTS.md");
  const agentsDir = join(opts.dataDir, "agents");
  const readEnvFile = () => (existsSync(envFile) ? readFileSync(envFile, "utf8") : "");
  const fileVals = () => parseEnv(readEnvFile()) as Record<string, string>;
  const agentFile = (name: string) => join(agentsDir, name, "AGENTS.md");
  const listAgents = () =>
    existsSync(agentsDir) ? readdirSync(agentsDir).filter((n) => statSync(join(agentsDir, n)).isDirectory()) : [];
  // 当前这个进程是不是由 Kiki.app 的 launchd 服务跑起来的：是的话能自己重启
  const canRestart = () => !!process.env.KIKI_APP;
  let changed = false; // 改过需要重启的设置

  /** 实际要用的密钥：.env 里写的是 op:// 引用、进程里又没解析好时，现场用 op read 解析。 */
  async function resolvedKey(): Promise<string | undefined> {
    const file = fileVals().DEEPSEEK_API_KEY;
    const env = process.env.DEEPSEEK_API_KEY;
    if (env && !env.startsWith("op://")) return env;
    const ref = file?.startsWith("op://") ? file : env;
    if (ref?.startsWith("op://")) return (await run("op", ["read", ref], 15000)).trim();
    return file || undefined;
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    const json = (data: unknown, code = 200) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };
    const body = async () => {
      let s = "";
      for await (const chunk of req) s += chunk;
      return JSON.parse(s || "{}");
    };
    const p = url.pathname;
    const post = req.method === "POST";

    // 总览：页面一打开就要的东西
    if (p === "/api/settings" && !post) {
      const file = fileVals();
      const env: Record<string, unknown> = {};
      for (const k of Object.keys(KEYS) as Key[]) {
        const fv = file[k];
        const ev = process.env[k];
        const source = sourceOf(fv, ev);
        const shown = source === "external" ? ev : fv;
        env[k] = {
          source,
          value: shown === undefined ? "" : KEYS[k].secret && source !== "op" ? (shown ? mask(shown) : "") : shown,
        };
      }
      return json({
        version: VERSION,
        dataDir: opts.dataDir,
        envFile,
        env,
        agents: listAgents(),
        changed,
        canRestart: canRestart(),
      });
    }

    if (p === "/api/settings/remote") return json(await remote(opts.port));

    // 改一个配置项：{ key, value }；value 为空字符串表示删掉这一行
    if (p === "/api/settings/env" && post) {
      const { key, value } = await body();
      if (!(key in KEYS)) return json({ error: `设置页不能改 ${key}` }, 400);
      if (typeof value !== "string" || /[\r\n]/.test(value)) return json({ error: "值不能换行" }, 400);
      if (sourceOf(fileVals()[key], process.env[key]) === "external")
        return json({ error: "这个值是启动时从外部注入的，这里改了也不生效" }, 409);
      writeFileSync(envFile, setEnvLine(readEnvFile(), key, value.trim() === "" ? undefined : value.trim()), { mode: 0o600 }); // 里面有密钥，新建时只给自己读写
      changed = true;
      return json({ ok: true, changed });
    }

    // 关于我
    if (p === "/api/settings/about") {
      if (!post) return json({ path: aboutFile, text: existsSync(aboutFile) ? readFileSync(aboutFile, "utf8") : "" });
      const { text } = await body();
      if (typeof text !== "string") return json({ error: "缺 text" }, 400);
      writeFileSync(aboutFile, text);
      return json({ ok: true });
    }

    // 某个宝的说明：GET ?name=dev 读，POST {name, text} 写，POST {name, create:true} 新建
    if (p === "/api/settings/agent") {
      if (!post) {
        const name = url.searchParams.get("name");
        if (!validName(name) || !listAgents().includes(name)) return json({ error: "没有这个宝" }, 404);
        const f = agentFile(name);
        return json({ name, path: f, text: existsSync(f) ? readFileSync(f, "utf8") : "" });
      }
      const { name, text, create } = await body();
      if (!validName(name)) return json({ error: "名字只能用字母、数字、汉字、- 和 _，最多 40 个字" }, 400);
      const exists = listAgents().includes(name);
      if (create) {
        if (exists) return json({ error: "已经有这个宝了" }, 400);
        mkdirSync(join(agentsDir, name), { recursive: true });
        writeFileSync(agentFile(name), typeof text === "string" && text ? text : `# ${name}\n\n你是我的${name}。\n`);
        return json({ ok: true });
      }
      if (!exists) return json({ error: "没有这个宝" }, 404);
      if (typeof text !== "string") return json({ error: "缺 text" }, 400);
      writeFileSync(agentFile(name), text);
      return json({ ok: true });
    }

    // 测试密钥：用 DeepSeek 的 /models 接口，不花钱
    if (p === "/api/settings/test" && post) {
      let key: string | undefined;
      try {
        key = await resolvedKey();
      } catch (e) {
        return json({ ok: false, error: `用 op 读密钥失败：${(e as Error).message.split("\n")[0]}` });
      }
      if (!key) return json({ ok: false, error: "还没填 DeepSeek 密钥" });
      try {
        const r = await fetch("https://api.deepseek.com/models", {
          headers: { authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        });
        if (r.ok) return json({ ok: true });
        return json({ ok: false, error: r.status === 401 ? "密钥不对（401）" : `DeepSeek 返回 ${r.status}` });
      } catch (e) {
        return json({ ok: false, error: `连不上 DeepSeek：${(e as Error).message}` });
      }
    }

    // 重启：Kiki.app 下让 launchd 重启服务；开发模式下请手动重启
    if (p === "/api/settings/restart" && post) {
      if (!canRestart()) return json({ error: "开发模式（npm start）请在终端里手动重启" }, 400);
      json({ ok: true });
      const uid = process.getuid?.() ?? 501;
      setTimeout(() => {
        run("launchctl", ["kickstart", "-k", `gui/${uid}/com.lkyxuan.kiki`]).catch(() => process.exit(0));
      }, 300);
      return;
    }

    json({ error: "not found" }, 404);
  };
}
