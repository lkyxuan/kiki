// 对话摘要：每段对话一句话（30 到 40 字），说清在聊什么、到哪一步了。
// 每次回完话，后台用便宜模型重写一遍，存进 registry.json。奇奇路由、宝的主对话看讨论串，都只看摘要，不看原文。
import type { Registry } from "./registry.js";

export const SUMMARY_MAX = 40;

const SYSTEM = `你给一段对话写一句话摘要，给分派助手看，让它一眼知道这段对话在聊什么、做到哪一步了。
要求：中文，不超过 ${SUMMARY_MAX} 个字，一句话，不加引号、不加"这段对话"之类的开头，只输出摘要本身。
有旧摘要的话，在它的基础上按最新内容改写。`;

export function buildSummaryInput(name: string, old: string | undefined, lines: { role: string; text: string }[]): string {
  const body = lines
    .slice(-12)
    .map((l) => `${l.role === "user" ? "用户" : "助理"}：${l.text.replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  return `对话名：${name}\n旧摘要：${old ?? "（无）"}\n\n最近的内容：\n${body}`;
}

/** 模型输出收拾成一行，去掉引号和多余前缀，截到上限。 */
export function cleanSummary(raw: string): string {
  const line = raw.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return [...line.replace(/^(摘要[:：]\s*)/, "").replace(/^["“「『]+|["”」』]+$/g, "").trim()].slice(0, SUMMARY_MAX).join("");
}

export class Summaries {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Set<string>();
  private again = new Set<string>();

  constructor(
    private o: {
      registry: Registry;
      history: (path: string) => { role: string; text: string }[];
      complete: (system: string, user: string) => Promise<string>;
      delayMs?: number; // 回完话等一会儿再总结，连着几句只总结一次
    },
  ) {}

  /** 这段对话刚回完话：过一会儿在后台更新摘要。 */
  schedule(path: string) {
    if (!this.o.registry.byPath(path)) return;
    clearTimeout(this.timers.get(path));
    this.timers.set(
      path,
      setTimeout(() => {
        this.timers.delete(path);
        void this.run(path);
      }, this.o.delayMs ?? 1500),
    );
  }

  async run(path: string): Promise<void> {
    if (this.running.has(path)) {
      this.again.add(path); // 正在写，写完再来一遍
      return;
    }
    this.running.add(path);
    try {
      const rec = this.o.registry.byPath(path);
      if (!rec) return;
      const lines = this.o.history(path);
      let summary: string | undefined;
      if (lines.length) {
        try {
          summary = cleanSummary(await this.o.complete(SYSTEM, buildSummaryInput(rec.name, rec.summary, lines))) || undefined;
        } catch (e) {
          console.warn("[summary] 写摘要失败：", (e as Error).message);
        }
      }
      this.o.registry.setSummary(path, summary); // 写不出来也记下活跃时间
    } finally {
      this.running.delete(path);
      if (this.again.delete(path)) void this.run(path);
    }
  }
}
