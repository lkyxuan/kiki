import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_BAO, migrateToQiqi } from "./migrate.js";

const tpl = join(import.meta.dirname, "..", "data-template");

test("老数据目录：建奇奇，dev/life 挪进 archive，对话文件还在", () => {
  const d = mkdtempSync(join(tmpdir(), "kiki-"));
  mkdirSync(join(d, "agents", "dev", "sessions"), { recursive: true });
  writeFileSync(join(d, "agents", "dev", "sessions", "a.jsonl"), "{}\n");
  mkdirSync(join(d, "agents", "life"), { recursive: true });
  mkdirSync(join(d, "agents", "work"), { recursive: true });
  writeFileSync(join(d, "分派规则.md"), "- 都不太贴近时，交给生活宝（life）。\n");
  const log = migrateToQiqi(d, tpl, new Date("2026-11-01T00:00:00Z"));
  assert.ok(existsSync(join(d, "agents", DEFAULT_BAO, "AGENTS.md")));
  assert.ok(!existsSync(join(d, "agents", "dev")));
  assert.ok(!existsSync(join(d, "agents", "life")));
  assert.ok(existsSync(join(d, "agents", "work")), "用户自己的宝不动");
  assert.ok(existsSync(join(d, "archive", "agents-2026-11-01", "dev", "sessions", "a.jsonl")));
  assert.match(readFileSync(join(d, "分派规则.md"), "utf8"), /交给奇奇。/);
  assert.ok(log.length >= 3);
  assert.deepEqual(migrateToQiqi(d, tpl), [], "只跑一次");
});

test("新数据目录（模板里已经有奇奇）：什么都不用挪", () => {
  const d = mkdtempSync(join(tmpdir(), "kiki-"));
  mkdirSync(join(d, "agents", DEFAULT_BAO), { recursive: true });
  assert.deepEqual(migrateToQiqi(d, tpl), []);
});
