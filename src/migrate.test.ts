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
  writeFileSync(join(d, "registry.json"), JSON.stringify({
    sessions: [{ agent: "dev", name: "a", path: "/x/a.jsonl" }, { agent: "work", name: "b", path: "/x/b.jsonl" }],
    chats: { app: "/x/a.jsonl", other: "/x/b.jsonl" },
  }));
  const log = migrateToQiqi(d, tpl, new Date("2026-11-01T00:00:00Z"));
  assert.ok(existsSync(join(d, "agents", DEFAULT_BAO, "AGENTS.md")));
  assert.ok(!existsSync(join(d, "agents", "dev")));
  assert.ok(!existsSync(join(d, "agents", "life")));
  assert.ok(existsSync(join(d, "agents", "work")), "用户自己的宝不动");
  assert.ok(existsSync(join(d, "archive", "agents-2026-11-01", "dev", "sessions", "a.jsonl")));
  assert.match(readFileSync(join(d, "分派规则.md"), "utf8"), /交给奇奇。/);
  const reg = JSON.parse(readFileSync(join(d, "registry.json"), "utf8"));
  assert.deepEqual(reg.sessions.map((x: any) => x.agent), ["work"], "名册里去掉已归档的对话");
  assert.deepEqual(reg.chats, { other: "/x/b.jsonl" }, "指向归档对话的当前选择清掉");
  assert.ok(log.length >= 4);
  assert.deepEqual(migrateToQiqi(d, tpl), [], "只跑一次");
});

test("新数据目录（模板里已经有奇奇）：什么都不用挪", () => {
  const d = mkdtempSync(join(tmpdir(), "kiki-"));
  mkdirSync(join(d, "agents", DEFAULT_BAO), { recursive: true });
  assert.deepEqual(migrateToQiqi(d, tpl), []);
});

test("奇奇的说明：没改过的旧版换成新版，改过的不动", async () => {
  const { upgradeQiqiNote, OLD_QIQI: old } = await import("./migrate.js");
  const d = mkdtempSync(join(tmpdir(), "kiki-"));
  mkdirSync(join(d, "agents", "奇奇"), { recursive: true });
  const f = join(d, "agents", "奇奇", "AGENTS.md");
  writeFileSync(f, old);
  assert.equal(upgradeQiqiNote(d, tpl).length, 1);
  assert.match(readFileSync(f, "utf8"), /我自己不接具体的事/);
  writeFileSync(f, old + "\n我自己加的一行\n");
  assert.deepEqual(upgradeQiqiNote(d, tpl), []);
});
