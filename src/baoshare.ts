// 宝的导出和导入：把一个宝打成一个 .bao 文件发给别人，或者从文件 / GitHub 链接装一个别人的宝。
//
// .bao 文件就是一个 JSON：{ kiki: "bao", format: 1, name, look: {emoji}, files: { "AGENTS.md": "…", "skills/x/SKILL.md": "…" } }
// 只带“配方”：说明文件（AGENTS.md 和宝目录下其他自己写的 .md）和技能（skills/ 下，Claude / Agent Skills 的格式）。
// 不带：对话记录（sessions/）、笔记（notes/）、工作（work/）、关注清单、任务、密钥；看着像密钥的文件也不带。
//
// 导入分两步：先「看一眼」（preview）列出它会做什么——用哪些技能、会跑脚本吗、会联系谁、有没有可疑的话，
// 你看过点「装上」才真的写进 agents/<名字>/。这是导入时唯一的一次提示，装好以后照全自动规则跑，不再问。
// 兼容别人的格式：只有 CLAUDE.md 也行（当成 AGENTS.md）；只有一个 SKILL.md 的文件夹（Claude skill）会包成一个带这个技能的宝；
// .claude/skills、.agents/skills、.pi/skills 下的技能都挪到 skills/ 下。
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, relative, sep } from "node:path";
import { BAO_FILE, SKILLS_DIR, baoDir, readDuty } from "./bao.js";
import { baoEmoji, baoLook, validName } from "./settings.js";
import { VERSION } from "./update.js";

export const BAO_EXT = ".bao";

const MAX_FILES = 200;
const MAX_FILE = 256 * 1024; // 单个文件
const MAX_TOTAL = 2 * 1024 * 1024; // 整个宝
/** 宝目录下这些不导出：要么是你的私事，要么是程序自己管的 */
const PRIVATE_MD = new Set(["关注清单.md"]);

export interface BaoBundle {
  kiki: "bao";
  format: 1;
  name: string;
  exportedAt?: string;
  kikiVersion?: string;
  look?: { emoji?: string };
  files: Record<string, string>;
}

// ---------- 密钥和可疑内容 ----------

