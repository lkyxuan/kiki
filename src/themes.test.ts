import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listThemes, themeFile, validThemeId } from "./themes.js";

function setup() {
  const data = mkdtempSync(join(tmpdir(), "kiki-themes-"));
  const t = join(data, "themes");
  mkdirSync(join(t, "glass"), { recursive: true });
  writeFileSync(join(t, "glass", "theme.css"), ":root[data-theme=glass]{}");
  writeFileSync(join(t, "glass", "theme.json"), JSON.stringify({ name: "玻璃", base: "dark", author: "me" }));
  writeFileSync(join(t, "glass", "bg.png"), "x");
  writeFileSync(join(t, "glass", "evil.js"), "x");
  mkdirSync(join(t, "nometa"));
  writeFileSync(join(t, "nometa", "theme.css"), "");
  mkdirSync(join(t, "nocss"));
  mkdirSync(join(t, "dark")); // 和内置重名
  writeFileSync(join(t, "dark", "theme.css"), "");
  mkdirSync(join(t, "Bad Name"));
  writeFileSync(join(t, "Bad Name", "theme.css"), "");
  return data;
}

test("validThemeId", () => {
  assert.ok(validThemeId("glass"));
  assert.ok(validThemeId("my-theme-2"));
  for (const bad of ["", "light", "dark", "system", "A", "../x", "-x", "a/b"]) assert.equal(validThemeId(bad), false, bad);
});

test("listThemes：有 theme.css 才算，json 缺了用默认", () => {
  const data = setup();
  assert.deepEqual(listThemes(data), [
    { id: "glass", name: "玻璃", base: "dark", author: "me" },
    { id: "nometa", name: "nometa", base: "light" },
  ]);
  assert.deepEqual(listThemes(join(data, "nothing")), []);
});

test("themeFile：只给主题文件夹里的静态文件", () => {
  const data = setup();
  assert.equal(themeFile(data, "/themes/glass/theme.css")?.type, "text/css; charset=utf-8");
  assert.equal(themeFile(data, "/themes/glass/bg.png")?.type, "image/png");
  assert.equal(themeFile(data, "/themes/glass/evil.js"), null);
  assert.equal(themeFile(data, "/themes/glass/missing.css"), null);
  assert.equal(themeFile(data, "/themes/../x/theme.css"), null);
  assert.equal(themeFile(data, "/themes/glass/../../secret.css"), null);
  assert.equal(themeFile(data, "/themes/dark/theme.css"), null);
  assert.equal(themeFile(data, "/themes/glass/sub/theme.css"), null);
});
