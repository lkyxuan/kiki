// 宝的文件组成集中在这里：说明文件叫什么、新建一个宝时写什么。以后改文件名（比如改成 bao.md）只改这一处。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 每个宝的说明文件（pi 会读进系统提示词）。 */
export const BAO_FILE = "AGENTS.md";

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
  const what = duty.replace(/\s*\n\s*/g, " ").trim() || `${name}相关的事`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    baoFile(dataDir, name),
    `# ${name}\n\n## 我负责什么\n${what}\n\n## 我怎么干活\n- 回答简短，结论在前。\n- 需要记下来的东西，写进这个文件夹下的 notes/ 里（一个主题一个 .md）。\n`,
  );
  return dir;
}
