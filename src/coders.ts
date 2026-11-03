// 外面的编程 agent：你自己在终端里开的 Claude Code、Codex。
// 它们做到几个关键时刻（开始、要你批准、这一轮做完、关掉）由 hook 报给 Kiki，Kiki 只记状态、不插手：
// 哪些在跑、哪个在等你、做完了什么，按项目文件夹归到对应的宝，显示在右栏，写进主对话的摘要和每日简报。
//
// 和收发室的区别：收发室收的是“消息”（要交给奇奇分派、可能要回复），这里收的是“状态”，
// 来得很勤（每次工具调用都可能有一条），所以不调模型、不进奇奇，只改卡片；只有一轮做完时用小模型压一句话。
//
// 数据在 数据目录/coders/ 下：
//   sessions.json  最近的会话（每段一条：在哪个文件夹、归哪个宝、状态、最近几轮）
//   map.json       文件夹 → 宝（第一次见到时自动选，界面上可以改）
//   spool/         Kiki 没开时 hook 先写在这里，Kiki 启动后补收
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type CoderTool = "claude-code" | "codex";
export const TOOL_NAME: Record<CoderTool, string> = { "claude-code": "Claude Code", codex: "Codex" };

/** running 在干活；waiting 卡住等你（批准或回话）；idle 这一轮做完了，开着等下一句；ended 关掉了 */
export type CoderStatus = "running" | "waiting" | "idle" | "ended";
export const CODER_STATUS_LABEL: Record<CoderStatus, string> = { running: "在干活", waiting: "等你", idle: "这轮做完", ended: "已结束" };

export interface CoderTurn {
  prompt: string; // 你这一轮让它做什么
  result?: string; // 它这一轮最后说的话（截断）
  summary?: string; // 压成的一句话
  at: string;
  done?: string; // 做完的时间
}

export interface CoderSession {
  id: string; // tool:会话 id
  tool: CoderTool;
  session: string;
  cwd: string;
  repo: string; // 文件夹名
  branch?: string;
  host?: string; // 哪台电脑
  bao: string;
  status: CoderStatus;
  waitingFor?: "approval" | "reply";
  note?: string; // 等你时它说的话，比如“Claude needs your permission to use Bash”
  title: string; // 第一句要求
  summary?: string; // 最近一轮做完的一句话
  turns: CoderTurn[];
  transcript?: string;
  started: string;
  updated: string;
}

/** 一条整理好的事件（不管是 Claude Code 的 hook 还是 Codex 的 notify）。 */
export interface CoderEvent {
  tool: CoderTool;
  kind: "start" | "prompt" | "waiting" | "working" | "stop" | "end";
  session: string;
  cwd: string;
  host?: string;
  prompt?: string;
  result?: string;
  waitingFor?: "approval" | "reply";
  note?: string;
  transcript?: string;
  at?: string;
}

