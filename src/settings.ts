// 设置页的接口：/api/settings*。页面是 public/settings.html。
//
// 配置写回 <数据目录>/.env：只改对应的那一行，注释和别的行原样保留。改完要重启 Kiki 才生效（直接填的 DeepSeek 密钥例外，马上生效）。
// 如果某个值是进程启动时从外面带进来的（比如 op run 注入、终端里 export），这里改了也没用，界面会标出来。
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { baoDoc, readDuty, setDuty } from "./bao.js";
import { Extensions, validSource } from "./extensions.js";
import { listFeatures, setFeature } from "./features.js";
import { listApproval, removeAlways, setAuto, setMode } from "./approval.js";
import { MacPermissions } from "./macperm.js";
import { Mcp } from "./mcp.js";
import { VERSION } from "./update.js";

/** 设置页能改的键。别的键只能手动改 .env。 */
export const KEYS = {
  MODEL: { secret: false },
  DEEPSEEK_API_KEY: { secret: true },
  DEFAULT_AGENT: { secret: false },
  KIKI_AUTO_UPDATE: { secret: false },
} as const;
type Key = keyof typeof KEYS;

export type Source = "file" | "ref" | "external" | "unset";

/** 密钥引用：Kiki.app 启动时由 kiki-server 换成真值（keychain:<名字> 从钥匙串取，op://… 从 1Password 取）。 */
export const isRef = (v: string | undefined) => !!v && (v.startsWith("op://") || v.startsWith("keychain:"));

/**
 * 一个键的值从哪来：.env 文件、.env 里的密钥引用（钥匙串或 1Password）、外部注入，还是没设。
 * 是不是外部注入要拿"启动时"的 .env 比（startVal），不能拿现在的文件比：
 * 不然在设置页改过、还没重启的值，会被误认成外部注入。
 */
