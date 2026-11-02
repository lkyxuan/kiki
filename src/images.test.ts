import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hasImages, imageNames, imageNote, loadImages, saveImage, validImageName } from "./images.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("存图片、从消息里读回来", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-img-"));
  const mark = saveImage(dir, `data:image/png;base64,${PNG}`);
  assert.match(mark, /^!\[图片\]\(\/api\/image\/[a-f0-9]{32}\.png\)$/);
  assert.equal(saveImage(dir, `data:image/png;base64,${PNG}`), mark); // 同一张图只存一份
  assert.ok(validImageName(mark.slice(mark.lastIndexOf("/") + 1, -1)));
  const text = `${mark}\n\n这是什么？`;
  assert.ok(hasImages(text));
  const imgs = loadImages(dir, text);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].mimeType, "image/png");
  assert.equal(imgs[0].data, PNG);
  assert.equal(loadImages(dir, "没有图").length, 0);
  assert.equal(loadImages(dir, "![图片](/api/image/" + "0".repeat(32) + ".png)").length, 0); // 文件不在就跳过
});

test("不收别的东西", () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-img-"));
  assert.throws(() => saveImage(dir, "data:text/html;base64,PGI+"));
  assert.throws(() => saveImage(dir, "../../etc/passwd"));
  assert.ok(!validImageName("../x.png"));
});

test("看不了图时附上的文字说明", () => {
  const note = imageNote([{ name: "a".repeat(32) + ".png", text: "一只猫" }], "GPT-6 Luna");
  assert.match(note, /^\n\n<kiki-image-note>\n/);
  assert.match(note, /GPT-6 Luna 看到的内容：\n一只猫/);
  assert.match(note, /kiki_look/);
  assert.deepEqual(imageNames("x ![图片](/api/image/" + "b".repeat(32) + ".jpg) ![图片](/api/image/" + "b".repeat(32) + ".jpg)"), ["b".repeat(32) + ".jpg"]);
});
