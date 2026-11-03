// 工作：宝在做的一件件事（要办成什么、到哪了、下一步）。
// 左栏的讨论串是“在哪聊的”，按时间；工作是“要办成哪件事”，按目标。一件工作可能散在几段对话里，
// 一段对话也可能牵出两件工作，闲聊不产生工作。任务卡片是工作里的一次次执行，挂在工作的对话下面。
// 每段对话回完话、摘要写好以后，“工作归类”这个用途（可单独选小模型）替宝的主对话把它归到工作里：
// 并进已有的、新建一件，或者不算工作。存在 agents/<宝>/work/<id>.md，开头是状态，正文是目标和进展，能手改。
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";

export const WORK_STATUS = ["doing", "watching", "todo", "done", "dropped"] as const;
export type WorkStatus = (typeof WORK_STATUS)[number];
export const STATUS_NAME: Record<WorkStatus, string> = { doing: "进行中", watching: "盯着", todo: "待办", done: "做完了", dropped: "不做了" };

export interface Work {
  id: string;
  agent: string;
  title: string;
  status: WorkStatus;
  goal?: string; // 要办成什么
  doneWhen?: string; // 做到什么算完
  next?: string; // 下一步（谁做什么）
  threads: string[]; // 相关的对话（pi JSONL 路径），任务按对话挂过来
  left?: string[]; // 你手动移出去的对话，归类时不再并回来
  progress: { at: string; text: string }[]; // 进展，一件事一行
  created: string;
  updated: string;
}

// ---------- 存储：每件工作一个 .md ----------

const KEYS = ["id", "agent", "title", "status", "goal", "doneWhen", "next", "threads", "left", "created", "updated"] as const;

export function renderWork(w: Work): string {
  // 头部每个值写成 JSON（也是合法的 YAML），中文、引号、冒号都不用操心转义
  const head = KEYS.filter((k) => w[k] !== undefined && !(Array.isArray(w[k]) && !(w[k] as string[]).length && k === "left"))
    .map((k) => `${k}: ${JSON.stringify(w[k])}`)
    .join("\n");
  const top = [`# ${w.title}`, w.goal && `目标：${w.goal}`, w.doneWhen && `做完算：${w.doneWhen}`, w.next && `下一步：${w.next}`].filter(Boolean).join("\n\n");
  const log = w.progress.map((p) => `- ${p.at} ${p.text}`).join("\n");
  return `---\n${head}\n---\n\n${top}\n\n## 进展\n${log}\n`;
}

