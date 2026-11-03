// 每日简报：每天早上奇奇在主对话里说一条——昨天到现在做完了什么、没做成什么、什么在等你、今天要做什么。
// 用的就是定时任务：一张“每天 08:30”的任务卡，执行者是 Kiki 自己（briefing），
// 内容直接从任务账本算出来，不调模型，又快又不会编。用户在看板上取消这张卡就不再发，重启也不会再建。
import { showTime } from "./schedule.js";
import type { Task, Tasks } from "./tasks.js";

export const BRIEFING = "briefing";

const DAY = 86_400_000;
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const MAX = 8;

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const firstLine = (s = "", n = 60) => {
  const l = s.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  return l.length > n ? `${l.slice(0, n)}…` : l;
};

function section(title: string, items: string[]): string[] {
  if (!items.length) return [];
  const shown = items.slice(0, MAX);
  if (items.length > MAX) shown.push(`- 还有 ${items.length - MAX} 个，/tasks all 看全部`);
  return [`**${title}**（${items.length}）`, ...shown, ""];
}

/** 算出简报正文。extra.approvals：有几张卡片在等用户点头。 */
export function briefing(all: Task[], now = new Date(), extra: { approvals?: number; coders?: { done: string[]; waiting: string[] } } = {}): string {
  const list = all.filter((t) => t.executor !== BRIEFING);
  const since = now.getTime() - DAY;
  const recent = (t: Task) => !!t.finished && new Date(t.finished).getTime() >= since;

  const done = list.filter((t) => t.status === "done" && recent(t)).map((t) => `- ${t.title} · ${t.agent}`);
  const failed = list
    .filter((t) => (t.status === "failed" || t.status === "interrupted") && recent(t))
    .map((t) => `- ${t.title}：${firstLine(t.result, 40) || "没做完"} → /retry ${t.id}`);
  const waiting = list.filter((t) => t.status === "blocked").map((t) => `- ${t.title}：${firstLine(t.question)}（/answer ${t.id} 你的回答）`);
  if (extra.approvals) waiting.push(`- 还有 ${extra.approvals} 张卡片等你点头（右栏“等你点头”）`);
  if (extra.coders) waiting.push(...extra.coders.waiting); // 你在终端里开的 Claude Code / Codex
  const running = list.filter((t) => t.status === "running" || t.status === "queued").map((t) => `- 正在做：${t.title} · ${t.agent}`);
  const today = list
    .filter((t) => t.status === "todo" && !t.hold && t.when && sameDay(new Date(t.when), now) && new Date(t.when) >= now)
    .sort((a, b) => a.when!.localeCompare(b.when!))
    .map((t) => `- ${showTime(t.when!, now).replace(/^今天 /, "")} ${t.title} · ${t.agent}${t.repeat ? `（${t.repeat}）` : ""}`);
  const watching = list.filter((t) => t.watching && t.status !== "cancelled").map((t) => `- ${t.title}：${firstLine(t.watching)}`);
  const held = list.filter((t) => t.status === "todo" && t.hold).length;

  const p = (n: number) => String(n).padStart(2, "0");
  const lines = [`☀️ 早上好，今天是 ${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}。`, ""];
  const body = [
    ...section("等你", waiting),
    ...section("没做成", failed),
    ...section("昨天到现在做完了", [...done, ...(extra.coders?.done ?? [])]),
    ...section("今天要做", [...running, ...today]),
    ...section("还在盯着", watching),
  ];
  if (!body.length) lines.push("昨天到现在没有新的任务，今天也没有排上的事。");
  else lines.push(...body);
  if (held) lines.push(`另外有 ${held} 件事记在待办里，等你点开始（看板里能看到）。`);
  return lines.join("\n").trim() + `\n\n（${p(now.getHours())}:${p(now.getMinutes())} 的简报；不想要了在看板里取消“每日简报”。）`;
}

/** 第一次启动时建好“每日简报”这张定时任务卡；已经有了（包括被取消的）就不动。 */
export function ensureBriefing(tasks: Tasks, opts: { agent: string; at?: string }): Task | undefined {
  if (tasks.list((t) => t.executor === BRIEFING && !t.parent).length) return undefined;
  return tasks.start({
    agent: opts.agent,
    title: "每日简报",
    prompt: "每天早上汇总：昨天到现在做完了什么、没做成什么、什么在等你、今天要做什么。",
    repeat: `每天 ${opts.at || "08:30"}`,
    executor: BRIEFING,
  });
}
