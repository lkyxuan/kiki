// 奇奇看信：收发室收到的每条新消息，先让便宜快速的模型读一遍，判断三件事：
//   1. 值不值得马上提醒你（账户被盗、扣款失败这种）；
//   2. 要不要交给某个宝去办（要动手、要跟进的才交，普通通知不惊动宝）；
//   3. 和“关注清单”里的哪件事有关：新出现的值得盯的事记一条，已经解决的划掉（比如“币安恢复了”）。
// 关注清单是 ~/kiki-data/关注清单.md，你也可以自己改。判断时会带上它，后来的消息才能对上前情。
// 对方标的重要程度只当参考；规则命中的（重要规则.md）在这之前已经直接提醒过了。
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InboxItem } from "./postroom.js";

export const WATCH_FILE = "关注清单.md";

const HEAD = `# 关注清单

奇奇记着你现在在意、还没了结的事。收到相关的新消息时，奇奇会对上前情：新冒出来的值得盯的事记一条，解决了就划掉并告诉你。
你也可以自己加、自己划（把 [ ] 改成 [x]）。

`;

export interface WatchItem {
  line: number; // 在文件里第几行
  text: string;
  link?: string; // 连着的对话（任务卡的 session），写成 [接着办](kiki:宝/对话)：有新消息就交回那里
}

/** 还没了结的那些（- [ ] 开头的行）。 */
export function openItems(md: string): WatchItem[] {
  return md
    .split("\n")
    .map((l, i) => ({ line: i, m: l.match(/^\s*[-*]\s*\[ \]\s*(.+?)\s*$/) }))
    .filter((x) => x.m)
    .map((x) => {
      const link = x.m![1].match(/\]\(kiki:([^)]+)\)/)?.[1];
      return { line: x.line, text: x.m![1].replace(/\s*\[[^\]]*\]\(kiki:[^)]+\)/g, "").trim(), link };
    });
}

export interface Verdict {
  important: boolean; // 要不要马上提醒你
  why?: string; // 一句话：为什么要你看 / 这条说的是什么
  route: boolean; // 要不要交给宝去办
  add?: string; // 关注清单新记一条
  done?: number[]; // 划掉关注清单里的第几条（从 1 数）
  doneWhy?: string; // 为什么算解决了
  related?: number[]; // 有关、但还没了结的第几条（连着对话的，会把消息交回那段对话）
}

export const TRIAGE_SYSTEM = `你是用户的个人助理“奇奇”，替用户看收件箱里的一条新消息，只输出一行 JSON，不要别的字。
字段：
- important：这条要不要马上提醒用户。账户异常/被盗/登录提醒、扣款或付款失败、账单逾期、服务挂了、截止期限、关注清单里的事有了重要进展，算 true；广告、例行通知、日报、正常完成的事，算 false。拿不准时偏向 false，别打扰用户。
- why：一句话（30 字内），告诉用户这条说了什么、为什么值得看。
- route：要不要交给专门的助理去处理或跟进（需要查、需要动手、需要回复的才 true；只是知会一下的 false）。
- add：如果冒出一件用户应该持续盯着、还没了结的事，用一句话写下来（比如“币安账户异常，待确认是否被盗”）；没有就不写。关注清单里已经有的不要重复加。
- done：这条消息说明关注清单里哪几件事已经解决了，写它们的编号数组；没有就不写。
- doneWhy：解决的原因，一句话。
- related：这条消息和关注清单里哪几件事有关（有新进展、要用户做下一步，但还没了结），写编号数组；没有就不写。
发送方自己标的“重要”只作参考。`;

export function triageInput(it: Pick<InboxItem, "from" | "title" | "text" | "attention">, watch: WatchItem[], now = new Date()): string {
  const list = watch.length ? watch.map((w, i) => `${i + 1}. ${w.text}`).join("\n") : "（空）";
  const body = it.text.length > 1500 ? `${it.text.slice(0, 1500)}…` : it.text;
  return `现在：${now.toLocaleString("zh-CN", { hour12: false })}
关注清单（还没了结的）：
${list}

新消息
来源：${it.from}${it.attention ? "（发送方标了要看）" : ""}
标题：${it.title ?? "（无）"}
正文：
${body}`;
}

