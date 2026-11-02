// 收发室的 ACP 适配器：接 Claude Code、Codex 这类本机编码 agent。
// ACP（Agent Client Protocol）是 stdin/stdout 上的 JSON-RPC：Kiki 当“编辑器”那一方，
// 起一个 agent 进程，initialize → 每件活开一个新会话 session/new → session/prompt，
// 边做边收 session/update 里的文字，做完把整段回答当成回音交给收发室。
// 对方要权限（session/request_permission）时，按 Kiki 的审批规则判断：只有删除、强推、对外发送、花钱这几类问你，别的直接同意。
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { classify } from "./approval.js";
import { findBin } from "./mcp.js";
import type { AdapterContext, AgentConfig, AgentStatus, ExternalAgent, Incoming, Outgoing } from "./postroom.js";
import { expand } from "./postroom.js";

/** 预置：先找装好的命令，找不到用 npx 现拉官方的 ACP 适配包。 */
export const ACP_PRESETS: Record<string, { bins: string[]; npx: string }> = {
  "claude-code": { bins: ["claude-agent-acp", "claude-code-acp"], npx: "@agentclientprotocol/claude-agent-acp" },
  codex: { bins: ["codex-acp"], npx: "@agentclientprotocol/codex-acp" },
};

export function resolveCommand(cfg: AgentConfig): { command: string; args: string[] } {
  if (cfg.command) return { command: cfg.command.startsWith("~") ? expand(cfg.command) : cfg.command, args: (cfg.args ?? []).map(String) };
  const p = ACP_PRESETS[cfg.preset ?? ""];
  if (!p) throw new Error(`ACP 要写 preset（${Object.keys(ACP_PRESETS).join(" 或 ")}）或 command`);
  for (const b of p.bins) {
    const hit = findBin(b);
    if (hit) return { command: hit, args: [] };
  }
  const npx = findBin("npx");
  if (!npx) throw new Error(`没找到 ${p.bins[0]}，也没有 npx。先装 Node（brew install node）或 npm i -g ${p.npx}`);
  return { command: npx, args: ["-y", p.npx] };
}

interface Job {
  title: string;
  origin?: string;
  chunks: string[];
}

/** 一个 ACP agent 进程。进程按需启动，挂了下次派活再起。 */
export class AcpAgent implements ExternalAgent {
  readonly kind = "acp";
  private proc?: ChildProcess;
  private ready?: Promise<void>;
  private seq = 0;
  private calls = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>();
  private jobs = new Map<string, Job>(); // sessionId -> 正在做的活
  private sessions = new Map<string, string>(); // 派活编号 -> sessionId
  private done: Incoming[] = [];
  private lastError?: string;
  private cwd: string;

  constructor(
    readonly name: string,
    private cfg: AgentConfig,
    private ctx: AdapterContext,
    private launch: (cmd: string, args: string[], cwd: string) => ChildProcess = defaultLaunch,
  ) {
    this.cwd = cfg.cwd ? expand(cfg.cwd) : join(ctx.root, "acp", name); // 不写就给它一个自己的空文件夹，别在你的家目录里乱改
    mkdirSync(this.cwd, { recursive: true });
  }

  async status(): Promise<AgentStatus> {
    if (this.jobs.size) return { state: "working", note: `${this.jobs.size} 件在做` };
    if (this.lastError) return { state: "error", note: this.lastError };
    return { state: "idle", note: this.proc ? undefined : "派活时再启动" };
  }

  async dispatch(t: Outgoing) {
    await this.start();
    const { sessionId } = await this.call("session/new", { cwd: this.cwd, mcpServers: [] });
    this.jobs.set(sessionId, { title: t.title, origin: t.origin, chunks: [] });
    this.sessions.set(t.id, sessionId);
    // 不等它做完：长活可能几十分钟，做完在 collect 里交回去
    this.call("session/prompt", { sessionId, prompt: [{ type: "text", text: t.from ? `（来自 Kiki · ${t.from}）\n${t.text}` : t.text }] })
      .then((r) => this.finish(sessionId, t.id, r?.stopReason))
      .catch((e) => this.finish(sessionId, t.id, "error", (e as Error).message));
  }

  private finish(sessionId: string, id: string, stop?: string, err?: string) {
    const job = this.jobs.get(sessionId);
    this.jobs.delete(sessionId);
    this.sessions.delete(id);
    const text = job?.chunks.join("").trim() ?? "";
    const why = err ? `（出错：${err}）\n` : stop && stop !== "end_turn" ? `（停下原因：${stop}）\n` : "";
    this.done.push({ id: `${id}-r`, re: id, title: job?.title, text: why + (text || "（没有文字回答）"), attention: !!err || undefined });
    this.ctx.wake(); // 做完马上交回，不等下一轮巡视
  }

