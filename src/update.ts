// 自动更新。思路照搬 Hermes 的 `hermes update`：
//   后台查新版本 → 下载到暂存区 → 先自检再替换 → 替换前备份状态文件 → 重启 → 起不来就自动回滚 → 留回执。
// 和 Hermes 的区别：Hermes 是 git 仓库，用 git pull；Kiki 装好的是 Kiki.app，没有 git，
// 所以从 GitHub Releases 下载打好的 zip（构建见 packaging/build.sh 和 .github/workflows/release.yml）。
//
// 只有从 Kiki.app 启动时（启动脚本会设 KIKI_APP）才会自己替换；npm start 的开发模式只提示，不动代码。
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HOUR = 3600_000;

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const VERSION: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "installing" | "error";

export interface UpdateState {
  current: string;
  latest?: string;
  notes?: string;
  url?: string; // 发布页
  status: UpdateStatus;
  message?: string;
  checkedAt?: string;
  canApply: boolean; // 从 Kiki.app 跑的才能自己替换
  auto: boolean; // 空闲时自动装
  last?: { from: string; to: string; result: string; at: string }; // 上一次更新的回执
}

/** "0.10.1" > "0.9.3"。只比数字段，忽略 -beta 之类的后缀。 */
export function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

/** 从 SHA256SUMS 文本里找某个文件的校验和。 */
export function sumFor(sums: string, file: string): string | undefined {
  for (const line of sums.split("\n")) {
    const [hash, name] = line.trim().split(/\s+\*?/);
    if (name === file) return hash.toLowerCase();
  }
}

export const assetName = (arch = process.arch) => `Kiki-mac-${arch}.zip`;

export class Updater extends EventEmitter {
  readonly repo = process.env.KIKI_UPDATE_REPO || "lkyxuan/kiki";
  readonly api = process.env.KIKI_UPDATE_API || "https://api.github.com"; // 测试时可以指到假服务器
  readonly appPath = process.env.KIKI_APP; // .../Kiki.app
  readonly logDir = join(homedir(), "Library", "Logs", "Kiki");
  private release?: { tag: string; assets: { name: string; url: string }[] };
  private lastCheck = 0;
  state: UpdateState;

  constructor(
    private opts: { dataDir: string; port: number; isIdle: () => boolean },
  ) {
    super();
    this.state = {
      current: VERSION,
      status: "idle",
      canApply: !!this.appPath && process.platform === "darwin",
      auto: process.env.KIKI_AUTO_UPDATE !== "0",
    };
    this.readReceipt();
  }

  readReceipt() {
    try {
      this.state.last = JSON.parse(readFileSync(join(this.logDir, "last-update.json"), "utf8"));
    } catch {}
  }

  private set(patch: Partial<UpdateState>) {
    Object.assign(this.state, patch);
    this.emit("state", this.state);
  }

  /** 开机查一次，之后每 10 分钟看一眼：距上次查满 1 小时就再查；有新版且空闲就自动装。 */
  start() {
    if (process.env.KIKI_UPDATE_CHECK === "0") return;
    const tick = async () => {
      // 回滚后的回执是在旧版本重新起来之后才写的，所以每次都现读
      this.readReceipt();
      if (Date.now() - this.lastCheck > HOUR) await this.check().catch(() => {});
      // 上次装这个版本失败回滚过，就不再自动重试，等你手动点
      const failedBefore = this.state.last?.result.startsWith("roll") && this.state.last.to === this.state.latest;
      if (this.state.status === "available" && this.state.auto && this.state.canApply && !failedBefore && this.opts.isIdle()) {
        await this.apply().catch(() => {});
      }
    };
    setTimeout(tick, 20_000); // 别和启动抢
    setInterval(tick, 10 * 60_000).unref();
  }

  /** 私有仓库要令牌：先看环境变量，再借 gh 的登录（和 Hermes 一样的顺序）。公开仓库可以不要。 */
  private async token(): Promise<string | undefined> {
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (env) return env;
    for (const gh of ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"]) {
      try {
        const { stdout } = await run(gh, ["auth", "token"], { timeout: 5000 });
        if (stdout.trim()) return stdout.trim();
      } catch {}
    }
  }

