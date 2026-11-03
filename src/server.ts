// 本机聊天网页：只监听 127.0.0.1，别的机器连不上（远程用 Tailscale Serve 转进来，见 docs/mac-app.md）。
// 网页是 public/index.html；数据走下面几个接口，实时更新走 SSE。
//
// 通道边界：任何"通道"（这个网页、以后的微信插件……）都只需要调 router.handle(chatId, text, reply)。
import type { WorkBook } from "./work.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { networkInterfaces } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import { Acks, markForReply } from "./ack.js";
import { ackPrompt, cleanAck, ROLES, roleModel, roleOf, validSpec } from "./modelroles.js";
import { MAIN_SESSION } from "./bao.js";
import type { Agents, ChatLine } from "./agents.js";
import type { Approvals, Decision } from "./approval.js";
import { rejectReason, tailscaleIp } from "./guard.js";
import type { Registry } from "./registry.js";
import { answerText, deliveryText, type Postroom } from "./postroom.js";
import type { Notifier } from "./notify.js";
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
const POSTROOM_CHAT = "postroom"; // 收发室交给奇奇的消息，单独一个聊天 id，不打乱你自己的“当前对话”
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
  postroom?: Postroom;
  notifier?: Notifier;
  works?: WorkBook;
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
  // 先接住你：消息一到就在气泡上打表情（👀 / 排队中 / ⏳ / ✅ / ✋ / ❗），不用等模型，见 ack.ts
  const acks = new Acks();
  acks.on("change", (d) => push("ack", d));
  // “先回一句”：选了小模型才做，和主模型同时跑；它答得比主回答还慢就不显示了
  const quickLine = (ack: string, who: string, text: string) => {
    const spec = roleModel("ack");
    if (!spec || text.trim().startsWith("/")) return;
    agents
      .complete(ackPrompt(who), text.slice(0, 2000), spec)
      .then((raw) => acks.say(ack, cleanAck(raw)))
      .catch((e) => console.warn("[ack] 先回一句失败：", (e as Error).message));
  };
  router.tasks.on("update", (t) => {
    acks.onTask(t);
    push("task", t);
    push("tree", tree());
  });
  opts.works?.on("change", () => push("tree", tree())); // 归类改了工作，右栏跟着变
  opts.updater?.on("state", (s) => push("update", s));
  opts.approvals?.on("change", (list) => push("approvals", list)); // 待发、超预算的卡片
  opts.approvals?.actions.on("change", () => push("actions", opts.approvals!.actions.list(20))); // Kiki 自动做了什么

  const mainSay = (role: ChatLine["role"], text: string, ack?: string) => {
    appendFileSync(mainLog, JSON.stringify({ role, text, ts: new Date().toISOString() }) + "\n");
    if (role === "assistant" && mainLive) {
      mainLive = null; // 奇奇回话了，这一轮算做完
      push("activity", { path: MAIN, live: null });
    }
    push("message", { path: MAIN, role, text, ...(ack ? { ack } : {}) });
  };
  // 这条消息发出后从这个聊天开出去、还没挂到别的消息上的后台任务（拆成几件时有好几个）
  const tasksSince = (chatId: string, since: number) =>
    router.tasks.list((t) => t.chatId === chatId && Date.parse(t.created) >= since - 1000 && !acks.linked(t.id));

  const mainHistory = (): ChatLine[] =>
    existsSync(mainLog)
      ? readFileSync(mainLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : [];

  // 通知通道之一：Kiki 界面，在奇奇的聊天里多一条
  opts.notifier?.add({ id: "kiki-ui", name: "Kiki 界面", send: (n) => mainSay("assistant", `${n.urgent ? "⚠️ " : "📮 "}${n.title}\n\n${n.text}`) });

  // 收发室：收件箱里的新消息交给奇奇分派（和你在奇奇里说话走同一条路，聊天 id 单独一个），
  // 奇奇的回执经通知通道告诉你；回复某次派活的，直接记回派活的那段对话
  const pr = opts.postroom;
  const viewing = new Map<string, number>(); // path -> 最近一次报“正开着”的时间
  if (pr) {
    pr.deliver = (it) =>
      new Promise((ok, fail) => {
        let first = "";
        router
          .handle(POSTROOM_CHAT, deliveryText(it, (b) => agents.exists(b)), async (r) => {
            first ||= r;
            void opts.notifier?.send({
              title: `收发室 · 「${it.from}」发来${it.title ? `「${it.title}」` : "一条消息"}`,
              text: r,
              source: `收发室 · ${it.from}`, // 重要的收到时已经单独提醒过，这里是奇奇的回执，不再弹系统通知
            });
            push("tree", tree());
          })
          .then(() => ok(first), fail);
      });
    pr.answer = async (it, sent) => {
      const rec = sent.origin ? registry.byPath(sent.origin) : undefined;
      if (!rec) return false;
      await agents.note(rec.agent, rec.path, answerText(it, sent));
      return true;
    };
    // 只在你没开着那段对话时才会走到这里：告诉你结果写在哪了
    pr.notify = async (it) => {
      const rec = it.path && it.path !== MAIN ? registry.byPath(it.path) : undefined;
      const where = rec ? `\n\n结果在 [${rec.name === "主对话" ? rec.agent : rec.name}](kiki:${rec.agent}/${rec.name})` : "";
      const title = it.status === "replied" || it.re ? `「${it.from}」回复了${it.title ? `「${it.title}」` : ""}` : (it.title ?? `「${it.from}」有新消息`);
      const why = it.urgent ? `（重要：${it.urgent}）\n` : "";
      await opts.notifier?.send({ title, text: `${why}${it.text.length > 600 ? `${it.text.slice(0, 600)}…` : it.text}${where}`, urgent: !!it.urgent, source: it.from });
    };
    // 网页报上来你正开着哪几段对话（中间 + 右栏），90 秒内没再报就当你不在了
    pr.isViewing = (p) => (viewing.get(p) ?? 0) > Date.now() - 90_000;
    pr.followUp = async (session, watch, it) => {
      const rec = registry.find(session)[0];
      if (!rec) throw new Error(`找不到对话「${session}」`);
      const msg = `【收发室】你之前办的「${watch}」有新消息（来自 ${it.from}）：\n\n${it.title ? `${it.title}\n` : ""}${it.text}\n\n（请对照之前做过的事，用几句话说清楚现在需要用户做什么，或者你接下来做什么。）`;
      agents
        .send(rec.agent, rec.path, msg)
        .then((r) => agents.announce(rec.path, r))
        .catch((e) => agents.announce(rec.path, `出错了：${(e as Error).message}`));
      return `已交回 [${rec.name === "主对话" ? rec.agent : rec.name}](kiki:${rec.agent}/${rec.name})，它会带着之前的上下文给出下一步。`;
    };
    pr.on("change", () => push("tree", tree()));
    // 分派失败、外部 agent 出错：也经通知通道说一声（不只是情况栏里一行）
    pr.on("attention", (a: { title: string; why: string; from: string }) =>
      void opts.notifier?.send({ title: `收发室 · 「${a.from}」${a.title}`, text: a.why, urgent: true, source: `收发室 · ${a.from}` }),
    );
  }

  const tree = () => ({
    // 没结束的全给（待办、定时、等你…），结束了的只给最近 40 个
    tasks: [...router.tasks.list((t) => OPEN.includes(t.status)), ...router.tasks.list((t) => !OPEN.includes(t.status)).slice(-40)],
    current: registry.current(CHAT_ID)?.path,
    main: mainLive, // 奇奇正在分派的进度，没有就是 null
    acks: acks.list(), // 气泡上挂着的表情
    postroom: pr?.state() ?? null, // 收发室：外部 agent 的状态、要你看的
    agents: agents.listAgents().map((name) => ({
      name,
      works: opts.works?.list(name) ?? [], // 这个宝在做的事（右栏按它归类）
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

    // 收发室：GET 看一览；POST /api/postroom/poll 立刻收一轮、send {agent, text, title} 派活、dismiss {id} 不用再看
    // 网页报：你现在正开着哪几段对话（页面藏到后台时报空）。收发室据此决定提不提醒、清掉未读
    if (url.pathname === "/api/viewing" && req.method === "POST") {
      const b = await body();
      const paths: string[] = Array.isArray(b.paths) ? b.paths.filter((p: unknown) => typeof p === "string") : [];
      const now = Date.now();
      for (const [p] of viewing) if (!paths.includes(p)) viewing.delete(p);
      for (const p of paths) viewing.set(p, now);
      pr?.markRead(paths);
      return json({ ok: true });
    }
    // 推送：本机程序（或 A2A 推送通知）直接 POST 过来，马上收。/api/postroom/push/<来源名> {title, text, attention, bao, re}
    if (url.pathname.startsWith("/api/postroom/push/") && req.method === "POST" && pr) {
      const from = decodeURIComponent(url.pathname.slice("/api/postroom/push/".length));
      if (!/^[\p{L}\p{N} _.-]{1,40}$/u.test(from)) return json({ error: "来源名不对" }, 400);
      try {
        const it = pr.push(from, await body());
        return json({ ok: true, id: it?.id });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
    }
    if (url.pathname.startsWith("/api/postroom") && pr) {
      if (url.pathname === "/api/postroom") return json(pr.state());
      if (req.method !== "POST") return json({ error: "要用 POST" }, 405);
      try {
        if (url.pathname === "/api/postroom/poll") await pr.poll();
        else if (url.pathname === "/api/postroom/send") {
          const b = await body();
          if (!String(b.text ?? "").trim()) return json({ error: "空消息" }, 400);
          await pr.send(String(b.agent ?? ""), String(b.text), b.title ? String(b.title) : undefined, undefined, "用户");
        } else if (url.pathname === "/api/postroom/dismiss") pr.dismiss(String((await body()).id ?? ""));
        else return json({ error: "not found" }, 404);
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      return json(pr.state());
    }

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

    // 卡片：GET 看待发和要你点的卡片，POST /api/approvals/decide {id, decision: yes|no|always}（待发的 no = 撤回）
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

    // Kiki 做了什么：GET 最近自动做掉的危险动作；POST /api/actions/undo {id} 撤回
    if (url.pathname === "/api/actions" && opts.approvals) return json(opts.approvals.actions.list(Number(url.searchParams.get("limit")) || 50));
    if (url.pathname === "/api/actions/undo" && req.method === "POST" && opts.approvals) {
      const { id } = await body();
      try {
        return json({ ok: true, note: opts.approvals.actions.undo(String(id)) });
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
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
    // 模型按用途配置（modelroles.ts）：GET 看每个用途选了什么；POST {id, spec} 改，spec 为空是不选
    if (url.pathname === "/api/models/roles") {
      if (req.method === "POST") {
        const { id, spec } = await body();
        const role = roleOf(String(id));
        const want = String(spec ?? "").trim();
        if (!role || !validSpec(want)) return json({ error: "用途或模型名不对" }, 400);
        if (want && !(await agents.modelChoices()).some((c) => c.spec === want)) return json({ error: "没有这个模型，或者还没登录那家服务商" }, 400);
        saveEnv(role.env, want);
        if (role.id === "vision") agents.visionSpec = want;
        push("model", {});
      }
      return json({ roles: ROLES.map((r) => ({ ...r, spec: roleModel(r.id) ?? "" })), models: await agents.modelChoices() });
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
        const ack = acks.add(MAIN, text);
        const sent = Date.now();
        mainSay("user", text, ack);
        json({ ok: true, ack });
        quickLine(ack, "奇奇，负责把用户的事分给合适的宝去做", text);
        router
          .handle(CHAT_ID, text, async (r) => {
            const m = markForReply(r);
            if (m === "bg") acks.link(ack, tasksSince(CHAT_ID, sent)); // 之后跟着这些任务的状态走
            else if (m !== undefined && !acks.get(ack)?.tasks) acks.set(ack, m);
            mainSay("assistant", r);
            push("tree", tree()); // /new /bg 之类会改列表
          })
          .catch((e) => {
            acks.set(ack, "error");
            mainSay("assistant", `出错了：${(e as Error).message}`);
          });
        return;
      }
      const rec = registry.byPath(path);
      if (!rec) return json({ error: "没有这段对话" }, 404);
      // 这段对话是卡住等你回答的后台任务：回答交给任务，让它接着干、做完照常回报
      const stuck = router.tasks.blockedBySession(path);
      const ack = acks.add(path, text, !stuck && agents.occupied(path));
      json({ ok: true, ack });
      push("message", { path, role: "user", text, ack });
      if (stuck) {
        const t = router.tasks.answer(stuck.id, text);
        if (t) acks.link(ack, [t]);
        return;
      }
      quickLine(ack, rec.name === MAIN_SESSION ? `${rec.agent}（${agents.describe(rec.agent) || "一个助理"}）` : `${rec.agent}，正在讨论「${rec.name}」`, text);
      agents
        .send(rec.agent, rec.path, text, { onStart: () => acks.start(ack) })
        .then((r) => {
          acks.set(ack, null);
          push("message", { path, role: "assistant", text: r });
        })
        .catch((e) => {
          acks.set(ack, "error");
          push("message", { path, role: "assistant", text: `出错了：${(e as Error).message}` });
        });
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
    // 工作：你手动改归类。merge {agent, from, into} 合并；detach {agent, id, path} 把一段对话移出去；set {agent, id, status?, title?}
    if (url.pathname.startsWith("/api/work/") && req.method === "POST" && opts.works) {
      const b = await body(), act = url.pathname.slice("/api/work/".length), agent = String(b.agent ?? "");
      if (!agents.exists(agent)) return json({ error: "没有这个宝" }, 400);
      const w =
        act === "merge" ? opts.works.merge(agent, String(b.from), String(b.into))
        : act === "detach" ? opts.works.detach(agent, String(b.id), String(b.path))
        : act === "set" ? opts.works.set(agent, String(b.id), { status: b.status, title: b.title })
        : undefined;
      if (!w) return json({ error: "没找到这件工作" }, 400);
      push("tree", tree());
      return json({ ok: true, work: w });
    }
    if (url.pathname === "/api/delete" && req.method === "POST") {
      const { path } = await body();
      const gone = registry.byPath(String(path));
      try {
        await router.deleteSession(String(path));
      } catch (e) {
        return json({ error: (e as Error).message }, 400);
      }
      if (gone) opts.works?.forget(gone.agent, gone.path);
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
      const rec = registry.byPath(fresh);
      if (rec) opts.works?.repoint(rec.agent, String(path), fresh);
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
