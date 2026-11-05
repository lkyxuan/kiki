// 翻译后修测试：源文件和测试文件是分开翻的，断言里的字符串可能和代码对不上。
// 跑英文仓库的测试，把每个失败的测试文件连同失败输出、它引用的源文件交给模型，
// 只改测试里期望的字符串/正则/样例，最多 3 轮。
// 用法：node english/fixtests.mjs --en <英文仓库目录>（英文仓库里要先 npm ci）
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const en = resolve(args.includes("--en") ? args[args.indexOf("--en") + 1] : "en");
const rounds = Number(args.includes("--rounds") ? args[args.indexOf("--rounds") + 1] : 3);
const api = JSON.parse(readFileSync(join(here, "rules.json"), "utf8")).api;

const SYSTEM = `You fix test files in the English edition of the Kiki codebase. The code and its tests were machine-translated from Chinese separately, so some strings asserted in tests no longer match what the code produces. Fix only the test file: change expected strings, regexes and fixtures so they match the code's actual English output. Never change what a test checks, never weaken or delete assertions, never touch non-test code. Reply with JSON only.`;

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

function sources(testFile, text) {
  const out = [];
  for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const rel = join(dirname(testFile), m[1]).replace(/\.js$/, ".ts");
    if (!/\.test\./.test(rel) && existsSync(join(en, rel))) out.push(`<source file="${rel}">\n${readFileSync(join(en, rel), "utf8")}\n</source>`);
  }
  return out.join("\n\n").slice(0, 200000);
}

let lastCount = Infinity;
for (let round = 1; round <= rounds; round++) {
  const fails = failures(runTests());
  const count = [...fails.values()].reduce((n, s) => n + (s.match(/^not ok/gm) || []).length, 0);
  console.log(`round ${round}: ${count} failing tests in ${fails.size} files`);
  if (!count || count >= lastCount) break;
  lastCount = count;
  for (const [file, report] of fails) {
    const path = join(en, file);
    let text = readFileSync(path, "utf8");
    try {
      const raw = await ask(`Test file: ${file}\n\n<failures>\n${report.slice(0, 30000)}\n</failures>\n\n<test_file>\n${text}\n</test_file>\n\n${sources(file, text)}\n\nReturn {"edits": [{"find": "...", "replace": "..."}]}. Each "find" is an exact snippet of the test file that occurs exactly once in it; "replace" is its new text.`);
      let applied = 0;
      for (const { find, replace } of JSON.parse(raw).edits ?? []) {
        if (!find || text.split(find).length !== 2) continue;
        text = text.replace(find, () => replace);
        applied++;
      }
      writeFileSync(path, text);
      console.log(`  ${file}: ${applied} edits`);
    } catch (e) {
      console.log(`  ${file}: skipped (${e.message.slice(0, 120)})`);
    }
  }
}
