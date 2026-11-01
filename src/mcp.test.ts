import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Mcp, parseSpec, PRESETS, splitCommand } from "./mcp.js";

test("命令行拆参数，支持引号", () => {
  assert.deepEqual(splitCommand(`npx -y "@scope/pkg" --dir 'a b'`), ["npx", "-y", "@scope/pkg", "--dir", "a b"]);
  assert.deepEqual(splitCommand(`srv --directory="/Users/me/My Files" ''`), ["srv", "--directory=/Users/me/My Files", ""]);
  assert.deepEqual(splitCommand(`/Applications/My\\ App/bin/srv mcp`), ["/Applications/My App/bin/srv", "mcp"]);
  assert.throws(() => splitCommand(`a "b`));
});

test("设置页填的一行变成配置", () => {
  assert.deepEqual(parseSpec("cua-driver", "cua-driver mcp"), {
    name: "cua-driver",
    config: { command: "cua-driver", args: ["mcp"], exposure: "direct" },
  });
  assert.deepEqual(parseSpec("docs", "https://example.com/mcp").config, { url: "https://example.com/mcp", exposure: "direct" });
  const pasted = parseSpec("", `{"mcpServers":{"cua":{"command":"/usr/local/bin/cua-driver","args":["mcp"]}}}`);
  assert.equal(pasted.name, "cua");
  assert.equal(pasted.config.command, "/usr/local/bin/cua-driver");
  assert.equal(parseSpec("x", `{"command":"a","exposure":"codemode"}`).config.exposure, "codemode");
  assert.throws(() => parseSpec("坏 名字", "a"));
  assert.throws(() => parseSpec("x", ""));
  assert.throws(() => parseSpec("x", `{"args":[]}`));
  assert.throws(() => parseSpec("x", `{"command":"server","args":123}`));
  assert.throws(() => parseSpec("x", `{"url":"ftp://x"}`));
});

test("增、关、删只动 mcp.json 里对应那一项", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-mcp-"));
  const m = new Mcp(dir);
  const own = () => m.list().filter((s) => !s.preset);
  assert.deepEqual(own(), []);
  m.add("fs", "npx fs-server");
  m.add("docs", "https://example.com/mcp");
  assert.throws(() => m.add("docs", "https://x"));
  m.setOn("docs", false);
  assert.deepEqual(own(), [
    { name: "fs", preset: false, summary: "npx fs-server", on: true },
    { name: "docs", preset: false, summary: "https://example.com/mcp", on: false },
  ]);
  m.setOn("docs", true);
  assert.equal(JSON.parse(readFileSync(m.file, "utf8")).mcpServers.docs.enabled, undefined);
  m.remove("fs");
  assert.deepEqual(own().map((s) => s.name), ["docs"]);
});

test("预置的 cua-driver：没配过也列出来，打开时写上完整路径", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-mcp-"));
  const m = new Mcp(dir);
  const none = () => undefined;
  const cua = m.list(none).find((s) => s.name === "cua-driver")!;
  assert.equal(cua.preset, true);
  assert.equal(cua.on, false);
  assert.equal(cua.installed, false);
  assert.throws(() => m.setOn("cua-driver", true, none), /还没装/);
  m.setOn("cua-driver", false, none); // 没配过，关掉不报错

  const bin = join(dir, "cua-driver");
  writeFileSync(bin, "");
  const found = () => bin;
  assert.equal(m.list(found)[0].installed, true);
  m.setOn("cua-driver", true, found);
  const cfg = JSON.parse(readFileSync(m.file, "utf8")).mcpServers["cua-driver"];
  assert.deepEqual([cfg.command, cfg.args, cfg.exposure], [bin, PRESETS["cua-driver"].args, "direct"]);
  assert.equal(m.list(found)[0].on, true);
  m.setOn("cua-driver", false, found);
  assert.equal(m.list(found)[0].on, false);
  assert.equal(JSON.parse(readFileSync(m.file, "utf8")).mcpServers["cua-driver"].command, bin);
});

test("以前手填的 cua-driver mcp：打开时换成完整路径，别的设置保留", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-mcp-"));
  const m = new Mcp(dir);
  m.add("cua-driver", `{"command":"cua-driver","args":["mcp","--x"],"env":{"A":"1"}}`);
  m.setOn("cua-driver", false);
  const bin = join(dir, "cua-driver");
  writeFileSync(bin, "");
  m.setOn("cua-driver", true, () => bin);
  const cfg = JSON.parse(readFileSync(m.file, "utf8")).mcpServers["cua-driver"];
  assert.deepEqual(cfg, { command: bin, args: ["mcp", "--x"], env: { A: "1" }, exposure: "direct" });
});
