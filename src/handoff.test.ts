import assert from "node:assert/strict";
import { test } from "node:test";
import { handoffTool } from "./handoff.js";

test("交接工具的提示里带宝目录：每个宝的名字和一句职责", () => {
  const t = handoffTool({ listBaos: () => ["奇奇", "生活宝"], describe: (b) => (b === "生活宝" ? "日常生活" : ""), onHandoff: async () => "" });
  const dir = (t.promptGuidelines ?? []).find((g) => g.startsWith("现有的宝："));
  assert.equal(dir, "现有的宝：\n- 奇奇\n- 生活宝：日常生活\n各宝下面有哪些对话、聊到哪，用 kiki_peek 查。");
});
