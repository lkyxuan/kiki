// 审批：收不回来的动作，做之前先问你一句。
//
// 功能都能用，审批不是禁掉功能。只有四类动作默认“先问”：永久删除、强推覆盖、对外发送、花钱。
// 每类可以在设置页改成“直接做”或“不做”，问的时候点“以后都同意”就记住，下次不再问。
// 读密码、写代码、装依赖这些都直接做。
//
// 怎么认出危险动作：
//   - bash 命令交给 cc-safety-net 的 checkCommand 判断（它会解析 bash -c、python -c 这类包装），
//     命中的规则 id 再归到上面四类；它的“读密钥”类规则不管，读密码直接放行。
//   - 别的工具（MCP 等）看工具名：send/post/publish… 算对外发送，pay/buy/order… 算花钱，delete/remove… 算删除。
//
// 问的时候只暂停这一步：pi 的 tool_call 钩子在这里等你点按钮，别的对话照常跑。
// 状态存在 <数据目录>/approval.json，每次现读，设置页改了马上生效。
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

export const CATEGORIES = [
  { id: "delete", name: "永久删除", desc: "rm -rf、git reset --hard、清空 stash 这类删了找不回来的" },
  { id: "force", name: "强推覆盖", desc: "git push --force、删远程分支，会覆盖别人或远程上的东西" },
  { id: "send", name: "对外发送", desc: "发消息、发邮件、发布、把数据上传到外网" },
  { id: "spend", name: "花钱", desc: "付款、下单、订阅" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export type Mode = "allow" | "ask" | "deny";
export type Decision = "yes" | "no" | "always";

export interface AlwaysRule {
  key: string; // rule:git.push-force / tool:mcp__wx__send_message
  label: string; // 给人看的
}
interface State {
  modes: Partial<Record<Category, Mode>>;
  always: AlwaysRule[];
}

/** 一个动作该不该问：返回所属类别和“以后都同意”时记住的 key；不用管返回 undefined。 */
export interface Hit {
  category: Category;
  key: string;
  label: string; // 这类动作的说明，比如“强推（git.push-force）”
}

// ---------- 识别 ----------

const FORCE_RULES = new Set(["git.push-force", "git.push-mirror", "git.push-delete"]);
const SEND_RULES = new Set(["network.upload-remote"]);

/** cc-safety-net 的规则 id → 类别。读密钥的规则（secret.*）不管：读密码直接做。 */
export function categoryOfRule(ruleId: string): Category | undefined {
  if (ruleId.startsWith("secret.")) return undefined;
  if (FORCE_RULES.has(ruleId)) return "force";
  if (SEND_RULES.has(ruleId)) return "send";
  return "delete"; // 其余都是删文件、丢改动、抹磁盘这一类
}

const BUILTIN_TOOLS = new Set(["bash", "powershell", "read", "write", "edit", "grep", "find", "ls"]);
const READ_VERB = /^(get|list|read|search|fetch|query|find|view|show|lookup|check|describe|count)/i;
const SPEND = /(pay|purchase|buy|order|checkout|transfer|subscribe|charge|donate|tip)/i;
const SEND = /(send|post|reply|publish|tweet|email|mail|message|comment|share|upload|invite|notify|broadcast)/i;
const DELETE = /(delete|remove|destroy|drop|purge|wipe|erase|trash)/i;

/** 非 bash 工具按名字归类。Kiki 自己的 kiki_* 工具只在本机对话之间传话，不算对外。 */
export function categoryOfTool(toolName: string): Category | undefined {
  if (BUILTIN_TOOLS.has(toolName) || toolName.startsWith("kiki_")) return undefined;
  const action = toolName.replace(/^mcp__.+?__/, "");
  if (READ_VERB.test(action)) return undefined;
  if (SPEND.test(action)) return "spend";
  if (SEND.test(action)) return "send";
  if (DELETE.test(action)) return "delete";
  return undefined;
}

type Check = (input: { command: string; cwd: string }) => { kind: "allow" } | { kind: "deny"; reason: string; ruleId: string };
let checker: Promise<Check> | undefined;
async function checkCommand(dataDir: string): Promise<Check> {
  // cc-safety-net 的配置和日志放在 Kiki 自己的数据目录，不碰 ~/.cc-safety-net
  process.env.CC_SAFETY_NET_HOME ??= join(dataDir, "safety-net");
  process.env.CC_SAFETY_NET_AUDIT_HOME ??= join(dataDir, "safety-net");
  checker ??= import("cc-safety-net/api").then((m) => m.checkCommand as Check);
  return checker;
}

export async function classify(dataDir: string, toolName: string, input: any, cwd: string): Promise<Hit | undefined> {
  if (toolName === "bash" && typeof input?.command === "string" && input.command.trim()) {
    let r: ReturnType<Check>;
    try {
      r = (await checkCommand(dataDir))({ command: input.command, cwd });
    } catch {
      return undefined; // 判断器自己出错时不挡路
    }
    if (r.kind === "allow") return undefined;
    const category = categoryOfRule(r.ruleId);
    if (!category) return undefined;
    return { category, key: `rule:${r.ruleId}`, label: `${nameOf(category)}：${firstLine(r.reason)}（${r.ruleId}）` };
  }
  const category = categoryOfTool(toolName);
  if (!category) return undefined;
  return { category, key: `tool:${toolName}`, label: `${nameOf(category)}：工具 ${toolName}` };
}

const nameOf = (c: Category) => CATEGORIES.find((x) => x.id === c)!.name;
const firstLine = (s: string) => s.replace(/^BLOCKED by CC Safety Net\s*/i, "").split("\n").find((l) => l.trim())?.trim().slice(0, 120) ?? "";

// ---------- 状态文件 ----------

const file = (dataDir: string) => join(dataDir, "approval.json");

export function readState(dataDir: string): State {
  try {
    const s = existsSync(file(dataDir)) ? JSON.parse(readFileSync(file(dataDir), "utf8")) : {};
    return { modes: s.modes ?? {}, always: Array.isArray(s.always) ? s.always : [] };
  } catch {
    return { modes: {}, always: [] }; // 文件写坏了就按默认（先问），别让 Kiki 起不来
  }
}
function writeState(dataDir: string, s: State) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), JSON.stringify(s, null, 2) + "\n");
}

