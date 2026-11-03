import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseClassified, parseWork, renderWork, WorkBook, WorkSorter } from "./work.js";

const book = () => {
  const root = mkdtempSync(join(tmpdir(), "kiki-work-"));
  return new WorkBook((a) => join(root, "agents", a));
};

test("工作文件写出去再读回来一样", () => {
  const b = book();
  const w = b.create("投资宝", { title: "ETH 定投计划", goal: "每周自动买入：不追高", threads: ["/a.jsonl"], progress: [{ at: "2026-11-03 10:00", text: "回测做完了" }] });
  const back = parseWork(renderWork(w))!;
  assert.equal(back.title, "ETH 定投计划");
  assert.equal(back.goal, "每周自动买入：不追高");
  assert.deepEqual(back.threads, ["/a.jsonl"]);
  assert.deepEqual(back.progress, [{ at: "2026-11-03 10:00", text: "回测做完了" }]);
  assert.equal(b.list("投资宝").length, 1);
});

test("模型输出收拾成数组；闲聊是空数组；乱写认不出", () => {
  assert.deepEqual(parseClassified("好的：\n[]"), []);
  const r = parseClassified('```json\n[{"work":"new","title":"Q3 持仓报告","status":"doing","next":""}]\n```')!;
  assert.equal(r[0].title, "Q3 持仓报告");
  assert.equal(r[0].next, "");
  assert.equal(parseClassified("我不知道"), undefined);
  assert.equal(parseClassified('[{"status":"乱写"}]')![0].status, undefined);
});

test("归类：新建、再次并进同一件、记进展；同名不重复建", () => {
  const b = book();
  let w = b.apply("投资宝", "/a", [{ work: "new", title: "ETH 定投计划", progress: "定了只买 ETH" }])[0];
  w = b.apply("投资宝", "/b", [{ work: w.id, next: "等你定金额", progress: "回测做完了" }])[0];
  assert.deepEqual(w.threads, ["/a", "/b"]);
  assert.equal(w.next, "等你定金额");
  assert.equal(w.progress.length, 2);
  b.apply("投资宝", "/c", [{ work: "new", title: "ETH 定投计划" }]); // 模型忘了 id
  assert.equal(b.list("投资宝").length, 1);
});

test("手动：拆出去的对话不再并回，合并把对话和进展合到一起", () => {
  const b = book();
  const a = b.apply("宝", "/a", [{ work: "new", title: "甲", progress: "一" }])[0];
  const c = b.apply("宝", "/c", [{ work: "new", title: "乙", progress: "二" }])[0];
  b.detach("宝", a.id, "/a");
  b.apply("宝", "/a", [{ work: a.id, progress: "又来" }]);
  assert.deepEqual(b.get("宝", a.id)!.threads, []);
  const m = b.merge("宝", c.id, a.id)!;
  assert.deepEqual(m.threads, ["/c"]);
  assert.ok(m.progress.some((p) => p.text === "二"));
  assert.equal(b.list("宝").length, 1);
  assert.equal(b.set("宝", a.id, { status: "done" })!.status, "done");
});

test("归类器：后台对话跳过，模型出错不动工作", async () => {
  const b = book();
  let out = '[{"work":"new","title":"换交易所","status":"todo"}]';
  const s = new WorkSorter({
    book: b,
    thread: (p) => ({ agent: "宝", name: p }),
    history: () => [{ role: "user", text: "下周换个交易所" }],
    complete: async () => {
      if (out === "fail") throw new Error("no key");
      return out;
    },
    skip: (p) => p === "/bg",
  });
  assert.equal((await s.run("/bg")).length, 0);
  assert.equal((await s.run("/a"))[0].status, "todo");
  out = "fail";
  assert.equal((await s.run("/a")).length, 0);
  assert.equal(b.list("宝").length, 1);
});
