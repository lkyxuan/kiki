// 本机聊天网页：只监听 127.0.0.1，别的机器连不上。
// 网页是 public/index.html；数据走下面几个接口，实时更新走 SSE。
//
// 通道边界：任何"通道"（这个网页、以后的微信插件……）都只需要调 router.handle(chatId, text, reply)。
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Agents, ChatLine } from "./agents.js";
import type { Registry } from "./registry.js";
import type { Router } from "./router.js";

const MAIN = "main"; // 主 bot 在网页里的 path
const CHAT_ID = "app"; // 主 bot 在路由器眼里的聊天 id

export function startServer(opts: {
  port: number;
  dataDir: string;
  publicDir: string;
  agents: Agents;
  registry: Registry;
  router: Router;
}) {
  const { agents, registry, router } = opts;
  const mainLog = join(opts.dataDir, "main.jsonl"); // 主 bot 的聊天记录
  const clients = new Set<ServerResponse>();

  const push = (event: string, data: unknown) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };
  agents.on("delta", (d) => push("delta", d));
  agents.on("busy", (d) => push("busy", d));

  const mainSay = (role: ChatLine["role"], text: string) => {
    appendFileSync(mainLog, JSON.stringify({ role, text, ts: new Date().toISOString() }) + "\n");
    push("message", { path: MAIN, role, text });
  };

  const mainHistory = (): ChatLine[] =>
    existsSync(mainLog)
      ? readFileSync(mainLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];

  const tree = () => ({
    current: registry.current(CHAT_ID)?.path,
    agents: agents.listAgents().map((name) => ({
      name,
      sessions: registry.list(name).map((s) => ({ ...s, busy: agents.isBusy(s.path) })),
    })),
  });

  async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
    const json = (data: unknown, code = 200) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };
    const body = async () => {
      let s = "";
      for await (const chunk of req) s += chunk;
      return JSON.parse(s || "{}");
    };

    if (url.pathname === "/api/tree") return json(tree());

    if (url.pathname === "/api/history") {
      const path = url.searchParams.get("path") ?? MAIN;
      if (path === MAIN) return json(mainHistory());
      if (!registry.byPath(path)) return json({ error: "没有这段对话" }, 404);
      return json(agents.history(path));
    }

    if (url.pathname === "/api/send" && req.method === "POST") {
      const { path, text } = await body();
      if (!text?.trim()) return json({ error: "空消息" }, 400);
      if (path === MAIN) {
        // 主 bot：交给路由器，命令和转发都在那里
        mainSay("user", text);
        json({ ok: true });
        router
          .handle(CHAT_ID, text, async (r) => {
            mainSay("assistant", r);
            push("tree", tree()); // /new /bg 之类会改列表
          })
          .catch((e) => mainSay("assistant", `出错了：${(e as Error).message}`));
        return;
      }
      const rec = registry.byPath(path);
      if (!rec) return json({ error: "没有这段对话" }, 404);
      json({ ok: true });
      push("message", { path, role: "user", text });
      agents
        .send(rec.agent, rec.path, text)
        .then((r) => push("message", { path, role: "assistant", text: r }))
        .catch((e) => push("message", { path, role: "assistant", text: `出错了：${(e as Error).message}` }));
      return;
    }

    if (url.pathname === "/api/new" && req.method === "POST") {
      const { agent, name } = await body();
      if (!agents.exists(agent)) return json({ error: `没有 agent ${agent}` }, 400);
      if (!name?.trim()) return json({ error: "要起个名字" }, 400);
      if (registry.get(agent, name.trim())) return json({ error: "这个名字已经有了" }, 400);
      const rec = await router.newSession(agent, name.trim());
      push("tree", tree());
      return json(rec);
    }

    if (url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(": hi\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    json({ error: "not found" }, 404);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      api(req, res, url).catch((e) => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      });
      return;
    }
    // 只有一个页面
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(opts.publicDir, "index.html")));
  });

  server.listen(opts.port, "127.0.0.1", () => {
    console.log(`Kiki 已启动：http://localhost:${opts.port}  （数据目录 ${opts.dataDir}）`);
  });
  return server;
}
