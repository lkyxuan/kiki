import assert from "node:assert/strict";
import { test } from "node:test";
import { MemoryTaskStore, Tasks } from "./tasks.js";
import { taskTools } from "./tasktool.js";

const now = new Date(2026, 10, 2, 10, 30);
function setup() {
  const sent: string[] = [];
  const tasks = new Tasks(new MemoryTaskStore(), {
    spawn: async (a, title) => `/fake/${a}/${title}.jsonl`,
    send: async (_a, _p, t) => (sent.push(t), "ok"),
    note: async () => {},
  }, { now: () => now });
  const [task, ask] = taskTools({ tasks, listBaos: () => ["dev", "life"], baoOf: () => "dev", now: () => now });
  const ctx = (file?: string) => ({ sessionManager: { getSessionFile: () => file } }) as any;
  const call = async (tool: any, p: any, file = "/from.jsonl") => {
    const r = await tool.execute("id", p, undefined, undefined, ctx(file));
    return { text: r.content[0].text as string, err: !!r.isError };
  };
  return { tasks, task, ask, call, sent };
}

test("kiki_task：定时、重复、等待、只记下", async () => {
  const { tasks, task, call } = setup();
  let r = await call(task, { title: "提醒买菜", prompt: "提醒我买菜", when: "明天 18:00" });
  assert.match(r.text, /已记下「提醒买菜」（dev）：明天 18:00 开始/);
  r = await call(task, { title: "早报", prompt: "整理早报", repeat: "工作日 09:00", bao: "life" });
  assert.match(r.text, /定时任务，工作日 09:00，第一次 明天 09:00/);
  const first = tasks.list()[0];
  r = await call(task, { title: "后续", prompt: "p", after: first.id });
  assert.match(r.text, /等任务「提醒买菜」做完再开始/);
  r = await call(task, { title: "回头", prompt: "p", hold: true });
  assert.match(r.text, /已放进待办，等你点开始/);
  assert.ok(tasks.list().every((t) => t.status === "todo" && t.reportTo === "/from.jsonl"));
  r = await call(task, { action: "list" });
  assert.match(r.text, /\[定时\] 早报 · life · 工作日 09:00，下次 明天 09:00/);
  r = await call(task, { action: "cancel", id: first.id });
  assert.match(r.text, /已取消：提醒买菜/);
});

test("kiki_task：看不懂的时间和规则、没有的宝都报错", async () => {
  const { task, call } = setup();
  assert.ok((await call(task, { title: "x", prompt: "p", when: "改天" })).err);
  assert.ok((await call(task, { title: "x", prompt: "p", repeat: "偶尔" })).err);
  assert.ok((await call(task, { title: "x", prompt: "p", bao: "没这个" })).err);
});

test("kiki_ask_user：只在后台任务里有效", async () => {
  const { tasks, ask, call } = setup();
  assert.ok((await call(ask, { question: "?" }, "/random.jsonl")).err);
  const t = tasks.start({ agent: "dev", title: "活", prompt: "p" });
  t.status = "running";
  t.session = "/fake/dev/活.jsonl";
  const r = await call(ask, { question: "选 A 还是 B？" }, t.session);
  assert.equal(r.err, false);
});
