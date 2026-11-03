import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { allowedHost } from "./guard.js";
import { assetName, newer, sumFor, teamIdFrom, developerIdRequirement, Updater, VERSION } from "./update.js";

test("版本比较", () => {
  assert.equal(newer("0.2.0", "0.1.9"), true);
  assert.equal(newer("v0.10.0", "0.9.9"), true);
  assert.equal(newer("0.1.0", "0.1.0"), false);
  assert.equal(newer("0.1.0", "0.2.0"), false);
});

test("从 SHA256SUMS 里找校验和", () => {
  const sums = "aaa  Kiki-mac-arm64.zip\nbbb  Kiki-mac-x64.zip\n";
  assert.equal(sumFor(sums, "Kiki-mac-x64.zip"), "bbb");
  assert.equal(sumFor(sums, "nope.zip"), undefined);
});

test("主机名白名单", () => {
  assert.equal(allowedHost("localhost:4567"), true);
  assert.equal(allowedHost("127.0.0.1:4567"), true);
  assert.equal(allowedHost("mac-mini.tail1234.ts.net"), true);
  assert.equal(allowedHost("evil.com"), false);
  assert.equal(allowedHost("100.101.102.103:8889"), true);
  assert.equal(allowedHost("[fd7a:115c:a1e0::1]:8889"), true);
  assert.equal(allowedHost("100.63.0.1"), false);
  assert.equal(allowedHost("100.128.0.1"), false);
  assert.equal(allowedHost("192.168.1.5"), false);
  assert.equal(allowedHost(undefined), false);
  process.env.KIKI_ALLOWED_HOSTS = "kiki.home"; // 读 .env 晚于加载模块，也要生效
  assert.equal(allowedHost("kiki.home:4567"), true);
  delete process.env.KIKI_ALLOWED_HOSTS;
});

test("检查更新：发现新版本；开发模式不能自己装", async () => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        tag_name: "v99.0.0",
        html_url: "https://example.com/r",
        body: "改了些东西",
        assets: [{ name: assetName(), url: "http://x/1" }],
      }),
    );
  }).listen(0);
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  process.env.KIKI_UPDATE_API = `http://127.0.0.1:${port}`;
  process.env.GITHUB_TOKEN = "test"; // 免得去调 gh
  try {
    const u = new Updater({ dataDir: "/tmp", port: 0, whyBusy: () => undefined });
    const s = await u.check();
    assert.equal(s.current, VERSION);
    assert.equal(s.latest, "99.0.0");
    assert.equal(s.status, "available");
    if (!process.env.KIKI_APP) await assert.rejects(u.apply(), /开发模式/);
  } finally {
    server.close();
  }
});

test("已经在装了再点更新：返回进度，不报“没有可装的新版本”", async () => {
  const { Updater } = await import("./update.js");
  const u = new Updater({ dataDir: "/tmp", port: 0, whyBusy: () => undefined });
  u.state.canApply = true;
  u.state.status = "downloading";
  u.state.message = "正在下载 9.9.9…";
  const s = await u.apply();
  assert.equal(s.status, "downloading");
  u.state.status = "idle";
  await assert.rejects(() => u.apply(), /没有可装/);
});

test("从 codesign 输出读团队 ID：本地签名没有团队", () => {
  assert.equal(teamIdFrom("Executable=/A/Kiki\nAuthority=Developer ID Application: X (AB12CD34EF)\nTeamIdentifier=AB12CD34EF\n"), "AB12CD34EF");
  assert.equal(teamIdFrom("Signature=adhoc\nTeamIdentifier=not set\n"), undefined);
  assert.equal(teamIdFrom("code object is not signed at all"), undefined);
});

test("更新签名要求：苹果根证书 + Developer ID + 同一团队；团队 ID 不合格式就拒绝", () => {
  const r = developerIdRequirement("AB12CD34EF");
  assert.match(r, /^anchor apple generic and /);
  assert.match(r, /certificate leaf\[subject\.OU\] = "AB12CD34EF"$/);
  assert.throws(() => developerIdRequirement('X" or anchor trusted'));
});
