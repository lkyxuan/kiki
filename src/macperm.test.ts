import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { agentApp, MAC_PERMISSIONS, MacPermissions } from "./macperm.js";

test("认出“Kiki 后台”小 App", () => {
  assert.equal(agentApp("/Applications/Kiki.app/Contents/Helpers/KikiAgent.app/Contents/MacOS/kiki-node"), "/Applications/Kiki.app/Contents/Helpers/KikiAgent.app");
  assert.equal(agentApp("/usr/local/bin/node"), undefined);
});

test("不是 Mac：什么都不做", async () => {
  const m = new MacPermissions(mkdtempSync(join(tmpdir(), "kiki-mp-")), "linux");
  assert.deepEqual(await m.status(), { mac: false, items: [] });
});

test("一键申请：依次弹辅助功能、屏幕录制、每个 App 的自动化，记下结果，最后打开完全磁盘访问", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-mp-"));
  const calls: string[] = [];
  const fake = async (cmd: string, args: string[]) => {
    calls.push(`${cmd} ${args.join(" ")}`);
    if (cmd === "osascript" && args[1]?.includes("Notes")) return { ok: false, out: "", err: "execution error: Not authorized to send Apple events to Notes. (-1743)" };
    if (args.join(" ").includes("AXIsProcessTrusted()")) return { ok: true, out: "false", err: "" };
    return { ok: true, out: "true", err: "" };
  };
  const m = new MacPermissions(dir, "darwin", dir, fake);
  assert.equal((await m.status()).asked, false);
  calls.length = 0;
  await m.requestAll();
  assert.ok(calls[0].includes("AXIsProcessTrustedWithOptions"));
  assert.ok(calls[1].includes("CGRequestScreenCaptureAccess"));
  for (const p of MAC_PERMISSIONS.filter((x) => x.app)) assert.ok(calls.some((c) => c.includes(`tell application "${p.app}"`)), p.app);
  assert.ok(calls.some((c) => c.startsWith("open x-apple.systempreferences") && c.includes("AllFiles")));
  const s = await m.status();
  assert.equal(s.asked, true);
  const by = Object.fromEntries((s as any).items.map((i: any) => [i.id, i.status]));
  assert.equal(by["ae-notes"], "off");
  assert.equal(by["ae-calendar"], "on");
  assert.equal(by.accessibility, "off");
  assert.equal(by.screen, "on");
});
