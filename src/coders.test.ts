import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Coders, normalize, resumeCommand } from "./coders.js";
import { CoderSetup, claudeInstalled, codexInstalled, hookScript, mergeClaude, mergeCodex, unmergeClaude, unmergeCodex } from "./coders-setup.js";
import { addSetupBao, SETUP_BAO } from "./migrate.js";

const tmp = () => mkdtempSync(join(tmpdir(), "kiki-coders-"));
const make = (o: Partial<ConstructorParameters<typeof Coders>[0]> = {}) =>
  new Coders({ dataDir: tmp(), listBaos: () => ["奇奇", "kiki", "生活"], defaultBao: "奇奇", ...o });
const cc = (event: string, extra: Record<string, unknown> = {}) => ({ session_id: "s1", cwd: "/Users/me/code/kiki", transcript_path: "/t.jsonl", hook_event_name: event, ...extra });

test("Claude Code：开始→要求→等批准→接着干→做完→关掉，状态跟着变", async () => {
  const c = make();
  await c.ingest("claude-code", cc("SessionStart"));
  let s = c.list()[0];
  assert.equal(s.bao, "kiki"); // 文件夹名对上宝名
  assert.equal(s.status, "idle");
  await c.ingest("claude-code", cc("UserPromptSubmit", { prompt: "修好登录页\n细节……" }));
  s = c.list()[0];
  assert.equal(s.status, "running");
  assert.equal(s.title, "修好登录页");
  await c.ingest("claude-code", cc("Notification", { notification_type: "permission_prompt", message: "Claude needs your permission to use Bash" }));
  assert.equal(c.list()[0].status, "waiting");
  assert.equal(c.list()[0].waitingFor, "approval");
  await c.ingest("claude-code", cc("PostToolUse", { tool_name: "Bash" }));
  assert.equal(c.list()[0].status, "running");
  await c.ingest("claude-code", cc("Stop", { last_assistant_message: "改好了，测试都过了。" }));
  s = c.list()[0];
  assert.equal(s.status, "idle");
  assert.equal(s.summary, "改好了，测试都过了。");
  assert.equal(s.turns.length, 1);
  assert.ok(s.turns[0].done);
  await c.ingest("claude-code", cc("SessionEnd", { reason: "prompt_input_exit" }));
  assert.equal(c.list()[0].status, "ended");
  c.save();
  assert.ok(existsSync(join(c.dir, "sessions.json")));
});

test("Codex：notify 一次带要求和结果", async () => {
  const c = make();
  await c.ingest("codex", { type: "agent-turn-complete", "thread-id": "t1", "turn-id": "u1", cwd: "/x/旅行计划", "input-messages": ["订去东京的酒店"], "last-assistant-message": "找了三家，见 hotels.md" });
  const s = c.list()[0];
  assert.equal(s.tool, "codex");
  assert.equal(s.title, "订去东京的酒店");
  assert.equal(s.status, "idle");
  assert.equal(s.bao, "奇奇"); // 对不上，也没给模型：归默认的宝
  assert.match(resumeCommand(s), /^cd \/x\/旅行计划 && codex resume t1$|^cd '\/x\/旅行计划' && codex resume t1$/);
});

test("不关心的事件、没开头的工具调用不建卡片", async () => {
  assert.equal(normalize("claude-code", cc("PreCompact")), undefined);
  assert.equal(normalize("claude-code", cc("Notification", { notification_type: "auth_success" })), undefined);
  assert.equal(normalize("whatever", cc("Stop")), undefined);
  const c = make();
  assert.equal(await c.ingest("claude-code", cc("PostToolUse")), undefined);
  assert.equal(c.list().length, 0);
});

test("文件夹归宝：模型挑一次就记住，子文件夹跟着走，可以改投", async () => {
  let asked = 0;
  const c = make({ pickBao: async () => (asked++, "生活") });
  await c.ingest("claude-code", cc("UserPromptSubmit", { cwd: "/p/trip", prompt: "做行程" }));
  await c.ingest("claude-code", cc("UserPromptSubmit", { session_id: "s2", cwd: "/p/trip/sub", prompt: "再看看" }));
  assert.equal(asked, 1);
  assert.deepEqual(c.list().map((s) => s.bao), ["生活", "生活"]);
  c.setBao("/p/trip", "kiki");
  assert.deepEqual(c.list().map((s) => s.bao), ["kiki", "kiki"]);
  assert.throws(() => c.setBao("/p/trip", "没有的宝"));
});

