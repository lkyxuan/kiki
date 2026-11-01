// 路由器：只做分诊和转发，不亲自干活。
// 第一层（接到哪段对话）：自动判断，见 route.ts；也可以用 @宝名、/new、/use、/to 手动指定。
// 第二层（聊还是后台干）：路由顺带给建议，/bg 强制后台。
import { briefMessage, type HandoffRequest } from "./handoff.js";
import type { Registry, SessionRecord } from "./registry.js";
import { MemoryTaskStore, STATUS_LABEL, type Task, Tasks, type TaskStore } from "./tasks.js";
import { buildRouteInput, buildRouteSystem, type Decision, parseDecision, type RouteCandidate } from "./route.js";

/** 路由器对 pi 那一层的全部要求，测试时可以换成假的。 */
export interface AgentBackend {
  listAgents(): string[];
  exists(agent: string): boolean;
  create(agent: string, name: string): Promise<string>;
  /** 从已有对话分叉（带上下文） */
  fork(agent: string, fromPath: string, name: string): Promise<string>;
  send(agent: string, path: string, text: string): Promise<string>;
  isBusy(path: string): boolean;
  /** 一次性问模型（不进对话），路由用 */
  complete(system: string, user: string): Promise<string>;
  /** 这个宝负责什么，一句话 */
  describe(agent: string): string;
  /** 这段对话里用户最近说的几句（给路由看） */
  recent(path: string, n: number): string[];
  /** 往对话末尾记一条消息，不触发回答（后台任务回报用） */
  note(agent: string, path: string, text: string): Promise<void>;
  /** 通知界面这段对话有了一条完整回答（可选） */
  announce?(path: string, text: string): void;
  abort?(path: string): Promise<void>;
}

type Reply = (text: string) => Promise<void>;

const HELP = `我是 Kiki。直接说话，我会判断该接进哪段对话，或者新开一段。
@宝名 <话>           指定交给哪个宝
/to <宝/对话 | 宝 名字> 刚才那句分错了，改投到别处
/new <agent> <名字>  新开一段对话并切过去
/use <名字>          切到已有对话（重名时写 agent/名字）
/list [agent]        看有哪些对话
/bg <任务>           在后台新开一段对话去做，做完回报到这里
/tasks [all]         看后台任务（默认只看没做完的和最近 10 个）
/retry <任务id>      重跑失败或中断的任务
/agents              看有哪些 agent
/where               当前在哪段对话`;

export class Router {
  readonly tasks: Tasks;
  /** 分派规则（用户可改的 Markdown），每次路由现读，改完不用重启。main.ts 里接到 ~/kiki-data/分派规则.md。 */
  rules: () => string = () => "判断完就直接做，做完告诉用户。";

  constructor(
    private agents: AgentBackend,
    private registry: Registry,
    private defaultAgent: string,
    store: TaskStore = new MemoryTaskStore(),
    taskOpts: { concurrency?: number; timeoutMs?: number } = {},
  ) {
    this.tasks = new Tasks(
      store,
      {
        // 有原对话就分叉它（后台看得到前面讨论的内容），没有就开一段新的
        spawn: async (agent, title, from) => {
          let name = `bg-${title}`;
          for (let i = 2; this.registry.get(agent, name); i++) name = `bg-${title}${i}`;
          const rec = from ? await this.forkSession(agent, from, name) : await this.newSession(agent, name, true);
          return rec.path;
        },
        send: (agent, path, text) => this.agents.send(agent, path, text),
        abort: this.agents.abort ? (path) => this.agents.abort!(path) : undefined,
        note: async (path, text) => {
          const rec = this.registry.byPath(path);
          if (rec) await this.agents.note(rec.agent, path, text);
        },
      },
      taskOpts,
    );
  }

  private locks = new Map<string, Promise<void>>(); // 同一个聊天的消息按顺序路由

