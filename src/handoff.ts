// 交接工具：对话里的 agent 发现"这是一件新的事"时，自己把这件事需要的上下文写成交接说明，
// 带着它开一段新对话。新对话从一份干净、聚焦的说明开始，而不是搬整段旧聊天。
// 判断和总结都由当前对话里的 agent 做（它手上有全部上下文），不用每句话多调一次模型。
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export interface HandoffRequest {
  fromPath: string | undefined; // 发起交接的对话
  bao: string;
  name: string;
  brief: string;
  mode: "chat" | "background";
}

/** 交接说明的固定结构，写进工具说明里让模型照着写。 */
export const BRIEF_SECTIONS = ["目标", "已经定下的结论和决定", "相关事实、文件和链接", "还没解决的问题", "明确不要做的事"];

export function handoffTool(opts: {
  listBaos: () => string[];
  onHandoff: (req: HandoffRequest) => Promise<string>; // 返回给模型看的结果（新对话的位置）
}): ToolDefinition {
  const params = Type.Object({
    bao: Type.String({ description: "交给哪个宝（agent 文件夹名）" }),
    name: Type.String({ description: "新对话的短名，2 到 8 个字，概括这件事" }),
    brief: Type.String({
      description: `交接说明。按这几块写，只写新事用得上的，旧话题里无关的不要带：${BRIEF_SECTIONS.map((s) => `【${s}】`).join("")}`,
    }),
    mode: Type.Optional(
      Type.Union([Type.Literal("chat"), Type.Literal("background")], {
        description: "chat：开一段新对话等用户来聊；background：新对话拿到说明后直接开始干，做完回报到这里",
      }),
    ),
  });
  return {
    name: "kiki_handoff",
    label: "交接给新对话",
    description:
      "把一件新的事交接到一段新对话：你来写交接说明（这件事需要的上下文），Kiki 新开对话并把说明作为第一条消息。" +
      `可选的宝：${opts.listBaos().join("、")}。`,
    promptSnippet: "kiki_handoff：发现在聊的是一件新的事时，写好交接说明，分到一段新对话里去",
    promptGuidelines: [
      "当讨论里冒出一件独立的新事（新任务、新项目、换了领域），而不是当前话题的子问题时，考虑用 kiki_handoff 分出去。",
      "先在回复里问用户一句\"这像是一件新事，要分出去吗？\"，用户同意后再调用；用户明确要求分出去时直接调用。",
      `交接说明按【${BRIEF_SECTIONS.join("】【")}】写，让新对话的 agent 读完就能接着干，不需要再看旧聊天。`,
      "调用后告诉用户分到了哪里（宝/对话名）。",
    ],
    parameters: params,
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      const fromPath = ctx?.sessionManager?.getSessionFile?.();
      try {
        const where = await opts.onHandoff({ fromPath, bao: p.bao, name: p.name, brief: p.brief, mode: p.mode ?? "chat" });
        return { content: [{ type: "text", text: where }], details: undefined };
      } catch (e) {
        return { content: [{ type: "text", text: `交接失败：${(e as Error).message}` }], details: undefined, isError: true } as any;
      }
    },
  };
}

/** 新对话收到的第一条消息。 */
export function briefMessage(fromLabel: string | undefined, brief: string, mode: "chat" | "background") {
  const head = fromLabel ? `这是从「${fromLabel}」交接过来的一件新事。` : "这是交接过来的一件新事。";
  const tail = mode === "background" ? "请直接开始做，做完给出结论。" : "先读完，用两三句话确认你理解的目标和下一步，然后等用户。";
  return `${head}\n\n${brief.trim()}\n\n${tail}`;
}
