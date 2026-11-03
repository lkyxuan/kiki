import assert from "node:assert/strict";
import { test } from "node:test";
import { explainError } from "./errors.js";

test("没填 DeepSeek 密钥：指到设置页，不带 node_modules 路径", () => {
  const raw = "No API key found for deepseek.\n\nUse /login to log into a provider via OAuth or API key. See:\n/x/node_modules/@earendil-works/pi-coding-agent/docs/providers.md";
  const out = explainError(raw);
  assert.match(out, /还没填模型密钥/);
  assert.match(out, /设置 → 服务商/);
  assert.doesNotMatch(out, /node_modules|\/login/);
  assert.match(explainError("Provider is not configured: deepseek"), /还没填模型密钥/);
});

test("别的提供商没配好：说出是哪一家", () => {
  assert.match(explainError('No API key found for "anthropic"'), /还没登录 anthropic/);
});

test("密钥不对、余额不足", () => {
  assert.match(explainError("401 Authentication Fails, Your api key: ****abcd is invalid"), /密钥不对/);
  assert.match(explainError("402 Insufficient Balance"), /余额不足/);
});

test("不认得的报错原样返回", () => {
  assert.equal(explainError("Connection error."), "Connection error.");
});
