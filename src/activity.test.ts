import assert from "node:assert/strict";
import { test } from "node:test";
import { describeTool, stepsFromMessages, summarize } from "./activity.js";

test("工具调用翻成人话", () => {
  assert.deepEqual(describeTool("bash", { command: "ls -la\n  /tmp" }), { title: "运行命令", detail: "ls -la /tmp" });
  assert.deepEqual(describeTool("read", { path: "/Users/x/kiki-data/agents/奇奇/AGENTS.md" }), { title: "读文件", detail: "AGENTS.md" });
  assert.equal(describeTool("mcp__notion__search", { query: "周报" }).title, "用 notion 的 search");
  assert.equal(describeTool("mcp__notion__search", { query: "周报" }).detail, "周报");
  assert.deepEqual(describeTool("kiki_peek", { target: "奇奇/周报" }, { kiki_peek: "看别的对话" }), { title: "看别的对话", detail: "奇奇/周报" });
  assert.equal(describeTool("whatever", {}).title, "用工具 whatever");
  assert.ok(describeTool("bash", { command: "x".repeat(200) }).detail.length <= 80);
});

test("一轮做完的总结", () => {
  assert.equal(summarize([{ id: "1", title: "", detail: "", status: "done" }, { id: "2", title: "", detail: "", status: "error" }]), "用了 2 个工具，1 个出错");
});

test("老对话里每条回答前用过的工具", () => {
  const final = { role: "assistant", content: [{ type: "text", text: "好了" }] };
  const msgs = [
    { role: "user", content: "看看" },
    { role: "assistant", content: [{ type: "toolCall", id: "a", name: "ls", arguments: {} }] },
    { role: "toolResult", toolCallId: "a", isError: false },
    { role: "assistant", content: [{ type: "toolCall", id: "b", name: "bash", arguments: { command: "false" } }] },
    { role: "toolResult", toolCallId: "b", isError: true },
    final,
  ];
  const steps = stepsFromMessages(msgs).get(final)!;
  assert.deepEqual(steps.map((s) => [s.title, s.status]), [["看文件夹", "done"], ["运行命令", "error"]]);
});
