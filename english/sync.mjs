// 把中文仓库（当前目录的上一级）翻译成英文仓库。
// 用法：node english/sync.mjs --en <英文仓库目录> [--full] [--dry-run]
//
// 增量模式：英文仓库的 .translation/source-commit 记着上次同步到的中文提交，
// 只处理这之后改过的文件。对每个改过的中文文件，把“中文旧版、中文新版、英文旧版”
// 一起交给模型，让它只改需要改的地方，英文其余部分保持不动。
// 全量模式（--full 或第一次）：所有文件从头翻译。
import Anthropic from "@anthropic-ai/sdk";
import { minimatch } from "minimatch";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const zh = resolve(here, "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const en = resolve(opt("--en") || "en");
const dryRun = flag("--dry-run");
const rules = JSON.parse(readFileSync(join(here, "rules.json"), "utf8"));
const glossary = readFileSync(join(here, "glossary.md"), "utf8");
const stateDir = join(en, ".translation");
const pathsFile = join(stateDir, "paths.json");
const commitFile = join(stateDir, "source-commit");
const CJK = /[㐀-鿿豈-﫿　-〿！-｠]/;

const git = (...a) => execFileSync("git", a, { cwd: zh, encoding: "utf8", maxBuffer: 1 << 28 });
const gitBuf = (...a) => execFileSync("git", a, { cwd: zh, maxBuffer: 1 << 28 });
const head = git("rev-parse", "HEAD").trim();
const base = !flag("--full") && existsSync(commitFile) ? readFileSync(commitFile, "utf8").trim() : null;
const paths = existsSync(pathsFile) ? JSON.parse(readFileSync(pathsFile, "utf8")) : {};
const excluded = (p) => rules.exclude.some((g) => minimatch(p, g, { dot: true }));
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const client = dryRun ? null : new Anthropic();

// ---- 要处理哪些文件 ----
let changes = []; // {status: "A"|"M"|"D", path, old?}
if (base) {
  const parts = git("diff", "--name-status", "-M", "-z", base, head).split("\0").filter(Boolean);
  for (let i = 0; i < parts.length; ) {
    const s = parts[i++];
    if (s.startsWith("R")) { const from = parts[i++], to = parts[i++]; changes.push({ status: "D", path: from }, { status: "A", path: to, old: from }); }
    else changes.push({ status: s[0] === "D" ? "D" : s[0] === "A" ? "A" : "M", path: parts[i++] });
  }
} else {
  const current = git("ls-files", "-z").split("\0").filter(Boolean);
  changes = current.map((p) => ({ status: "A", path: p }));
  // 全量重翻时，英文仓库里对应已删除中文文件的旧文件也要删掉
  const keep = new Set(current);
  for (const p of Object.keys(paths)) {
    const target = join(en, paths[p]);
    if (!keep.has(p) && existsSync(target) && statSync(target).isFile()) changes.push({ status: "D", path: p });
  }
}
changes = changes.filter((c) => !excluded(c.path));

// ---- 模型调用 ----
const SYSTEM = `You translate the Kiki codebase from Chinese to English. Kiki is a Mac personal-assistant app (Swift shell + TypeScript server + HTML UI). The English edition is a separate product for overseas users and must read as if it had been written in English from day one.

Rules:
- Translate every piece of Chinese: UI strings, prompts sent to models, comments, docs, test names, test fixtures, log messages, file and folder names that appear in string literals.
- Do not change code logic, identifiers, structure, formatting or line order. Only human-language text changes. Keep the file valid (code still compiles, JSON still parses, Markdown links still work).
- Prompts written for models: translate naturally and keep their intent and constraints exact.
- Tests must keep passing: if a test asserts on a string, translate it exactly the way the code under test is translated. Use the glossary and the path map for every term.
- In READMEs, drop the language switcher line that links to the Chinese README, and drop Chinese-only content (e.g. links to Chinese communities) only if it makes no sense for an English reader.
- Chinese-specific example content (Chinese names, Chinese apps) may be adapted to natural English equivalents.
- Output only the full file contents, with no code fences and no commentary.

Glossary (follow it exactly):
${glossary}`;

async function ask(user, maxTokens = 128000) {
  const stream = client.beta.messages.stream({
    model: rules.model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("model refused");
  if (msg.stop_reason === "max_tokens") throw new Error("output too long");
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

const pathMapText = () => Object.entries(paths).map(([a, b]) => `${a} -> ${b}`).join("\n") || "(empty)";

async function translatePath(p) {
  if (paths[p]) return paths[p];
  if (!CJK.test(p)) return (paths[p] = p);
  const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
  const dirEn = dir ? await translatePath(dir) : "";
  const name = p.slice(p.lastIndexOf("/") + 1);
  const nameEn = CJK.test(name)
    ? dryRun ? `__EN__${name}` : (await ask(`Translate this file or folder name to English. Keep the extension. Use the glossary. Prefer short names that match how the code refers to them. Existing path map:\n${pathMapText()}\n\nName: ${name}\n\nOutput only the new name.`, 2000)).trim()
    : name;
  return (paths[p] = dirEn ? `${dirEn}/${nameEn}` : nameEn);
}

async function translateFile(p, oldZhPath) {
  const newZh = readFileSync(join(zh, p), "utf8");
  if (!CJK.test(newZh)) return newZh;
  if (dryRun) return newZh;
  const enPath = paths[oldZhPath ?? p];
  const oldEn = enPath && existsSync(join(en, enPath)) ? readFileSync(join(en, enPath), "utf8") : null;
  let oldZh = null;
  if (base && oldEn) { try { oldZh = git("show", `${base}:${oldZhPath ?? p}`); } catch {} }
  const header = `File: ${p}\nPath map (Chinese path -> English path):\n${pathMapText()}\n\n`;
  if (oldZh != null && oldEn != null) {
    return ask(`${header}The Chinese file changed. Update the existing English translation so it matches the new Chinese version. Change only what the Chinese change requires; keep every other line of the English file exactly as it is.\n\n<old_chinese>\n${oldZh}\n</old_chinese>\n\n<new_chinese>\n${newZh}\n</new_chinese>\n\n<old_english>\n${oldEn}\n</old_english>\n\nOutput the full new English file.`);
  }
  return ask(`${header}Translate this file.\n\n<chinese>\n${newZh}\n</chinese>`);
}

// 规则是正则，必须幂等：增量同步时旧英文里已替换过的内容会原样保留，再替换一次不能变
const replaceRules = rules.replace.map(([a, b]) => [new RegExp(a, "g"), b]);
for (const [re, b] of replaceRules) if (b.replace(re, b) !== b) throw new Error(`rules.json: replace rule ${re} is not idempotent`);
const applyReplace = (s) => replaceRules.reduce((t, [re, b]) => t.replace(re, b), s);

// ---- 主流程 ----
const leftovers = [];
const done = [];
for (const c of changes) {
  if (c.status === "D") {
    const target = paths[c.path] ?? c.path;
    if (!dryRun && existsSync(join(en, target))) rmSync(join(en, target));
    delete paths[c.path];
    done.push(`deleted ${target}`);
    continue;
  }
  const target = await translatePath(c.path);
  const buf = gitBuf("show", `${head}:${c.path}`);
  const out = join(en, target);
  if (!dryRun) mkdirSync(dirname(out), { recursive: true });
  const mode = git("ls-tree", head, "--", c.path).startsWith("100755") ? 0o755 : 0o644;
  if (!isText(buf)) { if (!dryRun) { writeFileSync(out, buf); chmodSync(out, mode); } done.push(`copied ${target}`); continue; }
  let text = applyReplace(await translateFile(c.path, c.old));
  if (!text.endsWith("\n") && buf.toString("utf8").endsWith("\n")) text += "\n";
  if (CJK.test(text) && !dryRun) leftovers.push(target);
  if (!dryRun) { writeFileSync(out, text); chmodSync(out, mode); }
  done.push(`${CJK.test(buf.toString("utf8")) ? "translated" : "copied"} ${target}`);
  console.log(done.at(-1));
}

// ---- 英文提交说明 ----
let message = "Sync from upstream";
if (!dryRun && base) {
  const log = git("log", "--format=%s%n%b", `${base}..${head}`).slice(0, 20000);
  message = (await ask(`Write one English git commit message (a short subject line, a blank line, then a few bullet points) summarizing these upstream commits for the English edition of Kiki. Do not mention translation, the Chinese edition or commit hashes.\n\n${log}`, 4000)).trim();
} else if (!base) message = "Initial public release";

if (!dryRun) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(pathsFile, JSON.stringify(paths, null, 2) + "\n");
  writeFileSync(commitFile, head + "\n");
  writeFileSync(join(stateDir, "commit-message.txt"), message + "\n");
  writeFileSync(join(stateDir, "leftovers.txt"), leftovers.join("\n") + (leftovers.length ? "\n" : ""));
}
console.log(`\n${done.length} files processed (${base ? `${base.slice(0, 7)}..${head.slice(0, 7)}` : "full"}), ${leftovers.length} still contain Chinese.`);
if (leftovers.length) console.log(leftovers.map((x) => `  ${x}`).join("\n"));
