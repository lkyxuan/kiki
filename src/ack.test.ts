import { test } from "node:test";
import assert from "node:assert/strict";
import { Acks, markForReply, taskMark } from "./ack.js";
import { cleanAck, roleModel } from "./modelroles.js";
import type { Task } from "./tasks.js";

test("收到消息马上 👀，忙时排队中，轮到了变 👀，答完去掉", () => {
  const a = new Acks();
  const seen: unknown[] = [];
  a.on("change", (d) => seen.push(d));
  const id1 = a.add("p", "你好");
  const id2 = a.add("p", "再来", true);
  assert.equal(a.get(id1)?.mark, "seen");
  assert.equal(a.get(id2)?.mark, "queued");
  a.set(id1, null);
  assert.equal(a.get(id1), undefined);
  a.start(id2);
  assert.equal(a.get(id2)?.mark, "seen");
  assert.equal(seen.length, 4);
});

test("先回一句：答完前到的留着（表情去掉后也在），答完后才到的丢掉", () => {
  const a = new Acks();
  const id = a.add("p", "帮我查下");
  a.say(id, "好，我先翻一下日程");
  a.set(id, null);
  assert.equal(a.get(id)?.say, "好，我先翻一下日程");
  assert.equal(a.get(id)?.mark, null);
  const late = a.add("p", "又一句");
  a.set(late, null);
  a.say(late, "太晚了");
  assert.equal(a.get(late), undefined);
});

test("后台任务的状态跟着换表情", () => {
  const a = new Acks();
  const id = a.add("main", "整理一下");
  a.link(id, [{ id: "t1", status: "running" } as Task]);
  assert.equal(a.get(id)?.mark, "bg");
  assert.equal(a.linked("t1"), true);
  a.onTask({ id: "t1", status: "blocked" } as Task);
  assert.equal(a.get(id)?.mark, "ask");
  a.onTask({ id: "t1", status: "done" } as Task);
  assert.equal(a.get(id)?.mark, "done");
  a.onTask({ id: "t2", status: "failed" } as Task); // 别的任务不影响
  assert.equal(a.get(id)?.mark, "done");
  assert.equal(taskMark({ status: "cancelled" } as Task), null);
});

test("奇奇的回执对应的表情", () => {
  assert.equal(markForReply("→ 奇奇 · 后台任务「周报」\n\n好，已交给后台"), "bg");
  assert.equal(markForReply("→ 奇奇/主对话 · 交给宝\n\n答案"), null);
  assert.equal(markForReply("✅ 后台任务「周报」完成：\n\n…"), "done");
  assert.equal(markForReply("❌ 后台任务「周报」失败：超时"), "error");
  assert.equal(markForReply("⏸ 后台任务「周报」卡住了"), "ask");
  assert.equal(markForReply("出错了：连不上"), "error");
  assert.equal(markForReply("拆成 2 件：\n- 后台任务「a」（奇奇）：做完回报到这里"), "bg");
  assert.equal(markForReply("奇奇 · 直接回答\n\n你好"), null);
});

test("模型按用途配置：没选是 undefined；先回一句的整理", () => {
  assert.equal(roleModel("route", {}), undefined);
  assert.equal(roleModel("ack", { ACK_MODEL: " deepseek/deepseek-flash " }), "deepseek/deepseek-flash");
  assert.equal(cleanAck("SKIP"), "");
  assert.equal(cleanAck("“好，我先看下日程”\n多余的"), "好，我先看下日程");
  assert.equal(cleanAck(""), "");
});

test("拆成几件放后台：全做完才 ✅，有一件出错就 ❗", () => {
  const a = new Acks();
  const id = a.add("main", "两件事");
  a.link(id, [{ id: "x", status: "queued" } as Task, { id: "y", status: "running" } as Task]);
  a.onTask({ id: "x", status: "done" } as Task);
  assert.equal(a.get(id)?.mark, "bg"); // y 还在做
  a.onTask({ id: "y", status: "failed" } as Task);
  assert.equal(a.get(id)?.mark, "error");
  a.onTask({ id: "x", status: "done" } as Task); // 晚到的更新不会盖掉出错
  assert.equal(a.get(id)?.mark, "error");
});
