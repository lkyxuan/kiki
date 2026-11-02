// 后台任务（第二层路由的执行部分）：一个任务 = 数据目录 tasks/ 下一个 Markdown 文件。
// 照 OpenClaw 的 spawn + announce：开一段后台对话去做，做完把结果报回发起的地方。
// 不用数据库、不轮询：Kiki 只有一个进程，任务进来直接排队跑；定时的任务只给最近要到点的那个定一个闹钟。
// 存储单独隔在 TaskStore 后面，以后要查询统计时只换这一层（比如换成 SQLite）。
import { EventEmitter } from "node:events";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nextRun } from "./schedule.js";

export type TaskStatus = "todo" | "queued" | "running" | "blocked" | "done" | "failed" | "interrupted" | "cancelled";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "待办",
  queued: "排队",
  running: "进行中",
  blocked: "等你",
  done: "完成",
  failed: "失败",
  interrupted: "中断",
  cancelled: "已取消",
};

/** 还没结束的状态（重启、更新时要当心的）。 */
export const OPEN: TaskStatus[] = ["todo", "queued", "running", "blocked"];

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  agent: string; // 在哪个宝里做
  prompt: string; // 交给后台对话的原话
  session?: string; // 执行这个任务的后台对话（pi JSONL 路径）
  origin?: string; // 从哪段对话派出来的：分叉它去做，做完回报到那里
  reportTo?: string; // 只回报、不分叉：做完回报到这段对话（优先于 origin），比如交接
  chatId?: string; // 从哪个聊天派出来的（收件箱）
  created: string;
  started?: string;
  finished?: string;
  result?: string; // 完成时的回答，失败时的原因
  when?: string; // 待办：到这个时间才开跑（ISO）；重复任务是下一次的时间
  after?: string; // 待办：等这个任务做完才开跑（任务 id）
  repeat?: string; // 重复规则，比如"每天 09:00"（见 schedule.ts）。有它的是"定时任务"本身，每次到点另开一个任务去跑
  parent?: string; // 由哪个定时任务开出来的
  question?: string; // 等你：卡在哪、要你回答什么
  hold?: boolean; // 只记下来：不管到没到点、等的任务做没做完，都等用户点开始
  doneWhen?: string; // 完成标准：做到什么算完
  executor?: string; // 谁来做：不填是 Kiki 自己开后台对话；填外部 bot 的名字就交给收发室注册的执行者
}

// ---------- 存储 ----------

export interface TaskStore {
  load(): Task[];
  save(t: Task): void;
}

/** 每个任务一个 .md：开头 YAML 是状态，正文是任务和结果，打开就能看、能手改。 */
export class FileTaskStore implements TaskStore {
  private files = new Map<string, string>(); // id -> 文件名

  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  load(): Task[] {
    const out: Task[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".md")) continue;
      try {
        const t = parseTask(readFileSync(join(this.dir, f), "utf8"));
        if (t) {
          this.files.set(t.id, f);
          out.push(t);
        }
      } catch (e) {
        console.warn(`[tasks] 读不懂 ${f}：${(e as Error).message}`);
      }
    }
    return out.sort((a, b) => a.created.localeCompare(b.created));
  }

  save(t: Task) {
    const name = this.files.get(t.id) ?? `${t.id} ${safe(t.title)}.md`;
    this.files.set(t.id, name);
    const file = join(this.dir, name);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, formatTask(t));
    renameSync(tmp, file); // 先写临时文件再改名，避免写一半
  }
}

/** 测试用：只放内存。 */
export class MemoryTaskStore implements TaskStore {
  private m = new Map<string, Task>();
  load() {
    return [...this.m.values()];
  }
  save(t: Task) {
    this.m.set(t.id, { ...t });
  }
}

const RESULT_MARK = "<!-- kiki:result -->";
const FIELDS = [
  "id", "title", "status", "agent", "when", "after", "repeat", "parent", "question", "hold", "doneWhen", "executor",
  "session", "origin", "reportTo", "chatId", "created", "started", "finished",
] as const;

export function formatTask(t: Task): string {
  const head = FIELDS.filter((k) => t[k] !== undefined).map((k) => `${k}: ${JSON.stringify(t[k])}`);
  let body = `---\n${head.join("\n")}\n---\n\n## 任务\n\n${t.prompt}\n`;
  if (t.result !== undefined) body += `\n${RESULT_MARK}\n## 结果\n\n${t.result}\n`;
  return body;
}

