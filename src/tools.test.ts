import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { remember } from "./tools.js";

test("kiki_remember：写进关于我 / 宝的说明，第一次加小标题，之后只追加", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-"));
  writeFileSync(join(dir, "AGENTS.md"), "# 关于我\n\n- 语言：中文");
  mkdirSync(join(dir, "agents", "dev"), { recursive: true });
  assert.match(remember(dir, ["dev"], "我", "喜欢先给结论\n再解释"), /已记到「关于我」里：喜欢先给结论 再解释/);
  remember(dir, ["dev"], "我", "时区 北京");
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), "# 关于我\n\n- 语言：中文\n\n## 记下的事\n\n- 喜欢先给结论 再解释\n- 时区 北京\n");
  remember(dir, ["dev"], "dev", "代码用 TypeScript");
  assert.match(readFileSync(join(dir, "agents", "dev", "AGENTS.md"), "utf8"), /## 记下的事\n\n- 代码用 TypeScript\n$/);
  assert.throws(() => remember(dir, ["dev"], "work", "x"), /没有宝「work」/);
  assert.throws(() => remember(dir, ["dev"], "我", "  "), /空的/);
});
