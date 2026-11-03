// 审批：危险动作不先问你，而是系统兜底、做完记一笔、能撤回。
//
// Kiki 是全自动的个人 agent。四类危险动作默认都“直接做”，但各有兜底：
//   - 永久删除、强推覆盖：做之前自动备份（backup.ts），做完记进“Kiki 做了什么”，一键撤回；备份不了的不做，原因交回给模型换做法。
//   - 对外发送：直接发（设置里可以加一段“待发”时间，期间能撤回，默认 0 = 不等）；
//     这一轮是外来消息（收发室、邮件）触发的、又不在白名单里，就不发（防钓鱼邮件让 Kiki 替你转账、转发资料）。
//   - 花钱：在预算内（默认单笔 100、每月 500）直接付并记账；超预算或看不出金额，才是唯一会停下来问你的。
// 每类在设置页仍可改成“先问”或“不做”；“先问”的卡片 24 小时没人点就当不做，不会一直挂着。
//
// 怎么认出危险动作：
//   - bash 命令交给 cc-safety-net 的 checkCommand 判断（它会解析 bash -c、python -c 这类包装），
//     命中的规则 id 再归到上面四类；它的“读密钥”类规则不管，读密码直接放行。
//   - 别的工具（MCP 等）看工具名：send/post/publish… 算对外发送，pay/buy/order… 算花钱，delete/remove… 算删除。
//
// 状态存在 <数据目录>/approval.json，每次现读，设置页改了马上生效。
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { ActionLog } from "./actions.js";
import { backupFor } from "./backup.js";

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
export interface Budget {
  perTx: number; // 单笔上限（元）
  monthly: number; // 每月上限（元）
}
interface State {
  modes: Partial<Record<Category, Mode>>;
  always: AlwaysRule[];
  sendAllow: string[]; // 对外发送白名单：外来消息触发时，只有白名单里的才发；设了待发时间时，白名单里的不等
  sendDelaySec: number; // 白名单外的，等这么多秒没人撤回就发；0 = 马上发
  budget: Budget;
  spent: { month: string; total: number }; // 这个月自动花了多少
}
export const DEFAULT_BUDGET: Budget = { perTx: 100, monthly: 500 };
export const DEFAULT_SEND_DELAY = 0; // 默认马上发：用户要全自动，不留待发时间；想要缓冲可以在设置里改
/** “先问”和超预算的卡片最多等多久，过了当不做 */
export const ASK_TIMEOUT_MS = 24 * 3600_000;

/** 一个动作该不该问：返回所属类别和“以后都同意”时记住的 key；不用管返回 undefined。 */
export interface Hit {
  category: Category;
  key: string;
  label: string; // 这类动作的说明，比如“强推（git.push-force）”
  ruleId?: string; // bash 命令命中的 cc-safety-net 规则
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
    return { category, key: `rule:${r.ruleId}`, label: `${nameOf(category)}：${firstLine(r.reason)}（${r.ruleId}）`, ruleId: r.ruleId };
  }
  const category = categoryOfTool(toolName);
  if (!category) return undefined;
  return { category, key: `tool:${toolName}`, label: `${nameOf(category)}：工具 ${toolName}` };
}

const nameOf = (c: Category) => CATEGORIES.find((x) => x.id === c)!.name;
const firstLine = (s: string) => s.replace(/^BLOCKED by CC Safety Net\s*/i, "").split("\n").find((l) => l.trim())?.trim().slice(0, 120) ?? "";

// ---------- 状态文件 ----------

const file = (dataDir: string) => join(dataDir, "approval.json");

const month = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function readState(dataDir: string): State {
  let s: any = {};
  try {
    s = existsSync(file(dataDir)) ? JSON.parse(readFileSync(file(dataDir), "utf8")) : {};
  } catch {} // 文件写坏了就按默认，别让 Kiki 起不来
  const num = (v: any, d: number) => (typeof v === "number" && v >= 0 ? v : d);
  return {
    modes: s.modes ?? {},
    always: Array.isArray(s.always) ? s.always : [],
    sendAllow: Array.isArray(s.sendAllow) ? s.sendAllow.map(String).filter(Boolean) : [],
    sendDelaySec: num(s.sendDelaySec, DEFAULT_SEND_DELAY),
    budget: { perTx: num(s.budget?.perTx, DEFAULT_BUDGET.perTx), monthly: num(s.budget?.monthly, DEFAULT_BUDGET.monthly) },
    spent: s.spent?.month === month() ? { month: month(), total: num(s.spent.total, 0) } : { month: month(), total: 0 },
  };
}
function writeState(dataDir: string, s: State) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir), JSON.stringify(s, null, 2) + "\n");
}