const SECRET_RES: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, "像 API 密钥（sk-…）"],
  [/\b(ghp|gho|ghu|ghs)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/, "像 GitHub 令牌"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "像 Slack 令牌"],
  [/\bAKIA[0-9A-Z]{16}\b/, "像 AWS 密钥"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "像 Google 密钥"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "私钥"],
  [/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/, "像 Telegram 机器人令牌"],
  [/(api[_-]?key|secret|token|password|密码|密钥)\s*[:=：]\s*["']?[A-Za-z0-9_\-+/=.]{16,}/i, "写着密钥 / 密码"],
];

/** 文本里有没有像密钥的东西，有就说是什么 */
export function secretIn(text: string): string | undefined {
  for (const [re, what] of SECRET_RES) if (re.test(text)) return what;
  return undefined;
}

// ---------- 路径 ----------

/** 包里的路径要干净：相对路径、不带 ..、不带隐藏目录、不太长 */
export function safePath(p: string): boolean {
  if (typeof p !== "string" || !p || p.length > 200 || p.includes("\\") || p.includes("\0")) return false;
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  return p.split("/").every((s) => s && s !== "." && s !== ".." && !s.startsWith("."));
}

/** 这个路径能不能进宝：说明 .md（顶层）或者 skills/ 下的文件 */
function allowed(p: string): boolean {
  if (!safePath(p)) return false;
  const parts = p.split("/");
  if (parts.length === 1) return p.toLowerCase().endsWith(".md") && !PRIVATE_MD.has(p);
  return parts[0] === SKILLS_DIR && parts.length >= 3;
}

const isText = (b: Buffer) => !b.includes(0) && Buffer.from(b.toString("utf8"), "utf8").equals(b);

// ---------- 导出 ----------

export interface ExportResult {
  bundle: BaoBundle;
  /** 没带上的：路径 + 原因（对话记录这类整类不带的只说一句） */
  skipped: { path: string; why: string }[];
}

/** 把宝打成一个包。只读文件，不改任何东西。 */
export function exportBao(dataDir: string, name: string): ExportResult {
  const dir = baoDir(dataDir, name);
  if (!existsSync(dir)) throw new Error(`没有宝「${name}」`);
  const files: Record<string, string> = {};
  const skipped: ExportResult["skipped"] = [];
  let total = 0;
  const add = (abs: string, rel: string) => {
    const st = statSync(abs);
    if (st.size > MAX_FILE) return skipped.push({ path: rel, why: "太大了" });
    const buf = readFileSync(abs);
    if (!isText(buf)) return skipped.push({ path: rel, why: "不是文字文件" });
    const text = buf.toString("utf8");
    const s = secretIn(text);
    if (s) return skipped.push({ path: rel, why: `里面有${s}，没带上` });
    if (Object.keys(files).length >= MAX_FILES || total + st.size > MAX_TOTAL) return skipped.push({ path: rel, why: "宝太大了，后面的没带" });
    total += st.size;
    files[rel] = text;
  };
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && allowed(e.name)) add(join(dir, e.name), e.name);
    else if (e.isFile() && PRIVATE_MD.has(e.name)) skipped.push({ path: e.name, why: "关注清单是你的私事，不带" });
  }
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const abs = join(d, e.name);
      const rel = relative(dir, abs).split(sep).join("/");
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && allowed(rel)) add(abs, rel);
    }
  };
  if (existsSync(join(dir, SKILLS_DIR))) walk(join(dir, SKILLS_DIR));
  const PRIVATE_DIRS: Record<string, string> = { sessions: "对话记录不带", notes: "笔记是你的私事，不带", tasks: "任务不带", work: "你在做的工作不带" };
  for (const [d, why] of Object.entries(PRIVATE_DIRS)) if (existsSync(join(dir, d))) skipped.push({ path: `${d}/`, why });
  if (!files[BAO_FILE]) throw new Error(`宝「${name}」没有 ${BAO_FILE}，没法导出`);
  const emoji = baoLook(dataDir, name).emoji;
  return {
    bundle: { kiki: "bao", format: 1, name, exportedAt: new Date().toISOString(), kikiVersion: VERSION, ...(emoji ? { look: { emoji } } : {}), files },
    skipped,
  };
}

// ---------- 读包（文件或文件夹） ----------

/** 文件夹形式（GitHub 上的）整理成包：兼容 CLAUDE.md、单个 Claude skill、.claude/.agents/.pi 下的 skills */
export function fromFolder(raw: Record<string, string>, fallbackName: string): BaoBundle {
  const files: Record<string, string> = {};
  const put = (p: string, t: string) => {
    if (!(p in files)) files[p] = t;
  };
  // 整个文件夹就是一个技能
  if (typeof raw["SKILL.md"] === "string") {
    const fm = frontmatter(raw["SKILL.md"]);
    const skill = slug(fm.name || fallbackName);
    for (const [p, t] of Object.entries(raw)) put(`${SKILLS_DIR}/${skill}/${p}`, t);
    const name = cleanName(fm.name || fallbackName);
    put(BAO_FILE, `# ${name}\n\n## 我负责什么\n${(fm.description || `用「${skill}」技能做事`).replace(/\s+/g, " ").trim()}\n\n## 我怎么干活\n- 先看「${skill}」技能怎么说，照着做。\n- 回答简短，结论在前。\n`);
    return { kiki: "bao", format: 1, name, files };
  }
  for (const [p, t] of Object.entries(raw)) {
    const m = p.match(/^\.(claude|agents|pi)\/skills\/(.+)$/);
    if (m) put(`${SKILLS_DIR}/${m[2]}`, t);
    else if (p === "CLAUDE.md" && raw[BAO_FILE] === undefined) put(BAO_FILE, t);
    else put(p, t);
  }
  return { kiki: "bao", format: 1, name: cleanName(fallbackName), files };
}