  async handle(chatId: string, text: string, reply: Reply): Promise<void> {
    const t = text.trim();
    if (!t.startsWith("/")) {
      // 路由要等模型，期间用户可能又发了一句；排队，保证先发的先进对话、后一句能看到前一句选的去处。
      // 锁只管到"消息排进对话队列"为止，不等回答，不同对话之间不互相拖慢。
      const prev = this.locks.get(chatId) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const mine = prev.then(() => gate);
      this.locks.set(chatId, mine);
      await prev;
      try {
        return await this.chat(chatId, t, reply, release);
      } finally {
        release();
        if (this.locks.get(chatId) === mine) this.locks.delete(chatId);
      }
    }

    const [cmdRaw, ...args] = t.split(/\s+/);
    const cmd = cmdRaw;
    switch (cmd) {
      case "/start":
      case "/help":
        return reply(HELP);
      case "/agents":
        return reply(`agent：${this.agents.listAgents().join("、") || "（还没有，去数据目录 agents/ 下建文件夹）"}`);
      case "/where": {
        const cur = this.registry.current(chatId);
        return reply(cur ? `当前：${label(cur)}` : "还没选对话，直接说话会进默认对话。");
      }
      case "/new":
        return this.cmdNew(chatId, args, reply);
      case "/use":
        return this.cmdUse(chatId, args.join(" "), reply);
      case "/list":
        return this.cmdList(chatId, args[0], reply);
      case "/to":
        return this.cmdTo(chatId, args, reply);
      case "/bg":
        return this.cmdBg(chatId, t.slice(cmdRaw.length).trim(), reply);
      case "/tasks":
        return this.cmdTasks(args[0] === "all", reply);
      case "/retry": {
        const old = this.tasks.get(args[0] ?? "");
        if (!old) return reply("用法：/retry <任务id>，id 用 /tasks 看。");
        const t = this.tasks.retry(old.id, this.notifier(reply));
        return reply(t ? `好，重新开始：「${t.title}」（任务 ${t.id}）` : "这个任务还在跑，不用重跑。");
      }
      default:
        return reply(`不认识 ${cmd}。\n\n${HELP}`);
    }
  }

  private last = new Map<string, string>(); // 每个聊天上一句路由过的话，给 /to 改投用

  private async chat(chatId: string, text: string, reply: Reply, release: () => void = () => {}) {
    // @宝名 开头：只在这个宝下面选
    let onlyAgent: string | undefined;
    const at = text.match(/^@(\S+)\s+([\s\S]+)$/);
    if (at && this.agents.exists(at[1])) {
      onlyAgent = at[1];
      text = at[2].trim();
    }
    // 不出选择题：模型自己挑最合适的地方，分错了用 /to 改投
    const d = await this.decide(chatId, text, onlyAgent);
    return this.deliver(chatId, text, d, reply, release);
  }

  /** 让便宜模型判断去处；模型不可用或答得不像样，就退回"当前对话 / 默认对话"。 */
  private async decide(chatId: string, text: string, onlyAgent?: string): Promise<Decision> {
    const cur = this.registry.current(chatId);
    const fallback = (): Decision => {
      if (cur && (!onlyAgent || cur.agent === onlyAgent)) return { action: "continue", target: label(cur), mode: "chat" };
      const agent = onlyAgent ?? this.defaultAgent;
      return this.registry.get(agent, "默认")
        ? { action: "continue", target: `${agent}/默认`, mode: "chat" }
        : { action: "new", agent, name: "默认", mode: "chat" };
    };
    const agents = this.agents.listAgents();
    const candidates: RouteCandidate[] = agents.map((agent) => ({
      agent,
      desc: this.agents.describe(agent),
      sessions: this.registry
        .list(agent)
        .filter((s, i, all) => i >= all.length - 20 || s.path === cur?.path) // 每个宝只看最近 20 段，但当前对话一定在
        .map((s) => ({ label: label(s), recent: this.agents.recent(s.path, 2), background: s.background })),
    }));
    const targets = candidates.flatMap((c) => c.sessions.map((s) => s.label));
    try {
      const raw = await this.agents.complete(
        buildRouteSystem(this.rules()),
        buildRouteInput({ text, candidates, current: cur ? label(cur) : undefined, onlyAgent }),
      );
      const d = parseDecision(raw, { agents: onlyAgent ? [onlyAgent] : agents, targets: onlyAgent ? targets.filter((t) => t.startsWith(`${onlyAgent}/`)) : targets });
      if (d) return d;
      console.warn("[route] 模型输出看不懂，用默认去处：", raw.slice(0, 200));
    } catch (e) {
      console.warn("[route] 路由模型出错，用默认去处：", (e as Error).message);
    }
    return fallback();
  }