const MAX_SESSIONS = 200;
const MAX_TURNS = 20;
const cut = (s: unknown, n: number) => {
  const t = typeof s === "string" ? s.trim() : "";
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const firstLine = (s: string, n = 40) => cut(s.split("\n").find((l) => l.trim()) ?? "", n);

/** 把 hook 原样发来的 JSON 整理成一条事件；认不出来的（不关心的事件）返回 undefined。 */
export function normalize(tool: string, raw: any, host?: string): CoderEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (tool === "codex") {
    // Codex 的 notify：只有 agent-turn-complete 一种，带这一轮的要求和最后的回答
    if (raw.type !== "agent-turn-complete") return undefined;
    const input = Array.isArray(raw["input-messages"]) ? raw["input-messages"].filter((x: unknown) => typeof x === "string").join("\n") : "";
    const session = String(raw["thread-id"] ?? raw["turn-id"] ?? "");
    if (!session) return undefined;
    return { tool: "codex", kind: "stop", session, cwd: String(raw.cwd ?? ""), host, prompt: cut(input, 500), result: cut(raw["last-assistant-message"], 2000) };
  }
  if (tool !== "claude-code") return undefined;
  const session = String(raw.session_id ?? "");
  if (!session) return undefined;
  const base = { tool: "claude-code" as const, session, cwd: String(raw.cwd ?? ""), host, transcript: typeof raw.transcript_path === "string" ? raw.transcript_path : undefined };
  switch (raw.hook_event_name) {
    case "SessionStart":
      return { ...base, kind: "start" };
    case "UserPromptSubmit":
      return { ...base, kind: "prompt", prompt: cut(raw.prompt, 500) };
    case "Notification": {
      const type = String(raw.notification_type ?? "");
      const msg = String(raw.message ?? "");
      // 要权限 → 等你批准；闲了一阵 → 等你回话。其余（登录成功之类）不管
      if (type === "permission_prompt" || (!type && /permission/i.test(msg))) return { ...base, kind: "waiting", waitingFor: "approval", note: cut(msg, 200) };
      if (type === "idle_prompt" || (!type && /waiting for your input/i.test(msg))) return { ...base, kind: "waiting", waitingFor: "reply", note: cut(msg, 200) };
      return undefined;
    }
    case "PostToolUse":
      return { ...base, kind: "working" }; // 批准后接着干了：把“等你”改回“在干活”
    case "Stop":
      return { ...base, kind: "stop", result: cut(raw.last_assistant_message, 2000) };
    case "SessionEnd":
      return { ...base, kind: "end" };
  }
  return undefined;
}

export interface CodersOptions {
  dataDir: string;
  listBaos: () => string[];
  defaultBao: string;
  /** 文件夹名对不上任何宝时，让模型挑一个（不给就归默认的宝） */
  pickBao?: (repo: string, cwd: string, prompt: string) => Promise<string | undefined>;
  /** 一轮做完，把最后的回答压成一句话（不给就取第一行） */
  summarize?: (prompt: string, result: string) => Promise<string>;
}

export class Coders extends EventEmitter {
  readonly dir: string;
  private sessions: CoderSession[] = [];
  private map: Record<string, string> = {};
  private saving?: NodeJS.Timeout;

  constructor(private opts: CodersOptions) {
    super();
    this.dir = join(opts.dataDir, "coders");
    mkdirSync(join(this.dir, "spool"), { recursive: true });
    try {
      this.sessions = JSON.parse(readFileSync(join(this.dir, "sessions.json"), "utf8"));
    } catch {}
    try {
      this.map = JSON.parse(readFileSync(join(this.dir, "map.json"), "utf8"));
    } catch {}
  }

  list(): CoderSession[] {
    return [...this.sessions].sort((a, b) => b.updated.localeCompare(a.updated));
  }

  /** 给界面的：最近 3 天动过的，加上还开着的 */
  state() {
    const since = Date.now() - 3 * 86400_000;
    return this.list().filter((s) => s.status !== "ended" || Date.parse(s.updated) > since).slice(0, 40);
  }

  /** hook 发来的原始 JSON。返回整理后的会话（不关心的事件返回 undefined）。 */
  async ingest(tool: string, raw: unknown, host?: string, at?: string): Promise<CoderSession | undefined> {
    const ev = normalize(tool, raw, host);
    if (!ev) return undefined;
    return this.apply({ ...ev, at: at ?? ev.at });
  }

