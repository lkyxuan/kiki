// 对话在干活时给人看的进度：正在想、正在调用哪个工具、做了几步。
// 数据都来自 pi 的事件（见 agents.ts 的 watch），这里只管把工具调用翻译成人话。
import { basename } from "node:path";

export interface Step {
  id: string;
  title: string; // 人话的动作，比如“运行命令”
  detail: string; // 补一句对象，比如命令本身、文件名；可以为空
  status: "running" | "done" | "error";
  ms?: number; // 做完花了多久
}

/** 一段对话这一轮的进度。 */
export interface Live {
  since: number; // 开始干活的时间（毫秒）
  status: string; // 现在在干嘛，比如“正在思考…”
  steps: Step[];
}

const BUILTIN: Record<string, string> = {
  read: "读文件",
  write: "写文件",
  edit: "改文件",
  bash: "运行命令",
  powershell: "运行命令",
  grep: "搜索内容",
  find: "找文件",
  ls: "看文件夹",
  tool_search: "找能用的工具",
  code: "运行一段代码",
};

const clip = (s: string, n = 80) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
};

/** 把一次工具调用翻成人话。labels 是 Kiki 自己工具的中文名（ToolDefinition.label）。 */
export function describeTool(name: string, args: any, labels: Record<string, string> = {}): { title: string; detail: string } {
  const a = args && typeof args === "object" ? args : {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  let title = labels[name] ?? BUILTIN[name];
  if (!title) {
    const mcp = name.match(/^mcp__(.+?)__(.+)$/);
    title = mcp ? `用 ${mcp[1]} 的 ${mcp[2]}` : `用工具 ${name}`;
  }
  let detail = "";
  switch (name) {
    case "read":
    case "write":
    case "edit":
      detail = str(a.path) ? basename(str(a.path)) : "";
      break;
    case "ls":
      detail = str(a.path) ? basename(str(a.path)) : "当前文件夹";
      break;
    case "bash":
    case "powershell":
      detail = str(a.command);
      break;
    case "grep":
    case "find":
      detail = str(a.pattern);
      break;
    default: {
      // 别的工具：挑第一个看起来像“对象”的字符串参数
      const key = ["target", "name", "query", "url", "path", "text", "title"].find((k) => str(a[k]));
      detail = key ? str(a[key]) : (Object.values(a).find((v) => typeof v === "string") as string) ?? "";
    }
  }
  return { title, detail: clip(detail) };
}

/** 一轮做完后的一句总结：“用了 3 个工具” / “用了 3 个工具，1 个出错”。 */
export function summarize(steps: Step[]): string {
  const bad = steps.filter((s) => s.status === "error").length;
  return `用了 ${steps.length} 个工具${bad ? `，${bad} 个出错` : ""}`;
}

/** 从一段对话的消息里取出每条回答前用过的工具（打开老对话时显示折叠的步骤）。 */
export function stepsFromMessages(msgs: any[], labels: Record<string, string> = {}): Map<any, Step[]> {
  const out = new Map<any, Step[]>(); // 助手消息 -> 它之前（同一轮里）用过的工具
  const errors = new Set<string>();
  for (const m of msgs) if (m.role === "toolResult" && m.isError) errors.add(m.toolCallId);
  let pending: Step[] = [];
  for (const m of msgs) {
    if (m.role === "user") pending = [];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    const hasText = m.content.some((c: any) => c.type === "text" && c.text?.trim());
    if (hasText && pending.length) {
      out.set(m, pending);
      pending = [];
    }
    for (const c of m.content)
      if (c.type === "toolCall")
        pending.push({ id: c.id, ...describeTool(c.name, c.arguments, labels), status: errors.has(c.id) ? "error" : "done" });
  }
  return out;
}