  /** 按决定把这句话送进对话，回执 + 回答一起回给用户。 */
  private async deliver(chatId: string, text: string, d: Decision, reply: Reply, release: () => void = () => {}) {
    this.last.set(chatId, text);
    if (d.mode === "background") {
      // 接着某段对话派的活：分叉那段对话去后台做（带着前面的讨论），结果也回报到那段对话；
      // 新话题直接开任务，不再多开一段空对话
      const origin = d.action === "continue" ? this.registry.find(d.target)[0] : undefined;
      const agent = origin?.agent ?? (d.action === "new" ? d.agent : this.defaultAgent);
      const title = d.taskTitle ?? (d.action === "new" ? d.name : stamp());
      release();
      return this.runBackground(chatId, agent, text, title, origin, reply);
    }
    let rec: SessionRecord;
    let how: string;
    if (d.action === "continue") {
      rec = this.registry.find(d.target)[0];
      how = "接着聊";
    } else {
      let name = d.name;
      for (let i = 2; this.registry.get(d.agent, name); i++) name = `${d.name}${i}`; // 防重名
      rec = await this.newSession(d.agent, name);
      how = "新开";
    }
    this.registry.setCurrent(chatId, rec.path);
    const pending = this.agents.send(rec.agent, rec.path, text); // 已排进对话队列
    release();
    const answer = await pending;
    await reply(`→ ${label(rec)} · ${how}\n\n${answer}`);
  }

  /** /to：上一句分错了，改投到别处。参数是"宝/对话名"，或"宝 新对话名"。 */
  private async cmdTo(chatId: string, args: string[], reply: Reply) {
    const text = this.last.get(chatId);
    if (!text) return reply("还没有可以改投的话。");
    if (args.length === 0) return reply("用法：/to 宝/对话名，或 /to 宝 新对话名");
    if (args[0].includes("/")) {
      const hits = this.registry.find(args.join(" "));
      if (hits.length !== 1) return reply(hits.length ? "有重名，请写全 宝/对话名。" : `没找到「${args.join(" ")}」。`);
      return this.deliver(chatId, text, { action: "continue", target: label(hits[0]), mode: "chat" }, reply);
    }
    const [agent, ...rest] = args;
    if (!this.agents.exists(agent)) return reply(`没有宝「${agent}」。`);
    return this.deliver(chatId, text, { action: "new", agent, name: rest.join(" ") || stamp(), mode: "chat" }, reply);
  }

  private async cmdNew(chatId: string, args: string[], reply: Reply) {
    const [agent, ...nameParts] = args;
    if (!agent) return reply("用法：/new <agent> <名字>，比如 /new dev 路由器");
    if (!this.agents.exists(agent)) return reply(`没有 agent「${agent}」。现有：${this.agents.listAgents().join("、")}`);
    const name = nameParts.join(" ") || stamp();
    if (this.registry.get(agent, name)) return reply(`${agent}/${name} 已经有了，用 /use ${agent}/${name} 切过去。`);
    const rec = await this.newSession(agent, name);
    this.registry.setCurrent(chatId, rec.path);
    return reply(`已新建并切到 ${label(rec)}`);
  }

  private async cmdUse(chatId: string, query: string, reply: Reply) {
    if (!query) return reply("用法：/use <名字> 或 /use <agent>/<名字>");
    const hits = this.registry.find(query);
    if (hits.length === 0) return reply(`没找到「${query}」，用 /list 看看有哪些。`);
    if (hits.length > 1) return reply(`有重名：${hits.map(label).join("、")}，请写成 agent/名字。`);
    this.registry.setCurrent(chatId, hits[0].path);
    return reply(`已切到 ${label(hits[0])}`);
  }

  private async cmdList(chatId: string, agent: string | undefined, reply: Reply) {
    const all = this.registry.list(agent);
    if (all.length === 0) return reply("还没有对话。");
    const cur = this.registry.current(chatId)?.path;
    const lines = all.map((s) => {
      const marks = [s.path === cur ? "👉" : "  ", this.agents.isBusy(s.path) ? "⏳" : "", s.background ? "[后台]" : ""];
      return `${marks.join("")} ${label(s)}`;
    });
    return reply(lines.join("\n"));
  }

  /** /bg：强制后台。从当前对话派出，结果也回报到当前对话。 */
  private async cmdBg(chatId: string, task: string, reply: Reply) {
    if (!task) return reply("用法：/bg <任务>");
    const cur = this.registry.current(chatId);
    const title = task.replace(/\s+/g, " ").slice(0, 16);
    return this.runBackground(chatId, cur?.agent ?? this.defaultAgent, task, title, cur, reply);
  }

