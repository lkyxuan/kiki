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

  // 名册里去掉已归档的宝的对话，当前接着的对话如果指向它们也清掉，免得路由投到挪走的文件
  const moved = OLD.filter((n) => done.some((l) => l.startsWith(`旧的宝 ${n} `)));
  const regFile = join(dataDir, "registry.json");
  if (moved.length && existsSync(regFile)) {
    const reg = JSON.parse(readFileSync(regFile, "utf8")) as { sessions?: { agent: string; path: string }[]; chats?: Record<string, string> };
    const gone = new Set((reg.sessions ?? []).filter((x) => moved.includes(x.agent)).map((x) => x.path));
    if (gone.size) {
      reg.sessions = (reg.sessions ?? []).filter((x) => !gone.has(x.path));
      for (const [chat, path] of Object.entries(reg.chats ?? {})) if (gone.has(path)) delete reg.chats![chat];
      writeFileSync(regFile, JSON.stringify(reg, null, 2));
      done.push(`对话名册里去掉了 ${gone.size} 段已归档的对话`);
    }
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

/** 奇奇说明的旧版（0.2.7 到 0.2.14 的模板）：那时奇奇什么事都接，还让用户自己建宝。 */
export const OLD_QIQI = "# 奇奇：默认的宝\n\n## 我负责什么\n什么事都可以先交给我：日常安排、记录、提醒、查资料、写东西、写代码。\n没有更合适的宝时，事情都落到我这里。\n\n## 我怎么干活\n- 回答简短，结论在前。\n- 需要记下来的东西，写进这个文件夹下的 notes/ 里（一个主题一个 .md）。\n- 某一类事情多起来（比如一个长期项目、一个固定领域），建议用户新建一个专门的宝，把它分出去。\n\n## 我交回什么\n直接给答案或结果，必要时附一句理由；改过的文件列出来。\n";

/** 用户没改过奇奇的说明，就换成新版（奇奇只做分派，没有合适的宝自己建）；改过的不动。 */
export function upgradeQiqiNote(dataDir: string, templateDir: string): string[] {
  const f = join(dataDir, "agents", DEFAULT_BAO, "AGENTS.md");
  if (!existsSync(f) || readFileSync(f, "utf8") !== OLD_QIQI) return [];
  writeFileSync(f, readFileSync(join(templateDir, "agents", DEFAULT_BAO, "AGENTS.md"), "utf8"));
  return ["奇奇的说明换成新版：只做分派，没有合适的宝就自己建"];
}
