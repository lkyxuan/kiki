// 后台任务（第二层路由的执行部分）：一个任务 = 数据目录 tasks/ 下一个 Markdown 文件。
// 照 OpenClaw 的 spawn + announce：开一段后台对话去做，做完把结果报回发起的地方。
// 不用数据库、不轮询：Kiki 只有一个进程，任务进来直接排队跑。
// 存储单独隔在 TaskStore 后面，以后要查询统计时只换这一层（比如换成 SQLite）。
import { EventEmitter } from "node:events";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type TaskStatus = "queued" | "running" | "done" | "failed" | "interrupted";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "排队",
  running: "进行中",
  done: "完成",
  failed: "失败",
  interrupted: "中断",
};

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  agent: string; // 在哪个宝里做
  prompt: string; // 交给后台对话的原话
  session?: string; // 执行这个任务的后台对话（pi JSONL 路径）
  origin?: string; // 从哪段对话派出来的，做完回报到那里
  chatId?: string; // 从哪个聊天派出来的（收件箱）
  created: string;
  started?: string;
  finished?: string;
  result?: string; // 完成时的回答，失败时的原因
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
const FIELDS = ["id", "title", "status", "agent", "session", "origin", "chatId", "created", "started", "finished"] as const;

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
export interface TaskBackend {
  /** 在这个宝下为这个任务开一段后台对话，返回它的 JSONL 路径；给了 from 就从那段对话分叉 */
  spawn(agent: string, title: string, from?: string): Promise<string>;
  send(agent: string, path: string, text: string): Promise<string>;
  /** 停掉正在跑的对话（超时用），可以没有 */
  abort?(path: string): Promise<void>;
  /** 往一段对话末尾记一条消息，不触发回答（回报给发起的对话） */
  note(path: string, text: string): Promise<void>;
}

export interface StartInput {
  agent: string;
  title: string;
  prompt: string;
  origin?: string;
  chatId?: string;
}

/** 事件：update(task) 每次状态变化。 */
export class Tasks extends EventEmitter {
  private all = new Map<string, Task>();
  private running = 0;
  private waiting: string[] = [];
  private notifiers = new Map<string, (t: Task) => void>();

  constructor(
    private store: TaskStore,
    private backend: TaskBackend,
    private opts: { concurrency?: number; timeoutMs?: number } = {},
  ) {
    super();
    for (const t of store.load()) this.all.set(t.id, t);
  }

  /** 启动时调一次：上次没做完的（排队/进行中）标成"中断"，返回它们，由调用方告诉用户。 */
  recover(): Task[] {
    const out: Task[] = [];
    for (const t of this.all.values()) {
      if (t.status === "queued" || t.status === "running") {
        this.update(t, { status: "interrupted", finished: now(), result: "Kiki 重启时这个任务还没做完。" });
        out.push(t);
      }
    }
    return out;
  }

  list(filter?: (t: Task) => boolean): Task[] {
    return [...this.all.values()].filter((t) => !filter || filter(t));
  }

  get(id: string): Task | undefined {
    return this.all.get(id);
  }

  /** 派一个任务。马上返回（状态是排队或进行中），做完通过 notify 和 update 事件告诉调用方。 */
  start(input: StartInput, notify?: (t: Task) => void): Task {
    const t: Task = { id: newId(), status: "queued", created: now(), ...input };
    this.all.set(t.id, t);
    if (notify) this.notifiers.set(t.id, notify);
    this.update(t, {});
    this.waiting.push(t.id);
    this.pump();
    return t;
  }

  /** 重跑失败或中断的任务：新开一个任务，原文照抄。 */
  retry(id: string, notify?: (t: Task) => void): Task | undefined {
    const old = this.all.get(id);
    if (!old || old.status === "queued" || old.status === "running") return undefined;
    return this.start({ agent: old.agent, title: old.title, prompt: old.prompt, origin: old.origin, chatId: old.chatId }, notify);
  }

  private pump() {
    const max = this.opts.concurrency ?? 2;
    while (this.running < max && this.waiting.length) {
      const t = this.all.get(this.waiting.shift()!);
      if (!t) continue;
      this.running++;
      this.update(t, { status: "running", started: now() });
      void this.run(t);
    }
  }

  private async run(t: Task) {
    let timedOut = false;
    const work = (async () => {
      const path = await this.backend.spawn(t.agent, t.title, t.origin);
      if (timedOut) return undefined; // 开对话就超时了（比如原对话一直忙），不再开始干活
      this.update(t, { session: path });
      return this.backend.send(t.agent, path, t.prompt);
    })();
    try {
      // 超时从派活算起，包括开对话（分叉原对话可能要排在原对话后面）
      const answer = await this.withTimeout(work, () => {
        timedOut = true;
        if (t.session) void this.backend.abort?.(t.session);
      });
      this.update(t, { status: "done", finished: now(), result: answer as string });
    } catch (e) {
      this.update(t, { status: "failed", finished: now(), result: (e as Error).message });
    } finally {
      this.running--;
      this.notifiers.delete(t.id);
      this.pump(); // 先放下一个任务开跑，再回报原对话：原对话忙时回报要排队，别卡住整个队列
      await this.announce(t);
    }
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
    if (!t.origin) return;
    const head = t.status === "done" ? `✅ 后台任务「${t.title}」完成` : `❌ 后台任务「${t.title}」${STATUS_LABEL[t.status]}`;
    try {
      await this.backend.note(t.origin, `${head}（任务 ${t.id}）：\n\n${t.result ?? ""}`);
    } catch (e) {
      console.warn(`[tasks] 回报到原对话失败：${(e as Error).message}`);
    }
  }

  private update(t: Task, patch: Partial<Task>) {
    Object.assign(t, patch);
    this.store.save(t);
    this.emit("update", t);
    this.notifiers.get(t.id)?.(t);
  }
}

const now = () => new Date().toISOString();

function newId() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const r = Math.random().toString(36).slice(2, 5);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${r}`;
}