/** 读 .bao 文件的文字，不对就报错 */
export function parseBundle(text: string): BaoBundle {
  let b: any;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("这不是 .bao 文件（读不出来）");
  }
  if (!b || b.kiki !== "bao" || typeof b.files !== "object" || !b.files) throw new Error("这不是 .bao 文件");
  if (b.format !== 1) throw new Error("这个 .bao 文件是新版 Kiki 导出的，先把 Kiki 升级一下");
  for (const v of Object.values(b.files)) if (typeof v !== "string") throw new Error(".bao 文件里有坏掉的内容");
  return { kiki: "bao", format: 1, name: cleanName(String(b.name ?? "")), look: { emoji: baoEmoji(b.look?.emoji) || undefined }, files: b.files };
}

const cleanName = (s: string) => s.replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 12) || "新宝";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9\p{L}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "skill";

/** 读 SKILL.md 开头的 YAML（只认一层的 key: value，够用） */
export function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  let key = "";
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].replace(/^["']|["']$/g, "").replace(/^[>|]-?$/, "");
    } else if (key && /^\s+\S/.test(line)) out[key] = `${out[key]} ${line.trim()}`.trim();
  }
  return out;
}

// ---------- 看一眼：它会做什么 ----------

export interface Preview {
  name: string; // 建议用的名字（重名会自动加数字）
  originalName: string;
  emoji?: string;
  duty: string;
  files: { path: string; size: number }[];
  skills: { name: string; description: string; files: number; scripts: string[]; tools?: string }[];
  scripts: string[]; // 会被执行的脚本文件
  contacts: { domains: string[]; emails: string[]; channels: string[] };
  abilities: string[]; // 会做的事：联网、发消息、付钱、删文件……
  warnings: { level: "red" | "yellow"; text: string }[];
  dropped: { path: string; why: string }[]; // 包里有、但不会装的
}

const SCRIPT_EXT = /\.(sh|bash|zsh|py|js|mjs|cjs|ts|rb|pl|php|ps1|applescript|scpt|command)$/i;

