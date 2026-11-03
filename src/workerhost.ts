// 后台任务的子程序（主程序这一头）。
//
// 每个后台任务单独起一个 Node 子程序跑它那段 pi 对话（对标 Hermes 看板的工人、Claude Code 桌面版的会话）：
// 一个任务卡死、内存涨爆或崩掉，不连累主程序和别的对话；停任务就是关掉那个子程序。
// 对话（奇奇、宝的主对话、讨论串）仍在主程序里。
//
// 子程序只管跑对话；需要主程序的事经 IPC 问回来：
//   - Kiki 自己的工具（kiki_task、kiki_ask_user、交接……）在主程序里执行，子程序里只有同名的代理；
//   - 审批卡片挂在主程序（第四列“等你点头”）；
//   - 进度、流式文字、忙/闲转给主程序的 Agents，网页照常实时刷新。
// 协议见 worker.ts 开头。
import { type ChildProcess, fork } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Live } from "./activity.js";

/** 工具在子程序里的样子：只有说明，执行转回主程序。 */
export interface ToolMeta {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
}

/** 子程序开哪段对话：已有的、新建一段、从别的对话分叉。 */
export type OpenSpec = { path: string } | { create: string } | { fork: { from: string; name: string } };

export interface WorkerHooks {
  tools(agent: string): ToolMeta[];
  /** 在主程序里执行 Kiki 的工具，返回 pi 的工具结果 */
  runTool(agent: string, name: string, params: unknown, path: string, cwd: string, toolCallId: string): Promise<unknown>;
  /** 审批：拦下返回原因 */
  approve(req: { toolName: string; input: unknown; cwd: string; path: string }, signal: AbortSignal): Promise<{ block: true; reason: string } | undefined>;
}

export interface WorkerInit {
  dataDir: string;
  model: string;
  agent: string;
  open: OpenSpec;
}

/**
 * 一个子程序 = 一段对话。事件：event(name, data) 转发子程序里 Agents 的 delta/busy/activity/message；exit。
 */
export class Worker extends EventEmitter {
  path?: string;
  busy = false;
  live?: Live;
  readonly ready: Promise<string>;
  private child: ChildProcess;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private asks = new Map<number, AbortController>(); // 子程序在等的审批
  private seq = 0;
  private exited = false;
  private killed = false;
  private exitWait: Promise<void>;

  constructor(script: string, init: WorkerInit, private hooks: WorkerHooks, execArgv: string[] = process.execArgv) {
    super();
    this.child = fork(script, [], {
      execArgv,
      env: process.env,
      serialization: "advanced",
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    let onReady!: (p: string) => void, onFail!: (e: Error) => void;
    this.ready = new Promise<string>((res, rej) => ((onReady = res), (onFail = rej)));
    this.ready.catch(() => {}); // 没人等也别报未处理
    this.exitWait = new Promise((res) => this.child.once("exit", () => res()));
    this.child.on("message", (m: any) => this.onMessage(m, onReady, onFail));
    this.child.once("error", (e) => console.warn(`[worker] 子程序出错：${e.message}`));
    this.child.once("exit", (code, signal) => {
      this.exited = true;
      const err = new Error(this.killed ? "已停下（关掉了后台程序）" : `后台程序意外退出（${signal ?? `退出码 ${code}`}）`);
      onFail(err);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      for (const c of this.asks.values()) c.abort();
      this.asks.clear();
      if (this.path && (this.busy || this.live)) {
        this.busy = false;
        this.live = undefined;
        this.emit("event", "activity", { path: this.path, live: null });
        this.emit("event", "busy", { path: this.path, busy: false });
      }
      this.emit("exit");
    });
    this.post({ t: "init", ...init, tools: hooks.tools(init.agent) });
  }

  get pid() {
    return this.child.pid;
  }

  get alive() {
    return !this.exited;
  }

  private post(m: object) {
    if (this.exited || !this.child.connected) return;
    this.child.send(m, (e) => e && console.warn(`[worker] 发给子程序失败：${e.message}`));
  }

  private call<T>(t: string, payload: object): Promise<T> {
    if (this.exited) return Promise.reject(new Error("后台程序已经关了"));
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ t, id, ...payload });
    });
  }

  private onMessage(m: any, onReady: (p: string) => void, onFail: (e: Error) => void) {
    switch (m?.t) {
      case "ready":
        this.path = m.path;
        onReady(m.path);
        break;
      case "init-fail":
        onFail(new Error(m.message));
        break;
      case "event":
        if (m.name === "busy") this.busy = !!m.data?.busy;
        if (m.name === "activity") this.live = m.data?.live ?? undefined;
        this.emit("event", m.name, m.data);
        break;
      case "reply":
      case "fail": {
        const p = this.pending.get(m.id);
        if (!p) break;
        this.pending.delete(m.id);
        if (m.t === "reply") p.resolve(m.text);
        else p.reject(new Error(m.message));
        break;
      }
      case "tool":
        this.hooks
          .runTool(m.agent, m.name, m.params, this.path ?? "", m.cwd ?? "", m.toolCallId)
          .catch((e) => ({ content: [{ type: "text", text: `出错了：${(e as Error).message}` }], details: undefined, isError: true }))
          .then((result) => this.post({ t: "tool-result", id: m.id, result }));
        break;
      case "approve": {
        const c = new AbortController();
        this.asks.set(m.id, c);
        this.hooks
          .approve({ toolName: m.toolName, input: m.input, cwd: m.cwd, path: this.path ?? "" }, c.signal)
          .catch(() => ({ block: true as const, reason: "审批出错了，这一步先不做。" }))
          .then((r) => {
            this.asks.delete(m.id);
            this.post({ t: "approve-result", id: m.id, ...(r ?? {}) });
          });
        break;
      }
      case "approve-cancel":
        this.asks.get(m.id)?.abort();
        break;
    }
  }

  /** 发一句话，等这一轮做完，返回最后一条回答的文字。 */
  send(text: string): Promise<string> {
    return this.call("send", { text });
  }

  /** 往正在跑的这一轮插一句话（没在跑就当普通的一句话）。 */
  steer(text: string): Promise<void> {
    return this.call("steer", { text });
  }

  /** 往对话末尾记一条消息，不触发回答。 */
  note(text: string): Promise<void> {
    return this.call("note", { text });
  }

  /** 做完了：让子程序自己收尾退出，5 秒没退就强关。 */
  async close(): Promise<void> {
    if (this.exited) return;
    this.post({ t: "exit" });
    const t = setTimeout(() => this.child.kill("SIGKILL"), 5000);
    t.unref();
    await this.exitWait;
    clearTimeout(t);
  }

  /** 停任务：关掉子程序（先 SIGTERM，3 秒没退就 SIGKILL）。 */
  async kill(): Promise<void> {
    if (this.exited) return;
    this.killed = true;
    this.child.kill("SIGTERM");
    const t = setTimeout(() => this.child.kill("SIGKILL"), 3000);
    t.unref();
    await this.exitWait;
    clearTimeout(t);
  }
}
