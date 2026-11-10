// 发推：X API v2（POST /2/tweets）。宣传那条线要「能直接把稿发出去」，所以做成 Kiki 自带的工具。
//
// 只挂在 AGENT 这个宝的对话里（主对话和它下面的讨论串都行）：别的宝、奇奇要发内容，得找那个宝；
// 奇奇那边只给一个只看情况用的 statusText。
// 连的是「品牌号」：凭证从一个单独的小文件读，不给 agent 看，也不进模型上下文：
//   <数据目录>/engine/tweet.json  { "apiKey": "…", "apiSecret": "…", "accessToken": "…", "accessTokenSecret": "…",
//                                   "handle": "kiki", "recordDir": "…/发帖记录", "monthlyLimit": 500 }
// 值也可以写成 Kiki 设置页那套引用："keychain:<名字>"（macOS 钥匙串）、"op://…"（1Password），用法见 settings.ts。
//
// 三个工具：
//   x_post   发一条推文。text 是中文正文，english 给了就发成 reply 串的第二条；超 280 权重自动切串；
//            按每月自设上限（默认 500，X 免费档的 write 额度）拦一道；发完写发帖记录。
//   x_check  只看不发：凭证有没看、哪个号、本月发了几条、凭证是否有效。
//   x_delete 删自己发的推文（发错了能撤回），发帖记录那条标「已删」。
//
// 记录文件：<recordDir>/YYYY-MM-DD.md，一行一条：时间、推文 id、链接、回的是哪条、正文、谁发的。
import { execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** 这个工具的宝（宝名 = agents/ 下的文件夹名）；brand 是「品牌底稿」里的叫法，用来认凭证文件 */
export const AGENT = "宣传总管";

type Cred = {
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;
  bearerToken?: string; // 只读（看额度、读推文）用，可选
  handle?: string;
  recordDir?: string;
  monthlyLimit?: number; // 自设的每月发帖上限，默认 500（X 免费档的 write 额度）
  apiBase?: string; // 测试用，默认 https://api.x.com
  fetchImpl?: typeof fetch; // 测试用
};

const expandAll = (dataDir: string) => dataDir.replace(/^~/, homedir());
/** 凭证文件；测试时可以指到别处 */
export const configPath = (dataDir: string, override = process.env.KIKI_TWEET_CONFIG) =>
  override || join(expandAll(dataDir), "engine", "tweet.json");
/** 默认的发帖记录目录（宣传总管宝的 notes/ 下） */
export const defaultRecordDir = (dataDir: string) => join(expandAll(dataDir), "agents", AGENT, "notes", "发帖记录");
/** X 单条上限：中文按 2 算，英文按 1 */
const MAX_WEIGHT = 280;

// ---------- 凭证 ----------

const expand = (v: string | undefined) => (v ?? "").replace(/^~/, homedir());
let DATA = expandAll(process.env.DATA_DIR || "~/kiki-data"); // 每个工具执行时按 opts.dataDir 设一遍

/** 1Password service account 的 token 文件（op read 要用它；没有就交给 op 自己找） */
export const SA_FILE = join(homedir(), ".config", "op", "service-account.env");

/** 读 service-account.env 里的 OP_SERVICE_ACCOUNT_TOKEN（只读这一行；Kiki 里没设就去这个文件找） */
export function serviceAccountToken(file = SA_FILE): string | undefined {
  if (process.env.OP_SERVICE_ACCOUNT_TOKEN) return process.env.OP_SERVICE_ACCOUNT_TOKEN;
  try {
    const line = readFileSync(file, "utf8").split("\n").find((l) => /^\s*(export\s+)?OP_SERVICE_ACCOUNT_TOKEN=/.test(l));
    return line ? line.replace(/^\s*(export\s+)?OP_SERVICE_ACCOUNT_TOKEN=/, "").trim().replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

async function run(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    // op 要 token：Kiki 没带 OP_SERVICE_ACCOUNT_TOKEN 时从 service-account.env 补上，不然 op read 会说没登录
    const env = cmd === "op" ? { ...process.env, ...(serviceAccountToken() ? { OP_SERVICE_ACCOUNT_TOKEN: serviceAccountToken() } : {}) } : process.env;
    execFile(cmd, args, { timeout, env }, (err, out) => (err ? reject(err) : resolve(String(out))));
  });
}

/** 钥匙串 / 1Password 引用现场解析（和 Kiki 设置页的规则一样：keychain:名字、op://…） */
async function resolveRef(v: string | undefined): Promise<string | undefined> {
  if (!v) return undefined;
  if (v.startsWith("keychain:")) {
    const name = v.slice("keychain:".length);
    return (await run("security", ["find-generic-password", "-s", name, "-w"])).trim();
  }
  if (v.startsWith("op://")) return (await run("op", ["read", v], 30000)).trim();
  return v;
}

export function loadConfig(file = configPath(DATA)): Cred {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Cred;
  } catch {
    return {};
  }
}

