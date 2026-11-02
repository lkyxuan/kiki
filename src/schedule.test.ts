import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRun, parseWhen, showTime } from "./schedule.js";

const now = new Date(2026, 10, 2, 10, 30); // 2026-11-02 周一 10:30
const fmt = (d?: Date) => (d ? `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` : "?");

test("parseWhen：各种写法", () => {
  assert.equal(fmt(parseWhen("+30m", now)), "11-2 11:00");
  assert.equal(fmt(parseWhen("+2h", now)), "11-2 12:30");
  assert.equal(fmt(parseWhen("+1d", now)), "11-3 10:30");
  assert.equal(fmt(parseWhen("21:00", now)), "11-2 21:00");
  assert.equal(fmt(parseWhen("09:00", now)), "11-3 9:00", "过了就明天");
  assert.equal(fmt(parseWhen("明天 9:30", now)), "11-3 9:30");
  assert.equal(fmt(parseWhen("明天", now)), "11-3 9:00");
  assert.equal(fmt(parseWhen("后天 8点", now)), "11-4 8:00");
  assert.equal(fmt(parseWhen("周五 18:00", now)), "11-6 18:00");
  assert.equal(fmt(parseWhen("周一 09:00", now)), "11-9 9:00", "今天周一但已过，就下周一");
  assert.equal(fmt(parseWhen("下周三 10:00", now)), "11-11 10:00");
  assert.equal(fmt(parseWhen("2026-11-05 09:00", now)), "11-5 9:00");
  assert.equal(parseWhen("改天", now), undefined);
});

test("nextRun：每天、工作日、每周、每小时", () => {
  assert.equal(fmt(nextRun("每天 09:00", now)), "11-3 9:00");
  assert.equal(fmt(nextRun("每天 21:00", now)), "11-2 21:00");
  const fri = new Date(2026, 10, 6, 10, 0);
  assert.equal(fmt(nextRun("工作日 09:00", fri)), "11-9 9:00", "周五之后跳过周末");
  assert.equal(fmt(nextRun("每周一 09:00", now)), "11-9 9:00");
  assert.equal(fmt(nextRun("每周三 20:00", now)), "11-4 20:00");
  assert.equal(fmt(nextRun("每小时", now)), "11-2 11:00");
  assert.equal(nextRun("偶尔", now), undefined);
});

test("showTime", () => {
  assert.equal(showTime(new Date(2026, 10, 2, 21, 0).toISOString(), now), "今天 21:00");
  assert.equal(showTime(new Date(2026, 10, 3, 9, 5).toISOString(), now), "明天 09:05");
  assert.equal(showTime(new Date(2026, 10, 9, 9, 0).toISOString(), now), "11月9日 09:00");
});
