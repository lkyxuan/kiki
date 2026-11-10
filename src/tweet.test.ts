import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AGENT, appendRecord, configPath, countPosted, defaultRecordDir, oauthHeader, splitForThread, weightOf } from "./tweet.js";
import kikiTweetTools from "./tweet.js";

const pct = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (m) => `%${m.charCodeAt(0).toString(16).toUpperCase()}`);

// RFC 5849 的签名算法独立算一遍，和我们的实现对拍（X 文档里那个示例的期望值对不上任何标准算法，不用它）
test("x_post 的 OAuth 1.0a 签名按 RFC 5849", () => {
  const args = {
    method: "POST",
    url: "https://api.twitter.com/1.1/statuses/update.json",
    form: { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
    consumerKey: "xvz1evFS4wEEPTGEFPHBog",
    consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
    nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    timestamp: "1318622958",
  };
  const header = oauthHeader(args);
  const sig = decodeURIComponent(/oauth_signature="([^"]+)"/.exec(header)?.[1] ?? "");
  assert.equal(sig, "Tqz6pFAShJQqSyxctXvqKWrv3BQ=");
  const params: Record<string, string> = {
    status: args.form.status,
    oauth_consumer_key: args.consumerKey,
    oauth_nonce: args.nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: args.timestamp,
    oauth_token: args.token,
    oauth_version: "1.0",
  };
  const norm = Object.keys(params)
    .map((k) => [pct(k), pct(params[k])] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = `POST&${pct(args.url)}&${pct(norm)}`;
  assert.equal(createHmac("sha1", `${pct(args.consumerSecret)}&${pct(args.tokenSecret)}`).update(base).digest("base64"), sig);
});

test("推文长度：中文按 2、英文按 1，超长的切成多条都不超 280", () => {
  assert.equal(weightOf("abc!"), 4);
  assert.equal(weightOf("中"), 2);
  assert.equal(weightOf("。"), 2);
  assert.equal(weightOf("a".repeat(280)), 280);
  const long = ["Kiki runs on your own Mac.", "It talks, remembers, and hands work to the right agent.", "No cloud account needed."]
    .map((s) => s.repeat(4))
    .join("\n\n");
  const parts = splitForThread(long);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(weightOf(p) <= 280, `有一条超长：${weightOf(p)}`);
  assert.equal(parts.join("").replace(/\s/g, ""), long.replace(/\s/g, ""));
  assert.deepEqual(splitForThread("短的一条"), ["短的一条"]);
});

test("发帖记录：写进当天文件，删掉的标已删后不算数", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-tweet-"));
  const now = new Date().toISOString();
  appendRecord({ time: now, id: "111", link: "https://x.com/kiki/status/111", text: "第一行\n第二行", by: AGENT }, dir);
  appendRecord({ time: now, id: "222", link: "https://x.com/kiki/status/222", text: "english", replyTo: "111", by: AGENT }, dir);
  assert.equal(countPosted(dir), 2);
  const body = readFileSync(join(dir, `${now.slice(0, 10)}.md`), "utf8");
  assert.ok(body.includes("id 111") && body.includes("回 111") && body.includes("第一行 ⏎ 第二行"), body);
  const file = join(dir, `${now.slice(0, 10)}.md`);
  writeFileSync(file, body.replace("id 111", "id 111 · 已删"));
  assert.equal(countPosted(dir), 1);
});

