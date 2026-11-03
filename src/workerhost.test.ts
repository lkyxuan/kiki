import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { Agents } from "./agents.js";
import { Worker, type WorkerHooks } from "./workerhost.js";

// 假的子程序：真的 serve() 协议，假的 Agents（不调模型）
const dir = mkdtempSync(join(tmpdir(), "kiki-worker-"));
const script = join(dir, "fake.ts");
writeFileSync(
  script,
  `
import { EventEmitter } from "node:events";
import { serve } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "workerchild.ts")).href)};
class Fake extends EventEmitter {
  extensions = [];
  toolsFor;
  async create(agent, name) { return "/x/" + agent + "/" + name + ".jsonl"; }
  async fork(agent, from, name) { return from + "." + name; }
  async send(agent, path, text) {
    this.emit("busy", { path, busy: true });
    try {
      if (text === "hang") return await new Promise(() => {});
      if (text === "slow") await new Promise((r) => setTimeout(r, 100));
      if (text === "crash") process.exit(3);
      if (text === "tool") {
        const t = this.toolsFor(agent)[0];
        const r = await t.execute("call1", { q: 1 }, undefined, undefined, { cwd: "/cwd" });
        return t.name + ":" + r.content[0].text;
      }
      if (text === "approve") {
        let hook;
        for (const f of this.extensions) f({ on: (_n, fn) => (hook = fn) });
        const r = await hook({ toolName: "bash", input: { command: "rm -rf /" } }, { cwd: "/cwd" });
        return r ? "拦下：" + r.reason : "放行";
      }
      return "答：" + text + "@" + path;
    } finally {
      this.emit("busy", { path, busy: false });
    }
  }
  async steer(agent, path, text) {}
  async note(agent, path, text) { this.emit("message", { path, role: "assistant", text }); }
}
serve(process, () => new Fake());
`,
);

function hooks(over: Partial<WorkerHooks> = {}): WorkerHooks {
  return {
    tools: () => [{ name: "kiki_ask_user", label: "问", description: "d", parameters: { type: "object" } }],
    runTool: async (_a, name, params, path) => ({ content: [{ type: "text", text: `${name}(${JSON.stringify(params)}) in ${path}` }] }),
    approve: async () => undefined,
    ...over,
  };
}

const init = (open: any) => ({ dataDir: dir, model: "m/x", agent: "dev", open });

test("子程序：开对话、发话、转发忙闲事件，做完自己退出", async () => {
  const w = new Worker(script, init({ create: "bg-任务" }), hooks());
  const events: string[] = [];
  w.on("event", (name, data) => events.push(`${name}:${data.busy ?? data.text ?? ""}`));
  assert.equal(await w.ready, "/x/dev/bg-任务.jsonl");
  assert.equal(await w.send("你好"), "答：你好@/x/dev/bg-任务.jsonl");
  await w.note("回报");
  assert.deepEqual(events, ["busy:true", "busy:false", "message:回报"]);
  await w.close();
  assert.equal(w.alive, false);
});

test("子程序：Kiki 的工具在主程序里执行，带着这段对话的路径", async () => {
  const w = new Worker(script, init({ path: "/s/a.jsonl" }), hooks());
  await w.ready;
  assert.equal(await w.send("tool"), 'kiki_ask_user:kiki_ask_user({"q":1}) in /s/a.jsonl');
  await w.close();
});

test("子程序：审批在主程序里判断，拦下的原因传回去", async () => {
  const seen: any[] = [];
  const w = new Worker(
    script,
    init({ path: "/s/b.jsonl" }),
    hooks({
      approve: async (req) => {
        seen.push(req);
        return { block: true, reason: "用户没同意" };
      },
    }),
  );
  await w.ready;
  assert.equal(await w.send("approve"), "拦下：用户没同意");
  assert.equal(seen[0].path, "/s/b.jsonl");
  assert.equal(seen[0].input.command, "rm -rf /");
  await w.close();
});

test("子程序：停任务就是关掉它，手上的那句以「已停下」失败，忙状态清掉", async () => {
  const w = new Worker(script, init({ fork: { from: "/s/main.jsonl", name: "bg" } }), hooks());
  assert.equal(await w.ready, "/s/main.jsonl.bg");
  const busy: boolean[] = [];
  w.on("event", (name, data) => name === "busy" && busy.push(data.busy));
  const p = w.send("hang");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(w.busy, true);
  await w.kill();
  await assert.rejects(p, /已停下/);
  assert.equal(w.busy, false);
  assert.deepEqual(busy, [true, false]);
});

test("子程序：意外崩掉时手上的那句失败，说清退出码", async () => {
  const w = new Worker(script, init({ path: "/s/c.jsonl" }), hooks());
  await w.ready;
  await assert.rejects(w.send("crash"), /意外退出（退出码 3）/);
  assert.equal(w.alive, false);
  await assert.rejects(w.send("再来"), /已经关了/);
});

test("Agents：子程序还在起的时候来了回报，也转给子程序，不在主程序里另开一份；都做完后子程序退出", async () => {
  const agents = new Agents(mkdtempSync(join(tmpdir(), "kiki-agents-")), "deepseek/deepseek-flash");
  agents.isolation = { script, approve: async () => undefined };
  const seen: string[] = [];
  agents.on("message", (m: any) => seen.push(m.text));
  const reply = agents.sendTask("dev", "/s/q.jsonl", "slow");
  const noted = agents.note("dev", "/s/q.jsonl", "回报一句"); // 这时子程序可能还没起好
  assert.equal(await reply, "答：slow@/s/q.jsonl");
  await noted;
  assert.deepEqual(seen, ["回报一句"], "回报是子程序记的");
  assert.equal((agents as any).live.size, 0, "主程序没开这段对话");
  assert.equal(agents.isRemote("/s/q.jsonl"), false, "做完子程序退出");
});
