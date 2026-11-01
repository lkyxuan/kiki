// 入口：读配置，把网页、路由器、pi 接起来。
import { cpSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { Agents } from "./agents.js";
import { handoffTool } from "./handoff.js";
import { loadRules } from "./rules.js";
import { kikiTools } from "./tools.js";
import { Registry } from "./registry.js";
import { Router } from "./router.js";
import { startServer } from "./server.js";
import { FileTaskStore } from "./tasks.js";
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
  // 第一次启动：拷一份模板（关于我 + dev/life 两个 agent）
  cpSync(join(root, "data-template"), dataDir, { recursive: true });
  console.log(`已在 ${dataDir} 建好数据目录，记得改 AGENTS.md（关于我）。`);
}

const agents = new Agents(dataDir, process.env.MODEL || "deepseek/deepseek-flash");
const registry = new Registry(join(dataDir, "registry.json"));
// 后台任务：每个任务一个 Markdown 文件，在数据目录 tasks/ 下
const router = new Router(agents, registry, process.env.DEFAULT_AGENT || "life", new FileTaskStore(join(dataDir, "tasks")), {
  concurrency: Number(process.env.TASK_CONCURRENCY || 2),
  timeoutMs: Number(process.env.TASK_TIMEOUT_MIN || 30) * 60_000,
});
// 对话里的 agent 可以把一件新事交接到新对话（自己写交接说明）
router.rules = () => loadRules(dataDir);
agents.toolsFor = () => [
  handoffTool({ listBaos: () => agents.listAgents(), rules: router.rules, onHandoff: (r) => router.handoff(r) }),
  ...kikiTools({ host: router, dataDir, listBaos: () => agents.listAgents() }),
];

const port = Number(process.env.PORT || 4567);
const updater = new Updater({
  dataDir,
  port,
  // 没有对话在跑才自动装，免得打断干活
  isIdle: () =>
    registry.list().every((s) => !agents.isBusy(s.path)) &&
    router.tasks.list((t) => t.status === "queued" || t.status === "running").length === 0,
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
});
