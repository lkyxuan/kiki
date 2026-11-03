// 入口：读配置，把网页、路由器、pi 接起来。
import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { FIRST_LINE_RULE } from "./ack.js";
import { AUTONOMY_RULE } from "./autonomy.js";
import { Agents } from "./agents.js";
import { roleModel } from "./modelroles.js";
import { Approvals } from "./approval.js";
import { handoffTool } from "./handoff.js";
import { loadRules } from "./rules.js";
import { kikiTools } from "./tools.js";
import { lookTool } from "./look.js";
import { type FeatureId, isOn } from "./features.js";
import { Summaries } from "./summary.js";
import { MAIN_SESSION } from "./bao.js";
import { addRuleSections, DEFAULT_BAO, dropConfirmLine, migrateToQiqi, upgradeQiqiNote } from "./migrate.js";
import { Registry } from "./registry.js";
import { Router } from "./router.js";
import { ADAPTERS, Postroom, postroomTool } from "./postroom.js";
import { A2AAgent } from "./a2a.js";
import { AcpAgent } from "./acp.js";
import { WatchAgent } from "./watch.js";
import { Notifier } from "./notify.js";
import { makeTriage, watchForTask, Watchlist } from "./triage.js";
import { startServer } from "./server.js";
import { FileTaskStore, taskPrompt } from "./tasks.js";
import { taskTools, type WatchList } from "./tasktool.js";
import { Updater, VERSION } from "./update.js";

// 自动更新装新版本前会先跑一次 --selftest：能走到这里说明 Node 和全部代码都加载成功了
if (process.argv.includes("--selftest")) {
  console.log(`kiki ${VERSION} ok`);
  process.exit(0);
}

process.title = "Kiki"; // 活动监视器里显示 Kiki，而不是 node

// 读 .env：先当前目录（npm start 时是仓库目录），再数据目录（Kiki.app 用这个）。
// 已经存在的环境变量优先，不覆盖（比如 op run 注入的密钥）。
function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const [k, v] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv(".env");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve((process.env.DATA_DIR || "~/kiki-data").replace(/^~/, homedir()));
loadEnv(join(dataDir, ".env"));
if (!existsSync(dataDir)) {
  // 第一次启动：拷一份模板（关于我 + 默认的宝“奇奇” + 分派规则）
  cpSync(join(root, "data-template"), dataDir, { recursive: true });
  console.log(`已在 ${dataDir} 建好数据目录，记得改 AGENTS.md（关于我）。`);
}
// 老数据目录升级：只留奇奇一个默认宝，旧的 dev、life 挪进 archive/（不删）
for (const line of [...migrateToQiqi(dataDir, join(root, "data-template")), ...upgradeQiqiNote(dataDir, join(root, "data-template")), ...addRuleSections(dataDir, join(root, "data-template")), ...dropConfirmLine(dataDir)])
  console.log(`升级数据目录：${line}`);

