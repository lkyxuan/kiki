// 分派规则：用户可改的 Markdown（~/kiki-data/分派规则.md），收件箱路由和对话里的交接工具都读它。
// 每次用时现读，改完不用重启。文件不在就用仓库里的默认版本。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RULES_FILE = "分派规则.md";
const DEFAULT = join(dirname(fileURLToPath(import.meta.url)), "..", "data-template", RULES_FILE);

export function loadRules(dataDir: string): string {
  for (const f of [join(dataDir, RULES_FILE), DEFAULT]) {
    if (existsSync(f)) return readFileSync(f, "utf8");
  }
  return "判断完就直接做，做完告诉用户。";
}
