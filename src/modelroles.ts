// 模型按用途配置：Kiki 里每个要用模型、又和聊天不一样的地方，都是一个“用途”，可以单独选模型。
// 不选就跟着默认模型走（“先回一句”例外：不选就不回，只靠表情和主模型的第一句话）。
// 选的模型存在数据目录的 .env 里（和 MODEL、VISION_MODEL 一样），改完马上生效，不用重启。
export const ROLES = [
  { id: "route", env: "ROUTE_MODEL", name: "路由", desc: "判断一句话交给哪个宝、哪段对话。用便宜快的小模型就够", unset: "跟默认模型" },
  { id: "summary", env: "SUMMARY_MODEL", name: "对话摘要", desc: "每段对话答完后写一句摘要，路由和宝的主对话靠它认对话", unset: "跟默认模型" },
  { id: "ack", env: "ACK_MODEL", name: "先回一句", desc: "消息一到先用小模型说一句“收到，我先看 X”，主模型同时开始干活", unset: "不回（只打表情）" },
  { id: "vision", env: "VISION_MODEL", name: "看图", desc: "现在的模型看不了图时，先让它把图读成文字", unset: "自动挑一个能看图的" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export const roleOf = (id: string) => ROLES.find((r) => r.id === id);

/** 这个用途选的模型；没选返回 undefined（调用方自己决定是跟默认模型还是不做）。 */
export function roleModel(id: RoleId, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[roleOf(id)!.env]?.trim() || undefined;
}

/** 模型名看起来对不对（provider/model）；空字符串表示“不选”。 */
export const validSpec = (spec: string) => spec === "" || /^[\w.-]+\/[\w.:/-]+$/.test(spec);

/** “先回一句”的提示词。who 是谁在回（奇奇 / 某个宝），返回 SKIP 表示这句不用先回。 */
export function ackPrompt(who: string): string {
  return `你是${who}。用户刚发来一句话，真正的回答马上由另一个模型去做。
你只负责先用一句话接住用户：说清楚你理解要做什么、先从哪下手，不超过 25 个字，口语化，不加引号和表情。
不要回答问题本身，不要承诺结果，不要编造事实。
如果这句话是寒暄、简单问答、一句话就能回完的，或者是命令（/ 开头），只输出 SKIP。`;
}

/** 整理模型写的“先回一句”：去掉引号和多余的行；该跳过就返回空。 */
export function cleanAck(raw: string): string {
  const line = raw.trim().split("\n").find((l) => l.trim())?.trim() ?? "";
  if (!line || /^SKIP\b/i.test(line)) return "";
  const s = line.replace(/^["“「『']+|["”」』']+$/g, "").trim();
  return s.length > 60 ? s.slice(0, 59) + "…" : s;
}
