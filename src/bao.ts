// 宝的文件组成集中在这里：说明文件叫什么、新建一个宝时写什么。以后改文件名（比如改成 bao.md）只改这一处。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 每个宝固定的主对话：这个宝的协调人，简单的直接答，具体的事开成讨论串（宝下面其他的对话）。 */
export const MAIN_SESSION = "主对话";

/** 每个宝的说明文件（pi 会读进系统提示词）。 */
export const BAO_FILE = "AGENTS.md";

/** 宝自己的技能放在 skills/<技能名>/SKILL.md（Claude / Agent Skills 格式），开对话时 Kiki 会读进去。 */
export const SKILLS_DIR = "skills";

export const baoDir = (dataDir: string, name: string) => join(dataDir, "agents", name);
export const baoFile = (dataDir: string, name: string) => join(baoDir(dataDir, name), BAO_FILE);

/** 宝名：汉字、字母、数字、- 和 _，1 到 12 个字。 */
export function validBaoName(name: unknown): name is string {
  return typeof name === "string" && /^[\p{L}\p{N}_-]{1,12}$/u.test(name);
}

/** 新建一个宝：建文件夹、写说明。已经有了就报错。返回宝的文件夹。 */
export function createBao(dataDir: string, name: string, duty: string): string {
  if (!validBaoName(name)) throw new Error(`宝名「${name}」不行：只能用汉字、字母、数字、- 和 _，最多 12 个字`);
  const dir = baoDir(dataDir, name);
  if (existsSync(dir)) throw new Error(`已经有宝「${name}」了`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(baoFile(dataDir, name), baoDoc(name, duty));
  return dir;
}

/** 新宝的 AGENTS.md：「我负责什么」要写在这个小标题下，分派时才读得到 */
export function baoDoc(name: string, duty: string): string {
  const what = duty.replace(/\s*\n\s*/g, " ").trim() || `${name}相关的事`;
  return `# ${name}\n\n## 我负责什么\n${what}\n\n## 我怎么干活\n- 回答简短，结论在前。\n- 需要记下来的东西，写进这个文件夹下的 notes/ 里（一个主题一个 .md）。\n`;
}

// 「## 我负责什么」这一行，加上它下面直到下一个 # / ## 标题之前的每一行（标题紧挨着也算）
const DUTY_RE = /(^|\n)##[ \t]*我负责什么[ \t]*(?:\n|$)((?:(?!#{1,2}[ \t])[^\n]*(?:\n|$))*)/;

/** 从 AGENTS.md 里取「我负责什么」这一段的内容，没有就是空。 */
export function readDuty(md: string): string {
  return md.match(DUTY_RE)?.[2].trim() ?? "";
}

/** 改 AGENTS.md 里「我负责什么」这一段，其余内容原样保留；没有这一段就加在标题下面。 */
export function setDuty(md: string, name: string, duty: string): string {
  // 可以写几行，但不留空行，也不能写成小标题（不然这一段就断了）
  const what = duty.split("\n").map((l) => l.trim().replace(/^#+\s*/, "")).filter(Boolean).join("\n") || `${name}相关的事`;
  const m = md.match(DUTY_RE);
  if (m && m.index !== undefined) {
    const end = m.index + m[0].length;
    return `${md.slice(0, m.index)}${m[1]}## 我负责什么\n${what}\n${end < md.length ? `\n${md.slice(end)}` : ""}`;
  }
  const title = md.match(/^#[ \t]+[^\n]*\n?/);
  if (!title) return `# ${name}\n\n## 我负责什么\n${what}\n${md.trim() ? `\n${md}` : ""}`;
  const rest = md.slice(title[0].length).replace(/^\n+/, "");
  return `${title[0].replace(/\n?$/, "\n")}\n## 我负责什么\n${what}\n${rest ? `\n${rest}` : ""}`;
}
