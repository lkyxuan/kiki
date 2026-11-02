import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileTaskStore, formatTask, MemoryTaskStore, parseTask, type Task, type TaskBackend, Tasks } from "./tasks.js";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function fakeBackend(sendImpl?: (text: string) => Promise<string>) {
  let n = 0;
  const notes: string[] = [];
  const aborted: string[] = [];
  const backend: TaskBackend = {
    spawn: async (a, title) => `/fake/${a}/${title}-${++n}.jsonl`,
    send: (_a, _p, text) => (sendImpl ? sendImpl(text) : Promise.resolve(`做好了：${text}`)),
    abort: async (p) => void aborted.push(p),
    note: async (p, text) => void notes.push(`${p} ${text}`),
  };
  return { backend, notes, aborted };
}

test("任务文件：Markdown + YAML，写出去能原样读回来", () => {
  const t: Task = {
    id: "20261101-120000-abc",
    title: "写周报",
    status: "done",
    agent: "dev",
    prompt: "帮我写周报\n第二行",
    origin: "/x/a.jsonl",
    created: "2026-11-01T12:00:00.000Z",
    result: "## 本周\n- 做了 Kiki",
  };
  const md = formatTask(t);
  assert.match(md, /^---\nid: "20261101-120000-abc"\ntitle: "写周报"\nstatus: "done"/);
  assert.match(md, /\n## 任务\n\n帮我写周报\n第二行\n\n<!-- kiki:result -->\n## 结果\n\n## 本周/);
  assert.deepEqual(parseTask(md), t);
});

test("任务原文里有「## 结果」也不会被截断", () => {
  const base = { id: "x", title: "模板", agent: "dev", created: "", prompt: "按这个格式写：\n\n## 结果\n\n- 要点" };
  assert.deepEqual(parseTask(formatTask({ ...base, status: "queued" })), { ...base, status: "queued" });
  const done = { ...base, status: "done" as const, result: "写好了" };
  assert.deepEqual(parseTask(formatTask(done)), done);
});

test("手改时不加引号也认", () => {
  const t = parseTask("---\nid: x1\nstatus: failed\nagent: life\n---\n\n## 任务\n\n买菜\n");
  assert.equal(t?.status, "failed");
  assert.equal(t?.prompt, "买菜");
});

test("做完：状态写进文件，回报到原对话", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-tasks-"));
  const { backend, notes } = fakeBackend();
  const tasks = new Tasks(new FileTaskStore(dir), backend);
  const seen: string[] = [];
  const t = tasks.start({ agent: "dev", title: "整理", prompt: "整理 README", origin: "/o.jsonl" }, (x) => seen.push(x.status));
  await tick();
  assert.equal(t.status, "done");
  assert.deepEqual(seen, ["queued", "running", "running", "done"]); // 第二个 running 是记下了后台对话
  const files = readdirSync(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^\d{8}-\d{6}-\w+ 整理\.md$/);
  const md = readFileSync(join(dir, files[0]), "utf8");
  assert.match(md, /status: "done"/);
  assert.match(md, /## 结果\n\n做好了：整理 README/);
  assert.match(notes[0], /^\/o\.jsonl ✅ 后台任务「整理」完成/);
});

test("同时最多跑 concurrency 个，其余排队", async () => {
  const gates: (() => void)[] = [];
  const { backend } = fakeBackend((text) => new Promise((r) => gates.push(() => r(text))));
  const tasks = new Tasks(new FileTaskStore(mkdtempSync(join(tmpdir(), "kiki-tasks-"))), backend, { concurrency: 2 });
  const ts = [1, 2, 3].map((i) => tasks.start({ agent: "dev", title: `t${i}`, prompt: `p${i}` }));
  await tick();
  assert.deepEqual(ts.map((t) => t.status), ["running", "running", "queued"]);
  gates.shift()!();
  await tick();
  assert.deepEqual(ts.map((t) => t.status), ["done", "running", "running"]);
  gates.forEach((g) => g());
  await tick();
  assert.ok(ts.every((t) => t.status === "done"));
});

test("开对话就卡住也算超时，之后不再开始干活，也不占着名额", async () => {
  let release!: (p: string) => void;
  const sent: string[] = [];
  const { backend } = fakeBackend(async (text) => (sent.push(text), "ok"));
  const spawn = backend.spawn;
  let first = true;
  backend.spawn = (a, title, from) => {
    if (!first) return spawn(a, title, from);
    first = false;
    return new Promise((r) => (release = r)); // 第一个任务开对话卡住
  };
  const tasks = new Tasks(new FileTaskStore(mkdtempSync(join(tmpdir(), "kiki-tasks-"))), backend, { concurrency: 1, timeoutMs: 20 });
  const a = tasks.start({ agent: "dev", title: "卡住", prompt: "pa" });
  const b = tasks.start({ agent: "dev", title: "后面", prompt: "pb" });
  await tick(50);
  assert.equal(a.status, "failed");
  assert.equal(b.status, "done");
  release("/late.jsonl");
  await tick();
  assert.deepEqual(sent, ["pb"]);
});

test("原对话忙、回报排着队时，队列里的下一个任务照样开跑", async () => {
  const { backend } = fakeBackend();
  backend.note = () => new Promise(() => {}); // 原对话一直忙
  const tasks = new Tasks(new FileTaskStore(mkdtempSync(join(tmpdir(), "kiki-tasks-"))), backend, { concurrency: 1 });
  tasks.start({ agent: "dev", title: "a", prompt: "pa", origin: "/o.jsonl" });
  const b = tasks.start({ agent: "dev", title: "b", prompt: "pb" });
  await tick();
  assert.equal(b.status, "done");
});

test("超时：停下对话，标成失败", async () => {
  const { backend, aborted } = fakeBackend(() => new Promise(() => {}));
  const tasks = new Tasks(new FileTaskStore(mkdtempSync(join(tmpdir(), "kiki-tasks-"))), backend, { timeoutMs: 20 });
  const t = tasks.start({ agent: "dev", title: "慢", prompt: "p" });
  await tick(50);
  assert.equal(t.status, "failed");
  assert.match(t.result!, /没做完，已停下/);
  assert.deepEqual(aborted, [t.session]);
});

test("重启：上次没做完的标成中断，可以重跑", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-tasks-"));
  const a = fakeBackend(() => new Promise(() => {}));
  new Tasks(new FileTaskStore(dir), a.backend).start({ agent: "dev", title: "长活", prompt: "p" });
  await tick();
  // 模拟重启：重新从文件读
  const b = fakeBackend();
  const tasks = new Tasks(new FileTaskStore(dir), b.backend);
  const lost = tasks.recover();
  assert.equal(lost.length, 1);
  assert.equal(lost[0].status, "interrupted");
  assert.match(readFileSync(join(dir, readdirSync(dir)[0]), "utf8"), /status: "interrupted"/);
  const again = tasks.retry(lost[0].id)!;
  await tick();
  assert.equal(again.status, "done");
  assert.equal(readdirSync(dir).length, 2);
});