export function sourceOf(fileVal: string | undefined, envVal: string | undefined, startVal = fileVal): Source {
  const fromStartFile = envVal === startVal || isRef(startVal);
  if (envVal !== undefined && envVal !== "" && !fromStartFile) return "external";
  if (isRef(fileVal)) return "ref";
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

/** 宝的头像：一个 emoji（最多几个字符），不合法就不要 */
export const baoEmoji = (e: unknown) =>
  typeof e === "string" && e.trim() && [...e.trim()].length <= 8 && !/[<>&"'\s]/.test(e.trim()) ? e.trim() : "";

/** 读宝的外观设置（agents/<名字>/bao.json），没有就是空 */
export function baoLook(dataDir: string, name: string): { emoji?: string } {
  try {
    const emoji = baoEmoji(JSON.parse(readFileSync(join(dataDir, "agents", name, "bao.json"), "utf8")).emoji);
    return emoji ? { emoji } : {};
  } catch {
    return {};
  }
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
  const macPerms = new MacPermissions(opts.dataDir);
  const envFile = join(opts.dataDir, ".env");
  const aboutFile = join(opts.dataDir, "AGENTS.md");
  const agentsDir = join(opts.dataDir, "agents");
  const readEnvFile = () => (existsSync(envFile) ? readFileSync(envFile, "utf8") : "");
  const fileVals = () => parseEnv(readEnvFile()) as Record<string, string>;
  const startVals = fileVals(); // 启动时 .env 的样子，用来判断哪些值是外部注入的
  const source = (k: string) => sourceOf(fileVals()[k], process.env[k], startVals[k]);
  const agentFile = (name: string) => join(agentsDir, name, "AGENTS.md");
  // 改 bao.json 里的几项，别的项（以后加的）原样留着；值为 undefined 就删掉那一项
  const writeLook = (name: string, patch: Record<string, unknown>) => {
    const f = join(agentsDir, name, "bao.json");
    let cur: Record<string, unknown> = {};
    try { cur = JSON.parse(readFileSync(f, "utf8")); } catch {}
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    writeFileSync(f, JSON.stringify(next) + "\n");
  };
  const listAgents = () =>
    existsSync(agentsDir) ? readdirSync(agentsDir).filter((n) => statSync(join(agentsDir, n)).isDirectory()) : [];
  // 当前这个进程是不是由 Kiki.app 的 launchd 服务跑起来的：是的话能自己重启
  const canRestart = () => !!process.env.KIKI_APP;
  const exts = new Extensions(join(opts.dataDir, "engine"));
  const mcp = new Mcp(join(opts.dataDir, "engine"));
  let changed = false; // 改过需要重启的设置

  /** 实际要用的密钥：.env 里写的是 op:// 引用、进程里又没解析好时，现场用 op read 解析。 */
  /** 测试用的密钥：外部注入的用进程里的；否则用 .env 里现在存的（改过还没重启也算），密钥引用现场解析（钥匙串用 security，1Password 用 op read）。 */
  async function resolvedKey(): Promise<string | undefined> {
    const k = "DEEPSEEK_API_KEY";
    const val = source(k) === "external" ? process.env[k] : fileVals()[k];
    if (val?.startsWith("op://")) return (await run("op", ["read", val], 20000)).trim();
    if (val?.startsWith("keychain:"))
      return (await run("security", ["find-generic-password", "-s", val.slice("keychain:".length), "-w"])).trim();
    return val || undefined;
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
        const src = source(k);
        const shown = src === "external" ? ev : fv;
        env[k] = {
          source: src,
          value: shown === undefined ? "" : KEYS[k].secret && src !== "ref" ? (shown ? mask(shown) : "") : shown,
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
      if (source(key) === "external")
        return json({ error: "这个值是启动时从外部注入的，这里改了也不生效" }, 409);
      const v = value.trim();
      writeFileSync(envFile, setEnvLine(readEnvFile(), key, v === "" ? undefined : v), { mode: 0o600 }); // 里面有密钥，新建时只给自己读写
      if (key === "DEEPSEEK_API_KEY" && !isRef(v)) {
        // 直接填的密钥马上生效（内核每次调用模型时现读环境变量），新用户填完就能聊，不用先重启。
        // 启动时的样子也一起改掉，免得 sourceOf 把它当成外部注入的值。
        if (v) process.env[key] = v;
        else delete process.env[key];
        if (v) startVals[key] = v;
        else delete startVals[key];
      } else changed = true;
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

    // 某个宝的说明：GET ?name=dev 读（带上「我负责什么」和头像），POST {name, text} 写整份说明，
    // POST {name, create:true} 新建，POST {name, edit:true, about, emoji} 宝设置弹窗改负责什么和头像
    if (p === "/api/settings/agent") {
      if (!post) {
        const name = url.searchParams.get("name");
        if (!validName(name) || !listAgents().includes(name)) return json({ error: "没有这个宝" }, 404);
        const f = agentFile(name);
        const text = existsSync(f) ? readFileSync(f, "utf8") : "";
        return json({ name, path: f, text, about: readDuty(text), ...baoLook(opts.dataDir, name) });
      }
      const { name, text, create, edit, about, emoji } = await body();
      if (!validName(name)) return json({ error: "名字只能用字母、数字、汉字、- 和 _，最多 40 个字" }, 400);
      const exists = listAgents().includes(name);
      if (create) {
        if (exists) return json({ error: "已经有这个宝了" }, 400);
        mkdirSync(join(agentsDir, name), { recursive: true });
        // 新建弹窗里填的「我负责什么」写进 AGENTS.md，以后在「编辑说明」里改
        const duty = typeof about === "string" ? about.trim().slice(0, 500) : "";
        writeFileSync(agentFile(name), typeof text === "string" && text ? text : baoDoc(name, duty));
        const face = baoEmoji(emoji);
        if (face) writeFileSync(join(agentsDir, name, "bao.json"), JSON.stringify({ emoji: face }) + "\n");
        return json({ ok: true });
      }
      if (!exists) return json({ error: "没有这个宝" }, 404);
      if (edit) {
        if (typeof about === "string") {
          if (about.length > 2000) return json({ error: "「我负责什么」太长了，最多 2000 个字，更多的写进完整说明" }, 400);
          const f = agentFile(name);
          writeFileSync(f, setDuty(existsSync(f) ? readFileSync(f, "utf8") : "", name, about));
        }
        if (emoji !== undefined) writeLook(name, { emoji: baoEmoji(emoji) || undefined });
        return json({ ok: true });
      }
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
        return json({ ok: false, error: `读取密钥引用失败：${(e as Error).message.split("\n")[0]}` });
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

    // 扩展：pi 扩展（engine/settings.json）+ Kiki 自带能力（features.json）
    if (p === "/api/settings/extensions" && !post) {
      let packages: ReturnType<Extensions["list"]> = [];
      let error: string | undefined;
      try {
        packages = exts.list();
      } catch (e) {
        error = `读不了 engine/settings.json：${(e as Error).message}`;
      }
      return json({ packages, features: listFeatures(opts.dataDir), error });
    }
    if (p.startsWith("/api/settings/extensions/") && post) {
      const { source, on } = await body();
      if (!validSource(source)) return json({ error: "来源要写成 npm:包名、git:仓库地址 或 https://…" }, 400);
      try {
        const action = p.slice("/api/settings/extensions/".length);
        if (action === "toggle") exts.setOn(source, !!on);
        else if (action === "install") return json({ ok: true, output: await exts.install(source) });
        else if (action === "remove") return json({ ok: true, output: await exts.remove(source) });
        else return json({ error: "not found" }, 404);
        return json({ ok: true });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    // MCP 服务器：engine/mcp.json
    if (p === "/api/settings/mcp" && !post) {
      try {
        return json({ servers: mcp.list(), file: mcp.file });
      } catch (e) {
        return json({ servers: [], file: mcp.file, error: `读不了 mcp.json：${(e as Error).message}` });
      }
    }
    if (p.startsWith("/api/settings/mcp/") && post) {
      const { name, spec, on } = await body();
      try {
        const action = p.slice("/api/settings/mcp/".length);
        if (action === "add") return json({ ok: true, name: mcp.add(typeof name === "string" ? name.trim() : "", String(spec ?? "")) });
        if (action === "toggle") mcp.setOn(String(name), !!on);
        else if (action === "remove") mcp.remove(String(name));
        else return json({ error: "not found" }, 404);
        return json({ ok: true });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    // 审批：四类动作各自 直接做（带兜底）/ 先问 / 不做，以及“以后都同意”记下的规则
    if (p === "/api/settings/approval" && !post) return json(listApproval(opts.dataDir));
    if (p === "/api/settings/approval/mode" && post) {
      const { category, mode } = await body();
      try {
        setMode(opts.dataDir, String(category), String(mode));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json({ ok: true });
    }
    // Mac 权限：列出要开的系统权限和跳转链接
    if (p === "/api/settings/mac-permissions" && !post) return json(await macPerms.status());
    // 一次要齐：在后台慢慢弹（每个系统弹窗等你点完），网页轮询状态
    if (p === "/api/settings/mac-permissions/request" && post) {
      void macPerms.requestAll().catch(() => {});
      return json({ ok: true });
    }
    if (p === "/api/settings/mac-permissions/open" && post) {
      try {
        await macPerms.open(String((await body()).id ?? ""));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json({ ok: true });
    }
    if (p === "/api/settings/mac-permissions/seen" && post) {
      macPerms.markAsked();
      return json({ ok: true });
    }
    // 全自动的兜底：对外发送白名单、待发时长、花钱预算
    if (p === "/api/settings/approval/auto" && post) {
      try {
        setAuto(opts.dataDir, await body());
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json({ ok: true });
    }
    if (p === "/api/settings/approval/forget" && post) {
      const { key } = await body();
      removeAlways(opts.dataDir, String(key));
      return json({ ok: true });
    }
    if (p === "/api/settings/features" && post) {
      const { id, on } = await body();
      try {
        setFeature(opts.dataDir, id, !!on);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json({ ok: true });
    }

    json({ error: "not found" }, 404);
  };
}
