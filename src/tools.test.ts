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

test("createBao：写好说明文件，重名和坏名字报错", async () => {
  const { createBao, baoFile } = await import("./bao.js");
  const dir = mkdtempSync(join(tmpdir(), "kiki-"));
  createBao(dir, "生活宝", "日常生活：购物、\n家里的事");
  assert.match(readFileSync(baoFile(dir, "生活宝"), "utf8"), /^# 生活宝\n\n## 我负责什么\n日常生活：购物、 家里的事\n/);
  assert.throws(() => createBao(dir, "生活宝", "x"), /已经有/);
  assert.throws(() => createBao(dir, "../x", "x"), /不行/);
});

test("宝设置：只改「我负责什么」这一段，别的原样留着", async () => {
  const { baoDoc, readDuty, setDuty } = await import("./bao.js");
  const md = baoDoc("工作", "管项目") + "\n## 记下的事\n\n- 周一开会\n";
  assert.equal(readDuty(md), "管项目");
  const next = setDuty(md, "工作", "  管会议\n\n## 和邮件 \n");
  assert.equal(readDuty(next), "管会议\n和邮件");
  assert.equal(next.replace("管会议\n和邮件", "管项目"), md);
  assert.equal(setDuty("# 工作\n\n## 我怎么干活\n- x\n", "工作", "a"), "# 工作\n\n## 我负责什么\na\n\n## 我怎么干活\n- x\n");
  assert.equal(readDuty(setDuty("", "工作", "")), "工作相关的事");
});
