// 奇奇看信：收发室收到的每条新消息，分两步看，谁都不读全量：
//   1. 分给哪个宝：先用程序预筛（各宝关注清单里写了关键词、发件人的条目，命中就直接定），
//      没命中再让便宜模型只看每个宝的一行简介来选（和奇奇的分层路由一样）；
//   2. 那个宝只拿自己的关注清单判断：要不要马上提醒你、要不要交给它去办、
//      和清单里哪件事对上了（新冒出来的记一条，解决了划掉，连着任务对话的把消息交回那段对话）。
// 每个宝一份清单：agents/<宝>/关注清单.md，你也可以自己改。带关键词的条目只有消息命中时才拿给模型看，清单再长也不撑爆上下文。
// 对方标的重要程度只当参考；规则命中的（重要规则.md）在这之前已经直接提醒过了。
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { baoDir } from "./bao.js";
import type { InboxItem } from "./postroom.js";

export const WATCH_FILE = "关注清单.md";
const MAX_ITEMS = 40; // 交给模型的条目最多这么多（没写关键词的取最近的）

const head = (bao: string) => `# ${bao}的关注清单

${bao}记着你在意、还没了结的事。收到相关的新消息时会对上前情：新冒出来的值得盯的事记一条，解决了就划掉并告诉你。
你也可以自己加、自己划（把 [ ] 改成 [x]）。条目末尾写〔关键词：a、b〕或〔来自：xxx〕，只有命中的消息才会拿它来对，清单再长也不怕。

`;

export interface WatchItem {
  line: number; // 在文件里第几行
  text: string;
  keys: string[]; // 关键词（含“来自”的发件人），空 = 每次都拿来对
  link?: string; // 连着的对话（任务的 session），写成 [接着办](kiki:宝/对话)：有新消息就交回那里
  task?: string; // 连着的任务卡，写成〔任务：id〕：有新消息就交回那个任务接着办
}

/** 还没了结的那些（- [ ] 开头的行）。 */
export function openItems(md: string): WatchItem[] {
  const out: WatchItem[] = [];
  md.split("\n").forEach((l, line) => {
    const m = l.match(/^\s*[-*]\s*\[ \]\s*(.+?)\s*$/);
    if (!m) return;
    const link = m[1].match(/\]\(kiki:([^)]+)\)/)?.[1];
    const task = m[1].match(/〔任务[:：]([^〕]+)〕/)?.[1]?.trim();
    const keys = [...m[1].matchAll(/〔(?:关键词|来自)[:：]([^〕]+)〕/g)].flatMap((k) => k[1].split(/[、,，\s]+/)).map((k) => k.trim()).filter(Boolean);
    const text = m[1]
      .replace(/\s*\[[^\]]*\]\(kiki:[^)]+\)/g, "")
      .replace(/\s*〔[^〕]*〕/g, "")
      .trim();
    out.push({ line, text, keys, link, task });
  });
  return out;
}

/** 这条和消息有关吗：带关键词的要命中才算；没写关键词的都算（交给模型判断）。 */
export const hits = (w: WatchItem, hay: string) => w.keys.some((k) => hay.toLowerCase().includes(k.toLowerCase()));

export interface Verdict {
  important: boolean; // 要不要马上提醒你
  why?: string; // 一句话：为什么要你看 / 这条说的是什么
  route: boolean; // 要不要交给宝去办
  add?: string; // 关注清单新记一条
  keys?: string[]; // 新记那条的关键词
  done?: number[]; // 划掉关注清单里的第几条（从 1 数）
  doneWhy?: string; // 为什么算解决了
  related?: number[]; // 有关、但还没了结的第几条（连着对话的，会把消息交回那段对话）
}

export const PICK_SYSTEM = `你替用户分拣收件箱：下面有几个助理（叫“宝”），每个一行写着负责什么。看新消息属于哪个宝的领域，只输出一行 JSON：{"bao":"宝名"}；都不相关就 {"bao":null}。不要别的字。`;

