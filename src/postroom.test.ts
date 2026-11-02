import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deliveryText, MailboxAgent, parseMessage, Postroom } from "./postroom.js";

const old = (file: string) => utimesSync(file, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000)); // 过了“刚写完”的等待

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "kiki-pr-"));
  const pr = new Postroom({ dataDir });
  const delivered: string[] = [];
  const answered: string[] = [];
  pr.deliver = async (it) => {
    delivered.push(deliveryText(it, (b) => b === "工作宝"));
    return "→ 工作宝/主对话 · 交给宝\n\n好的";
  };
  pr.answer = async (it, sent) => {
    answered.push(`${sent.title}:${it.text}`);
    return true;
  };
  const box = join(dataDir, "postroom", "mailbox", "grokbot");
  mkdirSync(box, { recursive: true });
  const drop = (name: string, body: string) => {
    const f = join(box, "to-kiki", name);
    mkdirSync(join(box, "to-kiki"), { recursive: true });
    writeFileSync(f, body);
    old(f);
  };
  return { dataDir, pr, box, drop, delivered, answered };
}

test("消息格式：YAML 头可选，.json 也认", () => {
  assert.deepEqual(parseMessage("---\ntitle: 巡检\nre: \"abc\"\nattention: true\nbao: 工作宝\n---\n\n正文"), {
    id: "",
    text: "正文",
    title: "巡检",
    re: "abc",
    attention: true,
    bao: "工作宝",
  });
  assert.equal(parseMessage("只有正文").text, "只有正文");
  const c = parseMessage("---\nre: abc   # 回复哪次\nattention: true # 要看\n---\nx");
  assert.equal(c.re, "abc");
  assert.equal(c.attention, true);
  assert.equal(parseMessage('{"text":"hi","attention":true}', true).attention, true);
});

test("建个信箱文件夹就接上，新消息进队列、交给奇奇、原文件挪进 done", async () => {
  const { pr, box, drop, delivered } = setup();
  writeFileSync(join(box, "status.json"), JSON.stringify({ state: "working", note: "第 3 步" }));
  drop("1.md", "---\ntitle: 日报\nbao: 工作宝\n---\n今天的数据");
  await pr.poll();
  await pr.settled();
  assert.equal(delivered.length, 1);
  assert.match(delivered[0], /^@工作宝 【收发室】外部 agent「grokbot」发来「日报」/);
  assert.ok(existsSync(join(box, "to-kiki", "done", "1.md")));
  const s = pr.state();
  assert.equal(s.agents[0].state, "working");
  assert.equal(s.recent[0].status, "routed");
  assert.equal(s.recent[0].routedTo, "→ 工作宝/主对话 · 交给宝");
  await pr.poll();
  await pr.settled(); // 拿走的不会再收一遍
  assert.equal(delivered.length, 1);
});

test("刚写的文件先不拿，免得读到一半", async () => {
  const { pr, box, delivered } = setup();
  mkdirSync(join(box, "to-kiki"), { recursive: true });
  writeFileSync(join(box, "to-kiki", "new.md"), "还在写");
  await pr.poll();
  await pr.settled();
  assert.equal(delivered.length, 0);
});

test("派活写进 to-agent，对方回复带 re 就回到派活的对话，不再走奇奇", async () => {
  const { pr, box, drop, delivered, answered } = setup();
  await pr.poll();
  await pr.settled();
  const sent = await pr.send("grokbot", "帮我查一下 BTC 价格", "查价格", "/x/s.jsonl", "工作宝/查价");
  const file = readFileSync(join(box, "to-agent", `${sent.id}.md`), "utf8");
  assert.match(file, /title: "查价格"/);
  assert.match(file, /from: "工作宝\/查价"/);
  assert.equal(pr.state().agents[0].waiting, 1);
  drop("r.md", `---\nre: ${sent.id}\n---\n7 万`);
  await pr.poll();
  await pr.settled();
  assert.deepEqual(answered, ["查价格:7 万"]);
  assert.equal(delivered.length, 0);
  assert.equal(pr.outbox.get(sent.id)?.status, "answered");
  assert.equal(pr.state().agents[0].waiting, 0);
});

test("要你看的：对方标 attention、分派失败、对方出错；点 × 后不再显示", async () => {
  const { pr, box, drop } = setup();
  pr.deliver = async () => {
    throw new Error("模型挂了");
  };
  writeFileSync(join(box, "status.json"), JSON.stringify({ state: "error", note: "登录过期" }));
  drop("a.md", "---\nattention: true\ntitle: 要付款\n---\n续费");
  await pr.poll();
  await pr.settled();
  const att = pr.state().attention;
  assert.equal(att.length, 2);
  assert.equal(att[0].id, "agent:grokbot");
  assert.match(att[1].why, /没分出去：模型挂了/);
  pr.dismiss(att[1].id);
  assert.equal(pr.state().attention.length, 1);
});

test("队列落盘：重启后还在", async () => {
  const { dataDir, pr, drop } = setup();
  drop("1.txt", "hello");
  await pr.poll();
  await pr.settled();
  const again = new Postroom({ dataDir });
  assert.equal(again.inbox.rows.length, 1);
  assert.equal(again.inbox.rows[0].text, "hello");
});

test("A2A / ACP 先占位：登记了也只显示“下一步才做”", async () => {
  const { dataDir, pr } = setup();
  writeFileSync(join(dataDir, "postroom", "agents.json"), JSON.stringify([{ name: "cc", kind: "acp", command: "claude" }]));
  await pr.poll();
  await pr.settled();
  const cc = pr.state().agents.find((a) => a.name === "cc");
  assert.equal(cc?.state, "offline");
  assert.match(cc?.note ?? "", /下一步/);
  await assert.rejects(pr.send("cc", "hi"), /下一步/);
});

test("信箱可以放在别处", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kiki-box-"));
  const a = new MailboxAgent("x", dir);
  assert.deepEqual(readdirSync(dir).sort(), ["to-agent", "to-kiki"]);
  assert.deepEqual(await a.status(), { state: "unknown" });
});

test("读到一半出错或重启：落盘前不挪走，没分出去的重启后接着分", async () => {
  const { dataDir, pr, box, drop, delivered } = setup();
  let release!: () => void;
  pr.deliver = () => new Promise((ok) => (release = () => ok("→ x")));
  drop("1.md", "第一条");
  await pr.poll();
  assert.ok(existsSync(join(box, "to-kiki", "done", "1.md"))); // 已落盘才挪走
  // 分派还卡着（宝在回答），收信不受影响，也不会卡死
  drop("2.md", "第二条");
  await pr.poll();
  assert.equal(pr.inbox.rows.length, 2);
  // 这时“重启”：两条都还是 new，新实例启动时接着分
  const again = new Postroom({ dataDir });
  again.deliver = async (it) => {
    delivered.push(it.text);
    return "→ y";
  };
  again.start();
  again.stop();
  await again.settled();
  assert.deepEqual(delivered, ["第一条", "第二条"]);
  release();
});
