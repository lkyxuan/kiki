import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIEFING, briefing, ensureBriefing } from "./briefing.js";
import { MemoryTaskStore, type Task, type TaskBackend, Tasks } from "./tasks.js";

const now = new Date("2026-11-03T08:30:00"); // 周二
const at = (h: string) => new Date(`2026-11-03T${h}:00`).toISOString();
const base = { agent: "dev", prompt: "p", created: at("00:00") } as const;
const task = (o: Partial<Task>): Task => ({ ...base, id: o.title!, status: "todo", ...o }) as Task;

test("简报：等你、没做成、做完了、今天要做，分块列出；超过一天的不算", () => {
  const text = briefing(
    [
      task({ title: "写周报", status: "done", finished: at("01:00") }),
      task({ title: "报名", status: "done", finished: "2026-10-27T08:00:00.000Z", watching: "等审核结果" }),
      task({ title: "老任务", status: "done", finished: "2026-11-01T08:00:00.000Z" }),
      task({ title: "抓数据", status: "failed", finished: at("02:00"), result: "网站打不开\n详情…" }),
      task({ title: "订机票", status: "blocked", question: "要靠窗还是靠过道？" }),
      task({ title: "整理邮件", when: at("10:00"), repeat: "工作日 10:00" }),
      task({ title: "明天的事", when: "2026-11-04T09:00:00" }),
      task({ title: "先记着", hold: true }),
      task({ title: "跑测试", status: "running" }),
      task({ title: "每日简报", when: at("08:30"), repeat: "每天 08:30", executor: BRIEFING }),
    ],
    now,
    { approvals: 2 },
  );
  assert.match(text, /^☀️ 早上好，今天是 11月3日 周二。/);
  assert.match(text, /\*\*等你\*\*（2）\n- 订机票：要靠窗还是靠过道？（\/answer 订机票 你的回答）\n- 还有 2 张卡片等你点头/);
  assert.match(text, /\*\*没做成\*\*（1）\n- 抓数据：网站打不开 → \/retry 抓数据/);
  assert.match(text, /\*\*昨天到现在做完了\*\*（1）\n- 写周报 · dev/);
  assert.match(text, /\*\*今天要做\*\*（2）\n- 正在做：跑测试 · dev\n- 10:00 整理邮件 · dev（工作日 10:00）/);
  assert.match(text, /\*\*还在盯着\*\*（1）\n- 报名：等审核结果/);
  assert.match(text, /另外有 1 件事记在待办里/);
  assert.doesNotMatch(text, /老任务|明天的事|每日简报 ·/);
});

test("简报：什么都没有时说一句没有", () => {
  assert.match(briefing([], now), /昨天到现在没有新的任务，今天也没有排上的事。/);
});

const backend: TaskBackend = { spawn: async () => "/s", send: async () => "x", note: async () => {} };

test("每日简报卡：第一次建成每天 08:30 的定时任务；已有（含取消的）不再建；到点由执行者出正文", async () => {
  let t = new Date("2026-11-03T08:29:59.950").getTime();
  const tasks = new Tasks(new MemoryTaskStore(), backend, { now: () => new Date(t) });
  tasks.registerExecutor(BRIEFING, { run: async () => briefing(tasks.list(), new Date(t)) });
  const tpl = ensureBriefing(tasks, { agent: "奇奇" })!;
  assert.equal(tpl.repeat, "每天 08:30");
  assert.equal(tpl.status, "todo");
  assert.equal(new Date(tpl.when!).getHours(), 8);
  assert.equal(ensureBriefing(tasks, { agent: "奇奇" }), undefined);
  t += 50;
  await new Promise((r) => setTimeout(r, 150));
  const run = tasks.list((x) => x.parent === tpl.id)[0];
  assert.equal(run?.status, "done");
  assert.match(run.result!, /早上好/);
  assert.equal(new Date(tpl.when!).getDate(), 4, "挪到明天");
  tasks.cancel(tpl.id);
  assert.equal(ensureBriefing(tasks, { agent: "奇奇" }), undefined, "取消后不再建");
});
