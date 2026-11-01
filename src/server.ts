// 本机聊天网页：只监听 127.0.0.1，别的机器连不上（远程用 Tailscale Serve 转进来，见 docs/mac-app.md）。
// 网页是 public/index.html；数据走下面几个接口，实时更新走 SSE。
//
// 通道边界：任何"通道"（这个网页、以后的微信插件……）都只需要调 router.handle(chatId, text, reply)。
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Agents, ChatLine } from "./agents.js";
import type { Approvals, Decision } from "./approval.js";
import { rejectReason } from "./guard.js";
import type { Registry } from "./registry.js";
import type { Router } from "./router.js";
import { settingsApi } from "./settings.js";
import { type Updater, VERSION } from "./update.js";

const MAIN = "main"; // 主 bot 在网页里的 path
const CHAT_ID = "app"; // 主 bot 在路由器眼里的聊天 id
const STATIC: Record<string, string> = {
  "/manifest.webmanifest": "application/manifest+json",
  "/icon.svg": "image/svg+xml",
  "/icon-180.png": "image/png",
  "/settings.html": "text/html; charset=utf-8", // 设置页
  "/qiqi.png": "image/png", // 奇奇的头像
  "/qiqi-base.png": "image/png", // 会动的头像：眼睛涂黑的底图
  "/qiqi-closed.png": "image/png", // 会动的头像：闭眼那一层
  "/qiqi-eyes.js": "text/javascript; charset=utf-8",
  "/theme.css": "text/css; charset=utf-8", // 浅色 / 深色配色，两个页面共用
  "/theme.js": "text/javascript; charset=utf-8", // 外观切换（跟随系统 / 浅色 / 深色）
};

export function startServer(opts: {
  port: number;
  dataDir: string;
  publicDir: string;
  agents: Agents;
  registry: Registry;
  router: Router;
  updater?: Updater;
  approvals?: Approvals;
}) {
  const { agents, registry, router } = opts;
  const mainLog = join(opts.dataDir, "main.jsonl"); // 主 bot 的聊天记录
  const clients = new Set<ServerResponse>();
  const settings = settingsApi({ dataDir: opts.dataDir, port: opts.port });

  const push = (event: string, data: unknown) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of clients) c.write(msg);
  };
  agents.on("delta", (d) => push("delta", d));
  agents.on("busy", (d) => push("busy", d));
  agents.on("activity", (d) => push("activity", d)); // 正在想 / 正在调用哪个工具
  // 奇奇分派时的进度：网页上显示“正在想交给哪个宝… / 已交给 X”，交出去后跟着那段对话的进度走
  let mainLive: { since: number; status: string; follow?: string } | null = null;
  router.progress = (chatId, p) => {
    if (chatId !== CHAT_ID) return;
    mainLive = { since: mainLive?.since ?? Date.now(), status: p.status, follow: p.path };
    push("activity", { path: MAIN, live: mainLive });
  };
  agents.on("message", (d) => push("message", d)); // 后台任务回报到原对话
  router.tasks.on("update", (t) => {
    push("task", t);
    push("tree", tree());
  });
  opts.updater?.on("state", (s) => push("update", s));
  opts.approvals?.on("change", (list) => push("approvals", list)); // 等你点头的卡片

  const mainSay = (role: ChatLine["role"], text: string) => {
    appendFileSync(mainLog, JSON.stringify({ role, text, ts: new Date().toISOString() }) + "\n");
    if (role === "assistant" && mainLive) {
      mainLive = null; // 奇奇回话了，这一轮算做完
      push("activity", { path: MAIN, live: null });
    }
    push("message", { path: MAIN, role, text });
  };

  const mainHistory = (): ChatLine[] =>
    existsSync(mainLog)
      ? readFileSync(mainLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];

  const tree = () => ({
    tasks: router.tasks.list().slice(-50),
    current: registry.current(CHAT_ID)?.path,
    main: mainLive, // 奇奇正在分派的进度，没有就是 null
    agents: agents.listAgents().map((name) => ({
      name,
      sessions: registry.list(name).map((s) => ({ ...s, busy: agents.isBusy(s.path), live: agents.progress(s.path) ?? null })),
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
    if (url.pathname.startsWith("/api/settings")) return settings(req, res, url); // 设置页，见 settings.ts

    // 健康检查：自动更新换完版本后靠它确认新版本起来了
    if (url.pathname === "/api/health") return json({ ok: true, version: VERSION });

    // 更新：GET 看状态，POST /api/update/check 立刻查，POST /api/update/apply 立刻装
    if (url.pathname.startsWith("/api/update") && opts.updater) {
      const u = opts.updater;
      if (url.pathname === "/api/update/log") return json({ lines: u.logTail(80) });
      if (url.pathname === "/api/update") {
        u.readReceipt(); // 回执是新版本起来后才由 swap.sh 写的，现读才准
        return json(u.state);
      }
      if (req.method !== "POST") return json({ error: "要用 POST" }, 405);
      if (url.pathname === "/api/update/check") return json(await u.check());
      if (url.pathname === "/api/update/apply") {
        try {
          return json(await u.apply());
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
      }
    }

    // 审批：GET 看等你点头的卡片，POST /api/approvals/decide {id, decision: yes|no|always}
    if (url.pathname === "/api/approvals" && opts.approvals) return json(opts.approvals.list());
    if (url.pathname === "/api/approvals/decide" && req.method === "POST" && opts.approvals) {
      const { id, decision } = await body();
      if (!["yes", "no", "always"].includes(decision)) return json({ error: "decision 要是 yes、no 或 always" }, 400);
      try {
        opts.approvals.decide(String(id), decision as Decision);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json({ ok: true });
    }

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
    const denied = rejectReason(req);
    if (denied) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Kiki 拒绝了这个请求：${denied}`);
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      api(req, res, url).catch((e) => {
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      });
      return;
    }
    // 装成 App 用的图标和 manifest；其余路径都给那一个页面
    const asset = STATIC[url.pathname];
    if (asset) {
      res.writeHead(200, { "content-type": asset });
      res.end(readFileSync(join(opts.publicDir, url.pathname.slice(1))));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(opts.publicDir, "index.html")));
  });

  // 上次退出时没做完的后台任务：标成中断，在收件箱里说一声
  const lost = router.tasks.recover();
  if (lost.length)
    mainSay(
      "assistant",
      `上次 Kiki 关掉时有 ${lost.length} 个后台任务没做完：\n${lost.map((t) => `- 「${t.title}」 /retry ${t.id}`).join("\n")}`,
    );

  server.listen(opts.port, "127.0.0.1", () => {
    console.log(`Kiki 已启动：http://localhost:${opts.port}  （数据目录 ${opts.dataDir}）`);
  });
  return server;
}
