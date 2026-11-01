import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Mcp, parseSpec, splitCommand } from "./mcp.js";

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
  assert.deepEqual(m.list(), []);
  m.add("cua-driver", "cua-driver mcp");
  m.add("docs", "https://example.com/mcp");
  assert.throws(() => m.add("docs", "https://x"));
  m.setOn("docs", false);
  assert.deepEqual(m.list(), [
    { name: "cua-driver", summary: "cua-driver mcp", on: true },
    { name: "docs", summary: "https://example.com/mcp", on: false },
  ]);
  m.setOn("docs", true);
  assert.equal(JSON.parse(readFileSync(m.file, "utf8")).mcpServers.docs.enabled, undefined);
  m.remove("cua-driver");
  assert.deepEqual(m.list().map((s) => s.name), ["docs"]);
});