async function credentials(c: Cred) {
  const apiKey = await resolveRef(c.apiKey);
  const apiSecret = await resolveRef(c.apiSecret);
  const accessToken = await resolveRef(c.accessToken);
  const accessTokenSecret = await resolveRef(c.accessTokenSecret);
  const bearerToken = await resolveRef(c.bearerToken);
  return { apiKey, apiSecret, accessToken, accessTokenSecret, bearerToken };
}

const canPost = (k: Awaited<ReturnType<typeof credentials>>) => !!(k.apiKey && k.apiSecret && k.accessToken && k.accessTokenSecret);
const canRead = (k: Awaited<ReturnType<typeof credentials>>) => !!(k.bearerToken || canPost(k));

// ---------- OAuth 1.0a（HMAC-SHA1，用户上下文） ----------

const pct = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (m) => `%${m.charCodeAt(0).toString(16).toUpperCase()}`);

/** 拼 Authorization 头。bodyParams/queryParams 都要进签名（JSON 请求体不进签名）。 */
export function oauthHeader(opts: {
  method: string;
  url: string; // 不带查询串
  query?: Record<string, string>;
  form?: Record<string, string>;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  nonce?: string;
  timestamp?: string;
}): string {
  const params: Record<string, string> = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: opts.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: opts.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: opts.token,
    oauth_version: "1.0",
    ...(opts.query ?? {}),
    ...(opts.form ?? {}),
  };
  const normalized = Object.keys(params)
    .map((k) => [pct(k), pct(params[k])] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [opts.method.toUpperCase(), pct(opts.url), pct(normalized)].join("&");
  const key = `${pct(opts.consumerSecret)}&${pct(opts.tokenSecret)}`;
  const signature = createHmac("sha1", key).update(base).digest("base64");
  const header: Record<string, string> = {
    oauth_consumer_key: params.oauth_consumer_key,
    oauth_nonce: params.oauth_nonce,
    oauth_signature: signature,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: params.oauth_timestamp,
    oauth_token: params.oauth_token,
    oauth_version: "1.0",
  };
  return "OAuth " + Object.entries(header).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(", ");
}

// ---------- 正文检查 ----------

/** X 的字符权重：CJK、全角标点等按 2 算。返回总权重。 */
export function weightOf(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // 拉丁、数字、常见 ASCII 标点、半角空格算 1；emoji、CJK、全角标点算 2
    const light =
      (cp >= 0x20 && cp <= 0x7e) ||
      cp === 0x0a ||
      (cp >= 0xa0 && cp <= 0x24f) || // 拉丁补充 / 扩展（带音标）
      (cp >= 0x370 && cp <= 0x58f); // 希腊、西里尔
    n += light ? 1 : 2;
  }
  return n;
}

export const tooLong = (text: string) => weightOf(text) > MAX_WEIGHT;

// ---------- 发帖记录 ----------

const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function recordPath(dir = defaultRecordDir(DATA), d = new Date()) {
  return join(dir, `${today(d)}.md`);
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ⏎ ").trim();

export function appendRecord(
  entry: { time: string; id: string; link: string; text: string; replyTo?: string; by?: string; note?: string },
  dir = defaultRecordDir(DATA),
) {
  mkdirSync(dir, { recursive: true });
  const d = new Date(entry.time);
  const file = recordPath(dir, d);
  if (!existsSync(file))
    writeFileSync(file, `# ${today(d)} 发帖记录\n\n> 一条一行。发出去就记，删了在最后标「已删」。\n\n`);
  const line = [
    `- ${entry.time.slice(11, 16)}`,
    `X · ${entry.link}`,
    `id ${entry.id}`,
    entry.replyTo ? `回 ${entry.replyTo}` : "",
    `@${entry.by ?? "?"}`,
    entry.note ?? "",
    `「${oneLine(entry.text)}」`,
  ]
    .filter(Boolean)
    .join(" · ");
  appendFileSync(file, `${line}\n`);
  return file;
}

/** 当月（默认）一共记了多少条：数记录文件里的 `X · ` 行 */
export function countPosted(dir = defaultRecordDir(DATA), d = new Date()) {
  if (!existsSync(dir)) return 0;
  const prefix = today(d).slice(0, 7);
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md") || !f.startsWith(prefix)) continue;
    const body = readFileSync(join(dir, f), "utf8");
    for (const line of body.split("\n")) if (/^- \d\d:\d\d · X · /.test(line) && !line.includes("· 已删")) n++;
  }
  return n;
}

