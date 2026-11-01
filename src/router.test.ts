import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Registry } from "./registry.js";
import { type AgentBackend, Router } from "./router.js";

function setup() {
  const sent: string[] = [];
  let n = 0;
  const backend: AgentBackend = {
    listAgents: () => ["dev", "life"],
    exists: (a) => a === "dev" || a === "life",
    create: async (a, name) => `/fake/${a}/${++n}.jsonl`,
    send: async (a, path, text) => `[${a}:${path}] ${text}`,
    isBusy: () => false,
  };
  const reg = new Registry(join(mkdtempSync(join(tmpdir(), "kiki-")), "registry.json"));
  const router = new Router(backend, reg, "life");
  const out: string[] = [];
  const say = (t: string) => router.handle("tg:1", t, async (r) => void out.push(r));
  return { router, reg, out, say, sent };
}

test("没选对话时进默认对话", async () => {
  const { out, say, reg } = setup();
  await say("你好");
  assert.match(out[0], /^\[life:.*\] 你好$/);
  assert.equal(reg.current("tg:1")?.name, "默认");
});

test("/new 建对话并切过去，/use 切回，/list 标出当前", async () => {
  const { out, say, reg } = setup();
  await say("/new dev 路由器");
  assert.equal(reg.current("tg:1")?.name, "路由器");
  await say("写个函数");
  assert.match(out.at(-1)!, /^\[dev:/);
  await say("/new life 健身");
  await say("/use 路由器");
  assert.equal(reg.current("tg:1")?.agent, "dev");
  await say("/list");
  assert.match(out.at(-1)!, /👉 dev\/路由器/);
  await say("/new nope x");
  assert.match(out.at(-1)!, /没有 agent/);
});

test("重名时 /use 要求写全", async () => {
  const { out, say } = setup();
  await say("/new dev 杂项");
  await say("/new life 杂项");
  await say("/use 杂项");
  assert.match(out.at(-1)!, /有重名/);
  await say("/use life/杂项");
  assert.match(out.at(-1)!, /已切到 life\/杂项/);
});

test("/bg 先立即答复，做完再回报，且不改当前对话", async () => {
  const { out, say, reg } = setup();
  await say("/new dev 主线");
  await say("/bg 整理一下 README");
  await new Promise((r) => setTimeout(r, 10));
  assert.match(out.at(-2)!, /已在后台开始/);
  assert.match(out.at(-1)!, /✅ 后台任务 dev\/bg-.* 完成：\n\n.*整理一下 README/);
  assert.equal(reg.current("tg:1")?.name, "主线");
  assert.ok(reg.list().find((s) => s.background));
});
