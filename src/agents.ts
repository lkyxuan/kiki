// pi 这一层：开对话、续对话、往对话里发一句话并拿回答。
// 每个 agent 是 DATA_DIR/agents/<名字>/ 一个文件夹，里面的 AGENTS.md 就是它的说明；
// DATA_DIR/AGENTS.md（关于我）在上级目录，pi 会自动一起读进来。
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentSession,
  type ExtensionFactory,
  type ToolDefinition,
  createAgentSession,
  createCodemodeExtension,
  createMcpExtension,
  createToolSearchExtension,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { type Live, type Step, describeTool, stepsFromMessages } from "./activity.js";
import { baoFile, createBao } from "./bao.js";

export interface ChatLine {
  role: "user" | "assistant";
  text: string;
  steps?: Step[]; // 这条回答之前用过的工具（网页上折叠显示）
}

/**
 * 事件：delta {path, text} 流式文字；busy {path, busy} 开始/结束干活；
 * activity {path, live} 这一轮的进度（正在想 / 正在调用哪个工具 / 做过的步骤），live 为 null 表示做完了。
 * 网页靠它实时刷新。
 */
export class Agents extends EventEmitter {
  private runtime: Promise<ModelRuntime>;
  /** Kiki 自己的 pi 配置目录（设置、密钥、模型、扩展、技能），和用户自己装的 pi（~/.pi）完全分开。 */
  readonly engineDir: string;
  /** Kiki 给对话里的 agent 额外提供的工具（比如交接），由 main.ts 注入。 */
  toolsFor?: (agent: string) => ToolDefinition[];
  /** Kiki 自己的 pi 扩展（比如审批），由 main.ts 注入。 */
  extensions: ExtensionFactory[] = [];
  private live = new Map<string, AgentSession>(); // path -> 已打开的对话
  private queues = new Map<string, Promise<unknown>>(); // path -> 排队，同一段对话一次只跑一句
  private runs = new Map<string, Live>(); // path -> 正在干活的这一轮的进度
  private labelCache?: Record<string, string>;

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

  /** 新建一个宝（自动分派时没有合适的宝就建）。 */
  createBao(name: string, duty: string) {
    createBao(this.dataDir, name, duty);
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
    const settingsManager = SettingsManager.create(cwd, this.engineDir);
    // SDK 嵌入的会话默认不带 MCP，要自己加上（和 pi 命令行一样）：
    // MCP 读 engine/mcp.json（设置页「MCP 服务器」改的就是它）；codemode 和 tool_search 平时不启用，
    // 只有服务器设成 codemode / deferred 方式时 MCP 扩展才会打开它们。
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: this.engineDir,
      settingsManager,
      extensionFactories: [...this.extensions, createCodemodeExtension(), createToolSearchExtension(), createMcpExtension()],
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd,
      agentDir: this.engineDir,
      resourceLoader,
      settingsManager,
      sessionManager: sm,
      model: await this.model(),
      thinkingLevel: "off",
      modelRuntime: await this.runtime,
      customTools: this.toolsFor?.(agent) ?? [],
    });
    // 发 session_start：MCP 扩展在这时去连服务器（后台连，不挡着对话）
    await session.bindExtensions({});
    return session;
  }

  /** Kiki 自己工具的中文名（kiki_peek → 看别的对话），进度里显示用。 */
  private labels(): Record<string, string> {
    return (this.labelCache ??= Object.fromEntries((this.toolsFor?.("") ?? []).map((t) => [t.name, t.label])));
  }

  /** 正在干活的对话这一轮的进度；没在干活返回 undefined。 */
  progress(path: string): Live | undefined {
    return this.runs.get(path);
  }

  private watch(path: string, s: AgentSession) {
    const show = (status?: string) => {
      const run = this.runs.get(path);
      if (!run) return;
      if (status !== undefined) {
        if (status === run.status) return; // 没变就不用推
        run.status = status;
      }
      this.emit("activity", { path, live: run });
    };
    s.subscribe((ev: any) => {
      switch (ev.type) {
        case "agent_start":
          // 自动重试会再来一次 agent_start：接着用上一次的进度，别把做过的步骤清掉
          if (!this.runs.has(path)) this.runs.set(path, { since: Date.now(), status: "正在思考…", steps: [] });
          this.emit("busy", { path, busy: true });
          show();
          break;
        case "agent_end":
          if (ev.willRetry) break; // 马上会重试，先别说做完了
          this.runs.delete(path);
          this.emit("activity", { path, live: null });
          this.emit("busy", { path, busy: false });
          break;
        case "turn_start":
          show("正在思考…");
          break;
        case "message_update": {
          const t = ev.assistantMessageEvent?.type;
          if (t === "text_delta") this.emit("delta", { path, text: ev.assistantMessageEvent.delta });
          else if (t === "text_start") show("正在回答…");
          else if (t === "thinking_start") show("正在思考…");
          else if (t === "toolcall_start") show("正在准备下一步…");
          break;
        }
        case "tool_execution_start": {
          const run = this.runs.get(path);
          if (!run || ev.parentToolCallId) break; // 工具里再调的工具不单列
          const d = describeTool(ev.toolName, ev.args, this.labels());
          run.steps.push({ id: ev.toolCallId, ...d, status: "running" });
          if (run.steps.length > 50) run.steps.splice(0, run.steps.length - 50); // 只留最近 50 步
          show(`正在${d.title}…`);
          break;
        }
        case "tool_execution_end": {
          const run = this.runs.get(path);
          const step = run?.steps.find((x) => x.id === ev.toolCallId);
          if (!run || !step) break;
          step.status = ev.isError ? "error" : "done";
          step.ms = ev.durationMs;
          const still = run.steps.find((x) => x.status === "running");
          run.status = still ? `正在${still.title}…` : "正在思考…";
          show();
          break;
        }
        case "auto_retry_start":
          show(`模型没回应，${Math.max(1, Math.round(ev.delayMs / 1000))} 秒后重试（第 ${ev.attempt}/${ev.maxAttempts} 次）…`);
          break;
        case "compaction_start":
          show("对话太长了，正在整理前面的内容…");
          break;
        case "compaction_end":
          show("正在思考…");
          break;
      }
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

  /** 告诉网页某段对话有了一条完整的回答（不是经网页发出的消息，网页收不到结束信号，靠这个收尾）。 */
  announce(path: string, text: string) {
    this.emit("message", { path, role: "assistant", text });
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
    const f = baoFile(this.dataDir, agent);
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
    const steps = stepsFromMessages(msgs, this.labels());
    const out: ChatLine[] = [];
    for (const m of msgs) {
      if (m.role !== "user" && m.role !== "assistant" && m.role !== "custom") continue;
      const role: ChatLine["role"] = m.role === "user" ? "user" : "assistant"; // 后台任务回报按助手消息显示
      const text =
        typeof m.content === "string"
          ? m.content
          : (m.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
      if (text.trim()) out.push({ role, text: text.trim(), ...(steps.has(m) ? { steps: steps.get(m) } : {}) });
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
