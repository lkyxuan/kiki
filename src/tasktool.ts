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

/** 关注清单（收发室管，每个宝一份，在 agents/<宝>/ 下）：任务做完后还要盯的事，写进任务所属那个宝的清单。有相关新消息时收发室调 tasks.followUp(taskId, 消息)。 */
export interface WatchList {
  add(w: { taskId: string; title: string; about: string; match: string; until?: string; agent: string; session?: string }): Promise<string> | string;
  remove(taskId: string, agent: string): Promise<void> | void;
}

export function taskTools(opts: {
  tasks: Tasks;
  /** 收发室的关注清单；没接上时 kiki_watch 会说一声 */
  watch?: () => WatchList | undefined;
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
      "action=list：看任务（没结束的 + 最近做完的）。action=stop：停下任务（正在跑的也能停，填 id）。" +
      "action=revise：改任务（填 id 和 text）——没开跑的改进任务内容，正在跑的插话进去，等你回答的当作回答，做完的在原对话里返工、做完重新回报。" +
      "done_when：一句话写做到什么算完（完成标准），执行时会对照它。" +
      "when 的写法：+30m、+2h、+1d、21:00（今天，过了就明天）、明天 09:00、后天 9:30、周五 18:00、下周一 10:00、2026-11-05 09:00。" +
      "repeat 的写法：每天 09:00、工作日 09:00、每周一 09:00、每小时。",
    promptSnippet: "kiki_task：记待办、定时任务（每天/每周）、等某个任务做完再做的事",
    promptGuidelines: [
      "用户说「明天/几点/每天/每周…帮我做…」「等…做完再…」「先记下，回头做」时，用 kiki_task 记下来，不要只口头答应；记完一句话告诉用户什么时候做、做完回报到哪。",
      "prompt 要写成到时候能直接动手的完整任务（自带背景），因为执行时是一段新的后台对话，看不到这里的聊天。",
      "add 时尽量填 done_when（做到什么算完），让结果有明确的边界。",
      "用户要停、改、返工某个任务：先 action=list 找到 id，再用 stop 或 revise（text 写成给那个任务的一句话）；改时间就 stop 掉旧的再 add 一个新的。",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([Type.Literal("add"), Type.Literal("list"), Type.Literal("stop"), Type.Literal("revise"), Type.Literal("cancel")], { description: "默认 add；cancel 同 stop" }),
      ),
      title: Type.Optional(Type.String({ description: "任务名，10 个字以内" })),
      prompt: Type.Optional(Type.String({ description: "到时候交给后台对话的完整任务说明" })),
      bao: Type.Optional(Type.String({ description: "交给哪个宝做，默认本宝" })),
      when: Type.Optional(Type.String({ description: "什么时候做（一次性）" })),
      repeat: Type.Optional(Type.String({ description: "重复规则（定时任务）" })),
      after: Type.Optional(Type.String({ description: "等这个任务 id 做完再做" })),
      hold: Type.Optional(Type.Boolean({ description: "只记进待办，等用户手动开始" })),
      id: Type.Optional(Type.String({ description: "stop / revise 时填任务 id" })),
      text: Type.Optional(Type.String({ description: "revise 时填：给那个任务的话" })),
      done_when: Type.Optional(Type.String({ description: "完成标准：做到什么算完，一句话" })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      const from: string | undefined = ctx?.sessionManager?.getSessionFile?.();
      try {
        const action = p.action ?? "add";
        if (action === "list") {
          const open = opts.tasks.list((t) => OPEN.includes(t.status));
          const recent = opts.tasks.list((t) => !OPEN.includes(t.status)).slice(-5);
          const lines = [...open, ...recent].map((t) => taskLine(t, now()));
          return text(lines.length ? lines.join("\n") : "还没有任务。");
        }
        if (action === "stop" || action === "cancel") {
          const t = await opts.tasks.stop(p.id ?? "");
          if (!t) return text(`没停成：没有这个任务（${p.id}），用 action=list 看看。`, true);
          return text(t.status === "running" ? `正在停下「${t.title}」。` : t.status === "cancelled" ? `已停下「${t.title}」。` : `「${t.title}」已经${STATUS_LABEL[t.status]}了，不用停。`);
        }
        if (action === "revise") {
          const how = opts.tasks.revise(p.id ?? "", p.text ?? "");
          return how ? text(how) : text("没改成：没有这个任务、没写 text，或者它正由外部 bot 在做。", true);
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
          doneWhen: p.done_when?.trim() || undefined,
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
            ? t.hold
              ? "已放进待办，等你点开始"
              : t.when
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

  const watch: ToolDefinition = {
    name: "kiki_watch",
    label: "盯着后续",
    description:
      "只在后台任务里用：这件事做完了但还有后续要等（比如报了名等对方回邮件、提交了申请等审核结果、下单了等发货），就记进关注清单。" +
      "之后有相关的新消息（邮件等）进来，会回到这段对话里交给你，你在原来的上下文里接着办。action=add 记下（填 about 和 match），action=stop 不用再盯了。",
    promptSnippet: "kiki_watch：任务做完还有后续要等时，记进关注清单，新消息来了回到这里接着办",
    promptGuidelines: [
      "后台任务做完时想一想：这件事之后还会有对方的回复、通知或截止日期吗？有就用 kiki_watch 记一条，about 写清在等什么、等到了要做什么，match 写几个用顿号隔开的短词（发件人、项目名、关键词），收发室先用它们筛消息。",
      "收到关注的新消息后，事情彻底办完了就 kiki_watch action=stop。",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("add"), Type.Literal("stop")], { description: "默认 add" })),
      about: Type.Optional(Type.String({ description: "在等什么、等到了要做什么，一两句，比如：等 XX 项目的报名审核结果，通过后要按邮件交材料" })),
      match: Type.Optional(Type.String({ description: "怎么认出相关消息：写几个短词，用顿号隔开（发件人、项目名、关键词），比如：XX 基金会、报名、审核" })),
      until: Type.Optional(Type.String({ description: "盯到什么时候（可选），比如 2026-12-01 或 +30d" })),
    }),
    async execute(_id, p: any, _signal, _onUpdate, ctx) {
      const from: string | undefined = ctx?.sessionManager?.getSessionFile?.();
      const t = from ? opts.tasks.bySession(from) : undefined;
      if (!t) return text("kiki_watch 只在后台任务里用。", true);
      const list = opts.watch?.();
      if (!list) return text("关注清单还没接上（收发室没开），先在结果里写清楚之后要留意什么。", true);
      try {
        if (p.action === "stop") {
          await list.remove(t.id, t.agent);
          opts.tasks.setWatching(t.id, undefined);
          return text("已经不再盯这件事了。");
        }
        if (!p.about?.trim() || !p.match?.trim()) return text("add 需要 about 和 match。", true);
        const about = p.about.trim();
        await list.add({ taskId: t.id, title: t.title, about, match: p.match.trim(), until: p.until?.trim() || undefined, agent: t.agent, session: t.session });
        opts.tasks.setWatching(t.id, about);
        return text(`已记进关注清单：${about}。有相关新消息会回到这段对话交给你。`);
      } catch (e) {
        return text(`没记上：${(e as Error).message}`, true);
      }
    },
  };

  return [task, ask, watch];
}
