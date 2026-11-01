// 入口：读配置，把网页、路由器、pi 接起来。
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agents } from "./agents.js";
import { Registry } from "./registry.js";
import { Router } from "./router.js";
import { startServer } from "./server.js";

// Node 20.6+ 自带读 .env
try {
  process.loadEnvFile(".env");
} catch {}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve((process.env.DATA_DIR || "~/kiki-data").replace(/^~/, homedir()));
if (!existsSync(dataDir)) {
  // 第一次启动：拷一份模板（关于我 + dev/life 两个 agent）
  cpSync(join(root, "data-template"), dataDir, { recursive: true });
  console.log(`已在 ${dataDir} 建好数据目录，记得改 AGENTS.md（关于我）。`);
}

const agents = new Agents(dataDir, process.env.MODEL || "deepseek/deepseek-flash");
const registry = new Registry(join(dataDir, "registry.json"));
const router = new Router(agents, registry, process.env.DEFAULT_AGENT || "life");

startServer({
  port: Number(process.env.PORT || 4567),
  dataDir,
  publicDir: join(root, "public"),
  agents,
  registry,
  router,
});