  async cancel(id: string) {
    const sessionId = this.sessions.get(id);
    if (sessionId) this.send({ method: "session/cancel", params: { sessionId } }); // 通知，不用等回
  }

  async collect(): Promise<Incoming[]> {
    const out = this.done;
    this.done = [];
    return out;
  }

  close() {
    this.proc?.kill();
    this.proc = undefined;
    this.ready = undefined;
  }

  // ---------- JSON-RPC ----------

  private start(): Promise<void> {
    if (this.ready && this.proc && this.proc.exitCode === null) return this.ready;
    const { command, args } = resolveCommand(this.cfg);
    const proc = this.launch(command, args, this.cwd);
    this.proc = proc;
    let buf = "";
    proc.stdout!.setEncoding("utf8");
    proc.stdout!.on("data", (d: string) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) this.onLine(line);
      }
    });
    let errTail = "";
    proc.stderr?.on("data", (d) => (errTail = (errTail + String(d)).slice(-500)));
    const gone = (why: string) => {
      if (this.proc !== proc) return;
      this.proc = undefined;
      this.ready = undefined;
      this.lastError = why;
      for (const c of this.calls.values()) c.fail(new Error(why));
      this.calls.clear();
    };
    proc.on("error", (e) => gone(`启动失败：${e.message}`));
    proc.on("exit", (code) => gone(`进程退出了（${code}）${errTail ? `：${errTail.trim().split("\n").pop()}` : ""}`));
    this.ready = this.call("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, // 让它用自己的工具读写文件、跑命令
    }).then(() => {
      this.lastError = undefined;
    });
    return this.ready;
  }

  private send(msg: object) {
    this.proc?.stdin?.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  }

  private call(method: string, params: unknown): Promise<any> {
    const id = ++this.seq;
    return new Promise((ok, fail) => {
      this.calls.set(id, { ok, fail });
      this.send({ id, method, params });
    });
  }

  private onLine(line: string) {
    let m: any;
    try {
      m = JSON.parse(line);
    } catch {
      return; // 不是 JSON 的输出（日志）跳过
    }
    if (m.method && m.id !== undefined) return void this.onRequest(m);
    if (m.method === "session/update") {
      const u = m.params?.update;
      const job = this.jobs.get(m.params?.sessionId);
      if (job && u?.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") job.chunks.push(u.content.text);
      return;
    }
    const c = m.id !== undefined ? this.calls.get(m.id) : undefined;
    if (!c) return;
    this.calls.delete(m.id);
    if (m.error) c.fail(new Error(m.error.message ?? JSON.stringify(m.error)));
    else c.ok(m.result);
  }

  /** 对方发来的请求：只认要权限这一个，别的（读写文件、终端）没开放，回“不支持”。 */
  private async onRequest(m: any) {
    if (m.method !== "session/request_permission") return this.send({ id: m.id, error: { code: -32601, message: "Kiki 没开放这个能力" } });
    const p = m.params ?? {};
    const options: any[] = Array.isArray(p.options) ? p.options : [];
    const pick = (kinds: string[]) => options.find((o) => kinds.includes(o.kind))?.optionId;
    let ok = true;
    try {
      ok = await this.allowed(p);
    } catch {
      ok = false;
    }
    const optionId = ok ? pick(["allow_once", "allow_always"]) : pick(["reject_once", "reject_always"]);
    this.send({ id: m.id, result: { outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" } } });
  }

  /** 和 Kiki 自己的对话一样的规则：命令过一遍 cc-safety-net，删除类先问，别的直接做。 */
  private async allowed(p: any): Promise<boolean> {
    const tc = p.toolCall ?? {};
    const raw = tc.rawInput ?? {};
    const command = typeof raw.command === "string" ? raw.command : Array.isArray(raw.command) ? raw.command.join(" ") : undefined;
    const job = this.jobs.get(p.sessionId);
    const dataDir = dirname(this.ctx.root);
    const hit = command
      ? await classify(dataDir, "bash", { command }, this.cwd)
      : tc.kind === "delete"
        ? { category: "delete" as const, key: `acp:${this.name}:delete`, label: `永久删除：${this.name} 删文件` }
        : undefined;
    if (!hit) return true;
    return this.ctx.approve({
      agent: this.name,
      origin: job?.origin,
      ...hit,
      detail: `${this.name}：${String(tc.title ?? "")}\n${command ?? JSON.stringify(raw, null, 2)}`.slice(0, 2000),
    });
  }
}

function defaultLaunch(command: string, args: string[], cwd: string): ChildProcess {
  return spawn(command, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PATH: [dirname(process.execPath), process.env.PATH ?? "", "/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local", "bin")].join(delimiter) },
  });
}
