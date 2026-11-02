// 收发室的 A2A 适配器：接说 A2A 协议的 agent（比如自家的 Grokbot）。
// A2A 是 HTTP 上的 JSON-RPC：先读对方的名片（/.well-known/agent-card.json），派活用 message/send，
// 查进度用 tasks/get。对方做完（或卡住要人）时，收发室就收到一条带 re 的消息，回到派活的那段对话。
// 还在等的任务记在 postroom/state/<名字>.json，Kiki 重启后接着查。
import type { AdapterContext, AgentConfig, AgentStatus, ExternalAgent, Incoming, Outgoing } from "./postroom.js";
import { loadState, saveState } from "./postroom.js";

/** 做完了、不会再变的状态 */
const FINAL = new Set(["completed", "failed", "canceled", "rejected"]);
/** 卡住、要人回话的状态：报给你，不再追 */
const NEEDS_YOU = new Set(["input-required", "auth-required"]);
const STATE_WORD: Record<string, string> = { failed: "失败了", canceled: "取消了", rejected: "拒绝了", "input-required": "需要你回话", "auth-required": "需要登录授权" };

interface Pending {
  task?: string; // 对方的任务 id
  context?: string;
  title: string;
}

type Fetch = typeof fetch;

export class A2AAgent implements ExternalAgent {
  readonly kind = "a2a";
  private endpoint?: string;
  private pending: Record<string, Pending>; // 我们的派活编号 -> 对方的任务
  private done: Incoming[] = []; // message/send 直接给了回答的，下一轮 collect 交出去

  constructor(
    readonly name: string,
    private cfg: AgentConfig,
    private ctx: AdapterContext,
    private http: Fetch = fetch,
  ) {
    if (!cfg.url) throw new Error("A2A 要写 url（对方的地址）");
    this.pending = loadState(ctx.root, name, { pending: {} as Record<string, Pending> }).pending;
  }

  private save() {
    saveState(this.ctx.root, this.name, { pending: this.pending });
  }

  /** 读名片拿到 JSON-RPC 地址；名片上没写就用配置的 url。 */
  private async card(): Promise<{ name?: string; url?: string }> {
    const base = this.cfg.url!.replace(/\/+$/, "");
    for (const p of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
      const r = await this.http(base + p, { headers: this.headers(), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      if (r?.ok) return (await r.json()) as any;
    }
    throw new Error("读不到对方的名片（agent-card.json）");
  }

  private headers(): Record<string, string> {
    return { accept: "application/json", ...(this.cfg.headers ?? {}) };
  }

  private async rpc(method: string, params: unknown): Promise<any> {
    this.endpoint ??= (await this.card()).url || this.cfg.url!;
    const r = await this.http(this.endpoint, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`A2A ${method}：HTTP ${r.status}`);
    const j: any = await r.json();
    if (j.error) throw new Error(`A2A ${method}：${j.error.message ?? JSON.stringify(j.error)}`);
    return j.result;
  }

  async status(): Promise<AgentStatus> {
    try {
      await this.card();
    } catch (e) {
      return { state: "offline", note: (e as Error).message };
    }
    const n = Object.keys(this.pending).length;
    return n ? { state: "working", note: `${n} 件在做` } : { state: "idle" };
  }

  async dispatch(t: Outgoing) {
    const result = await this.rpc("message/send", {
      message: {
        kind: "message",
        role: "user",
        messageId: t.id,
        parts: [{ kind: "text", text: t.from ? `（来自 Kiki · ${t.from}）\n${t.text}` : t.text }],
        metadata: { kikiId: t.id, title: t.title },
      },
      configuration: { blocking: false, acceptedOutputModes: ["text/plain", "text/markdown"] },
    });
    this.pending[t.id] = { title: t.title };
    this.take(t.id, result);
    this.save();
  }

  /** 对方给的结果：是消息就直接算回答；是任务就看状态，做完或卡住就算回音。 */
  private take(id: string, result: any) {
    const p = this.pending[id];
    if (!p || !result) return;
    if (result.kind === "message" || (!result.status && result.parts)) {
      this.finish(id, textOf(result.parts));
      return;
    }
    p.task = result.id ?? p.task;
    p.context = result.contextId ?? p.context;
    const state: string = result.status?.state ?? "";
    if (FINAL.has(state) || NEEDS_YOU.has(state)) {
      const body = [textOf(result.artifacts?.flatMap((a: any) => a.parts ?? [])), textOf(result.status?.message?.parts)].filter(Boolean).join("\n\n");
      const head = STATE_WORD[state] ? `（对方${STATE_WORD[state]}）\n` : "";
      this.finish(id, head + (body || "（没有文字结果）"), NEEDS_YOU.has(state));
    }
  }

  private finish(id: string, text: string, attention = false) {
    const p = this.pending[id];
    delete this.pending[id];
    this.done.push({ id: `${id}-r`, re: id, title: p?.title, text, attention: attention || undefined });
  }

  async cancel(id: string) {
    const p = this.pending[id];
    delete this.pending[id];
    this.save();
    if (p?.task) await this.rpc("tasks/cancel", { id: p.task });
  }

  async collect(): Promise<Incoming[]> {
    for (const [id, p] of Object.entries(this.pending)) {
      if (!p.task) continue;
      try {
        this.take(id, await this.rpc("tasks/get", { id: p.task }));
      } catch (e) {
        console.warn(`[a2a] ${this.name} 查任务 ${p.task} 失败：${(e as Error).message}`);
      }
    }
    this.save();
    const out = this.done;
    this.done = [];
    return out;
  }
}

function textOf(parts: any): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : p?.data !== undefined ? "```json\n" + JSON.stringify(p.data, null, 2) + "\n```" : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}
