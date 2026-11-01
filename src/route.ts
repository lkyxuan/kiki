// 自动对话路由（第一层）：主 bot 收到一句话，判断接进哪段已有对话，还是在哪个宝下新开一段。
// 顺带给出第二层的建议：聊（chat）还是后台干（background）。
// 这里只有纯逻辑（拼提示词、解析结果），调模型和执行在 router.ts。

export interface RouteCandidate {
  agent: string;
  desc: string; // 这个宝负责什么
  sessions: { label: string; recent: string[]; background?: boolean }[];
}

export type Mode = "chat" | "background";

export type Decision =
  | { action: "continue"; target: string; mode: Mode; taskTitle?: string; reason?: string }
  | { action: "new"; agent: string; name: string; mode: Mode; taskTitle?: string; reason?: string };


/** 路由的系统提示词 = 固定开头 + 用户可改的分派规则（~/kiki-data/分派规则.md）+ 固定输出格式。
 *  判断标准放在规则文件里给用户改；输出格式是程序要解析的，留在代码里。 */
export function buildRouteSystem(rules: string): string {
  return `你是个人助理 Kiki 的分诊台。用户的每句话要放进一段合适的对话里。
对话按"宝"分组，每个宝负责一个领域，下面有若干具名对话。你只负责分派，不回答问题本身。
一定要自己做决定，不要反问用户。

下面是用户定的分派规则：
${rules.trim()}

只输出一个 JSON 对象，不要任何别的文字。两种格式（mode 为 background 时加 "taskTitle"：10 个字以内的任务名）：
{"action":"continue","target":"宝名/对话名","mode":"chat","reason":"一句话理由"}
{"action":"new","agent":"宝名","name":"对话短名","mode":"chat","reason":"一句话理由"}`;
}

export function buildRouteInput(opts: {
  text: string;
  candidates: RouteCandidate[];
  current?: string;
  onlyAgent?: string; // 用户 @ 了某个宝，只能在它下面选
}): string {
  const lines: string[] = [];
  for (const c of opts.candidates) {
    if (opts.onlyAgent && c.agent !== opts.onlyAgent) continue;
    lines.push(`## 宝：${c.agent}${c.desc ? `（${c.desc}）` : ""}`);
    if (c.sessions.length === 0) lines.push("（还没有对话）");
    for (const s of c.sessions) {
      const tag = [s.label === opts.current ? "【当前】" : "", s.background ? "【后台任务】" : ""].join("");
      const recent = s.recent.length ? `：最近说过 ${s.recent.map((r) => `「${r}」`).join(" ")}` : "";
      lines.push(`- ${s.label}${tag}${recent}`);
    }
  }
  if (opts.onlyAgent) lines.push(`\n用户指定了宝「${opts.onlyAgent}」，只能在它下面 continue 或 new。`);
  lines.push(`\n用户当前所在：${opts.current ?? "无"}`);
  lines.push(`\n用户这句话：\n${opts.text}`);
  return lines.join("\n");
}

/** 解析并校验模型输出；不合法就返回 undefined，由调用方兜底。 */
export function parseDecision(raw: string, valid: { agents: string[]; targets: string[] }): Decision | undefined {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  let d: any;
  try {
    d = JSON.parse(m[0]);
  } catch {
    return undefined;
  }
  const mode: Mode = d.mode === "background" ? "background" : "chat";
  const taskTitle = mode === "background" && typeof d.taskTitle === "string" ? d.taskTitle.slice(0, 30) : undefined;
  const cleanName = (n: unknown) => (typeof n === "string" ? n.replace(/[\/\n]/g, " ").trim().slice(0, 30) : "");

  if (d.action === "continue" && valid.targets.includes(d.target)) {
    return { action: "continue", target: d.target, mode, taskTitle, reason: d.reason };
  }
  if (d.action === "new" && valid.agents.includes(d.agent) && cleanName(d.name)) {
    return { action: "new", agent: d.agent, name: cleanName(d.name), mode, taskTitle, reason: d.reason };
  }
  // 模型若还是给了选项（旧习惯），直接取第一个合法的，不把问题抛回给用户
  if (Array.isArray(d.options)) {
    for (const o of d.options) {
      if (o?.target && valid.targets.includes(o.target)) return { action: "continue", target: o.target, mode, taskTitle, reason: d.reason };
      if (o?.agent && valid.agents.includes(o.agent) && cleanName(o.name)) return { action: "new", agent: o.agent, name: cleanName(o.name), mode, taskTitle, reason: d.reason };
    }
  }
  return undefined;
}