export function parseWork(text: string): Work | undefined {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return undefined;
  const o: Record<string, unknown> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const raw = line.slice(i + 1).trim();
    try {
      o[line.slice(0, i).trim()] = JSON.parse(raw);
    } catch {
      o[line.slice(0, i).trim()] = raw; // 手改成了不带引号的 YAML，也认
    }
  }
  if (typeof o.id !== "string" || typeof o.title !== "string") return undefined;
  const progress: Work["progress"] = [];
  const sec = m[2].split(/^## 进展\s*$/m)[1] ?? "";
  for (const line of sec.split("\n")) {
    const p = line.match(/^- (\S+ \S+|\S+) (.+)$/);
    if (p) progress.push({ at: p[1], text: p[2].trim() });
  }
  return {
    id: o.id,
    agent: String(o.agent ?? ""),
    title: o.title,
    status: WORK_STATUS.includes(o.status as WorkStatus) ? (o.status as WorkStatus) : "doing",
    goal: str(o.goal),
    doneWhen: str(o.doneWhen),
    next: str(o.next),
    threads: arr(o.threads),
    left: arr(o.left),
    progress,
    created: String(o.created ?? ""),
    updated: String(o.updated ?? o.created ?? ""),
  };
}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export class WorkBook extends EventEmitter {
  constructor(private agentDir: (agent: string) => string) {
    super();
  }

  private dir(agent: string) {
    return join(this.agentDir(agent), "work");
  }

  list(agent: string): Work[] {
    const dir = this.dir(agent);
    if (!existsSync(dir)) return [];
    const out: Work[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      try {
        const w = parseWork(readFileSync(join(dir, f), "utf8"));
        if (w) out.push({ ...w, agent });
      } catch {
        /* 坏文件跳过 */
      }
    }
    return out.sort((a, b) => b.updated.localeCompare(a.updated));
  }

  get(agent: string, id: string): Work | undefined {
    const f = join(this.dir(agent), `${id}.md`);
    if (!/^[\w-]+$/.test(id) || !existsSync(f)) return undefined;
    const w = parseWork(readFileSync(f, "utf8"));
    return w && { ...w, agent };
  }

  save(w: Work) {
    mkdirSync(this.dir(w.agent), { recursive: true });
    const f = join(this.dir(w.agent), `${w.id}.md`);
    writeFileSync(`${f}.tmp`, renderWork(w));
    renameSync(`${f}.tmp`, f);
    this.emit("change", w.agent);
  }

  create(agent: string, init: Partial<Work> & { title: string }, now = new Date()): Work {
    const id = `w${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const w: Work = { status: "doing", threads: [], progress: [], ...init, id, agent, created: now.toISOString(), updated: now.toISOString() };
    this.save(w);
    return w;
  }

  /** 这段对话在哪几件工作里 */
  ofThread(agent: string, path: string): Work[] {
    return this.list(agent).filter((w) => w.threads.includes(path));
  }

  // ---------- 你手动改的 ----------

  /** 把 from 并进 into：对话、进展合到一起，from 删掉 */
  merge(agent: string, from: string, into: string): Work | undefined {
    const a = this.get(agent, from), b = this.get(agent, into);
    if (!a || !b || a.id === b.id) return undefined;
    b.threads = [...new Set([...b.threads, ...a.threads])];
    b.progress = [...b.progress, ...a.progress].sort((x, y) => x.at.localeCompare(y.at));
    b.progress.push({ at: stamp(), text: `并进了「${a.title}」` });
    b.updated = new Date().toISOString();
    this.save(b);
    unlinkSync(join(this.dir(agent), `${a.id}.md`));
    this.emit("change", agent);
    return b;
  }

  /** 把一段对话从工作里移出去（拆开）；以后归类也不再把它并回这件 */
  detach(agent: string, id: string, path: string): Work | undefined {
    const w = this.get(agent, id);
    if (!w) return undefined;
    w.threads = w.threads.filter((p) => p !== path);
    w.left = [...new Set([...(w.left ?? []), path])];
    w.updated = new Date().toISOString();
    this.save(w);
    return w;
  }

  set(agent: string, id: string, patch: { status?: WorkStatus; title?: string }): Work | undefined {
    const w = this.get(agent, id);
    if (!w) return undefined;
    if (patch.status && WORK_STATUS.includes(patch.status) && patch.status !== w.status) {
      w.progress.push({ at: stamp(), text: `你标成了「${STATUS_NAME[patch.status]}」` });
      w.status = patch.status;
    }
    if (patch.title?.trim()) w.title = patch.title.trim().slice(0, 40);
    w.updated = new Date().toISOString();
    this.save(w);
    return w;
  }

  /** 主对话清空换了新文件：工作里跟着换 */
  repoint(agent: string, from: string, to: string) {
    for (const w of this.ofThread(agent, from)) {
      w.threads = w.threads.map((p) => (p === from ? to : p));
      this.save(w);
    }
  }

  /** 对话删了：从所有工作里拿掉（工作本身留着，进展还在） */
  forget(agent: string, path: string) {
    for (const w of this.ofThread(agent, path)) {
      w.threads = w.threads.filter((p) => p !== path);
      this.save(w);
    }
  }

  // ---------- 归类结果写进来 ----------

  /** 把模型给的归类结果落到文件里。返回动过的工作 */
  apply(agent: string, path: string, items: Classified[], now = new Date()): Work[] {
    const open = this.list(agent);
    const out: Work[] = [];
    for (const it of items.slice(0, 3)) {
      let w = it.work && it.work !== "new" ? open.find((x) => x.id === it.work) : undefined;
      if (w?.left?.includes(path)) continue; // 你拆出去过的，不再并回
      if (w?.status === "dropped") continue; // 你说了不做的，自动归类不改它
      if (!w) {
        if (!it.title) continue;
        if (open.some((x) => x.title === it.title && x.status === "dropped")) continue; // 也不换个 id 再建一件
        // 同名的就当同一件，免得模型忘了 id 又建一件
        w = open.find((x) => x.title === it.title && x.status !== "done" && x.status !== "dropped" && !x.left?.includes(path));
        if (!w) {
          w = this.create(agent, { title: it.title.slice(0, 40), threads: [path] }, now);
          open.push(w);
        }
      }
      if (!w.threads.includes(path)) w.threads.push(path);
      if (it.title && w.title !== it.title && !w.progress.length) w.title = it.title.slice(0, 40); // 刚建的还能改名，有进展了就不乱改
      if (it.goal) w.goal = it.goal;
      if (it.doneWhen) w.doneWhen = it.doneWhen;
      if (it.next !== undefined) w.next = it.next || undefined;
      if (it.status && WORK_STATUS.includes(it.status)) w.status = it.status;
      const last = w.progress[w.progress.length - 1];
      if (it.progress && it.progress !== last?.text) w.progress.push({ at: stamp(now), text: it.progress.slice(0, 80) });
      w.progress = w.progress.slice(-30);
      w.updated = now.toISOString();
      this.save(w);
      out.push(w);
    }
    return out;
  }
}

// ---------- 归类：用一个便宜模型替宝的主对话做 ----------

export interface Classified {
  work?: string; // 已有工作的 id，"new" 是新建
  title?: string;
  goal?: string;
  doneWhen?: string;
  status?: WorkStatus;
  next?: string;
  progress?: string;
}

export const WORK_SYSTEM = `你是一个宝（负责某个领域的助理）的项目经理。用户在左边按对话聊天，你负责把对话里要办的事整理成“工作”：一件工作是一件要办成的事，有目标、状态和下一步。
看这段对话最近的内容，对照这个宝已有的工作，判断它属于哪件工作：
- 属于已有的，就用那件的 id；是一件新的要办的事，work 写 "new"；
- 只是闲聊、问答、查个信息、没有要办成的事，输出空数组 []；
- 一段对话最多牵出 3 件工作，大多数只有 1 件。
只输出 JSON 数组，每项字段：
{"work": "已有 id 或 new", "title": "8 到 14 个字的事名，像待办标题", "goal": "要办成什么，一句话", "doneWhen": "做到什么算完，一句话", "status": "doing|watching|todo|done|dropped", "next": "下一步谁做什么，一句话，没有就空字符串", "progress": "这次新进展一句话，不超过 30 字，没有新进展就省略"}
status：doing 正在办；watching 办完了还在盯着某个消息；todo 说好以后再做；done 做完了；dropped 用户说不做了。
已有的字段没变化可以省略，不要编造对话里没有的事。
标着“不做了”的是用户取消的，对话还在说它就用它的 id，不要当新的再建。`;

export function buildWorkInput(o: { agent: string; thread: string; summary?: string; lines: { role: string; text: string }[]; works: Work[]; mine: string[] }): string {
  const works = o.works
    .filter((w) => (w.status !== "dropped" && w.status !== "done") || o.mine.includes(w.id)) // 做完、不做了的，只给这段对话自己在里面的
    .slice(0, 20)
    .map((w) => `- id=${w.id}${o.mine.includes(w.id) ? "（这段对话已在里面）" : ""}｜${w.title}｜${STATUS_NAME[w.status]}${w.next ? `｜下一步：${w.next}` : ""}`)
    .join("\n");
  const body = o.lines
    .slice(-12)
    .map((l) => `${l.role === "user" ? "用户" : "助理"}：${l.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  return `宝：${o.agent}\n对话名：${o.thread}\n对话摘要：${o.summary ?? "（无）"}\n\n这个宝已有的工作：\n${works || "（还没有）"}\n\n这段对话最近的内容：\n${body}`;
}

/** 模型输出收拾成数组，认不出就当没有 */
export function parseClassified(raw: string): Classified[] | undefined {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return undefined;
  try {
    const v = JSON.parse(m[0]);
    if (!Array.isArray(v)) return undefined;
    return v
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        work: str(x.work),
        title: str(x.title),
        goal: str(x.goal),
        doneWhen: str(x.doneWhen),
        status: WORK_STATUS.includes(x.status) ? x.status : undefined,
        next: typeof x.next === "string" ? x.next.trim() : undefined,
        progress: str(x.progress),
      }));
  } catch {
    return undefined;
  }
}

