import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Registry } from "./registry.js";
import { cleanSummary, SUMMARY_MAX, Summaries } from "./summary.js";

const reg = () => new Registry(join(mkdtempSync(join(tmpdir(), "kiki-")), "registry.json"));

test("摘要收拾成一行、去引号、截到上限", () => {
  assert.equal(cleanSummary("摘要：「给妈妈挑 iPad，倾向 Air」\n多余的一行"), "给妈妈挑 iPad，倾向 Air");
  assert.equal([...cleanSummary("字".repeat(80))].length, SUMMARY_MAX);
});

test("回完话写摘要；连着几次只写一遍；模型出错也记下活跃时间", async () => {
  const r = reg();
  r.add({ agent: "life", name: "iPad", path: "/p1", created: "2026-01-01T00:00:00.000Z" });
  const prompts: string[] = [];
  let fail = false;
  const s = new Summaries({
    registry: r,
    history: () => [{ role: "user", text: "给妈妈买 iPad" }, { role: "assistant", text: "推荐 Air" }],
    complete: async (_sys, user) => {
      prompts.push(user);
      if (fail) throw new Error("no key");
      return "给妈妈挑 iPad，推荐 Air";
    },
    delayMs: 5,
  });
  s.schedule("/p1");
  s.schedule("/p1");
  await new Promise((x) => setTimeout(x, 30));
  assert.equal(prompts.length, 1);
  assert.equal(r.byPath("/p1")?.summary, "给妈妈挑 iPad，推荐 Air");
  fail = true;
  await s.run("/p1");
  assert.match(prompts[1], /旧摘要：给妈妈挑 iPad，推荐 Air/);
  assert.equal(r.byPath("/p1")?.summary, "给妈妈挑 iPad，推荐 Air"); // 写不出来保留旧的
  assert.ok(r.byPath("/p1")?.active);
  s.schedule("/nope"); // 不在名册里的不管
});