// ---------- 调 X ----------

type Ctx = { cred: Cred; keys: Awaited<ReturnType<typeof credentials>>; fetch: typeof fetch; base: string };

const text = (t: string, isError = false) =>
  ({ content: [{ type: "text" as const, text: t }], details: undefined, ...(isError ? { isError } : {}) }) as any;

export async function api(c: Ctx, method: string, path: string, body?: unknown) {
  const url = `${c.base}${path}`;
  const headers: Record<string, string> = { "user-agent": "kiki-tweet/1.0" };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  timer.unref?.(); // 别让这个定时器拖着进程不退出
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method === "GET" && c.keys.bearerToken && !canPost(c.keys)) {
    headers.authorization = `Bearer ${c.keys.bearerToken}`;
  } else if (canPost(c.keys)) {
    headers.authorization = oauthHeader({
      method,
      url,
      consumerKey: c.keys.apiKey!,
      consumerSecret: c.keys.apiSecret!,
      token: c.keys.accessToken!,
      tokenSecret: c.keys.accessTokenSecret!,
    });
  } else {
    throw new Error("没有可用的凭证：发帖要 OAuth 1.0a 的四件套（apiKey/apiSecret/accessToken/accessTokenSecret）");
  }
  const res = await c.fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ac.signal });
  clearTimeout(timer);
  const raw = await res.text();
  let data: any = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const detail = data?.detail ?? data?.title ?? data?.errors?.[0]?.message ?? raw.slice(0, 300);
    const hint =
      res.status === 401
        ? "（凭证不对或 App 权限不是 Read and write）"
        : res.status === 403
          ? "（账号或 App 没有发帖权限，或触发了平台限制）"
          : res.status === 429
            ? "（额度用完了，等额度重置）"
            : "";
    throw new Error(`X 返回 ${res.status}：${detail}${hint}`);
  }
  return data;
}

const linkOf = (handle: string | undefined, id: string) =>
  handle ? `https://x.com/${handle.replace(/^@/, "")}/status/${id}` : `https://x.com/i/web/status/${id}`;

/** 把一段正文按段落切成几条（超 280 权重时，英文版太长就切成 reply 串） */
export function splitForThread(body: string, max = MAX_WEIGHT): string[] {
  if (!tooLong(body)) return [body];
  const parts: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) parts.push(cur.trim());
    cur = "";
  };
  for (const para of body.split(/\n{2,}/)) {
    const candidate = cur ? `${cur}\n\n${para}` : para;
    if (weightOf(candidate) <= max) {
      cur = candidate;
      continue;
    }
    push();
    if (weightOf(para) <= max) {
      cur = para;
      continue;
    }
    // 单段还太长：按句子切
    for (const sent of para.split(/(?<=[.!?。！？])\s*/)) {
      const cand = cur ? `${cur} ${sent}` : sent;
      if (weightOf(cand) <= max) cur = cand;
      else {
        push();
        cur = sent;
      }
    }
  }
  push();
  return parts.length ? parts : [body];
}

// ---------- 工具 ----------

const HELP_NO_CONFIG = `还没配 X 凭证。要用户自己做的：
1. 用**品牌号**登录 https://developer.x.com → Projects & Apps → 建一个 App（Free 档够用，写额度约 500 条/月）
2. App 的 User authentication settings 打开 OAuth 1.0a，权限选 Read and write
3. 在 Keys and tokens 里生成：API Key / API Key Secret / Access Token / Access Token Secret（Access Token 必须是 Read and write 之后生成的，否则发不出去）
4. 把四件套写进 <数据目录>/engine/tweet.json（一般是 ~/kiki-data/engine/tweet.json）：
   {"apiKey":"…","apiSecret":"…","accessToken":"…","accessTokenSecret":"…","handle":"品牌号用户名不带@","recordDir":"…/agents/宣传总管/notes/发帖记录"}
   也可以值写 "keychain:名字"（钥匙串）或 "op://…"（1Password），不用把明文放文件里。`;