const agents = new Agents(dataDir, process.env.MODEL || "deepseek/deepseek-flash");
// 审批：危险动作系统兜底、做完记一笔能撤回，只有超预算才问你（见 approval.ts）
const approvals = new Approvals(dataDir);
agents.extensions.push(approvals.extension());
// 后台任务各自一个子程序（见 workerhost.ts）：崩了不连累别人，停任务就是关掉它。TASK_ISOLATION=0 改回在主程序里跑
if (process.env.TASK_ISOLATION !== "0") {
  const here = fileURLToPath(import.meta.url);
  agents.isolation = {
    script: join(dirname(here), `worker${here.endsWith(".ts") ? ".ts" : ".js"}`),
    approve: (r, signal) => approvals.check(r.toolName, r.input, r.cwd, r.path, signal, r.turn),
  };
}
const registry = new Registry(join(dataDir, "registry.json"));
// 后台任务：每个任务一个 Markdown 文件，在数据目录 tasks/ 下
// 默认的宝：.env 里写的那个不存在了（比如以前的 life 已归档）就回到奇奇
const defaultBao = process.env.DEFAULT_AGENT && agents.exists(process.env.DEFAULT_AGENT) ? process.env.DEFAULT_AGENT : DEFAULT_BAO;
const router = new Router(agents, registry, defaultBao, new FileTaskStore(join(dataDir, "tasks")), {
  concurrency: Number(process.env.TASK_CONCURRENCY || 2),
  timeoutMs: Number(process.env.TASK_TIMEOUT_MIN || 30) * 60_000,
});
// 对话里的 agent 可以把一件新事交接到新对话（自己写交接说明）
router.rules = () => loadRules(dataDir);
const TOOL_FEATURE: Record<string, FeatureId> = {
  kiki_handoff: "handoff",
  kiki_peek: "peek",
  kiki_relay: "relay",
  kiki_remember: "remember",
  kiki_task: "schedule",
  kiki_ask_user: "background",
  kiki_outside: "postroom",
  kiki_watch: "background",
};
// 关注清单（收发室接上后赋值，每个宝一份，在 agents/<宝>/ 下）：任务做完还要盯的事；有相关新消息时收发室调 router.tasks.followUp(任务id, 消息)
let watchList: WatchList | undefined;
// 每段对话一句话摘要：回完话后台更新（registry.json 里的 summary），路由和主对话都只看摘要
const summaries = new Summaries({
  registry,
  history: (p) => agents.history(p),
  complete: (sys, user) => agents.complete(sys, user, roleModel("summary")),
});
agents.on("busy", ({ path, busy }: { path: string; busy: boolean }) => {
  if (!busy) summaries.schedule(path);
});
// 每段对话都带上“先接住用户”的规矩（要干活先说一句理解再动手，见 ack.ts）；
// 宝的主对话每轮还自动看到本宝讨论串的摘要，不用靠它想起来去翻
agents.extensions.push((pi) => {
  pi.on("before_agent_start", (ev, ctx) => {
    const file = ctx.sessionManager.getSessionFile();
    const rec = file ? registry.byPath(file) : undefined;
    // 主对话再加：本宝讨论串的摘要，和一行后台任务的数（奇奇看全部，别的宝看自己的）
    const digest = rec?.name === MAIN_SESSION ? [router.threadDigest(rec.agent), router.taskCount(rec.agent === DEFAULT_BAO ? undefined : rec.agent)].filter(Boolean).join("\n\n") : "";
    return { systemPrompt: [ev.systemPrompt, FIRST_LINE_RULE, AUTONOMY_RULE, digest].filter(Boolean).join("\n\n") };
  });
});
router.isOn = (id) => isOn(dataDir, id);
// 收发室：定时去外部 agent 那里收发（见 postroom.ts）。怎么把收到的交给奇奇、记回对话，在 server.ts 里接上
const postroom = new Postroom({
  dataDir,
  intervalMs: Number(process.env.POSTROOM_POLL_SEC || 60) * 1000,
  isOn: () => isOn(dataDir, "postroom"),
});
// 收发室的接法：信箱（postroom.ts 自带）、A2A（接自家 bot）、ACP（接 Claude Code / Codex）、定时检查（网页 / RSS / 文件）
Object.assign(ADAPTERS, {
  a2a: (cfg, ctx) => new A2AAgent(cfg.name, cfg, ctx),
  acp: (cfg, ctx) => new AcpAgent(cfg.name, cfg, ctx),
  watch: (cfg, ctx) => new WatchAgent(cfg.name, cfg, ctx),
} satisfies typeof ADAPTERS);
// 外部 agent 要做危险动作：和自己的对话一样走兜底（先备份、待发、预算），要停下来的卡片挂在派活的那段对话上
postroom.approve = async (req) => {
  const rec = req.origin ? registry.byPath(req.origin) : undefined;
  const r = await approvals.gate(req, { agent: rec?.agent ?? DEFAULT_BAO, path: req.origin ?? "", detail: req.detail, command: req.command, cwd: req.cwd });
  return r.ok;
};
// 奇奇看信：每条新消息先用便宜模型读一遍，判断要不要提醒、要不要交给宝，顺手维护 关注清单.md
postroom.triage = makeTriage({
  dataDir,
  listBaos: () => agents.listAgents(),
  describe: (b) => agents.describe(b),
  complete: (sys, user) => agents.complete(sys, user, process.env.TRIAGE_MODEL || process.env.SUMMARY_MODEL || undefined),
});
// 通知通道：要告诉你的事从这里发出去。现在只有 Kiki 界面（server.ts 挂上），以后的 Telegram、微信做成插件也挂这里
const notifier = new Notifier();
// 收发室和任务接起来：派给外部 agent 的任务由收发室去办；任务做完还要盯的事记进宝的关注清单；有相关新消息就交回那个任务
router.tasks.executorFor = (name) =>
  postroom.configs().some((c) => c.name === name)
    ? { run: (t, signal) => postroom.run(name, taskPrompt(t), { title: t.title, origin: t.origin, from: t.reportTo ?? t.origin, signal }) }
    : undefined;
