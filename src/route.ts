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
  | { action: "new"; agent: string; name: string; mode: Mode; taskTitle?: string; reason?: string }
  | { action: "ask"; options: Option[]; reason?: string };

/** 拿不准时给用户的选项：要么接进已有对话（target），要么在某个宝下新开（agent + name）。 */
export type Option = { target: string } | { agent: string; name: string };

export const ROUTE_SYSTEM = `你是个人助理 Kiki 的分诊台。用户的每句话要放进一段合适的对话里。
对话按"宝"分组，每个宝负责一个领域，下面有若干具名对话。你只负责分派，不回答问题本身。

规则：
1. 如果这句话明显是在接着某段已有对话的话题，选 continue。用户当前所在的对话优先：只要不是明显换了话题，就继续留在当前对话。
2. 如果是一个新话题，选 new：挑最合适的宝，给对话起一个 2 到 8 个字的中文短名，概括话题（不要带日期，不要和该宝已有对话重名）。
3. 只有在两三个去处都说得通、选错代价明显时，才选 ask，给出 2 个选项。能定就定，别动不动就问。
4. mode：要产出东西、要多步执行、要跑工具或改文件、预计超过一两分钟的，填 background，并给 taskTitle（10 个字以内的任务名）；提问、讨论、闲聊填 chat。拿不准填 chat。

只输出一个 JSON 对象，不要任何别的文字。三种格式：
{"action":"continue","target":"宝名/对话名","mode":"chat","reason":"一句话理由"}
{"action":"new","agent":"宝名","name":"对话短名","mode":"chat","reason":"一句话理由"}
{"action":"ask","options":[{"target":"宝名/对话名"},{"agent":"宝名","name":"对话短名"}],"reason":"为什么拿不准"}`;

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
  if (d.action === "ask" && Array.isArray(d.options)) {
    const options: Option[] = [];
    for (const o of d.options) {
      if (o?.target && valid.targets.includes(o.target)) options.push({ target: o.target });
      else if (o?.agent && valid.agents.includes(o.agent) && cleanName(o.name)) options.push({ agent: o.agent, name: cleanName(o.name) });
    }
    if (options.length >= 2) return { action: "ask", options: options.slice(0, 3), reason: d.reason };
    if (options.length === 1) {
      const o = options[0];
      return "target" in o
        ? { action: "continue", target: o.target, mode, reason: d.reason }
        : { action: "new", agent: o.agent, name: o.name, mode, reason: d.reason };
    }
  }
  return undefined;
}

export const optionLabel = (o: Option) => ("target" in o ? `接进 ${o.target}` : `在 ${o.agent} 下新开「${o.name}」`);
