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
    announced: [] as string[], // 通知界面的完整回答
    duties: [] as string[], // 新建的宝
  };
  const baos = ["dev", "life"];
  const backend: AgentBackend = {
    listAgents: () => [...baos],
    exists: (a) => baos.includes(a),
    createBao: (a, duty) => {
      baos.push(a);
      ctl.duties.push(`${a}:${duty}`);
    },
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
    history: (path) => [{ role: "user", text: `问 ${path}` }, { role: "assistant", text: "答" }],
    note: async (a, path, text) => void ctl.notes.push(`${path} ${text}`),
    announce: (path, text) => void ctl.announced.push(`${path} ${text}`),
  };
  const reg = new Registry(join(mkdtempSync(join(tmpdir(), "kiki-")), "registry.json"));
  const router = new Router(backend, reg, "life");
  const out: string[] = [];
  const say = (t: string) => router.handle("app", t, async (r) => void out.push(r));
  return { router, reg, out, say, ctl };
}

test("路由模型不可用时，交给默认宝的主对话", async () => {
  const { out, say, reg } = setup();
  await say("你好");
  assert.match(out[0], /^→ life\/主对话 · 交给宝\n\n\[.*\] 你好$/);
  assert.equal(reg.current("app")?.name, "主对话");
  await say("还在吗");
  assert.match(out[1], /^→ life\/主对话 · 交给宝/);
});

