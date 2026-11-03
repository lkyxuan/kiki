// Mac 权限：Kiki 做事要用到的系统权限，第一次打开时一次要齐，免得干活时被系统弹窗卡住、或者弹窗根本出不来。
//
// 谁在要权限：真正干活的是「Kiki 后台」（Contents/Helpers/KikiAgent.app，里面是自带的 Node，由 launchd 跑），
// 所以权限都给它；系统设置里显示成“Kiki 后台”。开发者签名、标识固定，自动更新后权限还在。
//
// 怎么要：这些都在跑 Kiki 的那台 Mac 上做（连远程时就是远程那台），由后台自己发起，系统弹窗才会算在它头上：
//   - 辅助功能、屏幕录制：调系统的“请求”接口，弹出系统对话框
//   - 自动化（日历、提醒事项、备忘录、通讯录、Finder、System Events）：给每个 App 发一个无害的 AppleEvent，系统弹“允许控制”
//   - 完全磁盘访问：苹果不给弹窗，只能打开系统设置那一页，再在 Finder 里把“Kiki 后台”指出来，拖进去就行
//   - 本地网络：第一次连局域网时系统自己会问
// 苹果规定开关只能用户亲手点；我们能做的是一次把弹窗都弹出来、把设置页都打开。
import { execFile } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const PANE = "x-apple.systempreferences:com.apple.preference.security?";
type Status = "on" | "off" | "unknown";
interface Perm {
  id: string;
  name: string;
  why: string;
  url: string;
  /** 自动化：要控制的 App */
  app?: string;
}

export const MAC_PERMISSIONS: Perm[] = [
  { id: "files", name: "完全磁盘访问", why: "读写你所有的文件，包括文稿、下载、邮件和备忘录的数据", url: `${PANE}Privacy_AllFiles` },
  { id: "accessibility", name: "辅助功能", why: "帮你点按钮、在别的 App 里输入", url: `${PANE}Privacy_Accessibility` },
  { id: "screen", name: "屏幕录制", why: "需要时看一眼屏幕上是什么", url: `${PANE}Privacy_ScreenCapture` },
  { id: "ae-system", name: "自动化：System Events", why: "操作窗口、菜单和系统设置", url: `${PANE}Privacy_Automation`, app: "System Events" },
  { id: "ae-finder", name: "自动化：Finder", why: "整理文件、打开文件夹", url: `${PANE}Privacy_Automation`, app: "Finder" },
  { id: "ae-calendar", name: "自动化：日历", why: "看你的日程、帮你建会", url: `${PANE}Privacy_Automation`, app: "Calendar" },
  { id: "ae-reminders", name: "自动化：提醒事项", why: "看和添加你的待办", url: `${PANE}Privacy_Automation`, app: "Reminders" },
  { id: "ae-notes", name: "自动化：备忘录", why: "记笔记、查笔记", url: `${PANE}Privacy_Automation`, app: "Notes" },
  { id: "ae-contacts", name: "自动化：通讯录", why: "认出消息和邮件是谁发的", url: `${PANE}Privacy_Automation`, app: "Contacts" },
  { id: "network", name: "本地网络", why: "连你局域网或 Tailscale 里的另一台电脑（第一次连的时候系统会问）", url: `${PANE}Privacy_LocalNetwork` },
];

type Run = (cmd: string, args: string[], timeoutMs: number) => Promise<{ ok: boolean; out: string; err: string }>;
const run: Run = (cmd, args, timeoutMs) =>
  new Promise((resolve) =>
    execFile(cmd, args, { timeout: timeoutMs }, (e, out, err) => resolve({ ok: !e, out: String(out ?? "").trim(), err: String(err ?? "") })),
  );

const jxa = (code: string, timeoutMs = 10_000, r: Run = run) => r("osascript", ["-l", "JavaScript", "-e", code], timeoutMs);