  async apply(ev: CoderEvent): Promise<CoderSession | undefined> {
    const id = `${ev.tool}:${ev.session}`;
    const now = ev.at ?? new Date().toISOString();
    let s = this.sessions.find((x) => x.id === id);
    if (!s) {
      if (ev.kind === "working" || ev.kind === "end") return undefined; // 没见过开头的，就不为一次工具调用建卡片了
      const repo = basename(ev.cwd) || ev.cwd || "?";
      s = { id, tool: ev.tool, session: ev.session, cwd: ev.cwd, repo, host: ev.host, bao: await this.baoFor(ev.cwd, ev.prompt ?? ""), status: "idle", title: "", turns: [], started: now, updated: now };
      s.branch = await gitBranch(ev.cwd);
      this.sessions.push(s);
      if (this.sessions.length > MAX_SESSIONS) this.sessions = this.list().slice(0, MAX_SESSIONS);
    } else if (ev.kind === "working" && s.status !== "waiting") return s; // 正常干活中的工具调用：不动、不存
    if (ev.transcript) s.transcript = ev.transcript;
    const last = s.turns[s.turns.length - 1];
    switch (ev.kind) {
      case "start":
        if (s.status === "ended") s.status = "idle";
        break;
      case "prompt":
        s.turns.push({ prompt: ev.prompt ?? "", at: now });
        if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS);
        s.title ||= firstLine(ev.prompt ?? "");
        s.status = "running";
        s.waitingFor = s.note = undefined;
        break;
      case "waiting":
        s.status = "waiting";
        s.waitingFor = ev.waitingFor;
        s.note = ev.note;
        break;
      case "working":
        s.status = "running";
        s.waitingFor = s.note = undefined;
        break;
      case "stop": {
        // Codex 没有单独的“开始”，要求和结果一起来
        const turn = ev.prompt !== undefined || !last || last.done ? { prompt: ev.prompt ?? "", at: now } : last;
        if (turn !== last) {
          s.turns.push(turn);
          if (s.turns.length > MAX_TURNS) s.turns.splice(0, s.turns.length - MAX_TURNS);
        }
        turn.result = ev.result;
        turn.done = now;
        s.title ||= firstLine(turn.prompt);
        s.status = "idle";
        s.waitingFor = s.note = undefined;
        s.summary = firstLine(ev.result ?? "", 60);
        turn.summary = s.summary;
        if (this.opts.summarize && ev.result && ev.result.length > 60) void this.summarize(s, turn);
        break;
      }
      case "end":
        s.status = "ended";
        s.waitingFor = s.note = undefined;
        break;
    }
    s.updated = now;
    this.changed(s, ev.kind);
    return s;
  }

  private async summarize(s: CoderSession, turn: CoderTurn) {
    try {
      const one = firstLine(await this.opts.summarize!(turn.prompt, turn.result ?? ""), 60);
      if (!one) return;
      turn.summary = one;
      if (s.turns[s.turns.length - 1] === turn) s.summary = one;
      this.changed(s, "summary");
    } catch {}
  }

  private changed(s: CoderSession, kind: string) {
    clearTimeout(this.saving);
    this.saving = setTimeout(() => this.save(), 300);
    this.emit("change", s, kind);
  }

  save() {
    clearTimeout(this.saving);
    const write = (name: string, data: unknown) => {
      const f = join(this.dir, name);
      writeFileSync(`${f}.tmp`, JSON.stringify(data, null, 1));
      renameSync(`${f}.tmp`, f);
    };
    write("sessions.json", this.sessions);
    write("map.json", this.map);
  }

  /** 文件夹归哪个宝：记过的（最长前缀）→ 文件夹名就是宝的名字 → 让模型挑 → 默认的宝。选完记住。 */
  async baoFor(cwd: string, prompt = ""): Promise<string> {
    const baos = this.opts.listBaos();
    const known = Object.keys(this.map)
      .filter((k) => cwd === k || cwd.startsWith(k.endsWith("/") ? k : `${k}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (known && baos.includes(this.map[known])) return this.map[known];
    const repo = basename(cwd).toLowerCase();
    let pick: string | undefined;
    if (repo.length >= 2) {
      pick = baos.find((b) => b.toLowerCase() === repo);
    }
    if (!pick && this.opts.pickBao) pick = await this.opts.pickBao(basename(cwd), cwd, prompt).catch(() => undefined);
    if (!pick || !baos.includes(pick)) pick = this.opts.defaultBao;
    if (cwd) this.map[cwd] = pick;
    return pick;
  }

  /** 界面上改投：这个文件夹以后都归这个宝，已有的会话一起挪过去。 */
  setBao(cwd: string, bao: string) {
    if (!this.opts.listBaos().includes(bao)) throw new Error(`没有「${bao}」这个宝`);
    this.map[cwd] = bao;
    for (const s of this.sessions) if (s.cwd === cwd || s.cwd.startsWith(`${cwd}/`)) s.bao = bao;
    this.save();
    this.emit("change");
  }

  /** 宝的主对话每轮看到的一行：外面有几个在跑、几个在等你 */
  digest(bao?: string): string {
    const open = this.state().filter((s) => s.status !== "ended" && (!bao || s.bao === bao) && Date.parse(s.updated) > Date.now() - 86400_000);
    if (!open.length) return "";
    const line = (s: CoderSession) =>
      `- ${TOOL_NAME[s.tool]} · ${s.repo}${s.bao && !bao ? `（${s.bao}）` : ""}：${CODER_STATUS_LABEL[s.status]}${s.waitingFor === "approval" ? "批准" : ""} · ${s.title || "（还没说要做什么）"}${s.summary ? ` → ${s.summary}` : ""}`;
    return `【用户在终端里开的编程 agent】（只读，不归你管，用户问起时可以说）\n${open.slice(0, 8).map(line).join("\n")}`;
  }

  /** 每日简报用：过去一天做完的轮次、还在等你的 */
  briefingLines(now = new Date()): { done: string[]; waiting: string[] } {
    const since = now.getTime() - 86400_000;
    const done: string[] = [];
    const waiting: string[] = [];
    for (const s of this.list()) {
      const n = s.turns.filter((t) => t.done && Date.parse(t.done) >= since).length;
      if (n) done.push(`- ${TOOL_NAME[s.tool]} 在 ${s.repo} 做完 ${n} 轮：${s.summary || s.title}`);
      if (s.status === "waiting") waiting.push(`- ${TOOL_NAME[s.tool]} 在 ${s.repo} 等你${s.waitingFor === "approval" ? "批准" : "回话"}：${s.title}`);
    }
    return { done: done.slice(0, 8), waiting };
  }

  /** Kiki 没开时 hook 写下的（spool/*.jsonl，每行 {tool, host, at, event}），启动时补收。 */
  async drainSpool() {
    const dir = join(this.dir, "spool");
    if (!existsSync(dir)) return 0;
    let n = 0;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      const file = join(dir, f);
      const taking = `${file}.${process.pid}.taking`;
      try {
        renameSync(file, taking);
      } catch {
        continue;
      }
      n += await this.ingestLines(readFileSync(taking, "utf8"));
      unlinkSync(taking);
    }
    return n;
  }

  /** 一行一条：{tool, host, at, event}。远程电脑补发、本机 spool 都用这个 */
  async ingestLines(text: string) {
    let n = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (await this.ingest(String(r.tool ?? ""), r.event, typeof r.host === "string" ? r.host : undefined, typeof r.at === "string" ? r.at : undefined)) n++;
      } catch {}
    }
    return n;
  }
}

async function gitBranch(cwd: string): Promise<string | undefined> {
  if (!cwd || !existsSync(cwd)) return undefined; // 别的电脑上的文件夹，这台看不到
  try {
    const { stdout } = await run("git", ["-C", cwd, "branch", "--show-current"], { timeout: 2000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 继续这段会话的命令（卡片上点一下复制） */
export function resumeCommand(s: Pick<CoderSession, "tool" | "session" | "cwd">): string {
  const cd = s.cwd ? `cd ${shq(s.cwd)} && ` : "";
  return s.tool === "codex" ? `${cd}codex resume ${s.session}` : `${cd}claude --resume ${s.session}`;
}

export const shq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