test("每个宝自动有主对话；模型说交给某个宝（旧的 new 写法）就进它的主对话，不由奇奇开讨论串", async () => {
  const { out, say, reg, ctl } = setup();
  ctl.routeAnswer = '好的：{"action":"new","agent":"dev","name":"路由器","mode":"chat"}';
  await say("帮我设计路由");
  assert.match(out[0], /^→ dev\/主对话 · 交给宝/);
  assert.deepEqual(reg.list().map((x) => `${x.agent}/${x.name}`).sort(), ["dev/主对话", "life/主对话"]);
  assert.match(ctl.routePrompts[0], /- dev\/主对话/);
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

test("模型给了选项也不反问用户：直接取第一个", async () => {
  const { out, say, ctl, reg } = setup();
  await say("/new dev 路由器");
  ctl.routeAnswer = '{"action":"ask","options":[{"target":"life/主对话"},{"target":"dev/路由器"}],"reason":"都沾边"}';
  await say("Mac mini 要不要升级内存");
  assert.match(out.at(-1)!, /^→ life\/主对话 · 交给宝\n\n\[.*\] Mac mini 要不要升级内存$/);
  assert.equal(reg.current("app")?.agent, "life");
});

test("@宝名 只在这个宝下选，模型越界就退回该宝主对话", async () => {
  const { out, say, ctl } = setup();
  await say("/new life 健身");
  ctl.routeAnswer = '{"action":"continue","target":"life/健身","mode":"chat"}';
  await say("@dev 看下这个报错");
  assert.match(out.at(-1)!, /^→ dev\/主对话 · 交给宝\n\n\[.*\] 看下这个报错$/);
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

test("交给宝的活判成后台：不分叉主对话，直接开任务", async () => {
  const { out, say, reg, ctl } = setup();
  ctl.routeAnswer = '{"action":"new","agent":"dev","name":"周报","mode":"background","taskTitle":"写周报"}';
  await say("帮我写本周周报");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(reg.list().map((s) => s.name).filter((n) => n !== "主对话"), ["bg-写周报"]);
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
  const valid = { agents: ["dev"], targets: ["dev/a", "dev/主对话"] };
  assert.equal(parseDecision("不是 JSON", valid), undefined);
  assert.equal(parseDecision('{"action":"new","agent":"nope","name":"x"}', valid), undefined);
  assert.deepEqual(parseDecision('{"action":"ask","options":[{"target":"dev/a"},{"target":"dev/zz"}]}', valid), {
    action: "continue",
    target: "dev/a",
    mode: "chat",
    taskTitle: undefined,
    reason: undefined,
  });
  const d = parseDecision('{"action":"new","agent":"dev","name":"x","mode":"background","taskTitle":"t"}', valid);
  assert.deepEqual(d, { action: "continue", target: "dev/主对话", mode: "background", taskTitle: "t", reason: undefined });
});

test("交接（聊）：新开对话，第一条消息是交接说明，重名加序号", async () => {
  const { router, say, reg, ctl } = setup();
  await say("/new dev 主线");
  const from = reg.current("app")!.path;
  const r = await router.handoff({ fromPath: from, bao: "life", name: "买电脑", brief: "【目标】选一台 Mac", mode: "chat" });
  assert.match(r, /已交接到 life\/买电脑/);
  await new Promise((x) => setTimeout(x, 5));
  assert.match(ctl.sends.at(-1)!, /从「dev\/主线」交接过来.*\n\n【目标】选一台 Mac\n\n先读完/s);
  assert.match(ctl.announced.at(-1)!, /交接过来/, "新对话的回答要通知界面收尾");
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

test("kiki_peek：列出全部对话；看某段最近几条；找不到时列出现有的", async () => {
  const { router, say } = setup();
  await say("/new dev 路由器");
  assert.match(router.peek(undefined, 10), /## dev（写代码）\n- dev\/路由器\n## life（日常生活）/);
  assert.match(router.peek("dev/路由器", 10), /^dev\/路由器 最近 2 条（共 2 条）：\n\n用户：问 .*\n\n助理：答$/);
  assert.match(router.peek("路由器", 1), /最近 1 条/);
  assert.throws(() => router.peek("dev/没有", 5), /找不到对话「dev\/没有」。现有：dev\/路由器/);
});

test("kiki_relay：捎话给另一段对话，回答记回发起对话；不能捎给自己", async () => {
  const { router, say, reg, ctl } = setup();
  await say("/new dev 路由器");
  const a = reg.current("app")!.path;
  await say("/new life 买电脑");
  const b = reg.current("app")!.path;
  const r = await router.relay(b, "dev/路由器", "预算定了 8000");
  assert.match(r, /已捎给 dev\/路由器/);
  await new Promise((res) => setTimeout(res, 10));
  assert.match(ctl.sends.at(-1)!, /^【从「life\/买电脑」捎来的话】\n预算定了 8000/);
  assert.ok(ctl.announced.some((x) => x.startsWith(a)));
  assert.match(ctl.notes.at(-1)!, new RegExp(`^${b} 【dev/路由器 回复】`));
  await assert.rejects(router.relay(b, "life/买电脑", "x"), /当前对话/);
});

test("交接：同时交接同名的事，各自拿到不同的名字", async () => {
  const { router, reg } = setup();
  const [a, b] = await Promise.all([
    router.handoff({ fromPath: undefined, bao: "life", name: "买电脑", brief: "x", mode: "chat" }),
    router.handoff({ fromPath: undefined, bao: "life", name: "买电脑", brief: "y", mode: "chat" }),
  ]);
  assert.match(a, /life\/买电脑，/);
  assert.match(b, /life\/买电脑2，/);
  assert.deepEqual(reg.list("life").map((s) => s.name).sort(), ["买电脑", "买电脑2"]);
});

test("能力开关：关掉自动路由就投进当前对话；关掉后台就当聊", async () => {
  const { router, out, say, ctl } = setup();
  await say("/new dev 路由器");
  const off = new Set<string>(["route"]);
  router.isOn = (id) => !off.has(id);
  ctl.routeAnswer = '{"action":"new","agent":"life","name":"买电脑","mode":"chat"}';
  const before = ctl.routePrompts.length;
  await say("随便说一句");
  assert.equal(ctl.routePrompts.length, before);
  assert.match(out.at(-1)!, /^→ dev\/路由器 · 接着聊/);
  off.clear();
  off.add("background");
  ctl.routeAnswer = '{"action":"continue","target":"dev/路由器","mode":"background","taskTitle":"跑测试"}';
  await say("去把测试跑一遍");
  assert.match(out.at(-1)!, /^→ dev\/路由器 · 接着聊/);
  const r = await router.handoff({ fromPath: undefined, bao: "life", name: "写脚本", brief: "x", mode: "background" });
  assert.match(r, /已交接到 life\/写脚本/);
});

test("没有合适的宝：路由直接新建宝，交给它的主对话", async () => {
  const { out, say, ctl, reg } = setup();
  ctl.routeAnswer = '{"action":"new","agent":"购物宝","newBao":"买东西：比价、选型","name":"选iPad","mode":"chat"}';
  await say("给我妈挑台 iPad");
  assert.deepEqual(ctl.duties, ["购物宝:买东西：比价、选型"]);
  assert.match(out.at(-1)!, /^→ 购物宝\/主对话 · 新建宝/);
  assert.equal(reg.current("app")?.agent, "购物宝");
});

test("新宝名不合法或 @ 了宝：不新建，退回默认", async () => {
  const { out, say, ctl } = setup();
  ctl.routeAnswer = '{"action":"new","agent":"a/b","newBao":"x","name":"y","mode":"chat"}';
  await say("随便");
  assert.deepEqual(ctl.duties, []);
  assert.match(out.at(-1)!, /^→ life\/主对话/);
  ctl.routeAnswer = '{"action":"new","agent":"购物宝","newBao":"x","name":"y","mode":"chat"}';
  await say("@dev 随便");
  assert.deepEqual(ctl.duties, []);
});

test("一句话能答完的：奇奇直接回答，不进任何对话", async () => {
  const { out, say, ctl, reg } = setup();
  ctl.routeAnswer = '{"action":"reply","text":"你好！","reason":"打招呼"}';
  await say("你好");
  assert.equal(out.at(-1), "奇奇 · 直接回答\n\n你好！");
  assert.match(ctl.routePrompts.at(-1)!, /^现在：.*\d{4}.*（.+）\n/); // 带上时间，"几点了"才答得对
  assert.equal(ctl.sends.length, 0);
  assert.equal(reg.current("app"), undefined);
});

test("交接到还不存在的宝：带 duty 就新建，不带就报错", async () => {
  const { router, ctl } = setup();
  await assert.rejects(router.handoff({ fromPath: undefined, bao: "生活宝", name: "买iPad", brief: "x", mode: "chat" }), /要新建就同时填 duty/);
  const r = await router.handoff({ fromPath: undefined, bao: "生活宝", duty: "日常生活", name: "买iPad", brief: "x", mode: "chat" });
  assert.match(r, /^新建了宝「生活宝」，已交接到 生活宝\/买iPad/);
  assert.deepEqual(ctl.duties, ["生活宝:日常生活"]);
});

test("一段话拆成几件：一件进已有讨论串，一件新建宝交给主对话，交过去的是各自的说明，奇奇回一张清单带卡片", async () => {
  const { out, say, ctl, reg } = setup();
  await say("/new dev 路由器");
  ctl.routeAnswer = JSON.stringify({
    action: "split",
    parts: [
      { action: "continue", target: "dev/路由器", mode: "chat", text: "路由要支持拆分" },
      { action: "new", agent: "生活宝", newBao: "日常生活", name: "选iPad", mode: "chat", text: "给妈妈选 iPad，预算 3000" },
      { action: "new", agent: "瞎编", name: "x", mode: "chat", text: "不合法，丢掉" },
    ],
  });
  await say("路由要支持拆分；另外帮我给妈妈选个 iPad，预算 3000");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(
    out.at(-1),
    "奇奇 · 拆成 2 件事，分别交出去了\n\n- [路由器](kiki:dev/路由器)：接着聊\n- [生活宝](kiki:生活宝/主对话)：新建宝",
  );
  assert.deepEqual(ctl.duties, ["生活宝:日常生活"]);
  assert.deepEqual(ctl.sends.slice(-2).sort(), ["给妈妈选 iPad，预算 3000", "路由要支持拆分"]);
  assert.equal(ctl.announced.length, 2);
  assert.equal(reg.current("app")?.name, "路由器");
});

test("拆分只剩一件合法的：当普通分派，交过去的是用户原话", async () => {
  const { out, say, ctl } = setup();
  ctl.routeAnswer = JSON.stringify({
    action: "split",
    parts: [
      { action: "new", agent: "life", name: "买菜", mode: "chat", text: "买菜" },
      { action: "continue", target: "dev/不存在", mode: "chat", text: "x" },
    ],
  });
  await say("帮我列个买菜单");
  assert.match(out.at(-1)!, /^→ life\/主对话 · 交给宝\n\n\[.*\] 帮我列个买菜单$/);
  assert.equal(ctl.sends.at(-1), "帮我列个买菜单");
});

test("并发补主对话不会建出两段同名的", async () => {
  const { router, reg } = setup();
  await Promise.all([router.ensureMains(), router.ensureMains(), router.ensureMain("dev")]);
  assert.deepEqual(reg.list().map((x) => `${x.agent}/${x.name}`).sort(), ["dev/主对话", "life/主对话"]);
});

test("拆分里交给主对话的后台活不分叉主对话", async () => {
  const { say, ctl } = setup();
  ctl.routeAnswer = JSON.stringify({
    action: "split",
    parts: [
      { action: "continue", target: "dev/主对话", mode: "background", taskTitle: "跑测试", text: "跑一遍测试" },
      { action: "continue", target: "life/主对话", mode: "chat", text: "买菜" },
    ],
  });
  await say("跑测试；顺便买菜");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(ctl.forks, []);
});

test("kiki_relay 只写宝名：交给那个宝的主对话", async () => {
  const { router, say, reg, ctl } = setup();
  await router.ensureMains();
  await say("/new dev 路由器");
  const from = reg.current("app")!.path;
  const r = await router.relay(from, "life", "用户问：周末去哪玩");
  assert.match(r, /已捎给 life\/主对话/);
  await new Promise((x) => setTimeout(x, 10));
  assert.match(ctl.sends.at(-1)!, /^【从「dev\/路由器」捎来的话】\n用户问：周末去哪玩/);
});