export const TRIAGE_SYSTEM = `你是用户的助理，替用户看收件箱里的一条新消息，只输出一行 JSON，不要别的字。
字段：
- important：这条要不要马上提醒用户。账户异常/被盗/登录提醒、扣款或付款失败、账单逾期、服务挂了、截止期限、关注清单里的事有了要用户动手的进展，算 true；广告、例行通知、日报、正常完成的事，算 false。拿不准时偏向 false，别打扰用户。
- why：一句话（30 字内），告诉用户这条说了什么、为什么值得看。
- route：要不要交给你去处理或跟进（需要查、需要动手、需要回复的才 true；只是知会一下的 false）。
- add：如果冒出一件用户应该持续盯着、还没了结的事，用一句话写下来（比如“币安账户异常，待确认是否被盗”）；没有就不写。清单里已经有的不要重复加。
- keys：给 add 那条配 2 到 4 个关键词（发件方、产品名、单号等），以后靠它们认出相关消息。
- done：这条消息说明关注清单里哪几件事已经解决了，写编号数组；没有就不写。
- doneWhy：解决的原因，一句话。
- related：和清单里哪几件事有关（有新进展、要用户做下一步，但还没了结），写编号数组；没有就不写。
发送方自己标的“重要”只作参考。`;

export function triageInput(it: Pick<InboxItem, "from" | "title" | "text" | "attention">, watch: WatchItem[], now = new Date()): string {
  const list = watch.length ? watch.map((w, i) => `${i + 1}. ${w.text}`).join("\n") : "（空）";
  return `现在：${now.toLocaleString("zh-CN", { hour12: false })}
关注清单（还没了结的）：
${list}

${messageText(it)}`;
}

function messageText(it: Pick<InboxItem, "from" | "title" | "text" | "attention">) {
  const body = it.text.length > 1500 ? `${it.text.slice(0, 1500)}…` : it.text;
  return `新消息
来源：${it.from}${it.attention ? "（发送方标了要看）" : ""}
标题：${it.title ?? "（无）"}
正文：
${body}`;
}

function json(raw: string): any {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[0]);
  } catch {
    return undefined;
  }
}
const ints = (v: unknown) => (Array.isArray(v) ? v.filter((n) => Number.isInteger(n)) : undefined);
const s80 = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);

export function parseVerdict(raw: string): Verdict | undefined {
  const j = json(raw);
  if (!j) return undefined;
  return {
    important: j.important === true,
    why: s80(j.why),
    route: j.route === true,
    add: s80(j.add),
    keys: Array.isArray(j.keys) ? j.keys.filter((k: unknown) => typeof k === "string" && k.trim()).slice(0, 4) : undefined,
    done: ints(j.done),
    doneWhy: s80(j.doneWhy),
    related: ints(j.related),
  };
}

/** 一个宝的关注清单：读、加一条、划掉几条。 */
export class Watchlist {
  readonly file: string;
  constructor(
    dataDir: string,
    readonly bao: string,
  ) {
    this.file = join(baoDir(dataDir, bao), WATCH_FILE);
  }
  read(): string {
    return existsSync(this.file) ? readFileSync(this.file, "utf8") : head(this.bao);
  }
  open(): WatchItem[] {
    return openItems(this.read());
  }

  /** 记一条要盯的事。keys 是认出相关消息用的关键词或发件人；session 写“宝/对话名”时，以后有新消息会交回那段对话（任务做完留后续用）。 */
  add(text: string, opts: { from?: string; keys?: string[]; session?: string; task?: string } = {}, now = new Date()) {
    const t = text.replace(/\s*\n\s*/g, " ").trim();
    if (!t || this.open().some((w) => w.text.startsWith(t))) return;
    const lines = this.read().split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const day = `${now.getMonth() + 1}/${now.getDate()}`;
    const keys = opts.keys?.length ? `〔关键词：${opts.keys.join("、")}〕` : "";
    const task = opts.task ? `〔任务：${opts.task}〕` : "";
    lines.push(`- [ ] ${t}（${day} 起${opts.from ? ` · ${opts.from}` : ""}）${keys}${task}${opts.session ? ` [接着办](kiki:${opts.session})` : ""}`, "");
    this.write(lines);
  }

  /** 划掉连着这个任务的条目（任务取消了、或者不用再盯了）。返回划掉了几条。 */
  removeByTask(taskId: string, why = "不用再盯了", now = new Date()): number {
    const items = this.open().filter((w) => w.task === taskId);
    if (!items.length) return 0;
    const lines = this.read().split("\n");
    for (const w of items) lines[w.line] = lines[w.line].replace("[ ]", "[x]") + `（${now.getMonth() + 1}/${now.getDate()} ${why}）`;
    this.write(lines);
    return items.length;
  }

