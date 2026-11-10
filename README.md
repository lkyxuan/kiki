<div align="center">

**简体中文** · [English](README.en.md)

<br>

<a href="https://kikibao.com"><img src="docs/assets/readme/cn-hero.png" alt="Kiki：你的个人 AI 团队。交代目标，Kiki 负责拆解、分派与跟进。多个智能体同时推进，结果统一交付给你。" width="100%"></a>

<br><br>

<a href="https://dl.kikibao.com/latest/Kiki-mac-arm64.dmg"><img src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD%20Mac%20%E7%89%88-Apple%20%E8%8A%AF%E7%89%87-ffffff?style=for-the-badge&logo=apple&logoColor=000000&labelColor=ffffff&color=5b6cf0" alt="下载 Mac 版（Apple 芯片）" height="36"></a>
&nbsp;
<a href="https://dl.kikibao.com/latest/Kiki-mac-x64.dmg"><img src="https://img.shields.io/badge/Intel%20%E7%89%88-1d1e26?style=for-the-badge&logo=apple&logoColor=ffffff" alt="Intel 版" height="36"></a>

<p>
  <a href="https://github.com/lkyxuan/kiki/releases/latest"><img src="https://img.shields.io/github/v/release/lkyxuan/kiki?style=flat-square&color=5b6cf0&label=release" alt="最新版本"></a>
  <img src="https://img.shields.io/badge/macOS-13.5%2B-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS 13.5 及以上">
  <img src="https://img.shields.io/badge/status-private%20beta-f5a524?style=flat-square" alt="内测中">
  <a href="https://kikibao.com"><img src="https://img.shields.io/badge/%E5%AE%98%E7%BD%91-kikibao.com-1d1e26?style=flat-square" alt="官网 kikibao.com"></a>
</p>

</div>

<br>

<p align="center"><img src="docs/assets/readme/cn-integrations.png" alt="和你已经在用的 AI 工具一起工作：Claude Code、Codex、Gemini、Cursor、Grok Bot 等。支持主流模型服务商，也可以用你已有的订阅登录。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-goals.png" alt="交代目标，而不是步骤。无需编写提示词。Kiki 理解你的目标，拆分任务，选择合适的智能体并行执行。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-parallel.png" alt="一个目标，多线并行。复杂任务被拆分给不同专长的智能体，同时推进，统一汇总。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-always-on.png" alt="持续运行，按时交付。长任务在后台持续执行，定时任务按计划自动运行。每天一份简报，汇总进展与待决事项。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-control.png" alt="最终决定权在你。花钱、对外发送、删除这类操作，每一类都能设成先问你。操作可撤回、预算上限、按类设定先问。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-learning.png" alt="越用，越懂你的工作方式。每一次修改都会被记录和复盘，反复出现的问题自动沉淀为所有智能体共同遵循的规则。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-engines.png" alt="每个智能体，选自己的内核：Kiki 内核（默认）、Claude Code、DeepSeek Harness。调度始终由 Kiki 负责。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-models.png" alt="模型自由选择，数据留在本地。按用途分别配置模型，对话与记忆以 Markdown 保存在你的 Mac 上，密钥不经过任何服务器。" width="100%"></p>

<p align="center"><img src="docs/assets/readme/cn-why.png" alt="一个人，也能像一支团队：省下盯进度的时间、一处掌握全局、不被任何一家绑住。" width="100%"></p>

<p align="center"><a href="https://dl.kikibao.com/latest/Kiki-mac-arm64.dmg"><img src="docs/assets/readme/cn-start.png" alt="创造下一个奇迹。Kiki for Mac 现已开放内测。安装、配置模型、交代目标。" width="100%"></a></p>

## 开始使用

1. **安装**：下载 [Apple 芯片版](https://dl.kikibao.com/latest/Kiki-mac-arm64.dmg) 或 [Intel 版](https://dl.kikibao.com/latest/Kiki-mac-x64.dmg)，把 Kiki 拖进「应用程序」，从「应用程序」里打开。需要 macOS 13.5 及以上。
2. **填邀请码**：内测名额分批开放，第一次打开时输入邀请码。
3. **配置模型**：填入任一模型服务商的密钥，或用订阅登录。
4. **交代目标**：其余交给 Kiki。

也可以在终端里一行安装最新版：

```bash
curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
```

Kiki 会自己更新，新版起不来会自动回滚。第一次打开如果提示“无法验证开发者”，到「系统设置 → 隐私与安全性」点「仍要打开」。

## 常见问题

**费用怎么计算？** 模型费用由你自己的模型服务商账号直接结算，Kiki 不经手。以 DeepSeek 为例，日常使用每月花费很低。

**我的数据存在哪里？** 对话、记忆与配置以 Markdown 文件保存在你的 Mac 上，模型密钥仅存于本机。

**能和 Claude Code、Codex 一起用吗？** 可以。本机的会话会自动出现在 Kiki 的总览里，做完、需要你确认或出错时提醒你。

更多问题见 [官网](https://kikibao.com/#faq)。

## 更新日志与反馈

每个版本改了什么，写在 [Releases](https://github.com/lkyxuan/kiki/releases) 里。遇到问题或者想要什么功能，到 [Issues](https://github.com/lkyxuan/kiki/issues) 提。

---

<sub>这个仓库用来发布 Kiki 安装包和收集反馈。Kiki 不开放源代码；之前在这里公开过的代码仍按当时的许可证使用，可以在提交历史里找到。“Kiki”“奇奇”名称和 Kiki 图标是商标，经过签名的 Kiki 安装包只由官方发布。图中出现的产品名称与标志归各自所有者，仅用于说明 Kiki 可接入的产品。</sub>
