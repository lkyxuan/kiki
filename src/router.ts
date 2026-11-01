// 路由器：只做分诊和转发，不亲自干活。
// 第一层（接到哪段对话）v0 先手动：/new /use；第二层（聊还是后台干）用 /bg。
import type { Registry, SessionRecord } from "./registry.js";

/** 路由器对 pi 那一层的全部要求，测试时可以换成假的。 */
export interface AgentBackend {
  listAgents(): string[];
  exists(agent: string): boolean;
  create(agent: string, name: string): Promise<string>;
  send(agent: string, path: string, text: string): Promise<string>;
  isBusy(path: string): boolean;
}

type Reply = (text: string) => Promise<void>;

const HELP = `我是 Kiki。直接说话就会接进当前对话。
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

  async handle(chatId: string, text: string, reply: Reply): Promise<void> {
    const t = text.trim();
    if (!t.startsWith("/")) return this.chat(chatId, t, reply);

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
      case "/bg":
        return this.cmdBg(chatId, t.slice(cmdRaw.length).trim(), reply);
      default:
        return reply(`不认识 ${cmd}。\n\n${HELP}`);
    }
  }

  private async chat(chatId: string, text: string, reply: Reply) {
    let cur = this.registry.current(chatId);
    if (!cur) cur = await this.newSession(this.defaultAgent, "默认");
    this.registry.setCurrent(chatId, cur.path);
    const answer = await this.agents.send(cur.agent, cur.path, text);
    await reply(`【${label(cur)}】\n${answer}`);
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
    const name = `bg-${stamp()}`;
    const rec = await this.newSession(agent, name, true);
    await reply(`好，已在后台开始：${label(rec)}。做完我会回报，想插话可以 /use ${agent}/${name}。`);
    // 不等它，路由器马上能接下一句
    this.agents
      .send(agent, rec.path, task)
      .then((answer) => reply(`✅ 后台任务 ${label(rec)} 完成：\n\n${answer}`))
      .catch((e) => reply(`❌ 后台任务 ${label(rec)} 失败：${(e as Error).message}`));
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