export const modeOf = (s: State, c: Category): Mode => s.modes[c] ?? "ask";

export function setMode(dataDir: string, category: string, mode: string) {
  if (!CATEGORIES.some((c) => c.id === category)) throw new Error(`没有这类动作 ${category}`);
  if (mode !== "allow" && mode !== "ask" && mode !== "deny") throw new Error(`不认识 ${mode}`);
  const s = readState(dataDir);
  s.modes[category as Category] = mode;
  writeState(dataDir, s);
}

export function addAlways(dataDir: string, rule: AlwaysRule) {
  const s = readState(dataDir);
  if (!s.always.some((a) => a.key === rule.key)) s.always.push(rule);
  writeState(dataDir, s);
}

export function removeAlways(dataDir: string, key: string) {
  const s = readState(dataDir);
  s.always = s.always.filter((a) => a.key !== key);
  writeState(dataDir, s);
}

export function listApproval(dataDir: string) {
  const s = readState(dataDir);
  return { categories: CATEGORIES.map((c) => ({ ...c, mode: modeOf(s, c.id) })), always: s.always };
}

// ---------- 等你点头 ----------

export interface Ask {
  id: string;
  agent: string;
  path: string; // 哪段对话在等
  category: Category;
  categoryName: string;
  label: string;
  detail: string; // 具体要做的事：命令原文或工具参数
  key: string;
  created: string;
}

/** 事件：change 待批列表变了（网页刷新卡片）。 */
export class Approvals extends EventEmitter {
  private waiting = new Map<string, { ask: Ask; done: (d: Decision) => void }>();
  private seq = 0;

  constructor(readonly dataDir: string) {
    super();
  }

  list(): Ask[] {
    return [...this.waiting.values()].map((w) => w.ask);
  }

  /** 挂一张待批卡片，等你点；对话被停掉（signal）就当拒绝。 */
  request(ask: Omit<Ask, "id" | "created" | "categoryName">, signal?: AbortSignal): Promise<Decision> {
    const id = `a${Date.now().toString(36)}${(this.seq++).toString(36)}`;
    const full: Ask = { ...ask, id, created: new Date().toISOString(), categoryName: nameOf(ask.category) };
    return new Promise<Decision>((resolve) => {
      const finish = (d: Decision) => {
        if (!this.waiting.delete(id)) return;
        signal?.removeEventListener("abort", onAbort);
        resolve(d);
        this.emit("change", this.list());
      };
      const onAbort = () => finish("no");
      if (signal?.aborted) return resolve("no");
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiting.set(id, { ask: full, done: finish });
      this.emit("change", this.list());
    });
  }

  decide(id: string, decision: Decision) {
    const w = this.waiting.get(id);
    if (!w) throw new Error("这张卡片已经处理过了");
    if (decision === "always") addAlways(this.dataDir, { key: w.ask.key, label: w.ask.label });
    w.done(decision);
  }

  /** 按设置决定一步要不要做：不做 → false；直接做或点过“以后都同意” → true；否则挂卡片等你点。 */
  async gate(hit: Hit, where: { agent: string; path: string; detail: string }, signal?: AbortSignal): Promise<{ ok: boolean; why?: "deny" | "no" }> {
    const state = readState(this.dataDir);
    const mode = modeOf(state, hit.category);
    // 先看“不做”：设成不做之后，以前点过的“以后都同意”也不算数
    if (mode === "deny") return { ok: false, why: "deny" };
    if (mode === "allow" || state.always.some((a) => a.key === hit.key)) return { ok: true };
    const d = await this.request({ ...where, category: hit.category, label: hit.label, key: hit.key }, signal);
    return d === "no" ? { ok: false, why: "no" } : { ok: true };
  }

  /** 给 pi 用的扩展：每次调用工具前过一遍。 */
  extension(): ExtensionFactory {
    return (pi) => {
      pi.on("tool_call", async (ev, ctx) => {
        const hit = await classify(this.dataDir, ev.toolName, ev.input, ctx.cwd);
        if (!hit) return;
        const name = nameOf(hit.category);
        const r = await this.gate(hit, { agent: basename(ctx.cwd), path: ctx.sessionManager.getSessionFile() ?? "", detail: detailOf(ev.toolName, ev.input) }, ctx.signal);
        if (r.why === "deny")
          return { block: true, reason: `用户在 Kiki 设置里把「${name}」设成了不做。不要换个写法绕过去，告诉用户这一步需要他自己来。` };
        if (r.why === "no")
          return { block: true, reason: `用户没有同意这一步（${name}）。不要换个写法再试，告诉用户你停在了哪里、还需要他做什么。` };
      });
    };
  }
}

function detailOf(toolName: string, input: any): string {
  if (toolName === "bash" && typeof input?.command === "string") return input.command.slice(0, 2000);
  let s: string;
  try {
    s = JSON.stringify(input, null, 2);
  } catch {
    s = String(input);
  }
  return `${toolName}\n${s}`.slice(0, 2000);
}
