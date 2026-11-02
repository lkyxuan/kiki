// kiki_look：当前模型看不了图（比如 DeepSeek）时，让看图模型再仔细看一眼某张图（学的 Hermes 的 vision_analyze）。
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { validImageName } from "./images.js";

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], details: undefined, ...(isError ? { isError } : {}) }) as any;

export function lookTool(look: (name: string, question: string) => Promise<string>): ToolDefinition {
  return {
    name: "kiki_look",
    label: "看图",
    description: "让能看图的模型看一张用户发来的图片，回答具体问题。image 是图片文件名（消息里 <kiki-image-note> 写着），question 写要看什么。",
    promptSnippet: "kiki_look：看用户发来的图片里的细节",
    promptGuidelines: ["消息里只有图片的文字描述、又需要图里的细节（小字、数字、表格）时，用 kiki_look 再看一眼，不要猜。"],
    parameters: Type.Object({
      image: Type.String({ description: "图片文件名，比如 0123abcd….png" }),
      question: Type.String({ description: "要看什么，比如：把表格第三列的数字都抄下来" }),
    }),
    async execute(_id, p: any) {
      const name = String(p.image ?? "").split("/").pop() ?? "";
      if (!validImageName(name)) return text(`图片文件名不对：${p.image}`, true);
      try {
        return text(await look(name, String(p.question ?? "把图里的内容完整写下来")));
      } catch (e) {
        return text((e as Error).message, true);
      }
    },
  };
}
