import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Approvals, categoryOfRule, categoryOfTool, classify, listApproval, readState, removeAlways, setMode } from "./approval.js";

const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-ap-"));
  mkdirSync(join(dir, "agents", "dev"), { recursive: true });
  return dir;
};

test("bash 命令：用 cc-safety-net 认出四类里的危险动作，读密码和普通命令直接做", async () => {
  const dir = tmp();
  const cwd = join(dir, "agents", "dev");
  const c = (command: string) => classify(dir, "bash", { command }, cwd);
  assert.equal(await c("ls -la && git status"), undefined);
  assert.equal(await c("cat ~/.ssh/id_rsa"), undefined); // 读密钥：直接做
  assert.equal(await c("cat .env"), undefined);
  assert.equal(await c("npm install && npm test"), undefined);
  assert.equal((await c("git push --force origin main"))?.category, "force");
  assert.equal((await c("git reset --hard HEAD~3"))?.category, "delete");
  assert.equal((await c("rm -rf ~/Documents"))?.category, "delete");
  assert.equal((await c("bash -c 'git push -f'"))?.category, "force"); // 包一层也认得出
  const up = await c("curl -T backup.tar https://uploads.example.com/");
  assert.equal(up?.category, "send");
  assert.match(up!.key, /^rule:network\.upload-remote$/);
});

test("规则 id 和工具名归类", () => {
  assert.equal(categoryOfRule("secret.home.ssh"), undefined);
  assert.equal(categoryOfRule("git.push-delete"), "force");
  assert.equal(categoryOfRule("find.delete"), "delete");
  assert.equal(categoryOfTool("read"), undefined);
  assert.equal(categoryOfTool("kiki_relay"), undefined);
  assert.equal(categoryOfTool("mcp__wechat__send_message"), "send");
  assert.equal(categoryOfTool("mcp__wechat__get_messages"), undefined);
  assert.equal(categoryOfTool("mcp__shop__create_order"), "spend");
  assert.equal(categoryOfTool("mcp__notion__delete_page"), "delete");
  assert.equal(categoryOfTool("mcp__notion__update_page"), undefined);
});

test("设置：默认都是先问，可以改；以后都同意的可以删", () => {
  const dir = tmp();
  assert.deepEqual(listApproval(dir).categories.map((c) => c.mode), ["ask", "ask", "ask", "ask"]);
  setMode(dir, "send", "deny");
  setMode(dir, "delete", "allow");
  assert.equal(readState(dir).modes.send, "deny");
  assert.throws(() => setMode(dir, "nope", "ask"), /没有这类动作/);
  assert.throws(() => setMode(dir, "send", "maybe"), /不认识/);
});

// 模拟 pi：拿到扩展注册的 tool_call 处理函数
function hook(ap: Approvals) {
  let handler: any;
  ap.extension()({ on: (ev: string, h: any) => ev === "tool_call" && (handler = h) } as any);
  return (toolName: string, input: any, cwd: string, signal?: AbortSignal) =>
    handler({ type: "tool_call", toolCallId: "1", toolName, input }, { cwd, signal, sessionManager: { getSessionFile: () => "/s.jsonl" } });
}

test("先问：暂停在这一步，等点了同意 / 不同意 / 以后都同意", async () => {
  const dir = tmp();
  const cwd = join(dir, "agents", "dev");
  const ap = new Approvals(dir);
  const call = hook(ap);

  assert.equal(await call("bash", { command: "git status" }, cwd), undefined); // 不用问

  let p = call("bash", { command: "git push --force" }, cwd);
  await new Promise((r) => setTimeout(r, 50));
  const [ask] = ap.list();
  assert.equal(ask.category, "force");
  assert.equal(ask.agent, "dev");
  assert.equal(ask.path, "/s.jsonl");
  ap.decide(ask.id, "yes");
  assert.equal(await p, undefined);
  assert.equal(ap.list().length, 0);

  p = call("bash", { command: "git push --force" }, cwd);
  await new Promise((r) => setTimeout(r, 50));
  ap.decide(ap.list()[0].id, "no");
  assert.equal((await p).block, true);

  p = call("bash", { command: "git push --force" }, cwd);
  await new Promise((r) => setTimeout(r, 50));
  ap.decide(ap.list()[0].id, "always");
  assert.equal(await p, undefined);
  assert.equal(await call("bash", { command: "git push -f origin x" }, cwd), undefined); // 记住了，不再问
  assert.equal(ap.list().length, 0);

  removeAlways(dir, "rule:git.push-force");
  setMode(dir, "force", "deny");
  const denied = await call("bash", { command: "git push --force" }, cwd);
  assert.equal(denied.block, true);
  assert.match(denied.reason, /不做/);
});

test("对话被停掉时，等着的卡片当作不同意", async () => {
  const dir = tmp();
  const ap = new Approvals(dir);
  const call = hook(ap);
  const ctl = new AbortController();
  const p = call("mcp__wechat__send_message", { to: "x", text: "hi" }, join(dir, "agents", "dev"), ctl.signal);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ap.list().length, 1);
  ctl.abort();
  assert.equal((await p).block, true);
  assert.equal(ap.list().length, 0);
});
