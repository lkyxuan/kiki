// pi 这一层：开对话、续对话、往对话里发一句话并拿回答。
// 每个 agent 是 DATA_DIR/agents/<名字>/ 一个文件夹，里面的 AGENTS.md 就是它的说明；
// DATA_DIR/AGENTS.md（关于我）在上级目录，pi 会自动一起读进来。
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

export class Agents {
  private auth = AuthStorage.create();
  private models = ModelRegistry.create(this.auth);
  private live = new Map<string, AgentSession>(); // path -> 已打开的对话
  private queues = new Map<string, Promise<unknown>>(); // path -> 排队，同一段对话一次只跑一句

  constructor(
    private dataDir: string,
    private modelSpec: string, // "provider/model"，比如 deepseek/deepseek-v4-flash
  ) {}

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

  private model() {
    const [provider, ...rest] = this.modelSpec.split("/");
    const m = this.models.find(provider, rest.join("/"));
    if (!m) throw new Error(`找不到模型 ${this.modelSpec}`);
    return m;
  }

  private async open(agent: string, sm: SessionManager): Promise<AgentSession> {
    const cwd = this.agentDir(agent);
    const { session } = await createAgentSession({
      cwd,
      sessionManager: sm,
      model: this.model(),
      thinkingLevel: "off",
      authStorage: this.auth,
      modelRegistry: this.models,
    });
    return session;
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
    return path;
  }

  private async get(agent: string, path: string): Promise<AgentSession> {
    let s = this.live.get(path);
    if (!s) {
      s = await this.open(agent, SessionManager.open(path));
      this.live.set(path, s);
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
