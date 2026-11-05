// 翻译后修测试：源文件和测试文件是分开翻的，断言里的字符串可能和代码对不上。
// 跑英文仓库的测试，把每个失败的测试文件连同失败输出、它引用的源文件交给模型，
// 同时附上对应的中文原文（中文版测试是通过的）作参考。优先改测试；只有源文件之间自己对不上
// （比如一个文件发出的标记、另一个文件去匹配）才改源文件。最多 5 轮。
// 用法：node english/fixtests.mjs --en <英文仓库目录>（英文仓库里要先 npm ci）
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const en = resolve(args.includes("--en") ? args[args.indexOf("--en") + 1] : "en");
const rounds = Number(args.includes("--rounds") ? args[args.indexOf("--rounds") + 1] : 5);
const zh = resolve(args.includes("--zh") ? args[args.indexOf("--zh") + 1] : join(here, ".."));
const api = JSON.parse(readFileSync(join(here, "rules.json"), "utf8")).api;

const SYSTEM = `You fix the English edition of the Kiki codebase after machine translation. The code and its tests were translated from Chinese file by file, so strings that must agree across files can drift apart: a string asserted in a test vs. what the code outputs, a marker one source file emits vs. the regex another source file matches, an input format a parser accepts vs. the sample a test feeds it. The Chinese originals are given for reference: they pass all tests, so they show which strings must be identical. Fix the English so the strings agree again. Prefer editing the test file; edit a source file only when the sources disagree with each other or with the Chinese original's behavior. Never change what a test checks, never weaken or delete assertions, never add Chinese to English user-facing text. Reply with JSON only.`;

async function ask(user) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${api.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env[api.keyEnv]}` },
        body: JSON.stringify({
          model: api.model, max_tokens: api.maxOutputTokens, temperature: 0,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return (await res.json()).choices[0].message.content;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

function runTests() {
  const r = spawnSync("npm", ["test", "--silent", "--", "--test-reporter=tap"], { cwd: en, encoding: "utf8", maxBuffer: 1 << 28 });
  return (r.stdout || "") + (r.stderr || "");
}

// TAP 输出里按测试文件归类失败块
function failures(out) {
  const byFile = new Map();
  const blocks = out.split(/\n(?=(?:not )?ok \d+ )/).filter((b) => b.startsWith("not ok"));
  for (const b of blocks) {
    const m = b.match(/location: '([^']+?):\d+:\d+'/);
    if (!m) continue;
    const file = relative(en, m[1]);
    byFile.set(file, (byFile.get(file) ?? "") + b.slice(0, 4000) + "\n");
  }
  return byFile;
}

// 测试文件引用的源文件（英文版和中文原文）
function related(testFile, text) {
  const files = [];
  for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const rel = join(dirname(testFile), m[1]).replace(/\.js$/, ".ts");
    if (!/\.test\./.test(rel) && existsSync(join(en, rel)) && !files.includes(rel)) files.push(rel);
  }
  return files;
}
const zhOf = (rel) => (existsSync(join(zh, rel)) ? readFileSync(join(zh, rel), "utf8") : "");

// 每轮改动前的原文；改完失败数没降就退回去，不会越修越坏
let lastCount = Infinity;
let undo = new Map();
for (let round = 1; round <= rounds + 1; round++) {
  const fails = failures(runTests());
  const count = [...fails.values()].reduce((n, s) => n + (s.match(/^not ok/gm) || []).length, 0);
  console.log(`round ${round}: ${count} failing tests in ${fails.size} files`);
  if (count >= lastCount) {
    for (const [f, t] of undo) writeFileSync(join(en, f), t);
    console.log(`  no better than before, reverted ${undo.size} files`);
    break;
  }
  if (!count || round > rounds) break;
  lastCount = count;
  undo = new Map();
  for (const [file, report] of fails) {
    const text = readFileSync(join(en, file), "utf8");
    const srcs = related(file, text);
    let budget = 220000;
    const parts = [];
    for (const rel of [file, ...srcs]) {
      const en_ = readFileSync(join(en, rel), "utf8");
      const zh_ = zhOf(rel);
      if (rel !== file && en_.length + zh_.length > budget) continue;
      budget -= en_.length + zh_.length;
      parts.push(`<english file="${rel}">\n${en_}\n</english>` + (zh_ ? `\n<chinese_original file="${rel}">\n${zh_}\n</chinese_original>` : ""));
    }
    try {
      const raw = await ask(`Failing test file: ${file}\n\n<failures>\n${report.slice(0, 30000)}\n</failures>\n\n${parts.join("\n\n")}\n\nReturn {"edits": [{"file": "...", "find": "...", "replace": "..."}]}. "file" is one of the English files above; "find" is an exact snippet that occurs exactly once in that file; "replace" is its new text.`);
      const changed = new Map();
      let applied = 0;
      for (const { file: f = file, find, replace } of JSON.parse(raw).edits ?? []) {
        if (![file, ...srcs].includes(f) || !find) continue;
        const cur = changed.get(f) ?? readFileSync(join(en, f), "utf8");
        if (cur.split(find).length !== 2) continue;
        changed.set(f, cur.replace(find, () => replace));
        applied++;
      }
      for (const [f, t] of changed) {
        if (!undo.has(f)) undo.set(f, readFileSync(join(en, f), "utf8"));
        writeFileSync(join(en, f), t);
      }
      console.log(`  ${file}: ${applied} edits${changed.size > 1 || (changed.size && !changed.has(file)) ? ` (in ${[...changed.keys()].join(", ")})` : ""}`);
    } catch (e) {
      console.log(`  ${file}: skipped (${e.message.slice(0, 120)})`);
    }
  }
}