/** 默认都是“直接做”（带兜底） */
export const modeOf = (s: State, c: Category): Mode => s.modes[c] ?? "allow";

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

/** 设置页改白名单、待发时长、预算 */
export function setAuto(dataDir: string, p: { sendAllow?: unknown; sendDelaySec?: unknown; perTx?: unknown; monthly?: unknown }) {
  const s = readState(dataDir);
  const n = (v: unknown, name: string) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) throw new Error(`${name}要是不小于 0 的数`);
    return x;
  };
  if (p.sendAllow !== undefined)
    s.sendAllow = (Array.isArray(p.sendAllow) ? p.sendAllow : String(p.sendAllow).split(/\n|,|，/)).map((x) => String(x).trim()).filter(Boolean);
  if (p.sendDelaySec !== undefined) s.sendDelaySec = Math.min(n(p.sendDelaySec, "待发时长"), 3600);
  if (p.perTx !== undefined) s.budget.perTx = n(p.perTx, "单笔上限");
  if (p.monthly !== undefined) s.budget.monthly = n(p.monthly, "每月上限");
  writeState(dataDir, s);
}

export function listApproval(dataDir: string) {
  const s = readState(dataDir);
  return {
    categories: CATEGORIES.map((c) => ({ ...c, mode: modeOf(s, c.id) })),
    always: s.always,
    sendAllow: s.sendAllow,
    sendDelaySec: s.sendDelaySec,
    budget: s.budget,
    spent: s.spent,
  };
}

function addSpent(dataDir: string, amount: number) {
  const s = readState(dataDir);
  s.spent = { month: s.spent.month, total: Math.round((s.spent.total + amount) * 100) / 100 };
  writeState(dataDir, s);
}

/** 从工具参数里找金额：amount/price/total/cost… 这类字段（支持嵌套和 "¥12.5" 这种写法）。找不到返回 undefined。 */
export function amountOf(input: any): number | undefined {
  const KEY = /^(amount|price|total|cost|sum|value|money|fee|金额|价格|总价)$/i;
  let found: number | undefined;
  const walk = (v: any, depth: number) => {
    if (found !== undefined || depth > 4 || !v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (KEY.test(k)) {
        const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(/[^\d.]/g, "")) : NaN;
        if (Number.isFinite(n) && n >= 0) {
          found = n;
          return;
        }
      }
      walk(x, depth + 1);
    }
  };
  walk(input, 0);
  return found;
}

/** 从工具参数里找收件人：to/recipient/email/channel/chat/group… 这类字段的值。找不到返回空数组。 */
export function recipientsOf(input: any): string[] {
  const KEY = /^(to|cc|bcc|recipients?|receivers?|emails?|address(es)?|channels?|channel_id|chat(_id|_name)?|conversation(_id)?|group(_id|_name)?|room(_id)?|users?(_id|name)?|target|phone|number|contact|收件人|发给)$/i;
  const out: string[] = [];
  const take = (v: any) => {
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(take);
    else if (v && typeof v === "object") for (const x of Object.values(v)) if (typeof x === "string") out.push(x);
  };
  const walk = (v: any, depth: number) => {
    if (depth > 4 || !v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (KEY.test(k)) take(x);
      else walk(x, depth + 1);
    }
  };
  walk(input, 0);
  return out.filter((x) => x.trim());
}

