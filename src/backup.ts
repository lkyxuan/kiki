// 先备份，再动手：删除和强推不再先问你，而是做之前自动存一份，做完能一键撤回。
//
//   - rm 删文件：要删的东西先复制进 <数据目录>/trash/backups/<编号>/，撤回时复制回去（原地已有同名的不覆盖）。
//   - git 丢改动（reset --hard、clean、checkout --、stash drop、删分支…）：先记下 HEAD、所有分支和标签、
//     没提交的改动（git stash create）、stash 列表和没被跟踪的文件，都挂在 refs/kiki-backup/<编号>/ 下不怕被回收。
//     撤回 = 回到那一步之前的样子。
//   - 强推：先把远程所有分支抓一份到本地 refs/kiki-backup/<编号>/，撤回时把被改掉的分支推回原样。
//   - 认不出要删什么、太大、抹磁盘这类备份不了的：不做，把原因交回给模型让它换个做法（不来问你）。
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, globSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export type Undo =
  | { kind: "files"; items: { from: string; backup: string }[] }
  | {
      kind: "git";
      repo: string;
      id: string;
      head: string;
      branch?: string;
      wip?: string;
      refs: [string, string][]; // [sha, refs/heads/x]
      stashes: string[];
      untracked?: { dir: string; files: string[] };
    }
  | { kind: "push"; repo: string; remote: string; refs: [string, string][] }; // [分支名, 原来的 sha]

export type BackupResult = { undo: Undo; note: string } | { error: string };

/** 一次最多备份这么多（字节）：再大就不做，让模型换个做法 */
export const MAX_BACKUP = 1 << 30;

const IRREVERSIBLE = new Set(["dd.device-write", "disk.erase"]);

