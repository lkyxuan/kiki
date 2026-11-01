// pi 这一层：开对话、续对话、往对话里发一句话并拿回答。
// 每个 agent 是 DATA_DIR/agents/<名字>/ 一个文件夹，里面的 AGENTS.md 就是它的说明；
// DATA_DIR/AGENTS.md（关于我）在上级目录，pi 会自动一起读进来。
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentSession,
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

export interface ChatLine {
  role: "user" | "assistant";
  text: string;
}

/** 事件：delta {path, text} 流式文字；busy {path, busy} 开始/结束干活。网页靠它实时刷新。 */
export class Agents extends EventEmitter {
  private runtime: Promise<ModelRuntime> = ModelRuntime.create(); // 读 ~/.pi/agent 里的密钥和模型配置
  private live = new Map<string, AgentSession>(); // path -> 已打开的对话
  private queues = new Map<string, Promise<unknown>>(); // path -> 排队，同一段对话一次只跑一句

  constructor(
    private dataDir: string,
    private modelSpec: string, // "provider/model"，比如 deepseek/deepseek-flash
  ) {
    super();
  }

  agentDir(agent: string) {
    return join(this.dataDir, "agents", agent);
  }

  listAgents(): string[] {
    const root = join(this.dataDir, "agents");
    if (!existsSync(root)) return [];
    return readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory());
  }

  exists(agent: string) {
    return existsSync(this.agentDir(agent));
  }

  private async model() {
    const [provider, ...rest] = this.modelSpec.split("/");
    const m = (await this.runtime).getModel(provider, rest.join("/"));
    if (!m) throw new Error(`找不到模型 ${this.modelSpec}`);
    return m;
  }

  private async open(agent: string, sm: SessionManager): Promise<AgentSession> {
    const cwd = this.agentDir(agent);
    const { session } = await createAgentSession({
      cwd,
      sessionManager: sm,
      model: await this.model(),
      thinkingLevel: "off",
      modelRuntime: await this.runtime,
    });
    return session;
  }

  private watch(path: string, s: AgentSession) {
    s.subscribe((ev: any) => {
      if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
        this.emit("delta", { path, text: ev.assistantMessageEvent.delta });
      } else if (ev.type === "agent_start") this.emit("busy", { path, busy: true });
      else if (ev.type === "agent_end") this.emit("busy", { path, busy: false });
    });
  }

  /** 新建一段具名对话，返回它的 JSONL 路径（文件在第一次有回答时才真正写盘）。 */
  async create(agent: string, name: string): Promise<string> {
    const sessionsDir = join(this.agentDir(agent), "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const session = await this.open(agent, SessionManager.create(this.agentDir(agent), sessionsDir));
    session.setSessionName(name);
    const path = session.sessionFile;
    if (!path) throw new Error("pi 没有给出对话文件路径");
    this.live.set(path, session);
    this.watch(path, session);
    return path;
  }

  private async get(agent: string, path: string): Promise<AgentSession> {
    let s = this.live.get(path);
    if (!s) {
      s = await this.open(agent, SessionManager.open(path));
      this.live.set(path, s);
      this.watch(path, s);
    }
    return s;
  }

  /** 往指定对话发一句话，等它做完，返回最后一条回答的文字。同一段对话里的消息按顺序排队。 */
  send(agent: string, path: string, text: string): Promise<string> {
    const prev = this.queues.get(path) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const s = await this.get(agent, path);
      await s.prompt(text);
      return lastReply(s);
    });
    this.queues.set(path, run);
    return run;
  }

  isBusy(path: string) {
    return this.live.get(path)?.isStreaming ?? false;
  }

  /** 一段对话里的聊天记录（只取文字，不含工具调用）。 */
  history(path: string): ChatLine[] {
    const live = this.live.get(path);
    let msgs: any[];
    if (live) msgs = live.messages as any[];
    else if (existsSync(path))
      msgs = readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .filter((e) => e.type === "message")
        .map((e) => e.message);
    else return [];
    const out: ChatLine[] = [];
    for (const m of msgs) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const text =
        typeof m.content === "string"
          ? m.content
          : (m.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      if (text.trim()) out.push({ role: m.role, text: text.trim() });
      else if (m.role === "assistant" && m.stopReason === "error") out.push({ role: "assistant", text: `出错了：${m.errorMessage ?? "未知错误"}` });
    }
    return out;
  }
}

function lastReply(s: AgentSession): string {
  const msgs = s.messages as any[];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "assistant") continue;
    if (m.stopReason === "error") return `出错了：${m.errorMessage ?? "未知错误"}`;
    const text = (m.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return "（没有文字回答）";
}
