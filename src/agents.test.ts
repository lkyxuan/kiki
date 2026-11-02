import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Agents } from "./agents.js";

/** 假的 pi 会话：prompt 等 release 才结束，记下被调用和关掉的次数。 */
function stub() {
  let release = () => {};
  const st = { prompts: 0, disposed: 0, aborted: 0 };
  const s: any = {
    messages: [],
    isStreaming: false,
    prompt: () => {
      st.prompts++;
      return new Promise<void>((r) => (release = r));
    },
    abort: async () => {
      st.aborted++;
      release();
    },
    dispose: () => void st.disposed++,
  };
  return { s, st };
}

test("删掉对话：正在跑的停下，排在后面的消息不再跑；记录挪进回收站，同名同秒也不互相覆盖", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-agents-"));
  const agents = new Agents(dir, "deepseek/deepseek-flash");
  const p1 = join(dir, "a-1.jsonl"), p2 = join(dir, "a-2.jsonl");
  writeFileSync(p1, "{}\n");
  writeFileSync(p2, "{}\n");
  const { s, st } = stub();
  (agents as any).live.set(p1, s);
  const first = agents.send("奇奇", p1, "一").catch(() => "");
  const second = agents.send("奇奇", p1, "二"); // 排在后面
  await new Promise((r) => setImmediate(r));
  await agents.discard("奇奇", p1, "a:b");
  await first;
  await assert.rejects(second, /删掉/);
  assert.equal(st.prompts, 1);
  assert.equal(st.aborted, 1);
  assert.equal(st.disposed, 1);
  await agents.discard("奇奇", p2, "a?b"); // 名字清理后同为 a_b
  assert.ok(!existsSync(p1) && !existsSync(p2));
  assert.equal(readdirSync(join(dir, "trash", "奇奇")).length, 2);
});