/** 这一轮是不是外来消息触发的：看这段对话最近一条“用户”消息是不是收发室转进来的。 */
const EXTERNAL_MARK = /【收发室】|📮 外部 agent|你在盯的事有新消息|这是外部 agent 发来的/;
export function triggeredByOutside(sm: any): boolean {
  try {
    const branch: any[] = sm?.getBranch?.() ?? [];
    for (let i = branch.length - 1; i >= 0; i--) {
      const m = branch[i]?.message;
      if (branch[i]?.type !== "message" || m?.role !== "user") continue;
      const text = typeof m.content === "string" ? m.content : (m.content ?? []).map((c: any) => c?.text ?? "").join("");
      return EXTERNAL_MARK.test(text);
    }
  } catch {}
  return false;
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
  kind?: "ask" | "send" | "spend"; // send = 待发（到点自动发，点撤回就不发）；spend = 超预算
  autoAt?: string; // 待发：这个时间没人撤回就照发
  why?: string; // 为什么停下来（超预算、看不出金额）
}

export interface Where {
  agent: string;
  path: string;
  detail: string;
  command?: string; // bash 命令原文（删除、强推要先备份）
  cwd?: string;
  input?: any; // 工具参数（花钱看金额）
  outside?: boolean; // 这一轮是外来消息触发的
}
export type GateResult = { ok: boolean; why?: "deny" | "no" | "blocked"; reason?: string };

/** 事件：change 待批 / 待发列表变了（网页刷新卡片）。 */
export class Approvals extends EventEmitter {
  private waiting = new Map<string, { ask: Ask; done: (d: Decision) => void }>();
  private seq = 0;
  readonly actions: ActionLog;

  constructor(readonly dataDir: string) {
    super();
    this.actions = new ActionLog(dataDir);
  }

  list(): Ask[] {
    return [...this.waiting.values()].map((w) => w.ask);
  }

  /** 挂一张卡片：问的等你点（最多 24 小时，过了当不做）；待发的到点自动当同意。对话被停掉（signal）就当不做。 */
  request(ask: Omit<Ask, "id" | "created" | "categoryName">, signal?: AbortSignal, autoMs?: number): Promise<Decision> {
    const id = `a${Date.now().toString(36)}${(this.seq++).toString(36)}`;
    const full: Ask = { ...ask, id, created: new Date().toISOString(), categoryName: nameOf(ask.category), ...(autoMs !== undefined ? { autoAt: new Date(Date.now() + autoMs).toISOString() } : {}) };
    return new Promise<Decision>((resolve) => {
      const finish = (d: Decision) => {
        if (!this.waiting.delete(id)) return;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(d);
        this.emit("change", this.list());
      };
      const onAbort = () => finish("no");
      if (signal?.aborted) return resolve("no");
      const timer = setTimeout(() => finish(autoMs !== undefined ? "yes" : "no"), autoMs ?? ASK_TIMEOUT_MS);
      if (autoMs === undefined) timer.unref?.(); // 24 小时的不拖住进程；待发的要准时发
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiting.set(id, { ask: full, done: finish });
      this.emit("change", this.list());
    });
  }

  decide(id: string, decision: Decision) {
    const w = this.waiting.get(id);
    if (!w) throw new Error("这张卡片已经处理过了");
    // 花钱的“以后都同意”不记：钱只认预算
    if (decision === "always" && w.ask.category !== "spend") addAlways(this.dataDir, { key: w.ask.key, label: w.ask.label });
    w.done(decision);
  }

  private log(hit: Hit, where: Where, note: string, undo?: any) {
    this.actions.add({ agent: where.agent, path: where.path, category: hit.category, categoryName: nameOf(hit.category), label: hit.label, detail: where.detail, note, ...(undo ? { undo } : {}) });
  }