/** “Kiki 后台”小 App 在哪（从命令行起的 Kiki 没有，返回 undefined） */
export function agentApp(execPath = process.execPath): string | undefined {
  const m = execPath.match(/^(.*\/KikiAgent\.app)\//);
  return m ? m[1] : undefined;
}

export class MacPermissions {
  private requesting = false;
  private step = "";

  constructor(
    readonly dataDir: string,
    private platform = process.platform,
    private home = homedir(),
    private r: Run = run,
  ) {}

  private get file() {
    return join(this.dataDir, "mac-permissions.json");
  }
  private load(): { asked?: string; results: Record<string, Status> } {
    try {
      const s = JSON.parse(readFileSync(this.file, "utf8"));
      return { asked: s.asked, results: s.results ?? {} };
    } catch {
      return { results: {} };
    }
  }
  private save(s: { asked?: string; results: Record<string, Status> }) {
    writeFileSync(this.file, JSON.stringify(s, null, 2) + "\n");
  }

  /** 完全磁盘访问：打得开系统的隐私数据库就是开了 */
  private files(): Status {
    try {
      closeSync(openSync(join(this.home, "Library/Application Support/com.apple.TCC/TCC.db"), "r"));
      return "on";
    } catch (e: any) {
      return e?.code === "EPERM" || e?.code === "EACCES" ? "off" : "unknown";
    }
  }

  /** 辅助功能、屏幕录制：系统有不弹窗的查询接口 */
  private async probe(id: string): Promise<Status> {
    const code =
      id === "accessibility"
        ? 'ObjC.import("ApplicationServices"); $.AXIsProcessTrusted()'
        : id === "screen"
          ? 'ObjC.import("CoreGraphics"); $.CGPreflightScreenCaptureAccess()'
          : "";
    if (!code) return "unknown";
    const x = await jxa(code, 10_000, this.r);
    return x.ok ? (x.out === "true" ? "on" : "off") : "unknown";
  }

  async status() {
    if (this.platform !== "darwin") return { mac: false as const, items: [] };
    const saved = this.load();
    const items = [];
    for (const p of MAC_PERMISSIONS) {
      let status: Status = saved.results[p.id] ?? "unknown";
      if (p.id === "files") status = this.files();
      else if (p.id === "accessibility" || p.id === "screen") status = await this.probe(p.id);
      items.push({ ...p, status });
    }
    return {
      mac: true as const,
      asked: !!saved.asked, // 第一次打开时还没要过：网页会自动打开这一页
      requesting: this.requesting,
      step: this.step,
      agent: agentApp(),
      items,
    };
  }

  /** 一次要齐：按顺序把系统弹窗都弹出来（每个弹窗等你点完再下一个），再打开完全磁盘访问那一页 */
  async requestAll(): Promise<void> {
    if (this.platform !== "darwin" || this.requesting) return;
    this.requesting = true;
    const saved = this.load();
    saved.asked = new Date().toISOString();
    this.save(saved);
    try {
      this.step = "辅助功能";
      await jxa('ObjC.import("ApplicationServices"); $.AXIsProcessTrustedWithOptions($({AXTrustedCheckOptionPrompt: true}))', 10_000, this.r);
      this.step = "屏幕录制";
      await jxa('ObjC.import("CoreGraphics"); $.CGRequestScreenCaptureAccess()', 10_000, this.r);
      for (const p of MAC_PERMISSIONS.filter((x) => x.app)) {
        this.step = p.name;
        // 无害的一问：只读 App 的名字。第一次会弹“允许 Kiki 后台 控制 X 吗”，最多等你两分钟
        const x = await this.r("osascript", ["-e", `tell application "${p.app}" to get name`], 120_000);
        saved.results[p.id] = x.ok ? "on" : /-1743|Not authori[sz]ed|不允许/i.test(x.err) ? "off" : "unknown";
        this.save(saved);
      }
      if (this.files() !== "on") {
        this.step = "完全磁盘访问";
        await this.open("files");
      }
    } finally {
      this.requesting = false;
      this.step = "";
    }
  }

  /** 在跑 Kiki 的那台 Mac 上打开系统设置对应的页；完全磁盘访问顺便在 Finder 里指出“Kiki 后台”，拖进列表就行 */
  async open(id: string): Promise<void> {
    const p = MAC_PERMISSIONS.find((x) => x.id === id);
    if (!p) throw new Error(`没有这项权限 ${id}`);
    if (this.platform !== "darwin") throw new Error("Kiki 现在不是跑在 Mac 上");
    await this.r("open", [p.url], 10_000);
    const agent = agentApp();
    if (id === "files" && agent && existsSync(agent)) await this.r("open", ["-R", agent], 10_000);
  }

  markAsked() {
    const s = this.load();
    s.asked ??= new Date().toISOString();
    this.save(s);
  }
}

export const agentDir = (execPath = process.execPath) => {
  const a = agentApp(execPath);
  return a ? dirname(a) : undefined;
};
