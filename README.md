<div align="center">

**简体中文** · [English](README.en.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img src="docs/assets/banner-light.svg" alt="Kiki 奇奇 · 创造下一个奇迹：跑在你自己 Mac 上的个人 AI 团队" width="100%">
</picture>

<h3>你的个人 AI 团队</h3>

<p>交代目标，Kiki 负责拆解、分派与跟进。<br>
多个智能体同时推进，结果统一交付给你。</p>

<p>
  <a href="https://github.com/lkyxuan/kiki/releases/latest"><img src="https://img.shields.io/github/v/release/lkyxuan/kiki?style=flat-square&color=5b6cf0&label=release" alt="最新版本"></a>
  <img src="https://img.shields.io/badge/macOS-13.5%2B-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS 13.5 及以上">
  <img src="https://img.shields.io/badge/Apple%20silicon%20%2B%20Intel-supported-5b6cf0?style=flat-square" alt="支持 Apple 芯片与 Intel">
  <img src="https://img.shields.io/badge/data-100%25%20local-5b6cf0?style=flat-square" alt="数据留在本地">
  <img src="https://img.shields.io/badge/status-private%20beta-f5a524?style=flat-square" alt="内测中">
</p>

<p>
  <a href="https://dl.kikibao.com/latest/Kiki-mac-arm64.dmg"><b>下载 Mac 版（Apple 芯片）</b></a> ·
  <a href="https://dl.kikibao.com/latest/Kiki-mac-x64.dmg">Intel 版</a> ·
  <a href="https://kikibao.com">官网 kikibao.com</a>
</p>

</div>

---

## Kiki 是什么

Kiki（奇奇）是运行在 Mac 上的个人 AI 团队。你交代目标，Kiki 拆分任务，调度多个智能体并行完成，结果统一交付给你。在 Kiki 里，每个智能体叫一个“宝”，各管一摊事。

聊天助手一次回答一个问题。Kiki 面向完整的任务：自动拆解、多线并行、后台持续运行，只在做完、需要你确认或出错时才提醒你，其余时间安心做自己的事。

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-dark.png">
    <img src="docs/assets/screenshot-light.png" alt="Kiki 界面：左边是你的宝，中间是宝的主对话，右边是讨论串和这个宝的情况" width="100%">
  </picture>
  <p><sub>左边是奇奇和你的宝，中间是宝的主对话，右边是讨论串和这个宝的情况。</sub></p>
</div>

## 为什么选择 Kiki

<table>
<tr>
<td width="33%" valign="top">

**🎯 交代目标，而不是步骤**

无需编写提示词。像对同事交代工作一样说清楚要什么，Kiki 自动找对的宝，每个宝有自己的专长、记忆和工作规则。

</td>
<td width="33%" valign="top">

**🧵 一个目标，多线并行**

复杂任务被拆分给不同专长的宝，同时推进，统一汇总。

</td>
<td width="33%" valign="top">

**🌙 持续运行，按时交付**

长任务在后台持续执行，定时任务按计划自动运行。每天一份简报，汇总进展与待决事项。

</td>
</tr>
<tr>
<td valign="top">

**🛡️ 最终决定权在你**

默认全自动。花钱、对外发送、删除这几类操作，每一类都能设成“先问你”。删除、覆盖前自动备份，按月设预算上限，超出即暂停征求确认。

</td>
<td valign="top">

**🧠 越用越懂你**

每一次修改都会被记录，每天夜里复盘。反复出现的问题自动沉淀为所有宝共同遵循的规则，每条都附带原因与出处。

</td>
<td valign="top">

**🔒 数据留在本地**

对话、记忆与配置以 Markdown 文件保存在你的 Mac 上，随时查看、备份或迁移。模型密钥仅存于本机，不经过任何服务器。

</td>
</tr>
</table>

### 试着这样说

> 筹备下周三的产品发布会
>
> 每天 8:00 生成 AI 行业简报
>
> 修复登录模块的缺陷并提交 PR
>
> 比价订好下周去东京的机票和酒店

## 和你已经在用的 AI 工具一起工作

- **Claude Code、Codex、Gemini 等。** 本机的编程会话自动出现在 Kiki 的总览里，做完、需要你确认或出错时提醒你，点一下回到原来的对话。
- **主流模型服务商都能接。** DeepSeek、Kimi、通义千问、Anthropic、OpenAI、Gemini 等填密钥就能用，也可以用你已有的订阅登录。
- **按用途配置模型。** 调度、编程、写作、视觉、摘要分别选模型，便宜的活交给便宜的模型。

## 每个宝，选自己的内核

同一个 Kiki 里，有的宝跑轻快的 Kiki 内核，有的直接跑 Claude Code。按宝单独切换，切换前列出影响，由你决定。调度始终由 Kiki 负责。

| 内核 | 状态 | 适合 |
|---|---|---|
| **Kiki 内核** | 默认 | 启动快、能装扩展，DeepSeek、Kimi、通义千问等主流模型都能接。基于开源 pi 打造。 |
| **Claude Code** | 已支持 | 编程与长任务。宝直接运行真正的 Claude Code，用你自己的 Claude 订阅，和你在终端里用的一模一样。 |
| **DeepSeek Harness** | 已支持 | DeepSeek 官方智能体框架。兼容 DSH 插件，带界面的插件直接在 Kiki 侧栏里打开。 |

更多内核陆续接入。

## 开始使用

Kiki Mac 版正在内测。需要 macOS 13.5 及以上，支持 Apple 芯片与 Intel 处理器。

1. **安装**：下载 [Apple 芯片版](https://dl.kikibao.com/latest/Kiki-mac-arm64.dmg) 或 [Intel 版](https://dl.kikibao.com/latest/Kiki-mac-x64.dmg)（[发布页](https://github.com/lkyxuan/kiki/releases/latest) 也有），把 Kiki 拖进「应用程序」，从「应用程序」里打开。
2. **填邀请码**：内测名额分批开放，第一次打开 Kiki 时输入邀请码。
3. **配置模型**：填入任一模型服务商的密钥，或用订阅登录。
4. **交代目标**：其余交给 Kiki。

也可以在终端里一行安装最新版：

```bash
curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
```

Kiki 会自己更新：每小时查一次新版本，空闲时安装，新版起不来就自动回滚。想让它一直在线，可以装在常开的 Mac mini 上，其他设备通过 [Tailscale](https://tailscale.com) 加密连接来用。

> 第一次打开如果提示“无法验证开发者”：点「完成」，到「系统设置 → 隐私与安全性」拉到最下面点「仍要打开」。

## 费用

模型费用由你自己的模型服务商账号直接结算，Kiki 不经手。以 DeepSeek 为例，日常使用每月花费很低。

## 更新日志

每个版本改了什么，写在 [Releases](https://github.com/lkyxuan/kiki/releases) 里。更新后在 App 里也能看到这一版的更新日志。

## 反馈

遇到问题或者想要什么功能，到 [Issues](https://github.com/lkyxuan/kiki/issues) 提，每一条我们都会看。

---

<sub>这个仓库用来发布 Kiki 安装包和收集反馈。Kiki 不开放源代码；之前在这里公开过的代码仍按当时的许可证使用，可以在提交历史里找到。“Kiki”“奇奇”名称和 Kiki 图标是商标，经过签名的 Kiki 安装包只由官方发布。文中提到的产品名称与标志归各自所有者，仅用于说明 Kiki 可接入的产品。</sub>