test("一轮做完用小模型压一句话；主对话摘要和简报带上", async () => {
  const c = make({ summarize: async () => "登录页修好，测试全过" });
  await c.ingest("claude-code", cc("UserPromptSubmit", { prompt: "修好登录页" }));
  await c.ingest("claude-code", cc("Stop", { last_assistant_message: "很长的回答".repeat(30) }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(c.list()[0].summary, "登录页修好，测试全过");
  assert.match(c.digest("kiki"), /Claude Code · kiki：这轮做完 · 修好登录页 → 登录页修好/);
  assert.equal(c.digest("生活"), "");
  assert.match(c.briefingLines().done[0], /在 kiki 做完 1 轮/);
});

test("Kiki 关着时 hook 写下的 spool，启动时补收", async () => {
  const c = make();
  writeFileSync(join(c.dir, "spool", "pending.jsonl"), [JSON.stringify({ tool: "claude-code", host: "mbp", at: "2026-11-03T10:00:00Z", event: cc("UserPromptSubmit", { prompt: "补收的" }) }), "坏行", ""].join("\n"));
  assert.equal(await c.drainSpool(), 1);
  assert.equal(c.list()[0].title, "补收的");
  assert.equal(c.list()[0].host, "mbp");
  assert.equal(await c.drainSpool(), 0);
});

test("装 Claude Code 的 hook：不重复、不碰原有的、能撤掉", () => {
  const orig = JSON.stringify({ model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "say done" }] }] } });
  const once = mergeClaude(orig, "/d/kiki-hook.sh");
  assert.ok(claudeInstalled(once));
  assert.equal(mergeClaude(once, "/d/kiki-hook.sh"), once);
  const cfg = JSON.parse(once);
  assert.equal(cfg.model, "opus");
  assert.equal(cfg.hooks.Stop.length, 2);
  assert.equal(cfg.hooks.Stop[1].hooks[0].async, true);
  const back = JSON.parse(unmergeClaude(once));
  assert.deepEqual(back, JSON.parse(orig));
  assert.ok(!claudeInstalled(""));
  assert.throws(() => mergeClaude("{坏", "/d/kiki-hook.sh"));
});

test("装 Codex 的 notify：原来有的接上、撤掉时放回去", () => {
  const empty = mergeCodex('model = "o3"\n[profiles.x]\nnotify = "不是顶层的"\n', "/d/kiki-hook.sh");
  assert.equal(empty.prev, undefined);
  assert.match(empty.text, /^notify = \["\/d\/kiki-hook.sh","codex"\]\nmodel/);
  assert.ok(codexInstalled(empty.text));
  assert.equal(unmergeCodex(empty.text), 'model = "o3"\n[profiles.x]\nnotify = "不是顶层的"\n');

  const had = mergeCodex("notify = ['python3', '/n.py']\nmodel = \"o3\"\n", "/d/kiki-hook.sh");
  assert.deepEqual(had.prev, ["python3", "/n.py"]);
  assert.equal(unmergeCodex(had.text, had.prev), 'notify = ["python3","/n.py"]\nmodel = "o3"\n');
  assert.throws(() => mergeCodex("notify = [\n 'a',\n]\n", "/d/kiki-hook.sh"));
});

test("CoderSetup：本机开关会备份、写脚本", () => {
  const home = tmp(), data = tmp();
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), "{}");
  const s = new CoderSetup({ dataDir: data, port: 4567, home });
  assert.deepEqual([s.status().claude.on, s.status().claude.found, s.status().codex.found], [false, true, false]);
  assert.match(s.set("claude", true), /接好了/);
  assert.ok(s.status().claude.on);
  assert.ok(existsSync(join(home, ".claude", "settings.json.kiki-bak")));
  assert.match(readFileSync(s.script, "utf8"), /127\.0\.0\.1:4567/);
  assert.match(s.set("claude", true), /已经接好了/);
  s.set("claude", false);
  assert.ok(!s.status().claude.on);
});

test("hook 脚本：发得通就发，发不通先写 spool，下次发通时补上", async () => {
  const got: { url: string; body: string }[] = [];
  let up = false;
  const srv = createServer(async (req, res) => {
    let b = "";
    for await (const c of req) b += c;
    if (!up) { res.writeHead(503); return res.end(); }
    got.push({ url: req.url!, body: b });
    res.end("{}");
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", () => ok()));
  const port = (srv.address() as any).port;
  const dir = tmp();
  const script = join(dir, "kiki-hook.sh");
  writeFileSync(script, hookScript({ url: `http://127.0.0.1:${port}`, spool: join(dir, "spool") }), { mode: 0o755 });
  // 服务器在同一个进程里，脚本要异步跑，不然服务器没法回话
  const sh = (args: string[], input = "") =>
    new Promise<void>((ok, fail) => {
      const p = execFile(script, args, (e) => (e ? fail(e) : ok()));
      p.stdin!.end(input);
    });
  const run = (input: string) => sh(["claude-code"], input);
  try {
    await run(JSON.stringify(cc("UserPromptSubmit", { prompt: "a\nb" })));
    await run(JSON.stringify(cc("PostToolUse"))); // 发不通时工具调用不记
    const pending = readFileSync(join(dir, "spool", "pending.jsonl"), "utf8").trim().split("\n");
    assert.equal(pending.length, 1);
    assert.equal(JSON.parse(pending[0]).event.prompt, "a\nb");
    up = true;
    await run(JSON.stringify(cc("Stop")));
    assert.equal(got.length, 2);
    assert.match(got[0].url, /^\/api\/coders\/event\?tool=claude-code&host=/);
    assert.equal(got[1].url, "/api/coders/batch");
    assert.equal(JSON.parse(got[1].body.trim()).event.prompt, "a\nb");
    assert.ok(!existsSync(join(dir, "spool", "pending.jsonl")) || !readFileSync(join(dir, "spool", "pending.jsonl"), "utf8").trim());
    // Codex：JSON 在第二个参数
    await sh(["codex", JSON.stringify({ type: "agent-turn-complete" })]);
    assert.match(got[2].url, /tool=codex/);
  } finally {
    srv.close();
  }
});

test("老数据目录补上管家，只补一次", () => {
  const data = tmp();
  const tpl = join(process.cwd(), "data-template");
  assert.equal(addSetupBao(data, tpl).length, 1);
  assert.ok(existsSync(join(data, "agents", SETUP_BAO, "AGENTS.md")));
  assert.equal(addSetupBao(data, tpl).length, 0);
});
