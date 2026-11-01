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
  const ctl = {
    routeAnswer: null as string | null,
    routePrompts: [] as string[],
    routeDelays: [] as number[], // 每次路由调用的延迟（毫秒），按调用顺序取
    sends: [] as string[], // send 被调用的顺序
    forks: [] as string[], // fork 的来源
    notes: [] as string[], // 回报到原对话的消息
  };
  const backend: AgentBackend = {
    listAgents: () => ["dev", "life"],
    exists: (a) => a === "dev" || a === "life",
    create: async (a) => `/fake/${a}/${++n}.jsonl`,
    fork: async (a, from) => {
      ctl.forks.push(from);
      return `/fake/${a}/${++n}.jsonl`;
    },
    send: async (a, path, text) => {
      ctl.sends.push(text);
      return `[${path}] ${text}`;
    },
    isBusy: () => false,
    complete: async (_sys, user) => {
      ctl.routePrompts.push(user);
      const delay = ctl.routeDelays.shift() ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (ctl.routeAnswer === null) throw new Error("no key");
      return ctl.routeAnswer;
    },
    describe: (a) => (a === "dev" ? "写代码" : "日常生活"),
    recent: () => [],
    note: async (a, path, text) => void ctl.notes.push(`${path} ${text}`),
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

test("判成后台：交给后台任务，先回执、做完回报到收件箱和原对话，且不改当前对话", async () => {
  const { out, say, reg, ctl, router } = setup();
  await say("/new dev 主线");
  ctl.routeAnswer = '{"action":"continue","target":"dev/主线","mode":"background","taskTitle":"整理README"}';
  await say("把 README 整理一遍");
  await new Promise((r) => setTimeout(r, 10));
  assert.match(out.at(-2)!, /^→ dev · 后台任务「整理README」\n\n好，已交给后台，做完我会回报到这里和 dev\/主线/);
  assert.match(out.at(-1)!, /^✅ 后台任务「整理README」完成（dev\/bg-整理README）：\n\n.*把 README 整理一遍/s);
  assert.equal(reg.current("app")?.name, "主线");
  const main = reg.get("dev", "主线")!;
  assert.match(ctl.notes.at(-1)!, new RegExp(`^${main.path} ✅ 后台任务「整理README」完成`));
  assert.equal(router.tasks.list()[0].status, "done");
});

test("接着某段对话判成后台：分叉那段对话，后台带着上下文", async () => {
  const { out, say, reg, ctl } = setup();
  await say("/new dev 设计");
  const src = reg.current("app")!.path;
  ctl.routeAnswer = '{"action":"continue","target":"dev/设计","mode":"background","taskTitle":"实现"}';
  await say("按刚才讨论的设计实现");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(ctl.forks, [src]);
  assert.match(out.at(-1)!, /✅ 后台任务「实现」完成（dev\/bg-实现）/);
});

test("新话题判成后台：不多开空对话，直接开任务", async () => {
  const { out, say, reg, ctl } = setup();
  ctl.routeAnswer = '{"action":"new","agent":"dev","name":"周报","mode":"background","taskTitle":"写周报"}';
  await say("帮我写本周周报");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(reg.list().map((s) => s.name), ["bg-写周报"]);
  assert.deepEqual(ctl.forks, []);
  assert.match(out.at(-1)!, /✅ 后台任务「写周报」完成/);
  assert.equal(ctl.notes.length, 0);
});

test("对话超过 20 段时，当前对话仍在候选里，接着聊不会被拒", async () => {
  const { out, say, ctl } = setup();
  await say("/new dev 老对话");
  for (let i = 0; i < 25; i++) await say(`/new dev 新${i}`);
  await say("/use dev/老对话");
  ctl.routeAnswer = '{"action":"continue","target":"dev/老对话","mode":"chat"}';
  await say("接着说");
  assert.match(ctl.routePrompts.at(-1)!, /dev\/老对话【当前】/);
  assert.match(out.at(-1)!, /^→ dev\/老对话 · 接着聊/);
});

test("同一聊天连发两句：先发的先进对话，即使第一句路由更慢", async () => {
  const { router, ctl } = setup();
  ctl.routeDelays = [30, 0];
  const out: string[] = [];
  const r = async (x: string) => void out.push(x);
  await Promise.all([router.handle("app", "第一句", r), router.handle("app", "第二句", r)]);
  assert.deepEqual(ctl.sends, ["第一句", "第二句"]);
});

test("/bg 强制后台（分叉当前对话），/tasks 列出，/retry 重跑", async () => {
  const { out, say, reg, router } = setup();
  await say("/new dev 主线");
  await say("/bg 整理一下 README");
  await new Promise((r) => setTimeout(r, 10));
  assert.match(out.at(-2)!, /已交给后台/);
  assert.match(out.at(-1)!, /✅ 后台任务「整理一下 README」完成/);
  assert.ok(reg.list().find((s) => s.background));
  await say("/tasks");
  assert.match(out.at(-1)!, /^\[完成\] 整理一下 README · dev · /);
  const id = router.tasks.list()[0].id;
  await say(`/retry ${id}`);
  assert.match(out.at(-1)!, /重新开始/);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(router.tasks.list().length, 2);
  assert.ok(reg.get("dev", "bg-整理一下 README2"), "重跑开新的后台对话，不和旧的混");
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

test("交接（聊）：新开对话，第一条消息是交接说明，重名加序号", async () => {
  const { router, say, reg, ctl } = setup();
  await say("/new dev 主线");
  const from = reg.current("app")!.path;
  const r = await router.handoff({ fromPath: from, bao: "life", name: "买电脑", brief: "【目标】选一台 Mac", mode: "chat" });
  assert.match(r, /已交接到 life\/买电脑/);
  await new Promise((x) => setTimeout(x, 5));
  assert.match(ctl.sends.at(-1)!, /从「dev\/主线」交接过来.*\n\n【目标】选一台 Mac\n\n先读完/s);
  await router.handoff({ fromPath: from, bao: "life", name: "买电脑", brief: "x", mode: "chat" });
  assert.ok(reg.get("life", "买电脑2"));
  assert.equal(reg.current("app")!.path, from, "交接不改当前对话");
});

test("交接给不存在的宝会报错", async () => {
  const { router } = setup();
  await assert.rejects(router.handoff({ fromPath: undefined, bao: "nope", name: "x", brief: "x", mode: "chat" }), /没有宝/);
});

test("交接（后台）：按说明开干净的新对话去做，不分叉原对话，做完回报到原对话", async () => {
  const { router, say, reg, ctl } = setup();
  await say("/new dev 主线");
  const from = reg.current("app")!.path;
  const r = await router.handoff({ fromPath: from, bao: "dev", name: "写脚本", brief: "【目标】写个备份脚本", mode: "background" });
  assert.match(r, /后台任务「写脚本」/);
  await new Promise((x) => setTimeout(x, 30));
  assert.deepEqual(ctl.forks, []);
  assert.match(ctl.sends.at(-1)!, /【目标】写个备份脚本\n\n请直接开始做/);
  assert.match(ctl.notes.at(-1)!, new RegExp(`^${from} ✅ 后台任务「写脚本」完成`));
});
