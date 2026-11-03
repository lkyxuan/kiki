// “先接住你”：消息一发出，程序马上在你的气泡上打个表情，不用等模型。
// 👀 收到在看（答完就消失）；🕐 前面还在做、排队中；⏳ 放后台了；✅ 后台做完；✋ 等你回答；❗ 出错了。
// 只放在内存里，不写进对话记录：重启后就没了，按状态实时显示就够。以后接微信等通道，也用同一个“收到”信号。
import { EventEmitter } from "node:events";
import type { Task, TaskStatus } from "./tasks.js";

export type Mark = "seen" | "queued" | "bg" | "done" | "ask" | "error";

export interface Ack {
  id: string;
  path: string; // 哪段对话（奇奇是 "main"）
  text: string; // 你发的原话，网页靠它在老记录里找到那个气泡
  mark: Mark | null; // null：表情去掉了，但还留着“先回一句”
  tasks?: Record<string, TaskStatus>; // 这条消息放到后台的任务（拆成几件时有好几个）和各自的状态
  say?: string; // 小模型先回的一句（模型按用途配置里的“先回一句”）
}

const KEEP = 60; // 留着的最多条数（✅ ❗ 这类会一直显示，太老的就丢）

/**
 * 每条消息的表情。事件：change {path, id, mark}，mark 为 null 表示表情去掉了。
 */
export class Acks extends EventEmitter {
  private all = new Map<string, Ack>();
  private seq = 0;

  /** 收到一条消息：busy 时标排队中，否则 👀。返回这条的 id。 */
  add(path: string, text: string, busy = false): string {
    const id = `a${Date.now().toString(36)}${(this.seq++).toString(36)}`;
    this.all.set(id, { id, path, text, mark: busy ? "queued" : "seen" });
    while (this.all.size > KEEP) this.all.delete(this.all.keys().next().value!);
    this.emit("change", { path, id, text, mark: busy ? "queued" : "seen" });
    return id;
  }

  /** 换表情；null 是去掉。 */
  set(id: string, mark: Mark | null) {
    const a = this.all.get(id);
    if (!a) return;
    if (a.mark === mark) return;
    if (mark === null && !a.say) this.all.delete(id);
    else a.mark = mark;
    this.emit("change", { path: a.path, id, mark });
  }

  /** 小模型先回的一句：挂在这条消息下面。消息已经答完（表情没了）就不显示，免得马后炮。 */
  say(id: string, text: string) {
    const a = this.all.get(id);
    if (!a || !text || a.mark === null) return;
    a.say = text;
    this.emit("change", { path: a.path, id, mark: a.mark, say: text });
  }

  /** 开始处理了：排队中 → 👀。 */
  start(id: string) {
    if (this.all.get(id)?.mark === "queued") this.set(id, "seen");
  }

  get(id: string) {
    return this.all.get(id);
  }

  /** 现在挂着的表情（网页打开时拿一遍）。 */
  list(): Ack[] {
    return [...this.all.values()];
  }

  /** 这条消息放到后台去的任务：之后表情跟着这些任务的状态走。 */
  link(id: string, tasks: Task[]) {
    const a = this.all.get(id);
    if (!a || !tasks.length) return;
    a.tasks = { ...a.tasks, ...Object.fromEntries(tasks.map((t) => [t.id, t.status])) };
    this.refresh(a);
  }

  /** 这些任务已经挂在某条消息上了吗（免得两条消息抢同一个任务）。 */
  linked(taskId: string) {
    return [...this.all.values()].some((a) => a.tasks && taskId in a.tasks);
  }

  /** 后台任务状态变了：跟着换表情。 */
  onTask(t: Task) {
    for (const a of this.all.values()) {
      if (!a.tasks || !(t.id in a.tasks)) continue;
      a.tasks[t.id] = t.status;
      this.refresh(a);
    }
  }

  /** 按这条消息所有任务的状态合出一个表情：有出错就 ❗，有等你就 ✋，还有在做的就 ⏳，全做完才 ✅。 */
  private refresh(a: Ack) {
    const marks = Object.values(a.tasks ?? {}).map((status) => taskMark({ status } as Task));
    const m = (["error", "ask", "bg", "done"] as const).find((x) => marks.includes(x));
    if (m) this.set(a.id, m);
    else if (marks.length && marks.every((x) => x === null)) this.set(a.id, null); // 全取消了
  }
}

/** 后台任务的状态对应哪个表情；null 是去掉，undefined 是不用动。 */
export function taskMark(t: Task): Mark | null | undefined {
  if (t.status === "done") return "done";
  if (t.status === "failed" || t.status === "interrupted") return "error";
  if (t.status === "blocked") return "ask";
  if (t.status === "cancelled") return null; // 取消了：不显示
  if (t.status === "queued" || t.status === "running" || t.status === "todo") return "bg";
  return undefined;
}

/**
 * 奇奇回了一句话，这条消息该换成什么表情。看的是路由器自己写的回执格式（router.ts）。
 * 返回 null 表示去掉表情（答完了）；undefined 表示不用动。
 */
export function markForReply(text: string): Mark | null | undefined {
  const head = text.split("\n", 1)[0];
  if (/^→ .+ · 后台任务「/.test(head)) return "bg";
  if (head.startsWith("✅ 后台任务")) return "done";
  if (head.startsWith("❌ 后台任务")) return "error";
  if (head.startsWith("⏸ 后台任务")) return "ask";
  if (head.startsWith("出错了")) return "error";
  // 拆成几件：有放后台的就挂 ⏳，否则各段的回答在各自对话里，奇奇这边算接住了
  if (/^- 后台任务「/m.test(text)) return "bg";
  return null;
}

/**
 * 给每段对话的规矩：要动手干活时，先用一句话说你理解要做什么再动手。
 * 让用户一眼看到“它听懂了”，而不是空洞的“收到”。
 */
export const FIRST_LINE_RULE = `## 先接住用户
用户发来的事要动手做（要用工具、不止一两步）时，先用一句话说你理解要做什么、打算怎么做，然后再动手；这句话要具体，不要只说“收到”“好的”。
简单的问题、闲聊、一句话能答完的，直接回答，不要先铺垫。`;