// 假的 X：自己按 RFC 重算签名，对不上就 401。这样能验到「请求真的带着对的签名出去」而不只是本地算得对
test("x_post / x_delete 打假 X 服务器：签名校验、reply 串、写记录、删掉标已删", async () => {
  const got: { method: string; path: string; body: any; ok: boolean }[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const auth = req.headers.authorization ?? "";
      const oauth: Record<string, string> = {};
      for (const m of auth.replace(/^OAuth\s+/, "").matchAll(/([a-z_]+)="([^"]*)"/g)) oauth[m[1]] = decodeURIComponent(m[2]);
      const url = new URL(`http://127.0.0.1:${port}${req.url}`);
      const all: Record<string, string> = {};
      for (const [k, v] of url.searchParams) all[k] = v;
      for (const [k, v] of Object.entries(oauth)) if (k !== "oauth_signature") all[k] = v;
      const norm = Object.keys(all)
        .map((k) => [pct(k), pct(all[k])] as const)
        .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      const base = `${req.method}&${pct(`http://127.0.0.1:${port}${url.pathname}`)}&${pct(norm)}`;
      const ok = oauth.oauth_signature === createHmac("sha1", `${pct("cs")}&${pct("ts")}`).update(base).digest("base64");
      got.push({ method: req.method ?? "", path: url.pathname, body, ok });
      res.writeHead(ok ? 201 : 401, { "content-type": "application/json" });
      res.end(JSON.stringify(ok ? { data: { id: String(1000 + got.length) } } : { detail: "签名对不上" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as any).port;
  const dir = mkdtempSync(join(tmpdir(), "kiki-tweet-"));
  process.env.KIKI_TWEET_CONFIG = join(dir, "tweet.json");
  writeFileSync(
    process.env.KIKI_TWEET_CONFIG,
    JSON.stringify({ apiKey: "ck", apiSecret: "cs", accessToken: "tok", accessTokenSecret: "ts", apiBase: `http://127.0.0.1:${port}`, handle: "kiki", recordDir: join(dir, "记录") }),
  );
  const tools = kikiTweetTools(dir);
  const ctx = { cwd: join(dir, "agents", AGENT), sessionManager: { getSessionFile: () => undefined } } as any;
  const post = tools.find((t) => t.name === "x_post")!;
  const out = await post.execute("1", { text: "一条中文", english: "english" } as any, undefined, undefined, ctx);
  const said = (out as any).content[0].text as string;
  assert.match(said, /已发 2 条/, said);
  assert.equal(got.length, 2);
  assert.ok(got.every((g) => g.ok), "签名应该全都对得上");
  assert.equal(got[1].body.reply.in_reply_to_tweet_id, "1001");
  assert.equal(countPosted(join(dir, "记录")), 2);

  // 别的宝拿不到：同一个工具，cwd 换成别的宝就拒绝
  const other = await post.execute("2", { text: "x" } as any, undefined, undefined, { ...ctx, cwd: join(dir, "agents", "生活宝") });
  assert.ok((other as any).isError);
  assert.equal(got.length, 2);

  const del = tools.find((t) => t.name === "x_delete")!;
  await del.execute("3", { id: "1001" } as any, undefined, undefined, ctx);
  assert.equal(got[2].method, "DELETE");
  assert.equal(countPosted(join(dir, "记录")), 1);
  server.close();
});

test("没配凭证：说清要用户做什么，不发东西", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-tweet-"));
  process.env.KIKI_TWEET_CONFIG = join(dir, "没有这个文件.json");
  const post = kikiTweetTools(dir).find((t) => t.name === "x_post")!;
  const out = await post.execute("1", { text: "x" } as any, undefined, undefined, { cwd: join(dir, "agents", AGENT) } as any);
  assert.ok((out as any).isError);
  assert.match((out as any).content[0].text, /developer\.x\.com/);
});

test("路径和记录目录跟着数据目录走", () => {
  const saved = process.env.KIKI_TWEET_CONFIG;
  delete process.env.KIKI_TWEET_CONFIG;
  assert.equal(configPath("/tmp/x"), "/tmp/x/engine/tweet.json");
  if (saved !== undefined) process.env.KIKI_TWEET_CONFIG = saved;
  assert.equal(defaultRecordDir("/tmp/x"), `/tmp/x/agents/${AGENT}/notes/发帖记录`);
});

test("op:// 引用：Kiki 没带 token 时自己去 service-account.env 拿，能读到密钥", async () => {
  const { serviceAccountToken } = await import("./tweet.js");
  const dir = mkdtempSync(join(tmpdir(), "kiki-sa-"));
  const f = join(dir, "service-account.env");
  writeFileSync(f, "export OP_SERVICE_ACCOUNT_TOKEN=ops_abc123\n");
  assert.equal(serviceAccountToken(f), "ops_abc123");
  assert.equal(serviceAccountToken(join(dir, "没有.env")), undefined);
});
