// 收发室的“定时检查”来源：不等别人推，自己定时去看一个地方，有新内容就当成一条新消息收进来。
// 能看的：网页、HTTP 接口（JSON / 文本）、RSS / Atom、本地文件、本地文件夹。
// 第一次看只记下现状、不报（免得一接上就刷屏），之后只报新出现的部分。
// 上次看到什么记在 postroom/state/<名字>.json。
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AdapterContext, AgentConfig, AgentStatus, ExternalAgent, Incoming } from "./postroom.js";
import { expand, loadState, saveState } from "./postroom.js";

interface Seen {
  checked?: string; // 上次看的时间
  hash?: string; // 内容的指纹
  lines?: string[]; // 上次的内容（按行），用来挑出新出现的行
  ids?: string[]; // RSS 条目 / 文件夹里的文件，见过的
  error?: string;
}

const KEEP_LINES = 2000;
const KEEP_IDS = 500;

export class WatchAgent implements ExternalAgent {
  readonly kind = "watch";
  private seen: Seen;

  constructor(
    readonly name: string,
    private cfg: AgentConfig,
    private ctx: AdapterContext,
    private http: typeof fetch = fetch,
  ) {
    if (!cfg.url && !cfg.path) throw new Error("定时检查要写 url（网页 / RSS / 接口）或 path（本地文件或文件夹）");
    this.seen = loadState<Seen>(ctx.root, name, {});
  }

  async status(): Promise<AgentStatus> {
    if (this.seen.error) return { state: "error", note: this.seen.error, updated: this.seen.checked };
    const at = this.seen.checked ? new Date(this.seen.checked).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
    return { state: "idle", note: at ? `上次看 ${at}` : "还没看过", updated: this.seen.checked };
  }

  async dispatch(): Promise<void> {
    throw new Error("定时检查只看不收活");
  }

  async collect(now = Date.now()): Promise<Incoming[]> {
    const every = Number(this.cfg.every ?? 0) * 60_000;
    if (every && this.seen.checked && now - Date.parse(this.seen.checked) < every) return [];
    let found: { title: string; text: string }[] = [];
    try {
      found = this.cfg.url ? await this.checkUrl() : this.checkPath();
      this.seen.error = undefined;
    } catch (e) {
      this.seen.error = (e as Error).message;
    }
    this.seen.checked = new Date(now).toISOString();
    saveState(this.ctx.root, this.name, this.seen);
    // route: false 写在配置里 = 只通知你，不交给奇奇分派
    return found.map((f, i) => ({ id: `${this.name}-${now}-${i}`, title: f.title, text: f.text, route: this.cfg.route === false ? (false as const) : undefined }));
  }

  private async checkUrl() {
    const r = await this.http(this.cfg.url!, { headers: { "user-agent": "Kiki", ...(this.cfg.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = r.headers.get("content-type") ?? "";
    const body = await r.text();
    const feed = parseFeed(body);
    if (feed) return this.newIds(feed.map((e) => ({ id: e.id, title: e.title, text: [e.title, e.link].filter(Boolean).join("\n") })));
    const text = /json/.test(type) ? prettyJson(body) : /html/.test(type) || /^\s*</.test(body) ? htmlText(body) : body;
    return this.newLines(text, this.cfg.url!);
  }

  private checkPath() {
    const p = expand(this.cfg.path!);
    if (!existsSync(p)) throw new Error(`没有 ${p}`);
    if (statSync(p).isDirectory()) {
      const files = readdirSync(p)
        .filter((f) => !f.startsWith("."))
        .map((f) => ({ f, st: statSync(join(p, f)) }))
        .filter((x) => x.st.isFile());
      return this.newIds(files.map(({ f, st }) => ({ id: `${f}@${Math.floor(st.mtimeMs)}`, title: f, text: `${join(p, f)}\n${preview(join(p, f), st.size)}` })));
    }
    return this.newLines(readFileSync(p, "utf8"), p);
  }

  /** 一条一条的东西（RSS 条目、文件）：没见过的算新的。 */
  private newIds(items: { id: string; title: string; text: string }[]) {
    const first = !this.seen.ids;
    const known = new Set(this.seen.ids ?? []);
    const fresh = items.filter((x) => !known.has(x.id));
    this.seen.ids = [...(this.seen.ids ?? []), ...fresh.map((x) => x.id)].slice(-KEEP_IDS);
    return first ? [] : fresh.map((x) => ({ title: x.title.slice(0, 60) || this.name, text: x.text }));
  }

  /** 一整块内容（网页、接口、文件）：变了就报新出现的那些行。 */
  private newLines(text: string, where: string) {
    const hash = createHash("sha1").update(text).digest("hex");
    const first = !this.seen.hash;
    if (hash === this.seen.hash) return [];
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const old = new Set(this.seen.lines ?? []);
    const added = lines.filter((l) => !old.has(l));
    this.seen.hash = hash;
    this.seen.lines = lines.slice(0, KEEP_LINES);
    if (first) return [];
    const body = added.length ? added.slice(0, 40).join("\n") + (added.length > 40 ? `\n……还有 ${added.length - 40} 行` : "") : "（有删改，没有新增的行）";
    return [{ title: `${this.name} 有更新`, text: `${where}\n\n${body}` }];
  }
}

/** RSS 的 <item> 或 Atom 的 <entry>；不是订阅源返回 undefined。 */
export function parseFeed(xml: string): { id: string; title: string; link: string }[] | undefined {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return undefined;
  const out: { id: string; title: string; link: string }[] = [];
  for (const m of xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)) {
    const block = m[0];
    const tag = (t: string) => decode(block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"))?.[1] ?? "");
    const link = tag("link") || block.match(/<link[^>]*href="([^"]+)"/i)?.[1] || "";
    const title = tag("title");
    out.push({ id: tag("guid") || tag("id") || link || title, title, link });
  }
  return out;
}

function decode(s: string) {
  return s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** 网页只留看得见的文字。 */
export function htmlText(html: string) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, "")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " "),
  )
    .split("\n")
    .map((l) => decode(l))
    .filter(Boolean)
    .join("\n");
}

function prettyJson(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 1);
  } catch {
    return s;
  }
}

function preview(file: string, size: number) {
  if (size > 200_000 || !/\.(md|txt|json|log|csv|ya?ml)$/i.test(file)) return "";
  return readFileSync(file, "utf8").slice(0, 600);
}
