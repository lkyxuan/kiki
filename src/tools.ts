// Kiki 给对话里的 agent 的几个工具：看别的对话、给别的对话捎话、记到"关于我"或某个宝的说明里。
// 都是直接做、做完回一句回执，不先问用户（见 分派规则.md）。
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { baoFile } from "./bao.js";

export interface ToolHost {
  /** 所有对话一览，或某段对话最近的 n 条 */
  peek(target: string | undefined, n: number): string;
  /** 给另一段对话捎一句话；对方回答后回报到发起对话。立刻返回回执。 */
  relay(fromPath: string | undefined, target: string, text: string): Promise<string>;
}

const NOTES = "## 记下的事";

/** 把一条记录追加到 AGENTS.md 末尾的"记下的事"里。scope 为"我"时写 ~/kiki-data/AGENTS.md，否则写那个宝的。 */
export function remember(dataDir: string, baos: string[], scope: string, text: string): string {
  const me = scope === "我" || scope === "关于我";
  if (!me && !baos.includes(scope)) throw new Error(`没有宝「${scope}」，可选：我、${baos.join("、")}`);
  const file = me ? join(dataDir, "AGENTS.md") : baoFile(dataDir, scope);
  const line = text.replace(/\s*\n\s*/g, " ").trim();
  if (!line) throw new Error("内容是空的");
  const old = existsSync(file) ? readFileSync(file, "utf8") : "";
  const head = old.includes(NOTES) ? "" : `${old && !old.endsWith("\n") ? "\n" : ""}\n${NOTES}\n\n`;
  appendFileSync(file, `${head}- ${line}\n`);
  return `已记到${me ? "「关于我」" : `宝「${scope}」的说明`}里：${line}（之后新开的对话都会看到）`;
}

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], details: undefined, ...(isError ? { isError } : {}) }) as any;

export function kikiTools(opts: { host: ToolHost; dataDir: string; listBaos: () => string[] }): ToolDefinition[] {
  const peek: ToolDefinition = {
    name: "kiki_peek",
    label: "看别的对话",
    description: "不带 target：列出所有宝和对话（标出正在跑的）。带 target（宝名/对话名）：看那段对话最近的几条消息。",
    promptSnippet: "kiki_peek：看有哪些对话，或者看另一段对话聊到哪了",
    promptGuidelines: ["用户提到别的对话、别的项目进展时，先用 kiki_peek 看一眼再回答，不要猜。"],
    parameters: Type.Object({
      target: Type.Optional(Type.String({ description: "宝名/对话名，比如 dev/路由器；不填就列出全部" })),
      n: Type.Optional(Type.Number({ description: "看最近几条，默认 10" })),
    }),
    async execute(_id, p: any) {
      try {
        return text(opts.host.peek(p.target, Math.min(Math.max(p.n ?? 10, 1), 40)));
      } catch (e) {
        return text((e as Error).message, true);
      }
    },
  };

  const relay: ToolDefinition = {
    name: "kiki_relay",
    label: "给别的对话捎话",
    description:
      "把一件事交给别的宝或另一段已有对话：target 只写宝名就进那个宝的主对话（由它决定怎么办），写「宝名/对话名」就进那段讨论串。那边回答后，回答会记回这段对话。立刻返回，不用等。",
    promptSnippet: "kiki_relay：属于别的宝的事交给那个宝；结论捎给另一段对话",
    promptGuidelines: [
      "用户在这里说的话里有属于别的宝领域的事（对照宝目录里每个宝负责什么）：先在这里简单答一两句，同时用 kiki_relay 把那件事抄送给那个宝（target 写宝名进它的主对话；明确属于它某段讨论串就写「宝名/对话名」），让那边接着跟。不要先问用户。",
      "一句话里牵涉好几个宝，就拆开：每个宝各调一次 kiki_relay，只交属于它的那一件，写成那边能直接动手的具体任务，不要把整段原话一股脑转过去。",
      "抄送完在回答末尾列出每件交给了谁，每件写成 [宝名](kiki:宝名/主对话) 或 [对话名](kiki:宝/对话名)，网页会显示成卡片。属于本宝、本对话的事照常原地答，不用抄送。",
      "这边得出的结论、决定，那边需要知道的，也用 kiki_relay 捎过去。",
      "交过去的话要自带上下文（用户原话 + 必要的背景），让那边不看这边的聊天也能懂。",
      "和别的宝无关的闲话、这边自己能收尾的小结论，不用捎。",
    ],
    parameters: Type.Object({
      target: Type.String({ description: "宝名（进它的主对话），或 宝名/对话名（进那段讨论串）" }),
      text: Type.String({ description: "交过去的话，自带上下文" }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      try {
        return text(await opts.host.relay(ctx?.sessionManager?.getSessionFile?.(), p.target, p.text));
      } catch (e) {
        return text(`没捎成：${(e as Error).message}`, true);
      }
    },
  };

  const note: ToolDefinition = {
    name: "kiki_remember",
    label: "记下来",
    description: `把一件以后要记住的事写进说明文件：scope 填"我"写进「关于我」（所有对话都会看到），填宝名写进那个宝的说明。可选的宝：${opts.listBaos().join("、")}。`,
    promptSnippet: "kiki_remember：把用户的偏好、长期事实记进「关于我」或某个宝的说明",
    promptGuidelines: [
      "用户说出长期有用的事（偏好、身份、习惯、项目的固定约定）时，直接用 kiki_remember 记下来，不要先问；记完一句话告诉用户记了什么。",
      "一次只记一条、一句话，不要记临时的、这次对话才用得上的事。",
      "记之前看一眼「关于我」和宝的说明（已经在你的系统提示里），意思已经有了就不要重复记。",
    ],
    parameters: Type.Object({
      scope: Type.String({ description: "\"我\" 或宝名" }),
      text: Type.String({ description: "要记的一句话" }),
    }),
    async execute(_id, p: any) {
      try {
        return text(remember(opts.dataDir, opts.listBaos(), p.scope, p.text));
      } catch (e) {
        return text(`没记上：${(e as Error).message}`, true);
      }
    },
  };

  return [peek, relay, note];
}