export class WorkSorter {
  private running = new Set<string>();
  private again = new Set<string>();

  constructor(
    private o: {
      book: WorkBook;
      thread: (path: string) => { agent: string; name: string; summary?: string } | undefined;
      history: (path: string) => { role: string; text: string }[];
      complete: (system: string, user: string) => Promise<string>;
      skip?: (path: string) => boolean; // 不归类的对话（比如任务开出来的后台对话，任务自己挂在发起对话的工作下）
    },
  ) {}

  async run(path: string): Promise<Work[]> {
    if (this.running.has(path)) {
      this.again.add(path);
      return [];
    }
    this.running.add(path);
    try {
      const rec = this.o.thread(path);
      if (!rec || this.o.skip?.(path)) return [];
      const lines = this.o.history(path);
      if (!lines.length) return [];
      const works = this.o.book.list(rec.agent);
      const mine = works.filter((w) => w.threads.includes(path)).map((w) => w.id);
      let items: Classified[] | undefined;
      try {
        items = parseClassified(await this.o.complete(WORK_SYSTEM, buildWorkInput({ agent: rec.agent, thread: rec.name, summary: rec.summary, lines, works, mine })));
      } catch (e) {
        console.warn("[work] 归类失败：", (e as Error).message);
      }
      // 等模型的时候对话可能被删了、清空换了文件：那这次结果作废，免得把删掉的对话又加回工作里
      if (!items || this.o.thread(path)?.agent !== rec.agent) return [];
      return this.o.book.apply(rec.agent, path, items);
    } finally {
      this.running.delete(path);
      if (this.again.delete(path)) void this.run(path);
    }
  }
}
