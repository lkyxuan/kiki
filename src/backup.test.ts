import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ActionLog } from "./actions.js";
import { backupFor, parseShell, rmTargets, undo } from "./backup.js";

const tmp = () => mkdtempSync(join(tmpdir(), "kiki-bk-"));
const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function repo(dir: string) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "k@k");
  git(dir, "config", "user.name", "k");
  writeFileSync(join(dir, "a.txt"), "v1");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "one");
  return dir;
}

test("拆命令：认 cd、引号、通配符、重定向；有 $ 的认不出", () => {
  assert.deepEqual(parseShell(`cd /x && rm -rf "a b" c 2>&1 | tee log`), [["cd", "/x"], ["rm", "-rf", "a b", "c"], ["tee", "log"]]);
  assert.equal(parseShell("rm -rf $HOME"), undefined);
  const d = tmp();
  writeFileSync(join(d, "1.log"), "");
  writeFileSync(join(d, "2.log"), "");
  mkdirSync(join(d, "k"));
  assert.deepEqual(rmTargets(parseShell(`cd ${d} && rm -f *.log k k/inner`)!, "/"), [join(d, "1.log"), join(d, "2.log"), join(d, "k")]);
});

test("rm：先复制一份，撤回放回原处（原地有同名的不覆盖）", () => {
  const data = tmp();
  const w = tmp();
  mkdirSync(join(w, "proj"));
  writeFileSync(join(w, "proj", "x.txt"), "keep me");
  const b = backupFor(data, "rm.recursive-force-outside-cwd", `rm -rf ${w}/proj`, "/");
  assert.ok("undo" in b, JSON.stringify(b));
  rmSync(join(w, "proj"), { recursive: true });
  const log = new ActionLog(data);
  const a = log.add({ agent: "dev", path: "/s", category: "delete", categoryName: "永久删除", label: "rm", detail: "rm", note: b.note, undo: b.undo });
  assert.match(log.undo(a.id), /放回/);
  assert.equal(readFileSync(join(w, "proj", "x.txt"), "utf8"), "keep me");
  assert.equal(log.list()[0].undone !== undefined, true);
  assert.ok(backupFor(data, "rm.recursive-force-outside-cwd", "rm -rf $X", "/").hasOwnProperty("error"));
  assert.ok("error" in backupFor(data, "disk.erase", "diskutil eraseDisk x", "/"));
  assert.ok("error" in backupFor(data, "find.delete", "find . -delete", "/"));
});

test("git reset --hard / clean：先存下仓库状态，撤回回到之前（改动、没跟踪的文件、stash 都回来）", () => {
  const data = tmp();
  const r = repo(join(tmp(), "r"));
  writeFileSync(join(r, "a.txt"), "改了没提交");
  writeFileSync(join(r, "new.txt"), "没跟踪");
  writeFileSync(join(r, "s.txt"), "stash 里的");
  git(r, "add", "s.txt");
  git(r, "stash", "push", "-q", "--", "s.txt");
  const b = backupFor(data, "git.reset-hard", `cd ${r} && git reset --hard && git clean -fd && git stash clear`, "/");
  assert.ok("undo" in b, JSON.stringify(b));
  git(r, "reset", "-q", "--hard");
  git(r, "clean", "-qfd");
  git(r, "stash", "clear");
  assert.equal(readFileSync(join(r, "a.txt"), "utf8"), "v1");
  assert.equal(existsSync(join(r, "new.txt")), false);
  undo(b.undo);
  assert.equal(readFileSync(join(r, "a.txt"), "utf8"), "改了没提交");
  assert.equal(readFileSync(join(r, "new.txt"), "utf8"), "没跟踪");
  assert.equal(git(r, "stash", "list").split("\n").filter(Boolean).length, 1);
});

test("git 删分支：撤回把分支找回来", () => {
  const data = tmp();
  const r = repo(join(tmp(), "r"));
  git(r, "branch", "feature");
  const b = backupFor(data, "git.branch-force-delete", "git branch -D feature", r);
  assert.ok("undo" in b);
  git(r, "branch", "-D", "feature");
  undo(b.undo);
  assert.match(git(r, "branch"), /feature/);
});

test("强推：先把远程分支存到本地，撤回推回原样", () => {
  const data = tmp();
  const base = tmp();
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  const r = repo(join(base, "r"));
  git(r, "remote", "add", "origin", remote);
  git(r, "push", "-q", "origin", "main");
  const before = git(r, "rev-parse", "HEAD");
  git(r, "commit", "-q", "--amend", "-m", "改写历史");
  const b = backupFor(data, "git.push-force", "git push --force origin main", r);
  assert.ok("undo" in b, JSON.stringify(b));
  git(r, "push", "-q", "--force", "origin", "main");
  assert.notEqual(git(remote, "rev-parse", "main"), before);
  assert.match(undo(b.undo), /推回原样：main/);
  assert.equal(git(remote, "rev-parse", "main"), before);
  assert.match(undo(b.undo), /不用改/);
});

test("强推撤回：只动这次推到的分支；之后别人又推过的不覆盖", () => {
  const data = tmp();
  const base = tmp();
  const remote = join(base, "remote.git");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  const r = repo(join(base, "r"));
  git(r, "remote", "add", "origin", remote);
  git(r, "branch", "other");
  git(r, "push", "-q", "origin", "main", "other");
  const before = git(r, "rev-parse", "HEAD");
  git(r, "commit", "-q", "--amend", "-m", "改写历史");
  const b = backupFor(data, "git.push-force", "git push -f", r);
  assert.ok("undo" in b, JSON.stringify(b));
  git(r, "push", "-q", "--force", "origin", "main");
  // 别的分支之后被推了：撤回不能动它
  git(r, "push", "-q", "--force", "origin", "HEAD:other");
  const other = git(remote, "rev-parse", "other");
  assert.match(undo(b.undo), /推回原样：main/);
  assert.equal(git(remote, "rev-parse", "main"), before);
  assert.equal(git(remote, "rev-parse", "other"), other);

  // main 之后又被别人推过：不自动覆盖
  const b2 = backupFor(data, "git.push-force", "git push --force origin main", r);
  assert.ok("undo" in b2);
  git(r, "push", "-q", "--force", "origin", "main");
  writeFileSync(join(r, "b.txt"), "x");
  git(r, "add", ".");
  git(r, "commit", "-qm", "别人又推");
  git(r, "push", "-q", "origin", "main");
  const later = git(remote, "rev-parse", "main");
  assert.match(undo(b2.undo), /又有人推过/);
  assert.equal(git(remote, "rev-parse", "main"), later);
});

test("git 命令认不出作用在哪个仓库：不猜，不做", () => {
  const r = repo(join(tmp(), "r"));
  const b = backupFor(tmp(), "git.reset-hard", 'git -C "$TARGET" reset --hard', r);
  assert.ok("error" in b);
});
