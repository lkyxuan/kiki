// 数据目录升级：从“dev + life 两个示例宝”改成“只有奇奇一个默认宝”。
// 只跑一次（做完写一个标记文件）。旧的 dev、life 不删，整个文件夹挪进 archive/，对话记录都还在。
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_BAO = "奇奇";
const MARK = ".migrated-qiqi";
const OLD = ["dev", "life"];

/** 返回做了哪些事（给日志看）；已经升级过就返回空。 */
export function migrateToQiqi(dataDir: string, templateDir: string, now = new Date()): string[] {
  const done: string[] = [];
  if (existsSync(join(dataDir, MARK))) return done;
  const agentsDir = join(dataDir, "agents");
  mkdirSync(agentsDir, { recursive: true });

  const qiqi = join(agentsDir, DEFAULT_BAO);
  if (!existsSync(qiqi)) {
    cpSync(join(templateDir, "agents", DEFAULT_BAO), qiqi, { recursive: true });
    done.push(`建好默认的宝 ${DEFAULT_BAO}`);
  }

  const stamp = now.toISOString().slice(0, 10);
  for (const name of OLD) {
    const from = join(agentsDir, name);
    if (!existsSync(from)) continue;
    const to = join(dataDir, "archive", `agents-${stamp}`, name);
    mkdirSync(join(to, ".."), { recursive: true });
    renameSync(from, to);
    done.push(`旧的宝 ${name} 已挪到 ${to}`);
  }

  // 分派规则里“交给生活宝（life）”这句换成奇奇；用户改过别的地方不动
  const rules = join(dataDir, "分派规则.md");
  if (existsSync(rules)) {
    const src = readFileSync(rules, "utf8");
    const next = src.replace("交给生活宝（life）", `交给${DEFAULT_BAO}`);
    if (next !== src) {
      writeFileSync(rules, next);
      done.push("分派规则里的默认去处改成奇奇");
    }
  }

  writeFileSync(join(dataDir, MARK), now.toISOString() + "\n");
  return done;
}
