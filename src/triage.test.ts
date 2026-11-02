import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { makeTriage, openItems, parseVerdict, unwatchTask, watchForTask, Watchlist } from "./triage.js";
import type { InboxItem } from "./postroom.js";

const item = (text: string, title?: string): InboxItem => ({ id: "x", from: "邮箱", received: "", text, title, status: "new" });
const today = () => `${new Date().getMonth() + 1}/${new Date().getDate()}`;

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "kiki-tr-"));
  for (const b of ["币圈宝", "生活宝"]) mkdirSync(join(dataDir, "agents", b), { recursive: true });
  const calls: { sys: string; user: string }[] = [];
  let answers: string[] = [];
  const triage = makeTriage({
    dataDir,
    listBaos: () => ["币圈宝", "生活宝"],
    describe: (b) => (b === "币圈宝" ? "加密货币、交易所账户" : "日常生活、账单"),
    complete: async (sys, user) => (calls.push({ sys, user }), answers.shift() ?? "{}"),
  });
  return { dataDir, triage, calls, answer: (...a: string[]) => (answers = a) };
}

test("看信结果：只认 JSON 里的字段", () => {
  const v = parseVerdict('好的：{"important":true,"why":"异地登录","route":false,"add":"币安账户异常","keys":["币安","Binance"],"done":[2],"related":[1]}');
  assert.equal(v?.important, true);
  assert.deepEqual(v?.keys, ["币安", "Binance"]);
  assert.deepEqual(v?.related, [1]);
  assert.equal(parseVerdict("看不懂"), undefined);
});

test("先看各宝简介分给宝，宝只读自己的清单；新事记进那个宝的清单，带关键词", async () => {
  const { dataDir, triage, calls, answer } = setup();
  new Watchlist(dataDir, "生活宝").add("电费没交成功");
  answer('{"bao":"币圈宝"}', '{"important":true,"why":"币安提示异地登录","route":false,"add":"币安账户异常，待确认是否被盗","keys":["币安","Binance"]}');
  const v = await triage(item("您的账户在新设备登录", "Binance 安全提醒"));
  assert.equal(v?.bao, "币圈宝");
  assert.match(calls[0].user, /币圈宝：加密货币/);
  assert.doesNotMatch(calls[1].user, /电费/); // 没读生活宝的清单
  const items = new Watchlist(dataDir, "币圈宝").open();
  assert.deepEqual(items.map((w) => [w.text, w.keys]), [[`币安账户异常，待确认是否被盗（${today()} 起 · 邮箱）`, ["币安", "Binance"]]]);
});

test("关键词命中直接定宝（不用模型选）；对上前情划掉；连着对话或任务的交回去", async () => {
  const { dataDir, triage, calls, answer } = setup();
  const wl = new Watchlist(dataDir, "币圈宝");
  wl.add("币安账户异常", { keys: ["币安"] });
  wl.add("报名链上黑客松，等主办方后续", { keys: ["黑客松"], session: "币圈宝/报名", task: "t9" });
  wl.add("和交易所无关的另一件事", { keys: ["不相干"] });
  answer('{"important":false,"why":"币安确认安全；黑客松要补材料","route":false,"done":[1],"doneWhy":"确认是本人登录","related":[2]}');
  const v = await triage(item("币安：账户已恢复。另：黑客松需要补交材料"));
  assert.equal(calls.length, 1); // 只调了一次（判断），选宝靠关键词
  assert.doesNotMatch(calls[0].user, /另一件事/); // 关键词没命中的条目不给模型看
  assert.deepEqual(v?.crossed, [`币安账户异常（${today()} 起）`]);
  assert.deepEqual(v?.follow, [{ text: `报名链上黑客松，等主办方后续（${today()} 起）`, link: "币圈宝/报名", task: "t9" }]);
  assert.match(readFileSync(wl.file, "utf8"), /- \[x\] 币安账户异常.*解决：确认是本人登录/);
});

test("任务的后续：写进所属宝的清单，取消时划掉", () => {
  const { dataDir } = setup();
  watchForTask(dataDir, { taskId: "t1", agent: "生活宝", about: "等房东回复押金", match: "房东、押金", session: "生活宝/押金" });
  const w = new Watchlist(dataDir, "生活宝").open()[0];
  assert.deepEqual([w.task, w.link, w.keys], ["t1", "生活宝/押金", ["房东", "押金"]]);
  unwatchTask(dataDir, ["币圈宝", "生活宝"], "t1");
  assert.equal(new Watchlist(dataDir, "生活宝").open().length, 0);
  assert.equal(openItems("- [ ] 手写的一条").length, 1);
});

test("模型出错就返回空，收发室照老办法交给奇奇", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "kiki-tr-"));
  const triage = makeTriage({ dataDir, listBaos: () => [], describe: () => "", complete: async () => { throw new Error("没密钥"); } });
  assert.equal(await triage(item("x")), undefined);
});
