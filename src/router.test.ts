import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Registry } from "./registry.js";
import { parseDecision } from "./route.js";
import { type AgentBackend, Router } from "./router.js";

/** 假的 pi 层。routeAnswer 决定"路由模型"怎么答：字符串原样返回，null 表示模型出错。 */
function setup() {
  let n = 0;
  const ctl = { routeAnswer: null as string | null, routePrompts: [] as string[] };
  const backend: AgentBackend = {
    listAgents: () => ["dev", "life"],
    exists: (a) => a === "dev" || a === "life",
    create: async (a) => `/fake/${a}/${++n}.jsonl`,
    send: async (a, path, text) => `[${path}] ${text}`,
    isBusy: () => false,
    complete: async (_sys, user) => {
      ctl.routePrompts.push(user);
      if (ctl.routeAnswer === null) throw new Error("no key");
      return ctl.routeAnswer;
    },
    describe: (a) => (a === "dev" ? "写代码" : "日常生活"),
    recent: () => [],
  };
  const reg = new Registry(join(mkdtempSync(join(tmpdir(), "kiki-")), "registry.json"));
  const router = new Router(backend, reg, "life");
  const out: string[] = [];
  const say = (t: string) => router.handle("app", t, async (r) => void out.push(r));
  return { router, reg, out, say, ctl };
}

test("路由模型不可用时，退回默认对话", async () => {
  const { out, say, reg } = setup();
  await say("你好");
  assert.match(out[0], /^→ life\/默认 · 新开\n\n\[.*\] 你好$/);
  assert.equal(reg.current("app")?.name, "默认");
  await say("还在吗");
  assert.match(out[1], /^→ life\/默认 · 接着聊/);
});

test("模型说新开：按它起的名字建对话，重名自动加序号", async () => {
  const { out, say, reg, ctl } = setup();
  ctl.routeAnswer = '好的：{"action":"new","agent":"dev","name":"路由器","mode":"chat"}';
  await say("帮我设计路由");
  assert.match(out[0], /^→ dev\/路由器 · 新开/);
  await say("又一个路由话题");
  assert.match(out[1], /^→ dev\/路由器2 · 新开/);
  assert.equal(reg.list("dev").length, 2);
});

test("模型说接着聊：进指定对话，提示词里标出当前对话", async () => {
  const { out, say, ctl } = setup();
  await say("/new dev 路由器");
  await say("/new life 健身");
  ctl.routeAnswer = '{"action":"continue","target":"dev/路由器","mode":"chat"}';
  await say("路由那块再改改");
  assert.match(out.at(-1)!, /^→ dev\/路由器 · 接着聊/);
  assert.match(ctl.routePrompts.at(-1)!, /life\/健身【当前】/);
});

test("模型给了不存在的对话：不乱建，退回当前对话", async () => {
  const { out, say, ctl } = setup();
  await say("/new dev 路由器");
  ctl.routeAnswer = '{"action":"continue","target":"dev/瞎编的","mode":"chat"}';
  await say("嗯");
  assert.match(out.at(-1)!, /^→ dev\/路由器 · 接着聊/);
});

test("拿不准：列出选项，回数字后投递", async () => {
  const { out, say, ctl, reg } = setup();
  await say("/new dev 路由器");
  ctl.routeAnswer = '{"action":"ask","options":[{"target":"dev/路由器"},{"agent":"life","name":"买电脑"}],"reason":"都沾边"}';
  await say("Mac mini 要不要升级内存");
  assert.match(out.at(-1)!, /拿不准（都沾边）.*\n1\. 接进 dev\/路由器\n2\. 在 life 下新开「买电脑」/);
  await say("2");
  assert.match(out.at(-1)!, /^→ life\/买电脑 · 新开\n\n\[.*\] Mac mini 要不要升级内存$/);
  assert.equal(reg.current("app")?.name, "买电脑");
});

test("@宝名 只在这个宝下选，模型越界就退回该宝默认对话", async () => {
  const { out, say, ctl } = setup();
  await say("/new life 健身");
  ctl.routeAnswer = '{"action":"continue","target":"life/健身","mode":"chat"}';
  await say("@dev 看下这个报错");
  assert.match(out.at(-1)!, /^→ dev\/默认 · 新开\n\n\[.*\] 看下这个报错$/);
  assert.match(ctl.routePrompts.at(-1)!, /只能在它下面/);
});

test("/to 把上一句改投到别处", async () => {
  const { out, say } = setup();
  await say("周末去爬山"); // 进 life/默认
  await say("/to dev 杂事");
  assert.match(out.at(-1)!, /^→ dev\/杂事 · 新开\n\n\[.*\] 周末去爬山$/);
});

test("判成后台：开后台对话，先回执、做完回报，且不改当前对话", async () => {
  const { out, say, reg, ctl } = setup();
  await say("/new dev 主线");
  ctl.routeAnswer = '{"action":"continue","target":"dev/主线","mode":"background","taskTitle":"整理README"}';
  await say("把 README 整理一遍");
  await new Promise((r) => setTimeout(r, 10));
  assert.match(out.at(-2)!, /^→ dev\/bg-整理README · 后台/);
  assert.match(out.at(-1)!, /✅ 后台任务 dev\/bg-整理README 完成/);
  assert.equal(reg.current("app")?.name, "主线");
});

test("/bg 强制后台", async () => {
  const { out, say, reg } = setup();
  await say("/new dev 主线");
  await say("/bg 整理一下 README");
  await new Promise((r) => setTimeout(r, 10));
  assert.match(out.at(-2)!, /已在后台开始/);
  assert.match(out.at(-1)!, /✅ 后台任务 dev\/bg-.* 完成：\n\n.*整理一下 README/);
  assert.ok(reg.list().find((s) => s.background));
});

test("/new /use /list 手动命令照常可用", async () => {
  const { out, say, reg } = setup();
  await say("/new dev 杂项");
  await say("/new life 杂项");
  await say("/use 杂项");
  assert.match(out.at(-1)!, /有重名/);
  await say("/use dev/杂项");
  assert.equal(reg.current("app")?.agent, "dev");
  await say("/list");
  assert.match(out.at(-1)!, /👉 dev\/杂项/);
});

test("parseDecision 过滤非法输出", () => {
  const valid = { agents: ["dev"], targets: ["dev/a"] };
  assert.equal(parseDecision("不是 JSON", valid), undefined);
  assert.equal(parseDecision('{"action":"new","agent":"nope","name":"x"}', valid), undefined);
  assert.deepEqual(parseDecision('{"action":"ask","options":[{"target":"dev/a"},{"target":"dev/zz"}]}', valid), {
    action: "continue",
    target: "dev/a",
    mode: "chat",
    reason: undefined,
  });
  const d = parseDecision('{"action":"new","agent":"dev","name":"a/b\\nc","mode":"background","taskTitle":"t"}', valid);
  assert.deepEqual(d, { action: "new", agent: "dev", name: "a b c", mode: "background", taskTitle: "t", reason: undefined });
});