export function newBackupId(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 5)}`;
}

/** 按 cc-safety-net 的规则 id 给这条命令做备份。 */
export function backupFor(dataDir: string, ruleId: string, command: string, cwd: string, id = newBackupId()): BackupResult {
  const trash = join(dataDir, "trash");
  if (IRREVERSIBLE.has(ruleId)) return { error: "写磁盘设备、抹磁盘这类动作没法备份，收不回来，Kiki 不做。换个不碰整块磁盘的做法。" };
  const parsed = parseShell(command);
  try {
    if (ruleId.startsWith("git.push")) {
      if (!parsed) return { error: "这条强推命令太复杂，没法先备份远程。拆成一条简单的 git push 再试。" };
      return pushBackup(parsed, cwd, id);
    }
    if (ruleId.startsWith("git.")) {
      const repo = gitRoot(parsed ? workDir(parsed, cwd) : cwd);
      if (!repo) return { error: "没找到这条 git 命令作用的仓库，没法先备份。先 cd 到仓库里再跑。" };
      return gitSnapshot(dataDir, repo, id, /\bclean\b[^;&|]*-[a-zA-Z]*x/i.test(command));
    }
    if (ruleId.startsWith("rm.")) {
      const targets = parsed ? rmTargets(parsed, cwd) : undefined;
      if (!targets?.length) return { error: `没认出要删哪些文件，没法先备份。用明确的路径，或者先 mv 到 ${trash}/ 里。` };
      return fileBackup(dataDir, targets, id);
    }
  } catch (e) {
    return { error: `先备份没成功（${String((e as Error).message ?? e).split("\n")[0].slice(0, 160)}），这一步没做。换个做法，或者先 mv 到 ${trash}/ 里。` };
  }
  // find -delete、rsync --delete、xargs rm、看不懂的复杂命令……
  return { error: `这条命令会删东西，但 Kiki 认不出具体删哪些，没法先备份，所以没做。先列出要删的文件，再用明确的路径 rm，或者 mv 到 ${trash}/ 里。` };
}

// ---------- 撤回 ----------

/** 撤回一次备份过的动作，返回给人看的一句话。 */
export function undo(u: Undo): string {
  if (u.kind === "files") {
    const skipped: string[] = [];
    for (const it of u.items) {
      if (!existsSync(it.backup)) continue;
      if (existsSync(it.from)) {
        skipped.push(it.from);
        continue;
      }
      mkdirSync(dirname(it.from), { recursive: true });
      cpSync(it.backup, it.from, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    }
    return skipped.length ? `已放回，原地已有同名的没覆盖：${skipped.join("、")}` : "删掉的文件已经放回原处";
  }
  if (u.kind === "git") {
    const g = git(u.repo);
    const now = new Map(lines(g(["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/tags"])).map((l) => [l.split(" ")[1], l.split(" ")[0]]));
    for (const [sha, ref] of u.refs) if (now.get(ref) !== sha) g(["update-ref", ref, sha]);
    if (u.head) {
      if (u.branch) {
        g(["checkout", "-f", u.branch]);
        g(["reset", "--hard", u.head]);
      } else g(["checkout", "-f", "--detach", u.head]);
    }
    const notes: string[] = [];
    if (u.wip) {
      try {
        g(["stash", "apply", u.wip]);
      } catch {
        notes.push(`没提交的改动没能自动放回，在 ${u.wip.slice(0, 10)}（git stash apply 它）`);
      }
    }
    const have = new Set(tryLines(g, ["log", "-g", "--format=%H", "refs/stash"]));
    for (const sha of [...u.stashes].reverse()) if (!have.has(sha)) g(["stash", "store", "-m", "Kiki 撤回时放回", sha]);
    if (u.untracked)
      for (const f of u.untracked.files) {
        const to = join(u.repo, f);
        if (!existsSync(to) && existsSync(join(u.untracked.dir, f))) {
          mkdirSync(dirname(to), { recursive: true });
          cpSync(join(u.untracked.dir, f), to, { recursive: true });
        }
      }
    return ["仓库已经回到那一步之前", ...notes].join("；");
  }
  // 强推：被改掉的分支推回原样；对方之后又推过的照样会被覆盖，所以用 force-with-lease 只在还是刚才那样时才推
  const g = git(u.repo);
  const now = new Map(lines(g(["ls-remote", "--heads", u.remote], 60_000)).map((l) => [l.split("\t")[1].replace("refs/heads/", ""), l.split("\t")[0]]));
  const back: string[] = [];
  for (const [branch, sha] of u.refs) {
    const cur = now.get(branch);
    if (cur === sha) continue;
    g(["push", `--force-with-lease=refs/heads/${branch}:${cur ?? ""}`, u.remote, `${sha}:refs/heads/${branch}`], 120_000);
    back.push(branch);
  }
  return back.length ? `远程分支已经推回原样：${back.join("、")}` : "远程分支和推之前一样，不用改";
}

// ---------- 备份 ----------

function fileBackup(dataDir: string, targets: string[], id: string): BackupResult {
  const live = targets.filter((t) => existsSync(t));
  if (!live.length) return { undo: { kind: "files", items: [] }, note: "要删的文件本来就不在" };
  const size = live.reduce((n, t) => n + duBytes(t), 0);
  if (size > MAX_BACKUP) return { error: `要删的东西太大（约 ${Math.round(size / 1e6)} MB），没法先备份，这一步没做。分批删，或者先 mv 到 ${join(dataDir, "trash")}/ 里。` };
  const dir = join(dataDir, "trash", "backups", id, "files");
  const items = live.map((from, i) => {
    const backup = join(dir, String(i), basename(from) || "root");
    mkdirSync(dirname(backup), { recursive: true });
    cpSync(from, backup, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    return { from, backup };
  });
  writeFileSync(join(dir, "原来的位置.txt"), items.map((x) => `${x.backup}\t${x.from}`).join("\n") + "\n");
  return { undo: { kind: "files", items }, note: `已先备份到 ${dir}` };
}

function gitSnapshot(dataDir: string, repo: string, id: string, ignored: boolean): BackupResult {
  const g = git(repo);
  const head = tryOne(g, ["rev-parse", "HEAD"]);
  const branch = tryOne(g, ["symbolic-ref", "-q", "--short", "HEAD"]) || undefined;
  const wip = tryOne(g, ["stash", "create"]) || undefined;
  const refs = lines(g(["for-each-ref", "--format=%(objectname) %(refname)", "refs/heads", "refs/tags"])).map((l) => l.split(" ") as [string, string]);
  const stashes = tryLines(g, ["log", "-g", "--format=%H", "refs/stash"]);
  // 挂在 refs/kiki-backup/<编号>/ 下，这些提交就不会被 git gc 回收
  const keep = [
    ...(head ? [`create refs/kiki-backup/${id}/head ${head}`] : []),
    ...(wip ? [`create refs/kiki-backup/${id}/wip ${wip}`] : []),
    ...refs.map(([sha], i) => `create refs/kiki-backup/${id}/ref/${i} ${sha}`),
    ...stashes.map((sha, i) => `create refs/kiki-backup/${id}/stash/${i} ${sha}`),
  ];
  if (keep.length) execFileSync("git", ["-C", repo, "update-ref", "--stdin"], { input: keep.join("\n") + "\n", stdio: ["pipe", "ignore", "pipe"] });
  // 没被跟踪的文件（git clean 会删的）复制一份
  const files = g(["ls-files", "--others", "-z", ...(ignored ? [] : ["--exclude-standard"])]).split("\0").filter(Boolean);
  let untracked: { dir: string; files: string[] } | undefined;
  if (files.length) {
    const size = files.reduce((n, f) => n + duBytes(join(repo, f)), 0);
    if (size > MAX_BACKUP) return { error: `仓库里没被跟踪的文件太大（约 ${Math.round(size / 1e6)} MB），没法先备份，这一步没做。` };
    const dir = join(dataDir, "trash", "backups", id, "untracked");
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      cpSync(join(repo, f), join(dir, f), { recursive: true, verbatimSymlinks: true });
    }
    untracked = { dir, files };
  }
  return { undo: { kind: "git", repo, id, head, branch, wip, refs: refs.map(([sha, ref]) => [sha, ref]), stashes, untracked }, note: `已先存下仓库状态（refs/kiki-backup/${id}）` };
}

function pushBackup(segs: string[][], cwd: string, id: string): BackupResult {
  let dir = cwd;
  let remote: string | undefined;
  for (const s of segs) {
    if (s[0] === "cd" && s[1]) dir = resolvePath(s[1], dir);
    const w = stripPrefix(s);
    if (w[0] !== "git") continue;
    const i = w.indexOf("push");
    if (i < 0) continue;
    for (let j = 1; j < i; j++) if (w[j] === "-C" && w[j + 1]) dir = resolvePath(w[j + 1], dir);
    remote = w.slice(i + 1).find((a) => !a.startsWith("-"));
  }
  const repo = gitRoot(dir);
  if (!repo) return { error: "没找到要推的仓库，没法先备份远程。先 cd 到仓库里再推。" };
  const g = git(repo);
  if (!remote) {
    const b = tryOne(g, ["symbolic-ref", "-q", "--short", "HEAD"]);
    remote = (b && tryOne(g, ["config", `branch.${b}.remote`])) || "origin";
  }
  const heads = lines(g(["ls-remote", "--heads", remote], 60_000)).map((l) => l.split("\t") as [string, string]);
  if (heads.length) g(["fetch", "--no-tags", remote, `+refs/heads/*:refs/kiki-backup/${id}/*`], 120_000);
  return { undo: { kind: "push", repo, remote, refs: heads.map(([sha, ref]) => [ref.replace("refs/heads/", ""), sha]) }, note: `已先把远程 ${remote} 的分支存到本地 refs/kiki-backup/${id}/` };
}

// ---------- 读命令 ----------

/** 很简单的 shell 拆词：按 ; && || | 换行分段，认单双引号和反斜杠。有 $、反引号、<( ) 这类动态的就返回 undefined。 */
export function parseShell(cmd: string): string[][] | undefined {
  // 先去掉重定向（2>&1、>/dev/null、< in.txt），它们不影响删的是哪些
  cmd = cmd.replace(/\d*>&\d+/g, " ").replace(/\d*(>>?|<)\s*[^\s;&|]+/g, " ");
  const segs: string[][] = [[]];
  let word = "";
  let has = false;
  let q: "'" | '"' | undefined;
  const push = () => {
    if (has) segs[segs.length - 1].push(word);
    word = "";
    has = false;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") {
      if (c === "'") q = undefined;
      else word += c;
      continue;
    }
    if (c === "\\" && i + 1 < cmd.length) {
      word += cmd[++i];
      has = true;
      continue;
    }
    if (c === "$" || c === "`") return undefined;
    if (q === '"') {
      if (c === '"') q = undefined;
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
      continue;
    }
    if (c === "(" || c === ")" || c === "<" || c === ">") return undefined;
    if (c === ";" || c === "&" || c === "|" || c === "\n") {
      push();
      if (segs[segs.length - 1].length) segs.push([]);
      continue;
    }
    if (c === " " || c === "\t") {
      push();
      continue;
    }
    word += c;
    has = true;
  }
  if (q) return undefined;
  push();
  return segs.filter((s) => s.length);
}

