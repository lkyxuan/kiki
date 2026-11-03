// Mac 权限：Kiki 做事要用到的系统权限，装好后在设置里一次给全，免得干活时被系统弹窗卡住。
// 苹果规定这些开关只能用户亲手点，程序点不了；这里只列出来、给跳到系统设置对应页的链接，能检测的显示开没开。
import { closeSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PANE = "x-apple.systempreferences:com.apple.preference.security?";
export const MAC_PERMISSIONS = [
  { id: "files", name: "完全磁盘访问", why: "读写你所有的文件，包括文稿、下载、邮件和备忘录的数据", url: `${PANE}Privacy_AllFiles` },
  { id: "automation", name: "自动化", why: "替你操作日历、备忘录、提醒事项、Finder 这些 App（第一次用到某个 App 时系统会问一次，点“好”）", url: `${PANE}Privacy_Automation` },
  { id: "accessibility", name: "辅助功能", why: "帮你点按钮、在别的 App 里输入", url: `${PANE}Privacy_Accessibility` },
  { id: "calendars", name: "日历", why: "看你的日程、帮你建会", url: `${PANE}Privacy_Calendars` },
  { id: "reminders", name: "提醒事项", why: "看和添加你的待办", url: `${PANE}Privacy_Reminders` },
  { id: "contacts", name: "通讯录", why: "认出消息和邮件是谁发的", url: `${PANE}Privacy_Contacts` },
  { id: "screen", name: "屏幕录制", why: "需要时看一眼屏幕上是什么", url: `${PANE}Privacy_ScreenCapture` },
  { id: "network", name: "本地网络", why: "连你局域网或 Tailscale 里的另一台电脑", url: `${PANE}Privacy_LocalNetwork` },
  { id: "notify", name: "通知", why: "有要紧的事时提醒你", url: "x-apple.systempreferences:com.apple.Notifications-Settings.extension" },
] as const;

/** 完全磁盘访问能直接测：打得开系统的隐私数据库就是开了。别的测不了，显示 unknown。 */
export function macPermissions(home = homedir(), platform = process.platform) {
  if (platform !== "darwin") return { mac: false, items: [] as any[] };
  let files: "on" | "off" | "unknown" = "unknown";
  try {
    closeSync(openSync(join(home, "Library/Application Support/com.apple.TCC/TCC.db"), "r"));
    files = "on";
  } catch (e: any) {
    if (e?.code === "EPERM" || e?.code === "EACCES") files = "off";
  }
  return {
    mac: true,
    node: process.execPath, // 从命令行或开机服务起的 Kiki，权限算在这个程序头上
    items: MAC_PERMISSIONS.map((p) => ({ ...p, status: p.id === "files" ? files : "unknown" })),
  };
}
