import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { A2AAgent } from "./a2a.js";
import { AcpAgent } from "./acp.js";
import type { AdapterContext, PermissionRequest } from "./postroom.js";
import { htmlText, parseFeed, WatchAgent } from "./watch.js";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function ctx(asks: PermissionRequest[] = [], answer = true): AdapterContext {
  const dataDir = mkdtempSync(join(tmpdir(), "kiki-ad-"));
  const root = join(dataDir, "postroom");
  mkdirSync(root, { recursive: true });
  return { root, approve: async (r) => (asks.push(r), answer), wake: () => {} };
}

// ---------- A2A ----------

function fakeA2A(script: (method: string, params: any) => any) {
  const calls: string[] = [];
  const http = (async (url: string, init?: any) => {
    if (String(url).endsWith("/.well-known/agent-card.json")) return new Response(JSON.stringify({ name: "grok", url: "http://bot/rpc" }));
    const body = JSON.parse(init.body);
    calls.push(body.method);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: script(body.method, body.params) }));
  }) as typeof fetch;
  return { http, calls };
}

test("A2A：派活不等结果，之后查到做完就交回带 re 的回音；重启后还记得在等哪件", async () => {
  const c = ctx();
  let state = "working";
  const { http, calls } = fakeA2A((m) =>
    m === "message/send"
      ? { kind: "task", id: "t1", contextId: "c1", status: { state: "submitted" } }
      : { kind: "task", id: "t1", status: { state }, artifacts: [{ parts: [{ kind: "text", text: "BTC 7 万" }] }] },
  );
  const a = new A2AAgent("grok", { name: "grok", kind: "a2a", url: "http://bot" }, c, http);
  await a.dispatch({ id: "o1", title: "查价", text: "查 BTC" });
  assert.deepEqual(await a.status(), { state: "working", note: "1 件在做" });
  assert.deepEqual(await a.collect(), []);
  // 换一个实例（像 Kiki 重启），还接着查 t1
  const b = new A2AAgent("grok", { name: "grok", kind: "a2a", url: "http://bot" }, c, http);
  state = "completed";
  const got = await b.collect();
  assert.equal(got.length, 1);
  assert.equal(got[0].re, "o1");
  assert.equal(got[0].text, "BTC 7 万");
  assert.deepEqual(await b.status(), { state: "idle" });
  assert.deepEqual(calls, ["message/send", "tasks/get", "tasks/get"]);
});

test("A2A：对方要人回话就标成要你看；直接回消息的当场算完", async () => {
  const { http } = fakeA2A((_m, p) =>
    p.message.parts[0].text === "问" ? { kind: "message", parts: [{ kind: "text", text: "答" }] } : { kind: "task", id: "t2", status: { state: "input-required", message: { parts: [{ kind: "text", text: "要哪个币？" }] } } },
  );
  const a = new A2AAgent("g", { name: "g", kind: "a2a", url: "http://bot" }, ctx(), http);
  await a.dispatch({ id: "o1", title: "x", text: "问" });
  await a.dispatch({ id: "o2", title: "y", text: "查价" });
  const got = await a.collect();
  assert.equal(got[0].text, "答");
  assert.equal(got[1].attention, true);
  assert.match(got[1].text, /需要你回话[\s\S]*要哪个币/);
});

test("A2A：读不到名片算联系不上", async () => {
  const a = new A2AAgent("g", { name: "g", kind: "a2a", url: "http://nope" }, ctx(), (async () => new Response("", { status: 404 })) as typeof fetch);
  assert.equal((await a.status()).state, "offline");
});

// ---------- ACP ----------

/** 假的 ACP agent：读 stdin 的 JSON-RPC，按顺序回。 */
function fakeAcp(onPrompt: (send: (m: object) => void, id: number, sessionId: string) => void) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const proc = Object.assign(new EventEmitter(), { stdin, stdout, stderr: new PassThrough(), exitCode: null, kill() {} }) as unknown as ChildProcess;
  const send = (m: object) => stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  const replies: any[] = [];
  let buf = "";
  stdin.on("data", (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (!m.method) replies.push(m);
      else if (m.method === "initialize") send({ id: m.id, result: { protocolVersion: 1 } });
      else if (m.method === "session/new") send({ id: m.id, result: { sessionId: "s1" } });
      else if (m.method === "session/prompt") onPrompt(send, m.id, m.params.sessionId);
    }
  });
  return { launch: () => proc, replies };
}

test("ACP：起进程、开会话、收文字，做完交回带 re 的回音", async () => {
  const { launch } = fakeAcp((send, id, sid) => {
    send({ method: "session/update", params: { sessionId: sid, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "改好了，" } } } });
    send({ method: "session/update", params: { sessionId: sid, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "测试都过了" } } } });
    setTimeout(() => send({ id, result: { stopReason: "end_turn" } }), 5);
  });
  const a = new AcpAgent("cc", { name: "cc", kind: "acp", command: "fake" }, ctx(), launch);
  await a.dispatch({ id: "o1", title: "修 bug", text: "修一下" });
  assert.equal((await a.status()).state, "working");
  await tick(30);
  const got = await a.collect();
  assert.deepEqual(got.map((g) => [g.re, g.text]), [["o1", "改好了，测试都过了"]]);
  assert.equal((await a.status()).state, "idle");
});

