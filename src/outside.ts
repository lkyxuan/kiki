// 指令从哪来：只有用户本人说的话算命令，邮件、网页、外部 agent 读回来的内容只当资料。
// 对话里的审批和后台任务子程序都要用，所以单独放一个不带依赖的小文件。
//
// 看这段对话最近一条“用户”消息往后：
//   - outside：这条“用户”消息本身是收发室转进来的（外来消息触发的这一轮）
//   - readOutside：这一轮里读过外来内容（MCP 工具、联网工具、外部 agent 的回复）
//   - userText：用户这句话的原文（发给谁、付给谁，要在这里面或白名单里才算用户的意思）

export interface TurnInfo {
  outside: boolean;
  readOutside: boolean;
  userText: string;
}

const EXTERNAL_MARK = /【收发室】|📮 外部 agent|你在盯的事有新消息|这是外部 agent 发来的/;
/** 本机工具：读写本地文件、Kiki 自己的对话之间传话，不算外来内容 */
const LOCAL_TOOLS = new Set(["read", "write", "edit", "ls", "grep", "find", "bash", "powershell"]);
const isExternalTool = (name: string) => !!name && !LOCAL_TOOLS.has(name) && (!name.startsWith("kiki_") || name === "kiki_outside");

const textOf = (m: any) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((c: any) => c?.text ?? "").join(""));

export function turnInfo(sm: any): TurnInfo {
  const info: TurnInfo = { outside: false, readOutside: false, userText: "" };
  try {
    const branch: any[] = sm?.getBranch?.() ?? [];
    for (let i = branch.length - 1; i >= 0; i--) {
      if (branch[i]?.type !== "message") continue;
      const m = branch[i].message;
      if (m?.role === "toolResult" && isExternalTool(m.toolName)) info.readOutside = true;
      if (m?.role === "user") {
        info.userText = textOf(m);
        info.outside = EXTERNAL_MARK.test(info.userText);
        break;
      }
    }
  } catch {}
  return info;
}

/** 兼容：这一轮是不是外来消息触发的 */
export const triggeredByOutside = (sm: any) => turnInfo(sm).outside;