test("reportTo：不分叉，只回报到指定对话；重跑也带着", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-tasks-"));
  const froms: (string | undefined)[] = [];
  const { backend, notes } = fakeBackend();
  const spawn = backend.spawn;
  backend.spawn = (a, title, from) => (froms.push(from), spawn(a, title, from));
  const tasks = new Tasks(new FileTaskStore(dir), backend);
  const t = tasks.start({ agent: "dev", title: "交接", prompt: "p", reportTo: "/r.jsonl" });
  await tick();
  assert.deepEqual(froms, [undefined]);
  assert.match(notes[0], /^\/r\.jsonl ✅/);
  const reloaded = new Tasks(new FileTaskStore(dir), backend);
  assert.equal(reloaded.get(t.id)?.reportTo, "/r.jsonl");
  reloaded.retry(t.id);
  await tick();
  assert.match(notes[1], /^\/r\.jsonl ✅/);
});

// ---------- 待办、定时、依赖、等你 ----------

function clock(start: string) {
  let t = new Date(start).getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

test("定时：when 在将来就进待办，到点自动开跑", async () => {
  const c = clock("2026-11-02T08:00:00");
  const { backend } = fakeBackend();
  const tasks = new Tasks(new MemoryTaskStore(), backend, { now: c.now });
  const t = tasks.start({ agent: "dev", title: "提醒", prompt: "p", when: new Date(c.now().getTime() + 30).toISOString() });
  assert.equal(t.status, "todo");
  c.advance(30);
  await tick(150); // 闹钟 +50ms 余量
  assert.equal(t.status, "done");
});

test("关机期间到点的待办：recover 时补跑", async () => {
  const c = clock("2026-11-02T08:00:00");
  const store = new MemoryTaskStore();
  const { backend } = fakeBackend();
  const t = new Tasks(store, backend, { now: c.now }).start({ agent: "dev", title: "早报", prompt: "p", when: "2026-11-02T09:00:00" });
  c.advance(2 * 3_600_000);
  const again = new Tasks(store, backend, { now: c.now });
  again.recover();
  await tick();
  assert.equal(again.get(t.id)?.status, "done");
});

test("重复：定时任务自己留在待办，每次到点另开一个任务，挪到下一次", async () => {
  const c = clock("2026-11-02T08:59:59.990");
  const { backend } = fakeBackend();
  const tasks = new Tasks(new MemoryTaskStore(), backend, { now: c.now });
  const tpl = tasks.start({ agent: "dev", title: "早报", prompt: "整理早报", repeat: "每天 09:00" });
  assert.equal(tpl.status, "todo");
  assert.equal(new Date(tpl.when!).getHours(), 9);
  c.advance(20);
  await tick(120);
  const runs = tasks.list((t) => t.parent === tpl.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "done");
  assert.equal(tpl.status, "todo");
  assert.equal(new Date(tpl.when!).getDate(), 3, "下一次是明天 9 点");
  // 现在跑一次：多开一个，不改下次时间
  tasks.runNow(tpl.id);
  await tick();
  assert.equal(tasks.list((t) => t.parent === tpl.id).length, 2);
  assert.equal(new Date(tpl.when!).getDate(), 3);
  // 取消定时任务
  tasks.cancel(tpl.id);
  assert.equal(tpl.status, "cancelled");
});

test("看不懂的重复规则直接报错", () => {
  const tasks = new Tasks(new MemoryTaskStore(), fakeBackend().backend);
  assert.throws(() => tasks.start({ agent: "dev", title: "x", prompt: "p", repeat: "偶尔" }), /看不懂重复规则/);
});

test("等 A 做完再做 B；A 失败则 B 标失败", async () => {
  const gates: ((v: string) => void)[] = [];
  const fails: ((e: Error) => void)[] = [];
  const { backend } = fakeBackend((text) => new Promise((r, j) => (gates.push(r), fails.push(j))));
  const tasks = new Tasks(new MemoryTaskStore(), backend);
  const a = tasks.start({ agent: "dev", title: "A", prompt: "pa" });
  const b = tasks.start({ agent: "dev", title: "B", prompt: "pb", after: a.id });
  await tick();
  assert.equal(b.status, "todo");
  gates[0]("ok");
  await tick();
  assert.equal(a.status, "done");
  assert.equal(b.status, "running");
  gates[1]("ok");
  await tick();
  const c = tasks.start({ agent: "dev", title: "C", prompt: "pc" });
  const d = tasks.start({ agent: "dev", title: "D", prompt: "pd", after: c.id });
  await tick();
  fails[2](new Error("坏了"));
  await tick();
  assert.equal(d.status, "failed");
  assert.match(d.result!, /等的任务「C」失败了/);
  // 重跑 D：不再等 C
  const d2 = tasks.retry(d.id)!;
  assert.equal(d2.after, undefined);
});

test("只记下来（hold）：进待办，点开始才跑", async () => {
  const { backend } = fakeBackend();
  const tasks = new Tasks(new MemoryTaskStore(), backend);
  const t = tasks.start({ agent: "dev", title: "回头做", prompt: "p", hold: true });
  await tick();
  assert.equal(t.status, "todo");
  tasks.runNow(t.id);
  await tick();
  assert.equal(t.status, "done");
});

test("卡住问人：停在等你，回答后在原对话接着干，做完回报", async () => {
  const sent: string[] = [];
  let tasks!: Tasks;
  const { backend, notes } = fakeBackend(async (text) => {
    sent.push(text);
    if (text === "写周报") {
      tasks.ask(tasks.list()[0].session!, "这周的重点是 Kiki 还是别的？");
      return "卡在：不知道重点";
    }
    return `好的，按「${text}」写完了`;
  });
  tasks = new Tasks(new MemoryTaskStore(), backend);
  const seen: string[] = [];
  const t = tasks.start({ agent: "dev", title: "周报", prompt: "写周报", origin: "/o.jsonl" }, (x) => seen.push(x.status));
  await tick();
  assert.equal(t.status, "blocked");
  assert.equal(t.question, "这周的重点是 Kiki 还是别的？");
  assert.equal(notes.length, 0, "卡住时不往原对话回报");
  assert.equal(tasks.blockedBySession(t.session!)?.id, t.id);
  const session = t.session;
  tasks.answer(t.id, "Kiki");
  await tick();
  assert.equal(t.status, "done");
  assert.equal(t.session, session, "在原来那段后台对话里接着干");
  assert.equal(t.question, undefined);
  assert.deepEqual(sent, ["写周报", "Kiki"]);
  assert.match(notes[0], /✅ 后台任务「周报」完成/);
  assert.ok(seen.includes("blocked"));
});

test("不是后台任务的对话里 ask 返回 undefined", () => {
  const tasks = new Tasks(new MemoryTaskStore(), fakeBackend().backend);
  assert.equal(tasks.ask("/random.jsonl", "?"), undefined);
});

test("定时字段写进文件能读回来", () => {
  const t: Task = { id: "x", title: "早报", status: "todo", agent: "dev", prompt: "p", created: "", repeat: "每天 09:00", when: "2026-11-03T01:00:00.000Z" };
  assert.deepEqual(parseTask(formatTask(t)), t);
});

test("依赖失败一路往下传：A 取消 → B、C 都标失败", () => {
  const tasks = new Tasks(new MemoryTaskStore(), fakeBackend().backend);
  const a = tasks.start({ agent: "dev", title: "A", prompt: "p", hold: true });
  const b = tasks.start({ agent: "dev", title: "B", prompt: "p", after: a.id });
  const c = tasks.start({ agent: "dev", title: "C", prompt: "p", after: b.id });
  tasks.cancel(a.id);
  assert.equal(b.status, "failed");
  assert.equal(c.status, "failed");
  assert.ok(tasks.retry(c.id), "下游也能重跑");
});

test("回答卡住的任务也排队，不超过同时跑的上限", async () => {
  const gates: (() => void)[] = [];
  let tasks!: Tasks;
  const { backend } = fakeBackend((text) => {
    if (text === "问") {
      tasks.ask(tasks.list((t) => t.prompt === "问")[0].session!, "?");
      return Promise.resolve("卡住");
    }
    return new Promise((r) => gates.push(() => r(text)));
  });
  tasks = new Tasks(new MemoryTaskStore(), backend, { concurrency: 1 });
  const q = tasks.start({ agent: "dev", title: "q", prompt: "问" });
  await tick();
  assert.equal(q.status, "blocked");
  const other = tasks.start({ agent: "dev", title: "o", prompt: "别的" });
  await tick();
  assert.equal(other.status, "running");
  tasks.answer(q.id, "答");
  await tick();
  assert.equal(q.status, "queued", "名额被占着，回答先排队");
  gates.shift()!();
  await tick();
  assert.equal(other.status, "done");
  assert.equal(q.status, "running");
  gates.shift()!();
  await tick();
  assert.equal(q.status, "done");
  assert.equal(q.result, "答");
});

test("定时任务等的前置做完：交给闹钟开子任务，不把定时任务本身跑掉", async () => {
  const c = clock("2026-11-02T08:00:00");
  const gates: (() => void)[] = [];
  const { backend } = fakeBackend((text) => (text === "前置" ? new Promise((r) => gates.push(() => r(text))) : Promise.resolve(text)));
  const tasks = new Tasks(new MemoryTaskStore(), backend, { now: c.now });
  const pre = tasks.start({ agent: "dev", title: "前置", prompt: "前置" });
  const tpl = tasks.start({ agent: "dev", title: "早报", prompt: "早报", repeat: "每天 09:00", after: pre.id });
  c.advance(2 * 3_600_000); // 过了 9 点，前置还没完
  await tick(80);
  assert.equal(tasks.list((t) => t.parent === tpl.id).length, 0);
  gates.shift()!();
  await tick(80);
  assert.equal(tpl.status, "todo", "定时任务还在");
  assert.equal(tasks.list((t) => t.parent === tpl.id).length, 1);
});

test("hold：到点、前置做完都不自动跑，记进文件，点开始才跑", async () => {
  const c = clock("2026-11-02T08:00:00");
  const store = new MemoryTaskStore();
  const tasks = new Tasks(store, fakeBackend().backend, { now: c.now });
  const t = tasks.start({ agent: "dev", title: "x", prompt: "p", hold: true, when: "2026-11-02T07:00:00" });
  await tick(80);
  assert.equal(t.status, "todo");
  assert.equal(parseTask(formatTask(t))?.hold, true);
  tasks.runNow(t.id);
  await tick();
  assert.equal(t.status, "done");
  assert.equal(t.hold, undefined);
});