const ABILITY_RES: [RegExp, string][] = [
  [/\b(curl|wget|fetch\(|axios|requests\.(get|post)|https?:\/\/)/i, "联网"],
  [/(发消息|发邮件|发送|回复邮件|send[_ ]?(message|email|mail)|smtp|telegram|微信|whatsapp|slack|discord|twitter|推特|\bx\.com)/i, "替你发消息"],
  [/(付款|支付|转账|下单|购买|充值|\bpay(ment)?\b|stripe|checkout|purchase|wallet|钱包)/i, "花钱 / 付款"],
  [/(\brm\s+-[a-z]*r|删除|delete|unlink|drop\s+table|trash)/i, "删东西"],
  [/(~\/|\/Users\/|\$HOME|钥匙串|keychain|\.ssh|\.env\b)/i, "读写你电脑上宝目录以外的文件"],
  [/(osascript|applescript|launchctl|crontab|sudo\b)/i, "操作系统设置 / 开机任务"],
  [/(日历|calendar|提醒事项|reminders|通讯录|contacts)/i, "读写日历 / 通讯录"],
];

const RED_RES: [RegExp, string][] = [
  [/(ignore (all |any )?(previous|prior|above) (instructions|prompts)|忽略(之前|前面|以上)(的)?(所有)?(指令|规则|说明))/i, "里面有“忽略之前的指令”这类话，常见于恶意技能"],
  [/(不要|别|勿)(告诉|通知|让)(用户|你的主人|主人)|without (telling|notifying|asking) the user|do not (tell|inform|notify) the user/i, "里面让 Kiki 瞒着你做事"],
  [/(curl|wget)[^\n|]*\|\s*(ba|z)?sh\b/i, "会从网上下载脚本直接运行"],
  [/base64\s+(-d|--decode)|eval\s*\(\s*(atob|Buffer\.from)/i, "有解码后执行的代码，看不出它真正要干嘛"],
  [/(上传|发送|发给|upload|send|post|curl)[^\n]{0,60}(\.ssh\/|\.env\b|auth\.json|钥匙串|keychain|id_rsa)/i, "会把你电脑上的密钥文件发出去"],
];

const IGNORED_DOMAINS = /(^|\.)(example\.(com|org)|localhost|w3\.org|schema\.org|agentskills\.io)$/i;

/** 列出这个包装上以后会做什么。只看文字，不执行任何东西。 */
export function previewBundle(b: BaoBundle, existing: string[]): Preview {
  const files: Preview["files"] = [];
  const dropped: Preview["dropped"] = [];
  const keep: Record<string, string> = {};
  let total = 0;
  for (const [p, t] of Object.entries(b.files)) {
    const size = Buffer.byteLength(t, "utf8");
    if (!allowed(p)) {
      dropped.push({ path: p, why: safePath(p) ? "不是说明或技能文件" : "路径不安全" });
      continue;
    }
    if (size > MAX_FILE) dropped.push({ path: p, why: "太大了" });
    else if (secretIn(t)) dropped.push({ path: p, why: `里面有${secretIn(t)}` });
    else if (files.length >= MAX_FILES || total + size > MAX_TOTAL) dropped.push({ path: p, why: "宝太大了，后面的不装" });
    else {
      keep[p] = t;
      files.push({ path: p, size });
      total += size;
    }
  }
  const all = Object.entries(keep);
  const text = all.map(([, t]) => t).join("\n");
  const scripts = all.map(([p]) => p).filter((p) => SCRIPT_EXT.test(p));

  // 技能
  const skills: Preview["skills"] = [];
  for (const [p, t] of all) {
    const m = p.match(new RegExp(`^${SKILLS_DIR}/(.+)/SKILL\\.md$`));
    if (!m) continue;
    const fm = frontmatter(t);
    const base = `${SKILLS_DIR}/${m[1]}/`;
    const own = all.filter(([q]) => q.startsWith(base));
    skills.push({
      name: fm.name || m[1].split("/").pop()!,
      description: (fm.description || "").slice(0, 300),
      files: own.length,
      scripts: own.map(([q]) => q.slice(base.length)).filter((q) => SCRIPT_EXT.test(q)),
      ...(fm["allowed-tools"] ? { tools: fm["allowed-tools"] } : {}),
    });
  }

  // 会联系谁
  const domains = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const d = m[1].toLowerCase().replace(/^www\./, "");
    if (!IGNORED_DOMAINS.test(d)) domains.add(d);
  }
  const emails = new Set<string>();
  for (const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) if (!IGNORED_DOMAINS.test(m[0].split("@")[1])) emails.add(m[0].toLowerCase());
  const channels = new Set<string>();
  for (const [re, label] of [
    [/微信|wechat/i, "微信"],
    [/telegram/i, "Telegram"],
    [/slack/i, "Slack"],
    [/discord/i, "Discord"],
    [/whatsapp/i, "WhatsApp"],
    [/邮件|e-?mail|smtp|gmail/i, "邮件"],
    [/twitter|推特|\bx\.com/i, "X / 推特"],
    [/短信|\bsms\b|imessage/i, "短信 / iMessage"],
  ] as [RegExp, string][])
    if (re.test(text)) channels.add(label);

  const abilities = ABILITY_RES.filter(([re]) => re.test(text)).map(([, a]) => a);
  if (scripts.length) abilities.unshift("运行脚本");

  const warnings: Preview["warnings"] = [];
  for (const [re, w] of RED_RES) if (re.test(text)) warnings.push({ level: "red", text: w });
  if (scripts.length) warnings.push({ level: "yellow", text: `带了 ${scripts.length} 个脚本，Kiki 用到这些技能时会在你的电脑上运行它们` });
  if (abilities.includes("花钱 / 付款")) warnings.push({ level: "yellow", text: "提到了付款，装上后按你的预算设置自动付" });
  if (!keep[BAO_FILE]) warnings.push({ level: "yellow", text: `没有 ${BAO_FILE}，会给它写一份最简单的` });
  if (dropped.length) warnings.push({ level: "yellow", text: `有 ${dropped.length} 个文件不会装（见下面）` });

  const originalName = b.name || "新宝";
  let name = originalName;
  for (let i = 2; existing.includes(name); i++) name = `${originalName.slice(0, 10)}${i}`;
  return {
    name,
    originalName,
    emoji: b.look?.emoji,
    duty: readDuty(keep[BAO_FILE] ?? ""),
    files,
    skills,
    scripts,
    contacts: { domains: [...domains].sort().slice(0, 30), emails: [...emails].sort().slice(0, 30), channels: [...channels] },
    abilities,
    warnings,
    dropped,
  };
}

// ---------- 装上 ----------

/** 把包装成一个新宝。先写到临时目录，全写好再改名过去，不会装一半。返回装上的名字。 */
export function installBundle(dataDir: string, b: BaoBundle, name: string): string {
  if (!validName(name)) throw new Error("名字只能用字母、数字、汉字、- 和 _");
  const dir = baoDir(dataDir, name);
  if (existsSync(dir)) throw new Error(`已经有宝「${name}」了，换个名字`);
  const p = previewBundle(b, []);
  const tmp = join(dataDir, `.bao-importing-${process.pid}-${Date.now()}`); // 放在 agents/ 外面，装好前不会被当成一个宝
  mkdirSync(tmp, { recursive: true });
  try {
    for (const f of p.files) {
      const abs = join(tmp, ...f.path.split("/"));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, b.files[f.path]);
    }
    if (!existsSync(join(tmp, BAO_FILE))) writeFileSync(join(tmp, BAO_FILE), `# ${name}\n\n## 我负责什么\n${name}相关的事\n`);
    const emoji = baoEmoji(b.look?.emoji);
    writeFileSync(join(tmp, "bao.json"), JSON.stringify({ ...(emoji ? { emoji } : {}), importedFrom: b.name, importedAt: new Date().toISOString() }) + "\n");
    mkdirSync(dirname(dir), { recursive: true });
    renameSync(tmp, dir);
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return name;
}

// ---------- 从 GitHub 拿 ----------

/** GitHub 链接 → 包。支持：仓库 / 仓库里的文件夹（tree 链接）/ 一个 .bao 文件（blob 或 raw 链接）。 */
export async function fetchGithub(link: string, fetcher: typeof fetch = fetch): Promise<BaoBundle> {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    throw new Error("链接不对");
  }
  const get = async (url: string, json = false) => {
    const r = await fetcher(url, { headers: { "user-agent": "Kiki", ...(json ? { accept: "application/vnd.github+json" } : {}) }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(r.status === 404 ? "GitHub 上找不到（仓库是私有的，或者链接打错了）" : r.status === 403 ? "GitHub 暂时不让拿了（访问太频繁），过一会儿再试" : `GitHub 返回 ${r.status}`);
    return json ? r.json() : r.text();
  };
  if (u.hostname === "raw.githubusercontent.com") {
    if (!u.pathname.endsWith(BAO_EXT)) throw new Error("raw 链接只认 .bao 文件；文件夹请贴 github.com 上的链接");
    return parseBundle((await get(u.href)) as string);
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") throw new Error("只支持 github.com 的链接");
  const [owner, repo, kind, ref, ...rest] = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "").split("/").map((s) => decodeURIComponent(s));
  if (!owner || !repo) throw new Error("链接里要有仓库，比如 https://github.com/某人/某仓库");
  const enc = (s: string) => s.split("/").map(encodeURIComponent).join("/");
  if (kind === "blob") {
    if (!rest.join("/").endsWith(BAO_EXT)) throw new Error("这个链接指向的是单个文件，只认 .bao 文件；要导入文件夹请贴文件夹的链接");
    return parseBundle((await get(`https://raw.githubusercontent.com/${owner}/${repo}/${enc(ref)}/${enc(rest.join("/"))}`)) as string);
  }
  const branch = kind === "tree" && ref ? ref : ((await get(`https://api.github.com/repos/${owner}/${repo}`, true)) as any).default_branch;
  const base = kind === "tree" ? rest.join("/") : "";
  const tree = (await get(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, true)) as any;
  const prefix = base ? `${base}/` : "";
  const blobs: { path: string; size: number }[] = (tree.tree ?? []).filter((x: any) => x.type === "blob" && x.path.startsWith(prefix)).map((x: any) => ({ path: x.path.slice(prefix.length), size: x.size ?? 0 }));
  // 文件夹里只有一个 .bao 文件：就用它
  const baos = blobs.filter((x) => x.path.endsWith(BAO_EXT) && !x.path.includes("/"));
  if (baos.length === 1 && !blobs.some((x) => x.path === BAO_FILE || x.path === "SKILL.md"))
    return parseBundle((await get(`https://raw.githubusercontent.com/${owner}/${repo}/${enc(branch)}/${enc(prefix + baos[0].path)}`)) as string);
  // 只拿用得上的：顶层 .md、SKILL.md 同级的东西、skills 目录
  const isSkill = blobs.some((x) => x.path === "SKILL.md");
  const want = blobs.filter((x) => {
    if (x.size > MAX_FILE) return false;
    if (isSkill) return !x.path.split("/").some((s) => s.startsWith("."));
    return (!x.path.includes("/") && /\.md$/i.test(x.path)) || /^(\.(claude|agents|pi)\/)?skills\//.test(x.path);
  });
  if (!want.length) throw new Error(`这个文件夹里没有 ${BAO_FILE}、CLAUDE.md、SKILL.md 或 .bao 文件，不像一个宝`);
  if (want.length > MAX_FILES) throw new Error(`文件太多了（${want.length} 个），一个宝最多 ${MAX_FILES} 个`);
  const raw: Record<string, string> = {};
  let total = 0;
  for (const f of want) {
    total += f.size;
    if (total > MAX_TOTAL) throw new Error("这个宝太大了（超过 2MB）");
    raw[f.path] = (await get(`https://raw.githubusercontent.com/${owner}/${repo}/${enc(branch)}/${enc(prefix + f.path)}`)) as string;
  }
  return fromFolder(raw, base ? base.split("/").pop()! : repo);
}

// ---------- 接口：/api/bao/export、/api/bao/import ----------

export function baoShareApi(opts: { dataDir: string; onInstalled?: (name: string) => void; fetcher?: typeof fetch }) {
  const agentsDir = join(opts.dataDir, "agents");
  const list = () => (existsSync(agentsDir) ? readdirSync(agentsDir).filter((n) => !n.startsWith(".") && statSync(join(agentsDir, n)).isDirectory()) : []);
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
    const json = (data: unknown, code = 200) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };
    // GET /api/bao/export?name=工作 → { file: "工作.bao", text, skipped, count }
    if (url.pathname === "/api/bao/export" && req.method === "GET") {
      const name = url.searchParams.get("name");
      if (!validName(name) || !list().includes(name)) return json({ error: "没有这个宝" }, 404);
      try {
        const { bundle, skipped } = exportBao(opts.dataDir, name);
        return json({ file: `${name}${BAO_EXT}`, text: JSON.stringify(bundle, null, 2) + "\n", count: Object.keys(bundle.files).length, skipped });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    // POST /api/bao/import { text | url, install?: false|true, name? }
    //   不带 install：只看一眼，返回 preview；带 install:true 和 name：装上
    if (url.pathname === "/api/bao/import" && req.method === "POST") {
      let body: any;
      try {
        const chunks: Buffer[] = [];
        let n = 0;
        for await (const c of req) {
          chunks.push(c as Buffer);
          n += (c as Buffer).length;
          if (n > MAX_TOTAL * 3) return json({ error: "文件太大了" }, 413);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); // 先拼起来再解码，免得汉字被切成两半
      } catch {
        return json({ error: "读不懂请求" }, 400);
      }
      let bundle: BaoBundle;
      try {
        if (typeof body.text === "string") bundle = parseBundle(body.text);
        else if (typeof body.url === "string") bundle = await fetchGithub(body.url, opts.fetcher);
        else return json({ error: "要给一个 .bao 文件或者 GitHub 链接" }, 400);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      // 看一眼时把整理好的包原样交回去，「装上」时网页带着它回来：装的就是你看过的那份，
      // 不会在看完之后再去 GitHub 拿一次（中间被改过就装成别的了）
      if (!body.install) return json({ preview: previewBundle(bundle, list()), text: JSON.stringify(bundle) });
      if (typeof body.text !== "string") return json({ error: "装之前要先看一眼" }, 400);
      try {
        const name = installBundle(opts.dataDir, bundle, String(body.name ?? "").trim());
        opts.onInstalled?.(name);
        return json({ ok: true, name });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    return json({ error: "not found" }, 404);
  };
}
