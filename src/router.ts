// 路由器：只做分诊和转发，不亲自干活。
// 第一层（接到哪段对话）：自动判断，见 route.ts；也可以用 @宝名、/new、/use、/to 手动指定。
// 第二层（聊还是后台干）：路由顺带给建议，/bg 强制后台。
import type { Registry, SessionRecord } from "./registry.js";
import { buildRouteInput, type Decision, type Option, optionLabel, parseDecision, ROUTE_SYSTEM, type RouteCandidate } from "./route.js";

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
}

type Reply = (text: string) => Promise<void>;

const HELP = `我是 Kiki。直接说话，我会判断该接进哪段对话，或者新开一段。
@宝名 <话>           指定交给哪个宝
/to <宝/对话 | 宝 名字> 刚才那句分错了，改投到别处
/new <agent> <名字>  新开一段对话并切过去
/use <名字>          切到已有对话（重名时写 agent/名字）
/list [agent]        看有哪些对话
/bg <任务>           在后台新开一段对话去做，做完回报到这里
/agents              看有哪些 agent
/where               当前在哪段对话`;

export class Router {
  constructor(
    private agents: AgentBackend,
    private registry: Registry,
    private defaultAgent: string,
  ) {}

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
      default:
        return reply(`不认识 ${cmd}。\n\n${HELP}`);
    }
  }

  private pending = new Map<string, { text: string; options: Option[] }>(); // 拿不准时等用户选
  private last = new Map<string, string>(); // 每个聊天上一句路由过的话，给 /to 改投用

  private async chat(chatId: string, text: string, reply: Reply, release: () => void = () => {}) {
    // 1. 上一句拿不准，用户回了个数字
    const pend = this.pending.get(chatId);
    if (pend && /^[1-9]$/.test(text)) {
      const o = pend.options[Number(text) - 1];
      if (o) {
        this.pending.delete(chatId);
        const d: Decision = "target" in o
          ? { action: "continue", target: o.target, mode: "chat" }
          : { action: "new", agent: o.agent, name: o.name, mode: "chat" };
        return this.deliver(chatId, pend.text, d, reply, release);
      }
    }
    this.pending.delete(chatId);

    // 2. @宝名 开头：只在这个宝下面选
    let onlyAgent: string | undefined;
    const at = text.match(/^@(\S+)\s+([\s\S]+)$/);
    if (at && this.agents.exists(at[1])) {
      onlyAgent = at[1];
      text = at[2].trim();
    }

    // 3. 问模型
    const d = await this.decide(chatId, text, onlyAgent);
    if (d.action === "ask") {
      this.pending.set(chatId, { text, options: d.options });
      const opts = d.options.map((o, i) => `${i + 1}. ${optionLabel(o)}`).join("\n");
      release();
      return reply(`🤔 这句该放哪我拿不准${d.reason ? `（${d.reason}）` : ""}，回个数字：\n${opts}`);
    }
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
        ROUTE_SYSTEM,
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
  private async deliver(chatId: string, text: string, d: Exclude<Decision, { action: "ask" }>, reply: Reply, release: () => void = () => {}) {
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
    this.last.set(chatId, text);
    if (d.mode === "background") {
      // 接着某段对话去后台干：分叉那段对话，后台才看得到前面讨论过的内容
      const from = d.action === "continue" ? rec.path : undefined;
      release();
      return this.runBackground(chatId, rec.agent, text, d.taskTitle, reply, from);
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

  /** 照 OpenClaw 的 spawn + announce：开一段新对话在后台跑，做完把结果推回发起的聊天。 */
  private async cmdBg(chatId: string, task: string, reply: Reply) {
    if (!task) return reply("用法：/bg <任务>");
    const agent = this.registry.current(chatId)?.agent ?? this.defaultAgent;
    return this.runBackground(chatId, agent, task, undefined, reply);
  }

  /** 后台执行的唯一入口（/bg 和自动路由判成 background 都走这里）。
   *  照 OpenClaw 的 spawn + announce：开一段新对话在后台跑，做完把结果推回发起的聊天。
   *  以后换成 tasks.start(...) 只改这里。 */
  private async runBackground(chatId: string, agent: string, task: string, title: string | undefined, reply: Reply, fromPath?: string) {
    let name = title ? `bg-${title}` : `bg-${stamp()}`;
    for (let i = 2; this.registry.get(agent, name); i++) name = `${title ? `bg-${title}` : `bg-${stamp()}`}${i}`;
    const rec = fromPath ? await this.forkSession(agent, fromPath, name) : await this.newSession(agent, name, true);
    await reply(`→ ${label(rec)} · 后台\n\n好，已在后台开始，做完我会回报。想插话可以 /use ${label(rec)}。`);
    // 不等它，路由器马上能接下一句
    this.agents
      .send(agent, rec.path, task)
      .then((answer) => reply(`✅ 后台任务 ${label(rec)} 完成：\n\n${answer}`))
      .catch((e) => reply(`❌ 后台任务 ${label(rec)} 失败：${(e as Error).message}`));
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
