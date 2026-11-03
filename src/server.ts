// 本机聊天网页：只监听 127.0.0.1，别的机器连不上（远程用 Tailscale Serve 转进来，见 docs/mac-app.md）。
// 网页是 public/index.html；数据走下面几个接口，实时更新走 SSE。
//
// 通道边界：任何"通道"（这个网页、以后的微信插件……）都只需要调 router.handle(chatId, text, reply)。
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Agents, ChatLine } from "./agents.js";
import type { Approvals, Decision } from "./approval.js";
import { rejectReason, tailscaleIp } from "./guard.js";
import type { Registry } from "./registry.js";
import type { Router } from "./router.js";
import { OPEN } from "./tasks.js";
import { Logins } from "./login.js";
import { setProviderModels, setProviderOn } from "./modelprefs.js";
import { imageMime, saveImage, uploadsDir, validImageName } from "./images.js";
import { baoLook, setEnvLine, settingsApi } from "./settings.js";
import { type Updater, VERSION } from "./update.js";

const run = promisify(execFile);

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
  "/bots.js": "text/javascript; charset=utf-8", // 宝的默认头像：按名字生成的小机器人
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
  const logins = new Logins(() => agents.modelRuntime(), opts.dataDir, agents.engineDir);
  // 模型菜单：现在用的、能选的、ChatGPT 登没登录
  const modelInfo = async () => {
    const models = await agents.modelChoices();
    return {
      current: agents.currentModel,
      models,
      vision: (await agents.visionChoice(models))?.spec ?? null, // 现在的模型看不了图时，先交给它看
      chatgpt: { loggedIn: await logins.loggedIn("openai").catch(() => false), login: logins.state.provider === "openai" ? logins.state : { status: "idle" } },
      login: logins.state, // 正在进行的登录（任何一家）
    };
  };
  const saveEnv = (key: string, value: string) => {
    const envFile = join(opts.dataDir, ".env");
    try {
      writeFileSync(envFile, setEnvLine(existsSync(envFile) ? readFileSync(envFile, "utf8") : "", key, value), { mode: 0o600 });
    } catch (e) {
      console.warn(`${key} 写回 .env 失败：`, (e as Error).message);
    }
    process.env[key] = value;
  };

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
    // 没结束的全给（待办、定时、等你…），结束了的只给最近 40 个
    tasks: [...router.tasks.list((t) => OPEN.includes(t.status)), ...router.tasks.list((t) => !OPEN.includes(t.status)).slice(-40)],
    current: registry.current(CHAT_ID)?.path,
    main: mainLive, // 奇奇正在分派的进度，没有就是 null
    agents: agents.listAgents().map((name) => ({
      name,
      ...baoLook(opts.dataDir, name), // 头像 emoji
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

    if (url.pathname === "/api/tree") {
      await router.ensureMains().catch(() => {}); // 刚在设置页新建的宝，也马上带上主对话
      return json(tree());
    }
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

    // 模型：GET 看菜单；POST /api/models/use {spec} 换模型（写回 .env，重启后还是它）
    if (url.pathname === "/api/models") return json(await modelInfo());
    if (url.pathname === "/api/models/use" && req.method === "POST") {
      const { spec } = await body();
      if (typeof spec !== "string" || !/^[\w.-]+\/[\w.:/-]+$/.test(spec)) return json({ error: "模型名不对" }, 400);
      try {
        await agents.useModel(spec);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      saveEnv("MODEL", spec);
      push("model", { current: spec });
      return json(await modelInfo());
    }
    // 看图模型：POST /api/models/vision {spec}
    if (url.pathname === "/api/models/vision" && req.method === "POST") {
      const { spec } = await body();
      const pick = (await agents.modelChoices()).find((c) => c.spec === spec && c.image);
      if (!pick) return json({ error: "这个模型看不了图，或者还没登录" }, 400);
      agents.visionSpec = pick.spec;
      saveEnv("VISION_MODEL", pick.spec);
      push("model", { vision: pick.spec });
      return json(await modelInfo());
    }
    // 用 ChatGPT 订阅登录：start 拿登录网址，code 远程时粘回跳转后的网址，cancel / logout
    if (url.pathname.startsWith("/api/models/chatgpt/") && req.method === "POST") {
      const action = url.pathname.slice("/api/models/chatgpt/".length);
      try {
        if (action === "start") await logins.start("openai", "oauth");
        else if (action === "code") await logins.answer(String((await body()).input ?? ""));
        else if (action === "cancel") logins.cancel();
        else if (action === "logout") await logins.logout("openai");
        else return json({ error: "not found" }, 404);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json(await modelInfo());
    }
    // 各家服务商：GET 列表；POST /api/models/login/start {provider, type: api_key|oauth}、answer {value}、cancel、logout {provider}
    if (url.pathname === "/api/models/providers") return json({ providers: await logins.providers(), login: logins.state });
    // 设置里的开关和勾选：GET /api/models/provider?id= 看这家的模型；POST /api/models/prefs {provider, on?, models?}
    if (url.pathname === "/api/models/provider") return json({ models: await agents.providerModels(url.searchParams.get("id") ?? "") });
    if (url.pathname === "/api/models/prefs" && req.method === "POST") {
      const b = await body();
      const id = String(b.provider ?? "");
      if (!(await logins.providers()).some((p) => p.id === id)) return json({ error: "没有这家服务商" }, 400);
      if (typeof b.on === "boolean") setProviderOn(opts.dataDir, id, b.on);
      if (Array.isArray(b.models)) setProviderModels(opts.dataDir, id, b.models);
      push("model", {});
      return json({ providers: await logins.providers(), login: logins.state });
    }
    if (url.pathname.startsWith("/api/models/login/") && req.method === "POST") {
      const action = url.pathname.slice("/api/models/login/".length);
      const b = await body();
      try {
        if (action === "start") {
          if (b.type !== "api_key" && b.type !== "oauth") return json({ error: "type 要是 api_key 或 oauth" }, 400);
          await logins.start(String(b.provider ?? ""), b.type);
        } else if (action === "answer") await logins.answer(String(b.value ?? ""));
        else if (action === "cancel") logins.cancel();
        else if (action === "logout") await logins.logout(String(b.provider ?? ""));
        else return json({ error: "not found" }, 404);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      push("model", {});
      return json({ providers: await logins.providers(), login: logins.state });
    }

    // 图片：POST /api/image {data: data:URL} 存起来，返回放进消息里的标记；GET /api/image/<名字> 看图
    if (url.pathname === "/api/image" && req.method === "POST") {
      try {
        return json({ mark: saveImage(opts.dataDir, String((await body()).data ?? "")) });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    if (url.pathname.startsWith("/api/image/")) {
      const name = url.pathname.slice("/api/image/".length);
      const f = join(uploadsDir(opts.dataDir), name);
      if (!validImageName(name) || !existsSync(f)) return json({ error: "没有这张图" }, 404);
      res.writeHead(200, { "content-type": imageMime(name), "cache-control": "private, max-age=31536000, immutable" });
      res.end(readFileSync(f));
      return;
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
      // 这段对话是卡住等你回答的后台任务：回答交给任务，让它接着干、做完照常回报
      const stuck = router.tasks.blockedBySession(path);
      if (stuck) {
        router.tasks.answer(stuck.id, text);
        return;
      }
      agents
        .send(rec.agent, rec.path, text)
        .then((r) => push("message", { path, role: "assistant", text: r }))
        .catch((e) => push("message", { path, role: "assistant", text: `出错了：${(e as Error).message}` }));
      return;
    }

    // 看板上的按钮：马上开始 / 取消或停下 / 重跑
    if (url.pathname.startsWith("/api/tasks/") && req.method === "POST") {
      const { id } = await body();
      const act = url.pathname.slice("/api/tasks/".length);
      const t =
        act === "run" ? router.tasks.runNow(id)
        : act === "cancel" || act === "stop" ? await router.tasks.stop(id)
        : act === "retry" ? router.tasks.retry(id)
        : undefined;
      if (!t) return json({ error: "这个任务现在不能这样操作" }, 400);
      return json(t);
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

    // 删讨论串 / 清空主对话：记录都挪进 数据目录/trash/，不真删
    if (url.pathname === "/api/delete" && req.method === "POST") {
      const { path } = await body();
      try {
        await router.deleteSession(String(path));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      push("tree", tree());
      return json({ ok: true });
    }
    if (url.pathname === "/api/clear" && req.method === "POST") {
      const { path } = await body();
      if (path === MAIN) {
        // 奇奇自己的聊天记录：整个文件挪走，下次从空白开始
        if (existsSync(mainLog)) {
          const dir = join(opts.dataDir, "trash", "奇奇收件箱");
          mkdirSync(dir, { recursive: true });
          renameSync(mainLog, join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-main.jsonl`));
        }
        push("cleared", { path: MAIN });
        return json({ ok: true });
      }
      let fresh: string;
      try {
        fresh = (await router.clearMain(String(path))).path;
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      push("tree", tree());
      push("cleared", { path, fresh });
      return json({ ok: true, path: fresh });
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

  // 定时开出来的、重启后的、agent 用工具记的任务，做完/卡住时回报到收件箱
  router.tasks.defaultNotify = (t) => {
    const msg = router.notice(t);
    if (msg) mainSay("assistant", msg);
  };
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
  if (process.env.KIKI_TAILSCALE_LISTEN !== "0") listenOnTailscale(server, opts.port);
  return server;
}

/** 本机网卡上落在 Tailscale 地址段（100.64.0.0/10）里的 IPv4。这个段也可能是运营商 CGNAT 分的，所以只当候选。 */
export function candidateAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && tailscaleIp(a.address))
    .map((a) => a!.address);
}

const TAILSCALE_BINS = [
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "/opt/homebrew/bin/tailscale",
  "/usr/local/bin/tailscale",
  "/usr/bin/tailscale",
];

/** 问 Tailscale 自己：它分给本机的 IPv4 是哪些。找不到 Tailscale 或问不到就返回空（宁可不开）。 */
async function tailscaleOwned(): Promise<Set<string>> {
  for (const bin of TAILSCALE_BINS) {
    if (!existsSync(bin)) continue;
    try {
      const { stdout } = await run(bin, ["ip", "-4"], { timeout: 5000 });
      return new Set(stdout.split(/\s+/).filter((ip) => tailscaleIp(ip)));
    } catch {
      /* 下一个 */
    }
  }
  return new Set();
}

/**
 * 同一个端口再在 Tailscale 的 IP 上开一扇门，别的设备可以直接填 100.x.x.x:端口 来连。
 * 只开在 Tailscale 自己确认是它分的地址上（100.64/10 也可能是运营商的 CGNAT），
 * 局域网、公网都连不到；进来的请求和本机一样过守卫。
 * Tailscale 可能比 Kiki 晚起来，所以每分钟看一次。KIKI_TAILSCALE_LISTEN=0 关掉。
 */
function listenOnTailscale(main: ReturnType<typeof createServer>, port: number) {
  const open = new Map<string, ReturnType<typeof createServer>>();
  const failed = new Set<string>(); // 开不了的不再每分钟重试刷日志
  const scan = async () => {
    const local = candidateAddresses().filter((ip) => !open.has(ip) && !failed.has(ip));
    if (!local.length) return;
    const owned = await tailscaleOwned();
    for (const ip of local) {
      if (!owned.has(ip) || open.has(ip)) continue;
      const s = createServer((req, res) => main.emit("request", req, res));
      open.set(ip, s);
      s.on("error", (e) => {
        console.warn(`Tailscale 地址 ${ip}:${port} 开不了：${(e as Error).message}`);
        open.delete(ip);
        failed.add(ip);
        s.close();
      });
      s.listen(port, ip, () => console.log(`远程可连：http://${ip}:${port}（Tailscale 内网）`));
    }
  };
  void scan();
  setInterval(() => void scan(), 60_000).unref();
  main.on("close", () => {
    for (const s of open.values()) s.close();
  });
}