  private async gh(url: string, accept = "application/vnd.github+json") {
    const token = await this.token();
    const res = await fetch(url, {
      headers: {
        accept,
        "user-agent": `kiki/${VERSION}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      if (res.status === 404)
        throw new Error(token ? "还没有发布过版本" : "找不到发布版本（私有仓库需要 GITHUB_TOKEN 或登录 gh）");
      throw new Error(`GitHub 返回 ${res.status}`);
    }
    return res;
  }

  async check(): Promise<UpdateState> {
    if (["checking", "downloading", "installing"].includes(this.state.status)) return this.state;
    this.set({ status: "checking", message: undefined });
    this.lastCheck = Date.now();
    try {
      const r = (await (await this.gh(`${this.api}/repos/${this.repo}/releases/latest`)).json()) as {
        tag_name: string;
        body?: string;
        html_url: string;
        assets: { name: string; url: string }[];
      };
      this.release = { tag: r.tag_name, assets: r.assets };
      const latest = r.tag_name.replace(/^v/, "");
      const has = newer(latest, VERSION);
      this.set({
        latest,
        notes: r.body?.slice(0, 2000),
        url: r.html_url,
        status: has ? "available" : "idle",
        checkedAt: new Date().toISOString(),
      });
    } catch (e) {
      this.set({ status: "error", message: `检查更新失败：${(e as Error).message}`, checkedAt: new Date().toISOString() });
    }
    return this.state;
  }

  async apply(): Promise<UpdateState> {
    if (!this.state.canApply) throw new Error("开发模式（npm start）不自动替换代码，请用 git pull 更新");
    if (this.state.status !== "available" || !this.release) throw new Error("现在没有可装的新版本");
    const app = this.appPath!;
    const to = this.state.latest!;
    const zipAsset = this.release.assets.find((a) => a.name === assetName());
    const sumAsset = this.release.assets.find((a) => a.name === "SHA256SUMS");
    if (!zipAsset || !sumAsset) {
      this.set({ status: "error", message: `发布 ${this.release.tag} 里没有 ${assetName()}` });
      return this.state;
    }

    const work = join(tmpdir(), `kiki-update-${to}`);
    const staging = join(dirname(app), ".Kiki-update"); // 和 App 同一个盘，替换时是瞬间改名
    try {
      // 1. 下载并校验
      this.set({ status: "downloading", message: `正在下载 ${to}…` });
      rmSync(work, { recursive: true, force: true });
      mkdirSync(work, { recursive: true });
      const zip = join(work, zipAsset.name);
      const res = await this.gh(zipAsset.url, "application/octet-stream");
      const hash = createHash("sha256");
      await pipeline(
        Readable.fromWeb(res.body as never),
        async function* (src) {
          for await (const chunk of src) {
            hash.update(chunk);
            yield chunk;
          }
        },
        createWriteStream(zip),
      );
      const sums = await (await this.gh(sumAsset.url, "application/octet-stream")).text();
      const want = sumFor(sums, zipAsset.name);
      if (!want || want !== hash.digest("hex")) throw new Error("校验和对不上，已放弃");

      // 2. 解压到暂存区，用新版本自带的 Node 跑一次自检（相当于 Hermes 更新后先编译关键文件）
      this.set({ status: "installing", message: `正在检查 ${to}…` });
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging, { recursive: true });
      await run("/usr/bin/ditto", ["-x", "-k", zip, staging]);
      const staged = join(staging, "Kiki.app");
      const res2 = join(staged, "Contents", "Resources");
      const { stdout } = await run(join(res2, "node", "bin", "node"), [join(res2, "app", "dist", "main.js"), "--selftest"], {
        timeout: 60_000,
      });
      if (!stdout.includes(`kiki ${to} ok`)) throw new Error(`新版本自检没通过：${stdout.slice(0, 200)}`);

      // 3. 备份状态文件（只是小文件；对话记录不会被更新动到）
      this.backup();

      // 4. 等手上的对话都跑完再切（下载和自检期间可能有新对话开始）。
      //    检查空闲和启动替换脚本之间是同步的，中间插不进新消息。
      while (!this.opts.isIdle()) {
        this.set({ message: `${to} 已准备好，等对话跑完就切换` });
        await new Promise((r) => setTimeout(r, 5000));
      }

      // 5. 交给旧版本里的替换脚本：换 App → 重启 → 健康检查 → 不行就回滚。它会把当前进程重启掉。
      const script = join(work, "swap.sh");
      copyFileSync(join(app, "Contents", "Resources", "swap.sh"), script);
      mkdirSync(this.logDir, { recursive: true });
      const log = openSync(join(this.logDir, "update.log"), "a");
      spawn("/bin/bash", [script, app, staged, VERSION, to, String(this.opts.port), this.logDir], {
        detached: true,
        stdio: ["ignore", log, log],
      }).unref();
      this.set({ message: `正在切换到 ${to}，Kiki 会重启一下` });
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      this.set({ status: "error", message: `更新失败：${(e as Error).message}` });
    }
    return this.state;
  }

  private backup() {
    const dir = join(this.opts.dataDir, "backups");
    const dest = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-v${VERSION}`);
    mkdirSync(dest, { recursive: true });
    for (const f of ["registry.json", "AGENTS.md", ".env", "main.jsonl"]) {
      const src = join(this.opts.dataDir, f);
      if (existsSync(src)) copyFileSync(src, join(dest, f));
    }
    // 只留最近 5 份
    const all = readdirSync(dir).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 5))) rmSync(join(dir, old), { recursive: true, force: true });
  }
}
