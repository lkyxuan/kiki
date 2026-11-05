# 英文版是怎么来的

Kiki 有两个独立产品：这个仓库是中文版，[英文版](https://github.com/lkyxuan/kiki-agent)是从这里自动翻译出来的全英文 App。两边代码逻辑完全一样，只是所有文字（界面、提示词、注释、文档、文件名、提交说明）都是英文。

**只在中文仓库开发。** 英文仓库由机器人生成，不要直接在上面改，改了也会被下一次同步覆盖。

## 流程

1. 中文仓库每合并一次到 main，`.github/workflows/english-sync.yml` 就运行。
2. `english/sync.mjs` 找出上次同步之后改过的文件，对每个文件把“中文旧版、中文新版、英文旧版”交给模型（默认 DeepSeek），让它只改对应的英文部分。新文件按块整份翻译，图片等二进制文件原样复制。
3. 英文仓库跑 `npm run check && npm test`。通过且没有残留中文，就直接推到英文仓库 main，提交说明是英文写的一条总结；否则推到 `sync/<提交号>` 分支并开 PR 等人看。

英文仓库的 `.translation/` 记着同步状态：`source-commit` 是同步到的中文提交，`paths.json` 是中文文件名到英文文件名的对照。

## 改什么在哪

- `glossary.md`：术语表（奇奇→Kiki、宝→bot、收发室→Mailroom……）。改了以后，手动运行一次工作流并勾上“从头整份重翻”。
- `rules.json`：翻译用的模型（任何 OpenAI 兼容接口）、英文仓库地址、不进英文版的文件、翻译后的字面替换（英文版用独立的 App ID `com.lkyxuan.kiki.en` 和数据目录 `~/Kiki`，所以两个版本能装在同一台 Mac 上）。

## 第一次启用

1. 在 GitHub 建好英文仓库（空的就行）。
2. 建一个 Fine-grained 令牌，只选英文仓库，权限给 Contents、Pull requests、Workflows 读写（英文仓库也有 .github/workflows，没有 Workflows 权限推不上去）。在中文仓库加 Secrets：`DEEPSEEK_API_KEY`（就是 Kiki 现在用的 DeepSeek 密钥）、`KIKI_EN_TOKEN`；加 Variable：`KIKI_EN_ENABLED=true`。
3. Actions 里手动运行 english-sync，勾上“从头整份重翻”。
4. 英文仓库要自己发版的话，也要配上签名公证那 5 个 Secrets（见 docs/signing.md）。

本地试跑：`npm ci --prefix english && node english/sync.mjs --en ../kiki-agent --dry-run`（只列出要处理的文件，不调用模型）。
