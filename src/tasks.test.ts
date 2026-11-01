import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FileTaskStore, formatTask, parseTask, type Task, type TaskBackend, Tasks } from "./tasks.js";

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
  assert.match(md, /\n## 任务\n\n帮我写周报\n第二行\n\n## 结果\n\n## 本周/);
  assert.deepEqual(parseTask(md), t);
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