/** 只在 AGENT 这个宝自己的目录里能用（cwd 就是宝目录，主对话和讨论串都一样） */
export const allowed = (cwd: unknown, owner: string = AGENT) =>
  typeof cwd === "string" && cwd.replace(/\/$/, "").endsWith(`/agents/${owner}`);

const HELP_SUFFIX = `\n\n凭证文件放在 <数据目录>/engine/tweet.json（只在用户电脑上，agent 看不到内容）；值可以写明文，也可以写 keychain:名字 / op://… 引用。`;

/** 用户问「X 能发了吗」「这月发了多少」时不发东西，只说情况（给别的宝和奇奇用） */
export const statusText = (dataDir: string, d = new Date()) => {
  DATA = expandAll(dataDir);
  const cred = loadConfig();
  const dir = expand(cred.recordDir) || defaultRecordDir(dataDir);
  const used = countPosted(dir, d);
  return `X 发帖工具在「${AGENT}」那里：${cred.apiKey && cred.accessToken ? `凭证已配${cred.handle ? `（@${cred.handle.replace(/^@/, "")}）` : ""}` : "还没配凭证（要用户自己去 developer.x.com 申请，步骤在 ${AGENT} 的说明里）"}，本月已发 ${used} 条（自设上限 ${cred.monthlyLimit ?? 500}）。`;
};

/** 发推工具（x_post / x_check / x_delete）。dataDir 是 Kiki 的数据目录，凭证和发帖记录都在里面。 */
export default function kikiTweetTools(dataDir: string): ToolDefinition[] {
  const tools = buildTools(dataDir);
  // 权限收在这一层：工具本身不知道有谁在用，外面统一挡成「只有这个宝能用」
  return tools.map((t) => ({
    ...t,
    execute: (async (id: string, p: any, sig: any, up: any, ctx: any) => {
      if (!allowed(ctx?.cwd)) return text(`${t.name} 只在「${AGENT}」的对话里能用。要发内容到 X，找「${AGENT}」。`, true);
      return t.execute(id, p, sig, up, ctx);
    }) as ToolDefinition["execute"],
  }));
}