test("ACP 要权限：普通命令直接同意，删除类走审批卡片（挂在派活的对话上）", async () => {
  const asks: PermissionRequest[] = [];
  const options = [
    { optionId: "yes", kind: "allow_once" },
    { optionId: "no", kind: "reject_once" },
  ];
  const { launch, replies } = fakeAcp((send, id, sid) => {
    send({ id: 100, method: "session/request_permission", params: { sessionId: sid, options, toolCall: { title: "跑测试", kind: "execute", rawInput: { command: "npm test" } } } });
    send({ id: 101, method: "session/request_permission", params: { sessionId: sid, options, toolCall: { title: "清目录", kind: "execute", rawInput: { command: "git reset --hard" } } } });
    setTimeout(() => send({ id, result: { stopReason: "end_turn" } }), 50);
  });
  const a = new AcpAgent("cc", { name: "cc", kind: "acp", command: "fake" }, ctx(asks, false), launch);
  await a.dispatch({ id: "o1", title: "t", text: "x", origin: "/s/a.jsonl" });
  await tick(300);
  const byId = Object.fromEntries(replies.map((r) => [r.id, r.result?.outcome?.optionId]));
  assert.equal(byId[100], "yes");
  assert.equal(byId[101], "no"); // 审批没同意
  assert.equal(asks.length, 1);
  assert.equal(asks[0].category, "delete");
  assert.equal(asks[0].origin, "/s/a.jsonl");
});

test("ACP：没写 preset 也没写 command 时报错说清楚", () => {
  const a = new AcpAgent("cc", { name: "cc", kind: "acp" }, ctx());
  return assert.rejects(a.dispatch({ id: "o", title: "t", text: "x" }), /preset/);
});

// ---------- 定时检查 ----------

test("定时检查文件：第一次只记下，之后只报新出现的行", async () => {
  const c = ctx();
  const f = join(c.root, "log.txt");
  writeFileSync(f, "a\nb\n");
  const w = new WatchAgent("日志", { name: "日志", kind: "watch", path: f }, c);
  assert.deepEqual(await w.collect(), []);
  assert.deepEqual(await w.collect(), []); // 没变
  writeFileSync(f, "a\nb\nc 出错了\n");
  const got = await w.collect();
  assert.equal(got.length, 1);
  assert.match(got[0].text, /c 出错了$/);
  assert.doesNotMatch(got[0].text, /\nb\n/);
});

test("定时检查文件夹：新文件各报一条；every 没到不看", async () => {
  const c = ctx();
  const d = join(c.root, "drop");
  mkdirSync(d);
  writeFileSync(join(d, "old.md"), "旧的");
  const w = new WatchAgent("下载", { name: "下载", kind: "watch", path: d, every: 5, route: false }, c);
  const t0 = Date.now();
  assert.deepEqual(await w.collect(t0), []);
  writeFileSync(join(d, "new.md"), "新的报告");
  assert.deepEqual(await w.collect(t0 + 60_000), []); // 才过 1 分钟
  const got = await w.collect(t0 + 6 * 60_000);
  assert.equal(got.length, 1);
  assert.equal(got[0].title, "new.md");
  assert.match(got[0].text, /新的报告/);
  assert.equal(got[0].route, false);
});

test("定时检查 RSS：只报新条目；网页只看文字", async () => {
  const rss = (items: string[]) => `<?xml version="1.0"?><rss><channel>${items.map((t) => `<item><title><![CDATA[${t}]]></title><link>http://x/${t}</link><guid>${t}</guid></item>`).join("")}</channel></rss>`;
  let body = rss(["一"]);
  const http = (async () => new Response(body, { headers: { "content-type": "application/rss+xml" } })) as typeof fetch;
  const w = new WatchAgent("新闻", { name: "新闻", kind: "watch", url: "http://x/feed" }, ctx(), http);
  assert.deepEqual(await w.collect(), []);
  body = rss(["一", "二"]);
  const got = await w.collect();
  assert.deepEqual(got.map((g) => g.title), ["二"]);
  assert.match(got[0].text, /http:\/\/x\/二/);
  assert.equal(parseFeed("<html></html>"), undefined);
  assert.equal(htmlText("<html><script>x()</script><p>你好 &amp; 再见</p></html>"), "你好 & 再见");
});

test("定时检查：地址打不开显示出错", async () => {
  const w = new WatchAgent("x", { name: "x", kind: "watch", url: "http://x" }, ctx(), (async () => new Response("", { status: 500 })) as typeof fetch);
  await w.collect();
  assert.deepEqual((await w.status()).state, "error");
});
