import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { makeTriage, openItems, parseVerdict, triageInput, Watchlist } from "./triage.js";
import type { InboxItem } from "./postroom.js";

const item = (text: string, title?: string): InboxItem => ({ id: "x", from: "邮箱", received: "", text, title, status: "new" });

test("看信结果：只认 JSON 里的字段，多余的话不影响", () => {
  const v = parseVerdict('好的：{"important":true,"why":"币安提示异地登录","route":false,"add":"币安账户异常，待确认","done":[2],"related":[1]}');
  assert.deepEqual(v, { important: true, why: "币安提示异地登录", route: false, add: "币安账户异常，待确认", done: [2], doneWhy: undefined, related: [1] });
  assert.equal(parseVerdict("看不懂"), undefined);
});

test("关注清单：记一条、对上前情划掉、连着对话的交回去", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-tr-"));
  const wl = new Watchlist(dir);
  wl.add("报名 AI 黑客松，等主办方后续", { from: "任务", session: "工作宝/报名黑客松" });
  let answer = '{"important":true,"why":"币安提示异地登录","route":false,"add":"币安账户异常，待确认是否被盗"}';
  const seen: string[] = [];
  const triage = makeTriage(dir, async (_s, user) => (seen.push(user), answer));
  const v1 = await triage(item("您的账户在新设备登录", "Binance 安全提醒"));
  assert.equal(v1?.important, true);
  assert.deepEqual(openItems(wl.read()).map((w) => w.text), ["报名 AI 黑客松，等主办方后续（11/2 起 · 任务）".replace("11/2", `${new Date().getMonth() + 1}/${new Date().getDate()}`), `币安账户异常，待确认是否被盗（${new Date().getMonth() + 1}/${new Date().getDate()} 起 · 邮箱）`]);
  // 第二封：币安恢复了 → 划掉第 2 条；黑客松来了新邮件 → 交回那段对话
  answer = '{"important":false,"why":"币安确认账户安全","route":false,"done":[2],"doneWhy":"币安确认是本人登录","related":[1]}';
  const v2 = await triage(item("账户已恢复正常；另：黑客松需要补交材料"));
  assert.match(seen[1], /1\. 报名 AI 黑客松[\s\S]*2\. 币安账户异常/);
  assert.equal(v2?.crossed.length, 1);
  assert.deepEqual(v2?.follow.map((f) => f.link), ["工作宝/报名黑客松"]);
  const md = readFileSync(join(dir, "关注清单.md"), "utf8");
  assert.match(md, /- \[x\] 币安账户异常.*解决：币安确认是本人登录/);
  assert.equal(openItems(md).length, 1);
});

test("模型出错就返回空，收发室照老办法交给奇奇", async () => {
  const triage = makeTriage(mkdtempSync(join(tmpdir(), "kiki-tr-")), async () => {
    throw new Error("没密钥");
  });
  assert.equal(await triage(item("x")), undefined);
  assert.match(triageInput(item("正文", "标题"), []), /关注清单（还没了结的）：\n（空）/);
});