watchList = {
  add: (w) => {
    watchForTask(dataDir, { taskId: w.taskId, agent: w.agent, about: w.until ? `${w.about}（盯到 ${w.until}）` : w.about, match: w.match, session: w.session });
    return `已记进「${w.agent}」的关注清单：${w.about}`;
  },
  remove: (id, agent) => {
    new Watchlist(dataDir, agent).removeByTask(id);
  },
};
postroom.followTask = async (id, text) => router.tasks.followUp(id, text);
// 任务被取消了，它在盯的事也从关注清单里拿掉
router.tasks.on("update", (t) => {
  if (t.status === "cancelled" && t.watching) void Promise.resolve(watchList?.remove(t.id, t.agent)).catch(() => {});
});
// 设置页关掉的能力不挂给 agent（新开的对话生效）
agents.toolsFor = () =>
  [
    handoffTool({ listBaos: () => agents.listAgents(), describe: (b) => agents.describe(b), rules: router.rules, onHandoff: (r) => router.handoff(r) }),
    ...kikiTools({ host: router, dataDir, listBaos: () => agents.listAgents() }),
    lookTool((name, q) => agents.look(name, q)), // 看不了图的模型再看一眼图
    postroomTool(postroom, (p) => {
      const r = p ? registry.byPath(p) : undefined;
      return r && `${r.agent}/${r.name}`;
    }),
    // 待办、定时任务、等某件事做完再做；后台任务卡住时停下来问用户
    ...taskTools({ tasks: router.tasks, listBaos: () => agents.listAgents(), baoOf: (p) => (p ? registry.byPath(p)?.agent : undefined), watch: () => watchList }),
  ].filter((t) => !TOOL_FEATURE[t.name] || isOn(dataDir, TOOL_FEATURE[t.name]));

// 每个宝一段主对话，老对话都当讨论串。放在扩展和工具都挂好之后，启动时补建的主对话也带着它们
void router.ensureMains().catch((e) => console.warn("补主对话失败：", (e as Error).message)); // 每个宝一段主对话，老对话都当讨论串

const port = Number(process.env.PORT || 4567);
const updater = new Updater({
  dataDir,
  port,
  // 没有对话在跑才自动装，免得打断干活；不空闲时说清楚卡在谁身上，写进更新日志
  whyBusy: () => {
    const s = registry.list().find((s) => agents.isBusy(s.path));
    if (s) return `对话「${s.agent}/${s.name}」还在跑`;
    const t = router.tasks.list((t) => t.status === "queued" || t.status === "running")[0];
    if (t) return `后台任务「${t.title}」还没做完（${t.status === "queued" ? "排队中" : "进行中"}）`;
    if (approvals.list().length) return "有卡片在等你点头"; // 这时重启，那一步就丢了
    return undefined;
  },
});
updater.start();

startServer({
  port,
  dataDir,
  publicDir: join(root, "public"),
  agents,
  registry,
  router,
  updater,
  approvals,
  postroom,
  notifier,
});
postroom.start();
