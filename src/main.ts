// 入口：读配置，把通道、路由器、pi 接起来。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agents } from "./agents.js";
import type { Channel } from "./channels/channel.js";
import { TelegramChannel } from "./channels/telegram.js";
import { Registry } from "./registry.js";
import { Router } from "./router.js";

// Node 20.6+ 自带读 .env
try {
  process.loadEnvFile(".env");
} catch {}

const env = (k: string, d?: string) => {
  const v = process.env[k] || d;
  if (v === undefined) throw new Error(`缺少环境变量 ${k}，见 .env.example`);
  return v;
};

const dataDir = resolve(env("DATA_DIR", "~/kiki-data").replace(/^~/, homedir()));
if (!existsSync(dataDir)) {
  // 第一次启动：拷一份模板（关于我 + dev/life 两个 agent）
  const tpl = join(dirname(fileURLToPath(import.meta.url)), "..", "data-template");
  cpSync(tpl, dataDir, { recursive: true });
  console.log(`已在 ${dataDir} 建好数据目录，记得改 AGENTS.md（关于我）。`);
}
mkdirSync(dataDir, { recursive: true });

const agents = new Agents(dataDir, env("MODEL", "deepseek/deepseek-v4-flash"));
const registry = new Registry(join(dataDir, "registry.json"));
const router = new Router(agents, registry, env("DEFAULT_AGENT", "life"));

const channels: Channel[] = [];
if (process.env.TELEGRAM_BOT_TOKEN) {
  const allowed = new Set(env("TELEGRAM_ALLOWED_CHATS", "").split(",").map((s) => s.trim()).filter(Boolean));
  channels.push(new TelegramChannel(process.env.TELEGRAM_BOT_TOKEN, allowed));
}
if (channels.length === 0) throw new Error("没有配置任何通道（至少要 TELEGRAM_BOT_TOKEN）");

for (const ch of channels) {
  console.log(`[${ch.name}] 已启动，数据目录 ${dataDir}`);
  ch.start((msg) => {
    const reply = (text: string) => ch.send(msg.chatId, text);
    const typing = setInterval(() => ch.typing?.(msg.chatId), 4000);
    ch.typing?.(msg.chatId);
    // 不 await：每条消息各跑各的，同一段对话内部由 Agents 排队
    router
      .handle(msg.chatId, msg.text, reply)
      .catch((e) => reply(`出错了：${(e as Error).message}`).catch(() => {}))
      .finally(() => clearInterval(typing));
  });
}
