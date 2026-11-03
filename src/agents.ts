// pi 这一层：开对话、续对话、往对话里发一句话并拿回答。
// 每个 agent 是 DATA_DIR/agents/<名字>/ 一个文件夹，里面的 AGENTS.md 就是它的说明；
// DATA_DIR/AGENTS.md（关于我）在上级目录，pi 会自动一起读进来。
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, join } from "node:path";
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
import { explainError } from "./errors.js";
import { existsSync as fileExists, readFileSync as readText, writeFileSync as writeText } from "node:fs";
import { pickedIds, readPrefs } from "./modelprefs.js";
import { imageNames, imageNote, readImage, uploadsDir } from "./images.js";

/** 模型菜单里一项 */
export interface ModelChoice {
  spec: string; // provider/model
  name: string;
  image: boolean; // 能不能看图
  provider: string;
  providerName?: string;
}

/**
 * pi 的模型表说能看图、但 Kiki 当成只收文字的服务商。
 * DeepSeek 官方接口发图会报错；当成只收文字后，切回 DeepSeek 时前面聊过的图会被 pi 换成一句“这里有张图”，不会把对话弄坏。
 */
const TEXT_ONLY = new Set(["deepseek"]);
/** 不进模型菜单的服务商：openai-codex 是老入口，已被 openai 的 ChatGPT 登录取代。 */
const MENU_SKIP = new Set(["openai-codex"]);

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
  private gone = new Set<string>(); // 已删掉 / 清空的对话：排在后面的消息不再跑
  private labelCache?: Record<string, string>;

  constructor(
    private dataDir: string,
    private modelSpec: string, // "provider/model"，比如 deepseek/deepseek-flash；模型菜单可以换
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
    return TEXT_ONLY.has(m.provider) ? { ...m, input: m.input.filter((x) => x !== "image") } : m;
  }

  /** 看图模型（.env 的 VISION_MODEL）：当前模型看不了图时，先让它把图读成文字。没设就自动挑一个能看图的。 */
  visionSpec = process.env.VISION_MODEL || "";

  /** 现在实际用来看图的模型；一个能看图的都没有（比如还没登录 ChatGPT）返回 undefined。 */
  async visionChoice(list?: ModelChoice[]): Promise<ModelChoice | undefined> {
    const seeing = (list ?? (await this.modelChoices())).filter((c) => c.image);
    return seeing.find((c) => c.spec === this.visionSpec) ?? seeing.find((c) => c.provider === "openai") ?? seeing[0];
  }

  /** 现在的模型能不能直接看图 */
  async canSee(): Promise<boolean> {
    try {
      return (await this.model()).input.includes("image");
    } catch {
      return false;
    }
  }

  /** 让看图模型看一张图，回答 question。 */
  async look(name: string, question: string): Promise<string> {
    const img = readImage(this.dataDir, name);
    if (!img) throw new Error(`没有图片 ${name}`);
    const v = await this.visionChoice();
    if (!v) throw new Error("现在没有能看图的模型：在输入框旁的模型菜单里用 ChatGPT 订阅登录一下");
    const rt = await this.runtime;
    const msg: any = await rt.completeSimple(await this.model(v.spec), {
      messages: [{ role: "user", content: [{ type: "text", text: question }, img], timestamp: Date.now() } as any],
    });
    if (msg.stopReason === "error") throw new Error(msg.errorMessage ?? "看图模型出错");
    return (msg.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
  }

  /** 把图读成一段完整的文字描述（存在 uploads/<名字>.txt，同一张图只读一次）。 */
  private async describeImage(name: string): Promise<{ text: string; by: string }> {
    const cache = join(uploadsDir(this.dataDir), `${name}.txt`);
    const v = await this.visionChoice();
    if (fileExists(cache)) return { text: readText(cache, "utf8"), by: v?.name ?? "看图模型" };
    if (!v) return { text: "（没读成：现在没有能看图的模型，请用户在模型菜单里用 ChatGPT 订阅登录）", by: "Kiki" };
    try {
      const text = await this.look(
        name,
        "把这张图里能看到的东西完整、细致地写下来，用中文。包括所有文字（原样照抄）、代码、界面、数据和表格、物体、人物、布局、颜色和别的值得注意的细节。只写看到的，不要猜。",
      );
      writeText(cache, text);
      return { text, by: v.name };
    } catch (e) {
      return { text: `（没读成：${(e as Error).message}）`, by: v.name };
    }
  }

  /** pi 的模型运行时（登录 ChatGPT 用）。 */
  modelRuntime(): Promise<ModelRuntime> {
    return this.runtime;
  }

  /** 现在用的模型 */
  get currentModel() {
    return this.modelSpec;
  }

  /** 模型菜单：已经能用（有密钥或已登录）的模型，加上现在用的那个。 */
  async modelChoices(): Promise<ModelChoice[]> {
    const rt = await this.runtime;
    const codex = new Set(rt.getModels("openai-codex").map((m) => m.id)); // ChatGPT 订阅能用的那几个
    const list: ModelChoice[] = [];
    // 所有已经配好（填了密钥或登录了）的服务商的模型
    let avail: readonly any[] = [];
    try {
      avail = await rt.getAvailable();
    } catch {}
    // 设置里关掉的服务商不列；每家只列勾选的模型（见 modelprefs.ts）
    const prefs = readPrefs(this.dataDir);
    const usable = avail.filter(
      (m) => !MENU_SKIP.has(m.provider) && !(m.provider === "openai" && rt.isUsingOAuth("openai") && !codex.has(m.id)), // ChatGPT 订阅只列 Codex 那几个
    );
    const byProvider = new Map<string, string[]>();
    for (const m of usable) byProvider.set(m.provider, [...(byProvider.get(m.provider) ?? []), m.id]);
    const picked = new Map([...byProvider].map(([p, ids]) => [p, pickedIds(prefs, p, ids)]));
    for (const m of usable) {
      if (prefs.off.includes(m.provider)) continue;
      if (!picked.get(m.provider)!.has(m.id)) continue;
      list.push(this.choice(m));
    }
    const name = (id: string) => (rt.getProvider(id) as any)?.name ?? id;
    for (const c of list) c.providerName = name(c.provider);
    if (!list.some((c) => c.spec === this.modelSpec)) {
      try {
        list.unshift(this.choice(await this.model()));
      } catch {}
    }
    return list;
  }

  /** 设置页用：某家服务商能用的全部模型，标出哪些已勾选进菜单。 */
  async providerModels(provider: string): Promise<(ModelChoice & { checked: boolean })[]> {
    const rt = await this.runtime;
    const codex = new Set(rt.getModels("openai-codex").map((m) => m.id));
    const ms = rt.getModels(provider).filter((m) => !(provider === "openai" && rt.isUsingOAuth("openai") && !codex.has(m.id)));
    const picked = pickedIds(readPrefs(this.dataDir), provider, ms.map((m) => m.id));
    return ms.map((m) => ({ ...this.choice(m), checked: picked.has(m.id) }));
  }

  private choice(m: any): ModelChoice {
    return {
      spec: `${m.provider}/${m.id}`,
      name: m.name ?? m.id,
      image: !TEXT_ONLY.has(m.provider) && m.input.includes("image"),
      provider: m.provider,
    };
  }

  /** 换模型：之后所有对话（包括已经打开的）都用它。没登录 / 没密钥会报错。 */
  async useModel(spec: string) {
    const m = await this.model(spec);
    const rt = await this.runtime;
    if (!(await rt.checkAuth(m.provider))) throw new Error(`${m.provider} 还没登录或没填密钥`);
    this.modelSpec = spec;
    for (const s of this.live.values()) await s.setModel(m as any);
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
    if (this.gone.has(path)) throw new Error("这段对话已经删掉了");
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
      // 消息里的图片标记换成图片本身。现在的模型看不了图（比如 DeepSeek）时，
      // 先让看图模型把图读成文字附在后面；原图也照样存进对话，以后换成能看图的模型还看得到
      const names = imageNames(text);
      const images = names.map((n) => readImage(this.dataDir, n)).filter((x) => !!x);
      let msg = text;
      if (images.length && !(await this.canSee())) {
        this.emit("activity", { path, live: { since: Date.now(), status: "正在先看图…", steps: [] } });
        const read = await Promise.all(names.map(async (n) => ({ name: n, ...(await this.describeImage(n)) })));
        msg += imageNote(read, read[0]?.by ?? "看图模型");
      }
      await s.prompt(msg, images.length ? { images } : undefined).catch((e) => {
        throw new Error(explainError((e as Error).message));
      });
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

  /** 关掉一段对话：停下手上的活、放开内存，JSONL 挪进 数据目录/trash/<宝>/（不真删，需要时还能找回）。 */
  async discard(agent: string, path: string, name: string) {
    this.gone.add(path); // 先标记：排在队里的消息拿到会话前就会出错退出，不会重新打开
    const s = this.live.get(path);
    if (s) {
      await s.abort().catch(() => {});
      s.dispose();
    }
    this.live.delete(path);
    this.queues.delete(path);
    if (this.runs.delete(path)) this.emit("activity", { path, live: null });
    if (!existsSync(path)) return; // 还没回答过的对话，文件没写盘
    const dir = join(this.dataDir, "trash", agent);
    mkdirSync(dir, { recursive: true });
    const safe = name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
    // 带上原文件名（里面有 pi 给的唯一 id），同一秒删两段同名对话也不会互相覆盖
    renameSync(path, join(dir, `${trashStamp()}-${safe}-${basename(path)}`));
  }

  /** 往正在跑的对话里插一句话（pi 的 steer：这一步做完就看到）；没在跑就当普通的一句话发进去。改任务用。 */
  async steer(agent: string, path: string, text: string): Promise<void> {
    const s = this.live.get(path);
    if (s?.isStreaming) {
      await s.steer(text);
      return;
    }
    await this.send(agent, path, text);
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
    if (msg.stopReason === "error") throw new Error(explainError(msg.errorMessage ?? "模型出错"));
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
    if (m.stopReason === "error") return `出错了：${explainError(m.errorMessage ?? "未知错误")}`;
    const text = (m.content ?? [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return "（没有文字回答）";
}

/** 回收站文件名前缀，比如 20261102-103015 */
function trashStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