/** 去掉 VAR=x、sudo、command、env 这类前缀 */
function stripPrefix(s: string[]): string[] {
  let i = 0;
  while (i < s.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(s[i]) || ["sudo", "command", "builtin", "env", "nice", "nohup", "time"].includes(s[i]))) i++;
  return s.slice(i);
}

function resolvePath(p: string, cwd: string) {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(cwd, p);
}

/** 命令最后作用在哪个目录（跟着 cd 和 git -C 走） */
function workDir(segs: string[][], cwd: string) {
  let dir = cwd;
  for (const s of segs) {
    if (s[0] === "cd" && s[1]) dir = resolvePath(s[1], dir);
    const w = stripPrefix(s);
    if (w[0] === "git") for (let j = 1; j < w.length; j++) if (w[j] === "-C" && w[j + 1]) return resolvePath(w[j + 1], dir);
  }
  return dir;
}

/** rm 要删的路径（跟着 cd 走，通配符展开）。认不出就返回 undefined。 */
export function rmTargets(segs: string[][], cwd: string): string[] | undefined {
  let dir = cwd;
  const out: string[] = [];
  for (const s of segs) {
    if (s[0] === "cd" && s[1]) {
      dir = resolvePath(s[1], dir);
      continue;
    }
    const w = stripPrefix(s);
    if (w[0] !== "rm" && !w[0]?.endsWith("/rm")) continue;
    let flags = true;
    for (const a of w.slice(1)) {
      if (flags && a === "--") {
        flags = false;
        continue;
      }
      if (flags && a.startsWith("-") && a !== "-") continue;
      const p = resolvePath(a, dir);
      if (/[*?[]/.test(a)) {
        const hits = globSync(p);
        if (!hits.length) continue;
        out.push(...hits.map((h) => resolve(h)));
      } else out.push(p);
    }
  }
  if (!out.length) return undefined;
  // 里外重复的（删 a 也删 a/b）只备份外层
  const uniq = [...new Set(out)].sort();
  return uniq.filter((p) => !uniq.some((q) => q !== p && (q === "/" ? p !== "/" : p.startsWith(q + "/"))));
}

// ---------- 小工具 ----------

function git(repo: string) {
  return (args: string[], timeout = 30_000) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }).trim();
}
function tryOne(g: ReturnType<typeof git>, args: string[]) {
  try {
    return g(args);
  } catch {
    return "";
  }
}
function tryLines(g: ReturnType<typeof git>, args: string[]) {
  return lines(tryOne(g, args));
}
const lines = (s: string) => s.split("\n").filter(Boolean);

function gitRoot(dir: string): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function duBytes(p: string): number {
  try {
    return Number(execFileSync("du", ["-sk", p], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 }).split(/\s/)[0]) * 1024 || 0;
  } catch {
    return Infinity; // 量不出来就当太大
  }
}
