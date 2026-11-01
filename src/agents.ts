// pi 这一层：开对话、续对话、往对话里发一句话并拿回答。
// 每个 agent 是 DATA_DIR/agents/<名字>/ 一个文件夹，里面的 AGENTS.md 就是它的说明；
// DATA_DIR/AGENTS.md（关于我）在上级目录，pi 会自动一起读进来。
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentSession,
  type ToolDefinition,
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
  private runtime: Promise<ModelRuntime>;
  /** Kiki 自己的 pi 配置目录（设置、密钥、模型、扩展、技能），和用户自己装的 pi（~/.pi）完全分开。 */
  readonly engineDir: string;
  /** Kiki 给对话里的 agent 额外提供的工具（比如交接），由 main.ts 注入。 */
  toolsFor?: (agent: string) => ToolDefinition[];
  private live = new Map<string, AgentSession>(); // path -> 已打开的对话
  private queues = new Map<string, Promise<unknown>>(); // path -> 排队，同一段对话一次只跑一句

  constructor(
    private dataDir: string,
    private modelSpec: string, // "provider/model"，比如 deepseek/deepseek-flash
  ) {
    super();
    this.engineDir = join(dataDir, "engine");
    mkdirSync(this.engineDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = this.engineDir; // 兜底：pi 内部任何地方取默认目录都落到这里
    this.runtime = ModelRuntime.create({
      authPath: join(this.engineDir, "auth.json"),
      modelsPath: join(this.engineDir, "models.json"),
    });
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

  private async model(spec = this.modelSpec) {
    const [provider, ...rest] = spec.split("/");
    const m = (await this.runtime).getModel(provider, rest.join("/"));
    if (!m) throw new Error(`找不到模型 ${spec}`);
    return m;
  }

  private async open(agent: string, sm: SessionManager): Promise<AgentSession> {
    const cwd = this.agentDir(agent);
    const { session } = await createAgentSession({
      cwd,
      agentDir: this.engineDir,
      sessionManager: sm,
      model: await this.model(),
      thinkingLevel: "off",
      modelRuntime: await this.runtime,
      customTools: this.toolsFor?.(agent) ?? [],
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

  /** 从已有对话分叉出一段新对话（带上原对话的全部上下文），后台接着做时用。 */
  async fork(agent: string, fromPath: string, name: string): Promise<string> {
    const dir = this.agentDir(agent);
    const sessionsDir = join(dir, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    await this.queues.get(fromPath)?.catch(() => {}); // 等原对话手上那句做完，免得分叉到一半
    const session = await this.open(agent, SessionManager.forkFrom(fromPath, dir, sessionsDir));
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

  /** 往对话末尾记一条消息（显示出来、下次回答时模型也能看到），不触发回答。后台任务回报用。 */
  note(agent: string, path: string, text: string): Promise<void> {
    const prev = this.queues.get(path) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const s = await this.get(agent, path);
      await s.sendCustomMessage({ customType: "kiki-task", content: text, display: true }, { triggerTurn: false });
      this.emit("message", { path, role: "assistant", text });
    });
    this.queues.set(path, run);
    return run;
  }

  /** 停掉正在跑的对话（后台任务超时用）。 */
  async abort(path: string) {
    await this.live.get(path)?.abort();
  }

  /** 一次性问模型一句话（不进任何对话），路由用。 */
  async complete(system: string, user: string, spec?: string): Promise<string> {
    const rt = await this.runtime;
    const msg: any = await rt.completeSimple(await this.model(spec), {
      systemPrompt: system,
      messages: [{ role: "user", content: user, timestamp: Date.now() }],
    });
    if (msg.stopReason === "error") throw new Error(msg.errorMessage ?? "模型出错");
    return (msg.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
  }

  /** 这个宝是干什么的：取 AGENTS.md 里"我负责什么"下面那段，没有就取标题。 */
  describe(agent: string): string {
    const f = join(this.agentDir(agent), "AGENTS.md");
    if (!existsSync(f)) return "";
    const md = readFileSync(f, "utf8");
    const duty = md.match(/##\s*我负责什么\s*\n+([^\n#][^\n]*)/);
    if (duty) return duty[1].trim();
    return (md.match(/^#\s*(.+)$/m)?.[1] ?? "").trim();
  }

  isBusy(path: string) {
    return this.live.get(path)?.isStreaming ?? false;
  }

  /** 用户在这段对话里最近说的 n 句，每句截到 60 字（路由用）。 */
  recent(path: string, n: number): string[] {
    return this.history(path)
      .filter((l) => l.role === "user")
      .slice(-n)
      .map((l) => l.text.replace(/\s+/g, " ").slice(0, 60));
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
        .filter((e) => e.type === "message" || e.type === "custom_message")
        .map((e) => (e.type === "message" ? e.message : { role: "custom", content: e.content }));
    else return [];
    const out: ChatLine[] = [];
    for (const m of msgs) {
      if (m.role !== "user" && m.role !== "assistant" && m.role !== "custom") continue;
      const role: ChatLine["role"] = m.role === "user" ? "user" : "assistant"; // 后台任务回报按助手消息显示
      const text =
        typeof m.content === "string"
          ? m.content
          : (m.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      if (text.trim()) out.push({ role, text: text.trim() });
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