  private write(lines: string[]) {
    writeFileSync(`${this.file}.tmp`, lines.join("\n"));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** 按判断结果改清单（编号对应 shown，也就是交给模型看的那几条），返回划掉的那几条的原文。 */
  apply(v: Verdict, from: string, shown: WatchItem[], now = new Date()): string[] {
    const crossed: string[] = [];
    if (v.done?.length) {
      const day = `${now.getMonth() + 1}/${now.getDate()}`;
      const lines = this.read().split("\n");
      for (const n of v.done) {
        const w = shown[n - 1];
        if (!w || !/\[ \]/.test(lines[w.line] ?? "")) continue;
        lines[w.line] = lines[w.line].replace("[ ]", "[x]") + `（${day} 解决${v.doneWhy ? `：${v.doneWhy}` : ""}）`;
        crossed.push(w.text);
      }
      this.write(lines);
    }
    if (v.add) this.add(v.add, { from, keys: v.keys }, now);
    return crossed;
  }
}

export interface TriageResult extends Verdict {
  bao?: string; // 分给了哪个宝
  crossed: string[];
  follow: { text: string; link?: string; task?: string }[];
}

/** 给任务看板用：任务要等后续时记进它所属宝的清单。match 是“怎么认出相关消息”，短的词当关键词用。 */
export function watchForTask(dataDir: string, w: { taskId: string; agent: string; about: string; match?: string; session?: string }) {
  const parts = (w.match ?? "").split(/[、,，;；\s]+/).map((k) => k.trim()).filter(Boolean);
  const keys = parts.length && parts.every((k) => k.length <= 20) ? parts.slice(0, 6) : [];
  const text = keys.length || !w.match ? w.about : `${w.about}（认法：${w.match}）`;
  new Watchlist(dataDir, w.agent).add(text, { from: "任务", keys, session: w.session, task: w.taskId });
}

/** 任务取消或不用再盯：在所有宝的清单里划掉连着它的条目。 */
export function unwatchTask(dataDir: string, baos: string[], taskId: string) {
  for (const b of baos) new Watchlist(dataDir, b).removeByTask(taskId);
}

/** 收发室用的“看信”函数。模型出错返回 undefined，收发室照老办法交给奇奇。 */
export function makeTriage(opts: {
  dataDir: string;
  listBaos: () => string[];
  describe: (bao: string) => string;
  complete: (system: string, user: string) => Promise<string>;
}) {
  return async (it: InboxItem): Promise<TriageResult | undefined> => {
    const hay = `${it.from}\n${it.title ?? ""}\n${it.text}`;
    const baos = opts.listBaos();
    try {
      // 1. 分给哪个宝：对方指定的 > 清单关键词命中最多的 > 模型看各宝一行简介
      let bao = it.bao && baos.includes(it.bao) ? it.bao : undefined;
      if (!bao) {
        const score = baos.map((b) => ({ b, n: new Watchlist(opts.dataDir, b).open().filter((w) => hits(w, hay)).length })).sort((x, y) => y.n - x.n);
        if (score[0]?.n) bao = score[0].b;
      }
      if (!bao && baos.length) {
        const list = baos.map((b) => `- ${b}：${opts.describe(b) || "（没写）"}`).join("\n");
        const j = json(await opts.complete(PICK_SYSTEM, `宝：\n${list}\n\n${messageText(it)}`));
        if (typeof j?.bao === "string" && baos.includes(j.bao)) bao = j.bao;
      }
      // 2. 那个宝只拿自己清单里相关的条目来判断
      const wl = bao ? new Watchlist(opts.dataDir, bao) : undefined;
      const all = wl?.open() ?? [];
      const shown = [...all.filter((w) => hits(w, hay)), ...all.filter((w) => !w.keys.length).slice(-MAX_ITEMS)].slice(0, MAX_ITEMS);
      const v = parseVerdict(await opts.complete(TRIAGE_SYSTEM, triageInput(it, shown)));
      if (!v) return undefined;
      const crossed = wl ? wl.apply(v, it.from, shown) : [];
      const follow = (v.related ?? [])
        .map((n) => shown[n - 1])
        .filter((w) => !!w && (!!w.link || !!w.task))
        .map((w) => ({ text: w.text, link: w.link, task: w.task }));
      return { ...v, bao, crossed, follow };
    } catch (e) {
      console.warn(`[triage] 看信失败，照常交给奇奇：${(e as Error).message}`);
      return undefined;
    }
  };
}
