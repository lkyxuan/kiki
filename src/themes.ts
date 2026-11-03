// 外部主题：放在 ~/kiki-data/themes/<id>/ 的文件夹，Kiki 本身只带浅色、深色两套。
// 一个主题 = theme.json（名字、基于浅色还是深色）+ theme.css（规则都挂在 :root[data-theme="<id>"] 下）+ 可选的图片、字体。
// 设置 › 外观会列出装好的主题；选中后 theme.js 在 <html> 上加 data-theme="<id>"，再加载 /themes/<id>/theme.css。
// 主题包单独放在别的仓库，装的时候把文件夹拷进 themes/ 就行。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export type ThemeInfo = { id: string; name: string; base: "light" | "dark"; author?: string; description?: string };

/** 主题 id 就是文件夹名：小写字母、数字、连字符；不能和内置的 system / light / dark 重名 */
export const validThemeId = (id: string) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(id) && !["system", "light", "dark"].includes(id);

/** 主题文件夹里能对外给的文件类型（只给静态资源，不给脚本） */
export const THEME_FILES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export const themesDir = (dataDir: string) => join(dataDir, "themes");

/** 列出装好的主题：有 theme.css 才算；theme.json 缺了或写错就用文件夹名、按浅色 */
export function listThemes(dataDir: string): ThemeInfo[] {
  const dir = themesDir(dataDir);
  if (!existsSync(dir)) return [];
  const out: ThemeInfo[] = [];
  for (const id of readdirSync(dir).sort()) {
    if (!validThemeId(id)) continue;
    const d = join(dir, id);
    try { if (!statSync(d).isDirectory() || !existsSync(join(d, "theme.css"))) continue; } catch { continue; }
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(readFileSync(join(d, "theme.json"), "utf8")); } catch {}
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    out.push({
      id,
      name: str(meta.name, 20) ?? id,
      base: meta.base === "dark" ? "dark" : "light",
      ...(str(meta.author, 40) ? { author: str(meta.author, 40) } : {}),
      ...(str(meta.description, 120) ? { description: str(meta.description, 120) } : {}),
    });
  }
  return out;
}

/** /themes/<id>/<文件> 对应的本地路径和类型；不合规（越界、子目录、不认识的类型）就返回 null */
export function themeFile(dataDir: string, pathname: string): { file: string; type: string } | null {
  const m = /^\/themes\/([^/]+)\/([A-Za-z0-9._-]+)$/.exec(pathname);
  if (!m || !validThemeId(m[1]) || m[2].startsWith(".")) return null;
  const type = THEME_FILES[extname(m[2]).toLowerCase()];
  if (!type) return null;
  const file = join(themesDir(dataDir), m[1], m[2]);
  try { if (!statSync(file).isFile()) return null; } catch { return null; }
  return { file, type };
}
