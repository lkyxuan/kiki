import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pickedIds, readPrefs, setProviderModels, setProviderOn } from "./modelprefs.js";

test("模型菜单的开关和勾选", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-prefs-"));
  assert.deepEqual(readPrefs(dir), { off: [], models: {} });
  const few = ["a", "b"], many = Array.from({ length: 20 }, (_, i) => `m${i}`);
  assert.deepEqual([...pickedIds(readPrefs(dir), "x", few)], few); // 不多就全列
  assert.equal(pickedIds(readPrefs(dir), "y", many).size, 8); // 多的先列 8 个
  setProviderOn(dir, "y", false);
  assert.deepEqual(readPrefs(dir).off, ["y"]);
  setProviderOn(dir, "y", true);
  assert.deepEqual(readPrefs(dir).off, []);
  setProviderModels(dir, "y", ["m3", "m15", "gone"]);
  assert.deepEqual([...pickedIds(readPrefs(dir), "y", many)].sort(), ["m15", "m3"]); // 已经没有的模型不算
});