  /** 后台执行的唯一入口（/bg 和自动路由判成 background 都走这里），具体见 tasks.ts。 */
  private async runBackground(chatId: string, agent: string, task: string, title: string, origin: SessionRecord | undefined, reply: Reply) {
    const t = this.tasks.start({ agent, title, prompt: task, origin: origin?.path, chatId }, this.notifier(reply));
    const wait = t.status === "queued" ? "，前面还有任务在跑，排队中" : "";
    await reply(`→ ${agent} · 后台任务「${title}」\n\n好，已交给后台${wait}，做完我会回报${origin ? `到这里和 ${label(origin)}` : ""}。/tasks 看进度。`);
  }

  /** 任务做完/失败时回报到发起的聊天（收件箱）。 */
  private notifier(reply: Reply) {
    return (t: Task) => {
      const where = t.session ? this.registry.byPath(t.session) : undefined;
      const tag = where ? `（${label(where)}）` : "";
      if (t.status === "done") void reply(`✅ 后台任务「${t.title}」完成${tag}：\n\n${t.result}`);
      else if (t.status === "failed") void reply(`❌ 后台任务「${t.title}」失败${tag}：${t.result}\n想重跑：/retry ${t.id}`);
    };
  }

  private async cmdTasks(all: boolean, reply: Reply) {
    let list = this.tasks.list();
    if (!all) {
      const open = list.filter((t) => t.status === "queued" || t.status === "running");
      const recent = list.filter((t) => !open.includes(t)).slice(-10);
      list = [...open, ...recent];
    }
    if (list.length === 0) return reply("还没有后台任务。");
    return reply(list.map((t) => `[${STATUS_LABEL[t.status]}] ${t.title} · ${t.agent} · ${t.id}`).join("\n"));
  }

  /** 交接：对话里的 agent 调 kiki_handoff 时走这里。新对话的第一条消息就是交接说明。
   *  不等新对话回答（工具调用还卡在原对话里，等了会拖住原对话）。 */
  async handoff(req: HandoffRequest): Promise<string> {
    if (!this.agents.exists(req.bao)) throw new Error(`没有宝「${req.bao}」，可选：${this.agents.listAgents().join("、")}`);
    const base = req.name.replace(/[\/\n]/g, " ").trim().slice(0, 30) || stamp();
    const from = req.fromPath ? this.registry.byPath(req.fromPath) : undefined;
    const msg = briefMessage(from ? label(from) : undefined, req.brief, req.mode);

    if (req.mode === "background") {
      // 后台：按交接说明开一段干净的新对话去做（不分叉原对话，只带说明里的上下文），做完回报到原对话
      // reportTo：只回报、不分叉，存进任务文件，重启后 /retry 也会回报到原对话
      this.tasks.start({ agent: req.bao, title: base, prompt: msg, reportTo: from?.path, chatId: "handoff" });
      return `已交给后台任务「${base}」（${req.bao}），做完会回报到这段对话。`;
    }

    let name = base;
    for (let i = 2; this.registry.get(req.bao, name); i++) name = `${base}${i}`;
    const rec = await this.newSession(req.bao, name);
    this.agents
      .send(rec.agent, rec.path, msg)
      .then((r) => this.agents.announce?.(rec.path, r))
      .catch((e) => this.agents.announce?.(rec.path, `出错了：${(e as Error).message}`));
    return `已交接到 ${label(rec)}，新对话已收到交接说明。用户在左边栏点「${name}」就能过去。`;
  }

  private async forkSession(agent: string, fromPath: string, name: string): Promise<SessionRecord> {
    const path = await this.agents.fork(agent, fromPath, name);
    const rec: SessionRecord = { agent, name, path, created: new Date().toISOString(), background: true };
    this.registry.add(rec);
    return rec;
  }

  async newSession(agent: string, name: string, background = false): Promise<SessionRecord> {
    const existing = this.registry.get(agent, name);
    if (existing) return existing;
    const path = await this.agents.create(agent, name);
    const rec: SessionRecord = { agent, name, path, created: new Date().toISOString(), background: background || undefined };
    this.registry.add(rec);
    return rec;
  }
}

const label = (s: SessionRecord) => `${s.agent}/${s.name}`;

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