function buildTools(dataDir: string): ToolDefinition[] {
  DATA = expandAll(dataDir);
  const tools: ToolDefinition[] = [];
  const guarded = (run: (p: any, ctx: any) => Promise<any>) => async (_id: string, p: any, _sig: any, _up: any, ctx: any) => {
    try {
      return await run(p, ctx);
    } catch (e: any) {
      return text(`没成：${e?.message ?? e}`, true);
    }
  };

  const context = async (): Promise<Ctx> => {
    const cred = loadConfig();
    return { cred, keys: await credentials(cred), fetch: cred.fetchImpl ?? fetch, base: (cred.apiBase ?? "https://api.x.com").replace(/\/$/, "") };
  };

  tools.push({
    name: "x_post",
    label: "发推",
    description:
      "直接在用户的 X 品牌号上发一条推文（X API v2 POST /2/tweets）。text 是正文；english 给了英文版就发成 reply 串的第二条；超 280 权重会自动按段落切串。按每月自设上限（默认 500）拦；发出去自动写进发帖记录并返回推文链接。replyTo 填推文 id 就回那条。",
    promptSnippet: "x_post：往品牌号发推（发完自动记进发帖记录）",
    promptGuidelines: [
      "要发内容到 X 时用 x_post，不要自己写 curl 或改文件。",
      "中文版用 text，英文版用 english；英文版会作为 reply 串跟在中文后面，两条都在同一个串里。",
      "发完把返回的链接告诉用户，不要自己拼链接。",
    ],
    parameters: Type.Object({
      text: Type.String({ description: "推文正文（中文版）" }),
      english: Type.Optional(Type.String({ description: "英文版，发成 reply 串的第二条" })),
      replyTo: Type.Optional(Type.String({ description: "要回哪条推文的 id（可选）" })),
      by: Type.Optional(Type.String({ description: "谁发的，写宝名或「宣传总管」，记进发帖记录" })),
    }),
    execute: guarded(async (p, ctx) => {
      const c = await context();
      if (!canPost(c.keys)) return text(`发不了：${HELP_NO_CONFIG}`, true);
      const limit = c.cred.monthlyLimit ?? 500;
      const used = countPosted(expand(c.cred.recordDir) || defaultRecordDir(DATA));
      // 中文版在前，英文版作为 reply 串跟在后面；各自超长就各自切成几条，不把两种语言混在一条里
      const pieces = [...splitForThread(p.text), ...(p.english ? splitForThread(p.english) : [])];
      if (used + pieces.length > limit) return text(`这月已经发了 ${used} 条，再发 ${pieces.length} 条就超过自设上限 ${limit} 条，先停下（要放宽改 tweet.json 的 monthlyLimit）。`, true);

      const by = p.by || AGENT;
      const sent: { id: string; link: string; text: string }[] = [];
      let replyTo = p.replyTo;
      for (const piece of pieces) {
        const body: any = { text: piece };
        if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };
        const r = await api(c, "POST", "/2/tweets", body);
        const id = String(r?.data?.id ?? "");
        if (!id) throw new Error(`X 没说推文 id：${JSON.stringify(r).slice(0, 200)}`);
        const link = linkOf(c.cred.handle, id);
        appendRecord(
          { time: new Date().toISOString(), id, link, text: piece, replyTo: replyTo || undefined, by },
          expand(c.cred.recordDir) || defaultRecordDir(DATA),
        );
        sent.push({ id, link, text: piece });
        replyTo = id;
      }
      const lines = sent.map((s, i) => `${i + 1}. ${s.link}\n${s.text}`);
      return text(`已发 ${sent.length} 条（本月第 ${used + 1}${sent.length > 1 ? `–${used + sent.length}` : ""} 条，上限 ${limit}）：\n\n${lines.join("\n\n")}\n\n记录已写进 ${recordPath(expand(c.cred.recordDir) || defaultRecordDir(DATA))}`);
    }),
  });

  tools.push({
    name: "x_check",
    label: "看 X 凭证和额度",
    description: "只看不发：X 凭证有没有、是哪个号、本月已发几条、还剩多少额度，以及凭证是否有效（调 /2/users/me）。",
    promptSnippet: "x_check：看 X 凭证和本月发帖数",
    promptGuidelines: ["用户问「X 那边能发了吗」「这个月发了多少」时用 x_check，不要猜。"],
    parameters: Type.Object({}),
    execute: guarded(async (_p: any, _ctx: any) => {
      const c = await context();
      const limit = c.cred.monthlyLimit ?? 500;
      const used = countPosted(expand(c.cred.recordDir) || defaultRecordDir(DATA));
      const head = [
        canPost(c.keys) ? "发帖凭证：齐了（OAuth 1.0a 四件套）" : `发帖凭证：缺\n\n${HELP_NO_CONFIG}`,
        `账号：${c.cred.handle ? `@${c.cred.handle.replace(/^@/, "")}` : "没写 handle（链接会用 i/web 形式）"}`,
        `本月已发：${used} 条 / 上限 ${limit} 条（按 ${expand(c.cred.recordDir) || defaultRecordDir(DATA)} 里的记录数）`,
      ].join("\n");
      if (!canRead(c.keys)) return text(head);
      try {
        const me = await api(c, "GET", "/2/users/me");
        const u = me?.data;
        return text(`${head}\n凭证自检：有效，当前账号 @${u?.username ?? "?"}（${u?.name ?? ""}，id ${u?.id ?? "?"}）`);
      } catch (e: any) {
        return text(`${head}\n凭证自检：没通过 —— ${e.message}`, true);
      }
    }),
  });

  tools.push({
    name: "x_delete",
    label: "删推",
    description: "删掉自己发的一条推文（发错了用）。id 填推文 id；发帖记录里那条会标「已删」。",
    promptSnippet: "x_delete：删一条自己发的推文",
    parameters: Type.Object({ id: Type.String({ description: "推文 id" }) }),
    execute: guarded(async (p, _ctx) => {
      const c = await context();
      if (!canPost(c.keys)) return text(`删不了：${HELP_NO_CONFIG}`, true);
      await api(c, "DELETE", `/2/tweets/${encodeURIComponent(p.id)}`);
      const dir = expand(c.cred.recordDir) || defaultRecordDir(DATA);
      const prefix = today().slice(0, 7);
      if (existsSync(dir))
        for (const f of readdirSync(dir)) {
          if (!f.startsWith(prefix)) continue;
          const file = join(dir, f);
          const body = readFileSync(file, "utf8");
          if (!body.includes(`id ${p.id}`)) continue;
          writeFileSync(file, body.split("\n").map((l) => (l.includes(`id ${p.id}`) ? `${l} · 已删` : l)).join("\n"));
        }
      return text(`已删 ${p.id}。`);
    }),
  });
  return tools;
}
