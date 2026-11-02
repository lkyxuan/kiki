// 任务工具：对话里的 agent 可以记待办、定时任务、"等 A 做完再做 B"；后台任务卡住时可以停下来问用户。
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { nextRun, parseWhen, showTime } from "./schedule.js";
import { OPEN, STATUS_LABEL, type Task, type Tasks } from "./tasks.js";

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], details: undefined, ...(isError ? { isError } : {}) }) as any;

/** 一行任务说明：给 agent 和用户看。 */
export function taskLine(t: Task, now = new Date()): string {
  const when = t.repeat ? `${t.repeat}，下次 ${t.when ? showTime(t.when, now) : "？"}` : t.when && t.status === "todo" ? `${showTime(t.when, now)} 开始` : "";
  const extra = [when, t.after && t.status === "todo" ? `等任务 ${t.after}` : ""].filter(Boolean).join("，");
  return `[${t.repeat ? "定时" : STATUS_LABEL[t.status]}] ${t.title} · ${t.agent}${extra ? ` · ${extra}` : ""} · ${t.id}`;
}

export function taskTools(opts: {
  tasks: Tasks;
  listBaos: () => string[];
  /** 这段对话属于哪个宝（不填宝时用） */
  baoOf: (sessionPath: string | undefined) => string | undefined;
  now?: () => Date;
}): ToolDefinition[] {
  const now = () => opts.now?.() ?? new Date();

  const task: ToolDefinition = {
    name: "kiki_task",
    label: "记任务",
    description:
      "管理后台任务。action=add：记一件要后台去做的事——填 when 就到点再做，填 repeat 就按时重复（定时任务），填 after 就等那个任务做完再做，都不填就马上开始；hold=true 只记进待办、等用户点开始。" +
      "action=list：看还没结束的任务。action=cancel：取消一个待办/定时任务（填 id）。" +
      "when 的写法：+30m、+2h、+1d、21:00（今天，过了就明天）、明天 09:00、后天 9:30、周五 18:00、下周一 10:00、2026-11-05 09:00。" +
      "repeat 的写法：每天 09:00、工作日 09:00、每周一 09:00、每小时。",
    promptSnippet: "kiki_task：记待办、定时任务（每天/每周）、等某个任务做完再做的事",
    promptGuidelines: [
      "用户说「明天/几点/每天/每周…帮我做…」「等…做完再…」「先记下，回头做」时，用 kiki_task 记下来，不要只口头答应；记完一句话告诉用户什么时候做、做完回报到哪。",
      "prompt 要写成到时候能直接动手的完整任务（自带背景），因为执行时是一段新的后台对话，看不到这里的聊天。",
      "用户要取消或改时间：先 action=list 找到 id，cancel 掉旧的，需要的话再 add 一个新的。",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("add"), Type.Literal("list"), Type.Literal("cancel")], { description: "默认 add" })),
      title: Type.Optional(Type.String({ description: "任务名，10 个字以内" })),
      prompt: Type.Optional(Type.String({ description: "到时候交给后台对话的完整任务说明" })),
      bao: Type.Optional(Type.String({ description: "交给哪个宝做，默认本宝" })),
      when: Type.Optional(Type.String({ description: "什么时候做（一次性）" })),
      repeat: Type.Optional(Type.String({ description: "重复规则（定时任务）" })),
      after: Type.Optional(Type.String({ description: "等这个任务 id 做完再做" })),
      hold: Type.Optional(Type.Boolean({ description: "只记进待办，等用户手动开始" })),
      id: Type.Optional(Type.String({ description: "cancel 时填任务 id" })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      const from: string | undefined = ctx?.sessionManager?.getSessionFile?.();
      try {
        const action = p.action ?? "add";
        if (action === "list") {
          const open = opts.tasks.list((t) => OPEN.includes(t.status));
          return text(open.length ? open.map((t) => taskLine(t, now())).join("\n") : "现在没有没做完的任务。");
        }
        if (action === "cancel") {
          const t = opts.tasks.cancel(p.id ?? "");
          return t ? text(`已取消：${t.title}`) : text(`没取消成：没有这个待办/定时任务（${p.id}），用 action=list 看看。`, true);
        }
        if (!p.title?.trim() || !p.prompt?.trim()) return text("add 需要 title 和 prompt。", true);
        const bao = p.bao?.trim() || opts.baoOf(from);
        if (!bao || !opts.listBaos().includes(bao)) return text(`没有宝「${bao ?? ""}」，可选：${opts.listBaos().join("、")}`, true);
        let when: string | undefined;
        if (p.when) {
          const d = parseWhen(p.when, now());
          if (!d) return text(`看不懂时间「${p.when}」。${task.description.split("。").find((s) => s.startsWith("when"))}`, true);
          when = d.toISOString();
        }
        if (p.repeat && !nextRun(p.repeat, now())) return text(`看不懂重复规则「${p.repeat}」，可以写：每天 09:00、工作日 09:00、每周一 09:00、每小时`, true);
        const t = opts.tasks.start({
          agent: bao,
          title: p.title.trim().slice(0, 30),
          prompt: p.prompt.trim(),
          when,
          repeat: p.repeat?.trim() || undefined,
          after: p.after?.trim() || undefined,
          hold: !!p.hold,
          reportTo: from,
          chatId: "app",
        });
        const how = t.repeat
          ? `定时任务，${t.repeat}，第一次 ${showTime(t.when!, now())}`
          : t.status === "todo"
            ? t.when
              ? `${showTime(t.when, now())} 开始`
              : t.after
                ? `等任务「${opts.tasks.get(t.after)?.title ?? t.after}」做完再开始`
                : "已放进待办，等你点开始"
            : "已经开始做";
        return text(`已记下「${t.title}」（${bao}）：${how}。做完会回报到这段对话和收件箱。任务 id：${t.id}`);
      } catch (e) {
        return text(`没记上：${(e as Error).message}`, true);
      }
    },
  };

  const ask: ToolDefinition = {
    name: "kiki_ask_user",
    label: "停下来问你",
    description:
      "只在后台任务里用：缺了没法自己判断的关键信息、猜错代价很大时，把问题交给用户，然后结束这一轮（简短说清做到哪了、卡在哪）。用户回答后会在这段对话里接着说，你接着干。",
    promptSnippet: "kiki_ask_user：后台任务卡住、必须用户拍板时停下来问",
    promptGuidelines: [
      "能自己合理判断的就自己定，在结果里写明你的假设，不要动不动就问；只有缺关键信息、猜错代价大时才用 kiki_ask_user。",
      "调用 kiki_ask_user 后不要继续干活，回一两句说明卡在哪就结束这一轮。",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "要用户回答的问题，自带背景，最好给出选项" }),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      const from: string | undefined = ctx?.sessionManager?.getSessionFile?.();
      const t = from ? opts.tasks.ask(from, p.question ?? "") : undefined;
      if (!t) return text("这里不是后台任务，直接在回答里问用户就行。", true);
      return text("问题已经交给用户。现在停下，用一两句话说明做到哪了、卡在哪，然后结束这一轮。");
    },
  };

  return [task, ask];
}