  /** 按设置决定一步怎么做。直接做的那几类各有兜底，见文件开头。 */
  async gate(hit: Hit, where: Where, signal?: AbortSignal): Promise<GateResult> {
    const state = readState(this.dataDir);
    const mode = modeOf(state, hit.category);
    // 先看“不做”：设成不做之后，以前点过的“以后都同意”也不算数
    if (mode === "deny") return { ok: false, why: "deny" };
    const always = state.always.some((a) => a.key === hit.key);

    if (mode === "ask" && !always) {
      const d = await this.request({ ...where, category: hit.category, label: hit.label, key: hit.key, kind: "ask" }, signal);
      if (d === "no") return { ok: false, why: "no" };
      this.log(hit, where, "你点了同意");
      return { ok: true };
    }

    switch (hit.category) {
      case "delete":
      case "force": {
        // 能先备份的命令先备份；别的工具（比如删 Notion 页面）备份不了，照做并记下来（多数服务有自己的回收站）
        if (where.command && hit.ruleId && where.cwd) {
          const b = backupFor(this.dataDir, hit.ruleId, where.command, where.cwd);
          if ("error" in b) return { ok: false, why: "blocked", reason: b.error };
          this.log(hit, where, b.note, b.undo);
          return { ok: true };
        }
        this.log(hit, where, "直接做了（这个工具 Kiki 备份不了，要找回去对应服务的回收站）");
        return { ok: true };
      }
      case "send": {
        // 白名单只对收件人那几个字段比，不看正文：正文里提到白名单里的人不算数
        const to = recipientsOf(where.input).map((x) => x.toLowerCase());
        const listed = always || (to.length > 0 && to.every((r) => state.sendAllow.some((x) => r.includes(x.toLowerCase()))));
        if (listed) {
          this.log(hit, where, "白名单里的，直接发了");
          return { ok: true };
        }
        if (where.outside)
          return { ok: false, why: "blocked", reason: "这一轮是外来消息（邮件、外部 agent）触发的，收件人又不在白名单里，Kiki 不替用户发。可以把情况告诉用户，或者只做提醒。" };
        if (state.sendDelaySec > 0) {
          const d = await this.request({ ...where, category: hit.category, label: hit.label, key: hit.key, kind: "send" }, signal, state.sendDelaySec * 1000);
          if (d === "no") return { ok: false, why: "no", reason: "用户把这条撤回了，不要再发。" };
          this.log(hit, where, d === "always" ? "你点了以后对这个直接发" : `等了 ${state.sendDelaySec} 秒没人撤回，发了`);
          return { ok: true };
        }
        this.log(hit, where, "直接发了");
        return { ok: true };
      }
      case "spend": {
        const amount = amountOf(where.input);
        const { perTx, monthly } = state.budget;
        if (amount !== undefined && amount <= perTx && state.spent.total + amount <= monthly) {
          addSpent(this.dataDir, amount);
          this.log(hit, where, `预算内，花了 ${amount}（这个月已花 ${state.spent.total + amount} / ${monthly}）`);
          return { ok: true };
        }
        const why =
          amount === undefined ? "看不出这笔要花多少钱" : amount > perTx ? `这笔 ${amount}，超过单笔上限 ${perTx}` : `这个月已花 ${state.spent.total}，再花 ${amount} 就超过每月上限 ${monthly}`;
        const d = await this.request({ ...where, category: hit.category, label: hit.label, key: hit.key, kind: "spend", why }, signal);
        if (d === "no") return { ok: false, why: "no" };
        if (amount !== undefined) addSpent(this.dataDir, amount);
        this.log(hit, where, `超预算，你点了同意（${why}）`);
        return { ok: true };
      }
    }
  }

  /** 给 pi 用的扩展：每次调用工具前过一遍。 */
  extension(): ExtensionFactory {
    return (pi) => {
      pi.on("tool_call", async (ev, ctx) => {
        const hit = await classify(this.dataDir, ev.toolName, ev.input, ctx.cwd);
        if (!hit) return;
        const name = nameOf(hit.category);
        const input: any = ev.input;
        const r = await this.gate(
          hit,
          {
            agent: basename(ctx.cwd),
            path: ctx.sessionManager.getSessionFile() ?? "",
            detail: detailOf(ev.toolName, input),
            ...(ev.toolName === "bash" && typeof input?.command === "string" ? { command: input.command, cwd: ctx.cwd } : {}),
            input,
            outside: triggeredByOutside(ctx.sessionManager),
          },
          ctx.signal,
        );
        if (r.why === "deny")
          return { block: true, reason: `用户在 Kiki 设置里把「${name}」设成了不做。不要换个写法绕过去，在结果里说明这一步没做、为什么。` };
        if (r.why === "blocked") return { block: true, reason: `${r.reason} 不要换个写法绕过这条规矩，也不要停下来问用户。` };
        if (r.why === "no")
          return { block: true, reason: r.reason ?? `用户没有同意这一步（${name}）。不要换个写法再试，在结果里说明停在了哪里。` };
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
