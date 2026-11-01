// pi 扩展（pi 叫“包”）的管理：装在 <数据目录>/engine，清单在 engine/settings.json 的 packages 里。
// 安装、卸载调 Kiki 自带的 pi 命令行；开关只改清单里那一项，不删文件：
//   开着：  "npm:pi-web-access"
//   关掉：  {"source": "npm:pi-web-access", "extensions": [], "skills": [], "prompts": [], "themes": []}
// 改完要新开对话或重启 Kiki 才生效。
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";

type Entry = string | { source: string; [k: string]: unknown };
const OFF = { extensions: [], skills: [], prompts: [], themes: [] };

const sourceOf = (e: Entry) => (typeof e === "string" ? e : e.source);
export const isOff = (e: Entry) =>
  typeof e !== "string" && Array.isArray(e.extensions) && e.extensions.length === 0 && Array.isArray(e.skills) && e.skills.length === 0;

/** 只接受 npm:、git:、https:// 来源，免得把奇怪的参数传给命令行。 */
export const validSource = (s: unknown): s is string =>
  typeof s === "string" && /^(npm:@?[\w.\-/@^~]+|git:[\w.\-/:@~]+|https:\/\/[\w.\-/:@~%]+)$/.test(s) && !s.includes("..");

/** 包的显示名：npm:@scope/name@1.0 → @scope/name，git:github.com/a/b → b */
export function displayName(source: string) {
  if (source.startsWith("npm:")) return source.slice(4).replace(/(.)@[^/]*$/, "$1");
  return source.replace(/\.git$/, "").split("/").pop() || source;
}

export function setEntryOn(packages: Entry[], source: string, on: boolean): Entry[] {
  let found = false;
  const out = packages.map((e) => {
    if (sourceOf(e) !== source) return e;
    found = true;
    // 打开时还原成最简单的写法（原先若有资源筛选会丢掉，设置页不管筛选）
    return on ? source : { source, ...OFF };
  });
  if (!found) throw new Error(`没装 ${source}`);
  return out;
}

export class Extensions {
  private settingsFile: string;
  constructor(private engineDir: string) {
    this.settingsFile = join(engineDir, "settings.json");
  }

  private read(): Record<string, unknown> {
    return existsSync(this.settingsFile) ? JSON.parse(readFileSync(this.settingsFile, "utf8")) : {};
  }

  list() {
    const pkgs = (this.read().packages as Entry[] | undefined) ?? [];
    return pkgs.map((e) => ({ source: sourceOf(e), name: displayName(sourceOf(e)), on: !isOff(e) }));
  }

  setOn(source: string, on: boolean) {
    const s = this.read();
    s.packages = setEntryOn((s.packages as Entry[] | undefined) ?? [], source, on);
    writeFileSync(this.settingsFile, JSON.stringify(s, null, 2) + "\n");
  }

  install(source: string) {
    return this.pi(["install", source]);
  }

  remove(source: string) {
    return this.pi(["remove", source]);
  }

  /** 用 Kiki 自带的 Node 跑 pi 命令行，配置目录指到 engine。PATH 里补上 Node 所在目录，pi 装 npm 包要用到 npm。 */
  private pi(args: string[]): Promise<string> {
    const cli = join(dirname(createRequire(import.meta.url).resolve("@earendil-works/pi-coding-agent")), "bundle", "cli.js");
    const env = {
      ...process.env,
      PI_CODING_AGENT_DIR: this.engineDir,
      PATH: [dirname(process.execPath), process.env.PATH ?? "", "/opt/homebrew/bin", "/usr/local/bin"].join(delimiter),
    };
    return new Promise((resolve, reject) =>
      execFile(process.execPath, [cli, ...args], { env, timeout: 180_000, maxBuffer: 4 << 20 }, (err, out, errOut) => {
        const text = `${out}\n${errOut}`.trim().split("\n").slice(-8).join("\n");
        if (err) reject(new Error(text || err.message));
        else resolve(text);
      }),
    );
  }
}
