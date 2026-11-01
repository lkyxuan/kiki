import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { setEnvLine, sourceOf, validName } from "./settings.js";

test("setEnvLine 只改对应那一行，保留注释", () => {
  const src = "# 模型\nDEEPSEEK_API_KEY=\nMODEL=deepseek/deepseek-flash\n\n# 端口\nPORT=4567\n";
  const out = setEnvLine(src, "DEEPSEEK_API_KEY", "sk-abc");
  assert.equal(out, "# 模型\nDEEPSEEK_API_KEY=sk-abc\nMODEL=deepseek/deepseek-flash\n\n# 端口\nPORT=4567\n");
});

test("setEnvLine 没有就追加，删除时去掉那一行", () => {
  assert.equal(setEnvLine("PORT=1\n", "MODEL", "x/y"), "PORT=1\nMODEL=x/y\n");
  assert.equal(setEnvLine("", "MODEL", "x/y"), "MODEL=x/y\n");
  assert.equal(setEnvLine("A=1\nKIKI_AUTO_UPDATE=0\nB=2\n", "KIKI_AUTO_UPDATE", undefined), "A=1\nB=2\n");
});

test("setEnvLine 带空格的值加引号，parseEnv 读得回来", () => {
  const out = setEnvLine("", "MODEL", 'a b#c"d');
  assert.equal(parseEnv(out).MODEL, 'a b#c"d');
});

test("sourceOf 分清 .env、op 引用、外部注入", () => {
  assert.equal(sourceOf("sk-1", "sk-1"), "file");
  assert.equal(sourceOf("op://v/i/f", "sk-resolved"), "ref");
  assert.equal(sourceOf("keychain:kiki-deepseek", "sk-resolved"), "ref");
  assert.equal(sourceOf("keychain:kiki-deepseek", ""), "ref");
  assert.equal(sourceOf(undefined, "sk-from-shell"), "external");
  assert.equal(sourceOf("sk-1", "sk-2"), "external");
  assert.equal(sourceOf(undefined, undefined), "unset");
  assert.equal(sourceOf("", ""), "unset");
});

test("validName 挡住路径穿越", () => {
  assert.ok(validName("dev"));
  assert.ok(validName("生活宝"));
  assert.ok(!validName("../x"));
  assert.ok(!validName("a/b"));
  assert.ok(!validName(""));
});

test("setEnvLine 单引号的值也读得回来", () => {
  assert.equal(parseEnv(setEnvLine("", "MODEL", "it's x")).MODEL, "it's x");
});

test("sourceOf 改过还没重启的值不算外部注入", () => {
  // 启动时 .env 是 sk-old，进程里也是 sk-old；设置页改成 sk-new 后仍然是 file
  assert.equal(sourceOf("sk-new", "sk-old", "sk-old"), "file");
  // 启动时 .env 没有，进程里却有：外部注入
  assert.equal(sourceOf("sk-new", "sk-shell", undefined), "external");
  // 启动时是 op 引用（op run 解析成明文），改成明文后算 file
  assert.equal(sourceOf("sk-new", "sk-resolved", "op://v/i/f"), "file");
});