export function parseTask(text: string): Task | undefined {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return undefined;
  const t: any = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    try {
      t[k] = JSON.parse(raw);
    } catch {
      t[k] = raw; // 手改时没加引号也认
    }
  }
  if (!t.id || !t.status || !t.agent) return undefined;
  // 用标记行分开任务和结果，任务原文里就算有"## 结果"也不会被截断
  const body = m[2];
  const r = body.indexOf(`\n${RESULT_MARK}\n`);
  const taskPart = r >= 0 ? body.slice(0, r) : body;
  t.prompt = taskPart.replace(/^\s*## 任务\s*\n/, "").trim();
  if (r >= 0) t.result = body.slice(r + RESULT_MARK.length + 2).replace(/^## 结果\s*\n/, "").trim();
  t.title ??= t.id;
  t.created ??= "";
  return t as Task;
}

const safe = (s: string) => s.replace(/[\/\\:*?"<>|\n]/g, " ").trim().slice(0, 30) || "任务";

// ---------- 执行 ----------

/** 执行器对外面的全部要求，测试时可以换成假的。 */
/** 外部执行者（收发室里的外部 bot）：拿到任务去做，返回结果。超时、重试、回报都复用任务的规则。 */
export interface Executor {
  run(t: Task): Promise<string>;
  /** 停下（停任务时调），可以没有 */
  stop?(t: Task): Promise<void> | void;
}

/** 交给执行者的完整说明：任务原文 + 完成标准。 */
export function taskPrompt(t: Pick<Task, "prompt" | "doneWhen">): string {
  return t.doneWhen ? `${t.prompt}\n\n完成标准：${t.doneWhen}\n做到这一步就停，在结果里逐条对照完成标准说明做到了没有。` : t.prompt;
}

export interface TaskBackend {
  /** 在这个宝下为这个任务开一段后台对话，返回它的 JSONL 路径；给了 from 就从那段对话分叉 */
  spawn(agent: string, title: string, from?: string): Promise<string>;
  send(agent: string, path: string, text: string): Promise<string>;
  /** 停掉正在跑的对话（超时、停任务用），可以没有 */
  abort?(path: string): Promise<void>;
  /** 往正在跑的对话里插一句话（改任务用），可以没有 */
  steer?(path: string, text: string): Promise<void>;
  /** 往一段对话末尾记一条消息，不触发回答（回报给发起的对话） */
  note(path: string, text: string): Promise<void>;
}

export interface StartInput {
  agent: string;
  title: string;
  prompt: string;
  origin?: string;
  reportTo?: string;
  chatId?: string;
  when?: string; // ISO；在将来就先放进待办
  after?: string; // 等这个任务做完
  repeat?: string; // 重复规则；有它就是定时任务
  hold?: boolean; // 只记下来，等手动开始
  parent?: string;
  doneWhen?: string;
  executor?: string;
}

type Notify = (t: Task) => void;

/** 事件：update(task) 每次状态变化。 */
export class Tasks extends EventEmitter {
  private all = new Map<string, Task>();
  private running = 0;
  private waiting: string[] = [];
  private notifiers = new Map<string, Notify>();
  private asked = new Map<string, string>(); // 任务 id -> 这一轮里 agent 提的问题
  private resumes = new Map<string, string>(); // 任务 id -> 用户的回答或返工要求（排队等着在原对话里接着干）
  private stopping = new Set<string>(); // 正在被停下的任务：这一轮结束时标"已取消"
  private executors = new Map<string, Executor>();
  private timer?: NodeJS.Timeout;
  /** 没有专门回报对象的任务（定时开出来的、重启后的、agent 用工具记的）做完/卡住时找它，server 接到收件箱。 */
  defaultNotify?: Notify;

  constructor(
    private store: TaskStore,
    private backend: TaskBackend,
    private opts: { concurrency?: number; timeoutMs?: number; now?: () => Date } = {},
  ) {
    super();
    for (const t of store.load()) this.all.set(t.id, t);
    // 闹钟等 recover() 再定：先把上次中断的标好，免得刚放出来的任务被当成中断
  }

  private now() {
    return this.opts.now?.() ?? new Date();
  }

  /** 收发室注册外部执行者（名字就是任务卡上的 executor）。 */
  registerExecutor(name: string, ex: Executor) {
    this.executors.set(name, ex);
  }

  /** 启动时调一次：上次没做完的（排队/进行中）标成"中断"，返回它们，由调用方告诉用户。待办和等你的照旧留着。 */
  recover(): Task[] {
    const out: Task[] = [];
    for (const t of this.all.values()) {
      if (t.status === "queued" || t.status === "running") {
        this.update(t, { status: "interrupted", finished: iso(this.now()), result: "Kiki 重启时这个任务还没做完。" });
        out.push(t);
      }
    }
    this.tick(); // 关机期间到点的待办，现在补上
    return out;
  }

  list(filter?: (t: Task) => boolean): Task[] {
    return [...this.all.values()].filter((t) => !filter || filter(t));
  }

  get(id: string): Task | undefined {
    return this.all.get(id);
  }

  /** 派一个任务。马上返回：能跑就排队/开跑，有时间、要等别的任务、或只是记下来的进待办。 */
  start(input: StartInput, notify?: Notify): Task {
    const { hold: holdIn, ...rest } = input;
    const hold = holdIn || undefined;
    if (rest.after && !this.all.has(rest.after)) throw new Error(`没有任务 ${rest.after}`);
    if (rest.repeat) {
      const first = rest.when ? new Date(rest.when) : nextRun(rest.repeat, this.now());
      if (!first) throw new Error(`看不懂重复规则「${rest.repeat}」，可以写：每天 09:00、工作日 09:00、每周一 09:00、每小时`);
      rest.when = iso(first);
    }
    const t: Task = { id: newId(), status: "todo", created: iso(this.now()), ...rest, ...(hold ? { hold } : {}) };
    this.all.set(t.id, t);
    if (notify) this.notifiers.set(t.id, notify);
    if (!t.repeat && this.ready(t)) this.enqueue(t);
    else this.update(t, {});
    this.arm();
    return t;
  }

  /** 重跑失败或中断的任务：新开一个任务，原文照抄，马上跑。 */
  retry(id: string, notify?: Notify): Task | undefined {
    const old = this.all.get(id);
    if (!old || OPEN.includes(old.status) || old.repeat) return undefined;
    return this.start({ agent: old.agent, title: old.title, prompt: old.prompt, doneWhen: old.doneWhen, executor: old.executor, origin: old.origin, reportTo: old.reportTo, chatId: old.chatId, parent: old.parent }, notify);
  }

  /** 待办马上开始（定时任务就是马上额外跑一次，不影响下次时间）。 */
  runNow(id: string, notify?: Notify): Task | undefined {
    const t = this.all.get(id);
    if (!t || t.status !== "todo") return undefined;
    if (notify) this.notifiers.set(t.id, notify);
    if (t.repeat) return this.spawnRun(t);
    this.update(t, { when: undefined, after: undefined, hold: undefined });
    this.enqueue(t);
    this.arm();
    return t;
  }

  /** 取消还没开跑或在等你的任务（定时任务取消就不再到点开跑）。 */
  cancel(id: string): Task | undefined {
    const t = this.all.get(id);
    if (!t || !["todo", "queued", "blocked"].includes(t.status)) return undefined;
    this.waiting = this.waiting.filter((x) => x !== id);
    this.resumes.delete(id);
    this.update(t, { status: "cancelled", finished: iso(this.now()) });
    this.notifiers.delete(id);
    this.settleDependents(t);
    this.arm();
    return t;
  }

  /** 后台对话里的 agent 卡住了要问用户：记下问题，这一轮答完后任务停在"等你"。不是后台任务的对话返回 undefined。 */
  ask(sessionPath: string, question: string): Task | undefined {
    const t = this.list((x) => x.session === sessionPath && x.status === "running")[0];
    if (t) this.asked.set(t.id, question.trim());
    return t;
  }

  /** 正在等你回答、由这段对话执行的任务。 */
  blockedBySession(sessionPath: string): Task | undefined {
    return this.list((x) => x.session === sessionPath && x.status === "blocked")[0];
  }

  /** 回答卡住的任务：在原来那段后台对话里接着干。 */
  answer(id: string, text: string, notify?: Notify): Task | undefined {
    const t = this.all.get(id);
    if (!t || t.status !== "blocked" || !t.session) return undefined;
    if (notify) this.notifiers.set(t.id, notify);
    this.resumes.set(t.id, text); // 和别的任务一样排队，不超过同时跑的上限
    this.update(t, { question: undefined });
    this.enqueue(t);
    return t;
  }

  /** 停任务：没开跑的直接取消；正在跑的停下对话（或外部执行者），这一轮结束时标"已取消"。 */
  async stop(id: string): Promise<Task | undefined> {
    const t = this.all.get(id);
    if (!t) return undefined;
    if (t.status !== "running") return this.cancel(id);
    this.stopping.add(id);
    if (t.executor) await this.executors.get(t.executor)?.stop?.(t);
    else if (t.session) await this.backend.abort?.(t.session);
    return t;
  }

  /** 改任务 / 返工：按任务现在的状态，把这句话送到该去的地方。返回给人看的一句说明；改不了返回 undefined。
   *  待办/排队：改进任务内容；进行中：插话进正在跑的对话；等你：当作回答；已结束：在原对话里接着做，做完重新回报。 */
  revise(id: string, text: string, notify?: Notify): string | undefined {
    const t = this.all.get(id);
    const add = text.trim();
    if (!t || !add) return undefined;
    if (notify) this.notifiers.set(t.id, notify);
    switch (t.status) {
      case "todo":
      case "queued":
        this.update(t, { prompt: `${t.prompt}\n\n补充：${add}` });
        return `已经改进「${t.title}」的任务内容，开跑时会按新的做。`;
      case "running":
        if (t.executor || !t.session || !this.backend.steer) return undefined;
        void this.backend.steer(t.session, add).catch((e) => console.warn(`[tasks] 插话失败：${(e as Error).message}`));
        return `已经把这句话插进正在跑的「${t.title}」。`;
      case "blocked":
        this.answer(t.id, add);
        return `已经当作回答交给「${t.title}」，它会接着做。`;
      default: {
        if (t.executor || !t.session) {
          // 没开过对话（或外部做的）：新开一个任务，原话加上返工要求
          const again = this.start(
            { agent: t.agent, title: t.title, prompt: `${t.prompt}\n\n返工要求：${add}`, doneWhen: t.doneWhen, executor: t.executor, origin: t.origin, reportTo: t.reportTo, chatId: t.chatId },
            notify,
          );
          return `「${t.title}」重新开了一个任务去返工（${again.id}）。`;
        }
        this.resumes.set(t.id, `返工：${add}`);
        this.update(t, { finished: undefined, result: undefined });
        this.enqueue(t);
        return `「${t.title}」在原来的对话里接着返工，做完会重新回报。`;
      }
    }
  }

  // ----- 内部 -----

  /** 待办能开跑了吗：到点了，要等的任务也做完了。 */
  private ready(t: Task): boolean {
    if (t.hold) return false;
    if (t.when && new Date(t.when) > this.now()) return false;
    if (t.after && this.all.get(t.after)?.status !== "done") return false;
    return true;
  }

  private enqueue(t: Task) {
    this.update(t, { status: "queued" });
    this.waiting.push(t.id);
    this.pump();
  }

  /** 定时任务到点：另开一个任务去跑，自己挪到下一次。 */
  private spawnRun(tpl: Task): Task {
    const notify = this.notifiers.get(tpl.id);
    const run = this.start(
      { agent: tpl.agent, title: tpl.title, prompt: tpl.prompt, doneWhen: tpl.doneWhen, executor: tpl.executor, reportTo: tpl.reportTo ?? tpl.origin, chatId: tpl.chatId, parent: tpl.id },
      notify,
    );
    return run;
  }

  /** 闹钟响了（或者有变化）：把到点的待办放出来，再定下一个闹钟。 */
  private ticking = false;
  private tick() {
    if (this.ticking) return; // 放任务时会 start()/arm()，别重入
    this.ticking = true;
    try {
      for (const t of [...this.all.values()]) {
        if (t.status !== "todo" || !t.when || !this.ready(t)) continue;
        if (t.repeat) {
          // 先挪到下一次，再开这一次的任务
          const next = nextRun(t.repeat, this.now());
          if (next) this.update(t, { when: iso(next) });
          else this.update(t, { status: "failed", finished: iso(this.now()), result: `看不懂重复规则「${t.repeat}」` });
          this.spawnRun(t);
        } else this.enqueue(t);
      }
    } finally {
      this.ticking = false;
    }
    this.arm(false);
  }

  /** 只定一个闹钟：最近要到点的那个待办。最长一小时醒一次（防电脑睡眠后时间跳了）。 */
  private arm(check = true) {
    if (this.ticking) return;
    if (check) {
      // 先看有没有已经到点的，有就直接放
      const due = this.list((t) => t.status === "todo" && !!t.when && this.ready(t));
      if (due.length) return this.tick();
    }
    clearTimeout(this.timer);
    const times = this.list((t) => t.status === "todo" && !!t.when).map((t) => new Date(t.when!).getTime());
    if (!times.length) return;
    const wait = Math.max(0, Math.min(Math.min(...times) - this.now().getTime(), 3_600_000));
    this.timer = setTimeout(() => this.tick(), wait + 50);
    this.timer.unref?.(); // 别因为闹钟让进程（和测试）退不出去
  }

  /** 一个任务结束了：等它的待办，做成了就放行，没做成就一起标失败（重跑时会去掉"等谁"）。 */
  private settleDependents(t: Task) {
    for (const d of this.all.values()) {
      if (d.status !== "todo" || d.after !== t.id) continue;
      if (t.status === "done") {
        // 定时任务交给闹钟（tick）去开子任务，不能把它本身放去跑
        if (!d.repeat && this.ready(d)) this.enqueue(d);
      } else {
        this.update(d, { status: "failed", finished: iso(this.now()), result: `等的任务「${t.title}」${STATUS_LABEL[t.status]}了，这个就没开始。` });
        this.settleDependents(d); // 一路往下传：等它的也开始不了
      }
    }
  }

  private pump() {
    const max = this.opts.concurrency ?? 2;
    while (this.running < max && this.waiting.length) {
      const t = this.all.get(this.waiting.shift()!);
      if (!t || t.status !== "queued") continue;
      this.running++;
      const reply = this.resumes.get(t.id);
      this.resumes.delete(t.id);
      if (reply !== undefined) {
        this.update(t, { status: "running" });
        void this.run(t, () => (t.session ? this.backend.send(t.agent, t.session, reply) : Promise.reject(new Error("这个任务没有对话可以接着做"))));
      } else {
        this.update(t, { status: "running", started: iso(this.now()) });
        void this.run(t);
      }
    }
  }

  /** 跑一轮：第一次是开对话+交任务，回答卡住的任务时是往原对话里接着说。 */
  private async run(t: Task, step?: () => Promise<string>) {
    let timedOut = false;
    const work =
      step?.() ??
      (async () => {
        if (t.executor) {
          const ex = this.executors.get(t.executor);
          if (!ex) throw new Error(`没有叫「${t.executor}」的执行者（收发室里没接上）`);
          return ex.run(t);
        }
        const path = await this.backend.spawn(t.agent, t.title, t.origin);
        if (timedOut) return ""; // 开对话就超时了（比如原对话一直忙），不再开始干活
        this.update(t, { session: path });
        return this.backend.send(t.agent, path, taskPrompt(t));
      })();
    let finished = true;
    try {
      // 超时从派活算起，包括开对话（分叉原对话可能要排在原对话后面）
      const answer = await this.withTimeout(work, () => {
        timedOut = true;
        if (t.executor) void this.executors.get(t.executor)?.stop?.(t);
        else if (t.session) void this.backend.abort?.(t.session);
      });
      const q = this.asked.get(t.id);
      this.asked.delete(t.id);
      if (this.stopping.delete(t.id)) this.update(t, { status: "cancelled", finished: iso(this.now()), result: answer || "已停下。" });
      else if (q) {
        finished = false;
        this.update(t, { status: "blocked", question: q, result: answer || undefined });
      } else this.update(t, { status: "done", finished: iso(this.now()), result: answer, question: undefined });
    } catch (e) {
      this.asked.delete(t.id);
      if (this.stopping.delete(t.id)) this.update(t, { status: "cancelled", finished: iso(this.now()), result: "已停下。" });
      else this.update(t, { status: "failed", finished: iso(this.now()), result: (e as Error).message });
    } finally {
      this.running--;
      this.pump(); // 先放下一个任务开跑，再回报原对话：原对话忙时回报要排队，别卡住整个队列
    }
    if (!finished) return;
    this.notifiers.delete(t.id);
    this.settleDependents(t);
    this.arm();
    await this.announce(t);
  }

  private withTimeout<T>(p: Promise<T>, onTimeout: () => void): Promise<T> {
    const ms = this.opts.timeoutMs;
    if (!ms) return p;
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new Error(`超过 ${Math.round(ms / 60000)} 分钟没做完，已停下`));
      }, ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  /** 做完（或失败）后，在发起的对话末尾记一条，让那边的 agent 下次回答时也知道。 */
  private async announce(t: Task) {
    const to = t.reportTo ?? t.origin;
    if (!to) return;
    const head = t.status === "done" ? `✅ 后台任务「${t.title}」完成` : `❌ 后台任务「${t.title}」${STATUS_LABEL[t.status]}`;
    try {
      await this.backend.note(to, `${head}（任务 ${t.id}）：\n\n${t.result ?? ""}`);
    } catch (e) {
      console.warn(`[tasks] 回报到原对话失败：${(e as Error).message}`);
    }
  }

  private update(t: Task, patch: Partial<Task>) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (t as any)[k];
      else (t as any)[k] = v;
    }
    this.store.save(t);
    this.emit("update", t);
    const n = this.notifiers.get(t.id) ?? this.defaultNotify;
    n?.(t);
  }
}

const iso = (d: Date) => d.toISOString();

function newId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const r = Math.random().toString(36).slice(2, 5);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${r}`;
}