export function parseVerdict(raw: string): Verdict | undefined {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  try {
    const j = JSON.parse(m[0]);
    return {
      important: j.important === true,
      why: typeof j.why === "string" ? j.why.trim().slice(0, 80) : undefined,
      route: j.route === true,
      add: typeof j.add === "string" && j.add.trim() ? j.add.trim().slice(0, 80) : undefined,
      done: Array.isArray(j.done) ? j.done.filter((n: unknown) => Number.isInteger(n)) : undefined,
      doneWhy: typeof j.doneWhy === "string" ? j.doneWhy.trim().slice(0, 80) : undefined,
      related: Array.isArray(j.related) ? j.related.filter((n: unknown) => Number.isInteger(n)) : undefined,
    };
  } catch {
    return undefined;
  }
}

/** 关注清单文件：读、加一条、划掉几条。 */
export class Watchlist {
  readonly file: string;
  constructor(dataDir: string) {
    this.file = join(dataDir, WATCH_FILE);
  }
  read(): string {
    return existsSync(this.file) ? readFileSync(this.file, "utf8") : HEAD;
  }
  open(): WatchItem[] {
    return openItems(this.read());
  }
  /** 记一条要盯的事。session 写“宝/对话名”时，这件事以后有新消息会交回那段对话（任务做完留个后续用）。 */
  add(text: string, opts: { from?: string; session?: string } = {}, now = new Date()) {
    const t = text.replace(/\s*\n\s*/g, " ").trim();
    if (!t || this.open().some((w) => w.text.startsWith(t))) return;
    const lines = this.read().split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const day = `${now.getMonth() + 1}/${now.getDate()}`;
    lines.push(`- [ ] ${t}（${day} 起${opts.from ? ` · ${opts.from}` : ""}）${opts.session ? ` [接着办](kiki:${opts.session})` : ""}`, "");
    this.write(lines);
  }

  private write(lines: string[]) {
    writeFileSync(`${this.file}.tmp`, lines.join("\n"));
    renameSync(`${this.file}.tmp`, this.file);
  }

  /** 按判断结果改清单，返回划掉的那几条的原文。 */
  apply(v: Verdict, from: string, items: WatchItem[], now = new Date()): string[] {
    if (!v.add && !v.done?.length) return [];
    const day = `${now.getMonth() + 1}/${now.getDate()}`;
    const lines = this.read().split("\n");
    const crossed: string[] = [];
    for (const n of v.done ?? []) {
      const w = items[n - 1];
      if (!w || !/\[ \]/.test(lines[w.line] ?? "")) continue;
      lines[w.line] = lines[w.line].replace("[ ]", "[x]") + `（${day} 解决${v.doneWhy ? `：${v.doneWhy}` : ""}）`;
      crossed.push(w.text);
    }
    this.write(lines);
    if (v.add) this.add(v.add, { from }, now);
    return crossed;
  }
}

/** 收发室用的“看信”函数：读关注清单 → 问模型 → 改清单。模型出错返回 undefined，收发室照老办法交给奇奇。 */
export function makeTriage(dataDir: string, complete: (system: string, user: string) => Promise<string>) {
  const wl = new Watchlist(dataDir);
  return async (it: InboxItem): Promise<(Verdict & { crossed: string[]; follow: { text: string; link: string }[] }) | undefined> => {
    const items = wl.open();
    let v: Verdict | undefined;
    try {
      v = parseVerdict(await complete(TRIAGE_SYSTEM, triageInput(it, items)));
    } catch (e) {
      console.warn(`[triage] 看信失败，照常交给奇奇：${(e as Error).message}`);
      return undefined;
    }
    if (!v) return undefined;
    const crossed = wl.apply(v, it.from, items);
    // 有关、又连着对话的：交回那段对话（带着原来的上下文出下一步）
    const follow = (v.related ?? []).map((n) => items[n - 1]).filter((w): w is WatchItem & { link: string } => !!w?.link).map((w) => ({ text: w.text, link: w.link }));
    return { ...v, crossed, follow };
  };
}
