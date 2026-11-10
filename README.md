<div align="center">

**简体中文** · [English](README.en.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img src="docs/assets/banner-light.svg" alt="Kiki 奇奇 · 创造下一个奇迹：跑在你自己 Mac 上的个人 AI 助理" width="100%">
</picture>

<p><em>Create the next miracle.</em></p>

<p>
  <a href="https://github.com/lkyxuan/kiki/releases"><img src="https://img.shields.io/github/v/release/lkyxuan/kiki?style=flat-square&color=5b6cf0" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-macOS-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/data-100%25%20local-5b6cf0?style=flat-square" alt="Local first">
</p>

**跟奇奇说一句，它替你分给对的宝。每个宝管一摊事，每件事一段对话。数据永远留在你自己的电脑上。**

[下载安装](#-下载安装) · [核心特性](#-核心特性) · [更新日志](#-更新日志) · [反馈](#-反馈)

</div>

---

## 📖 简介

**Kiki（奇奇）** 是一个本地优先的个人 AI 助理，专为常开的 Mac mini 设计，打包成原生 Mac App。

你只需要跟**奇奇**说话。奇奇是你的收件箱：一句话能答完的直接回答；需要干活的，交给负责那摊事的**宝**；一段话里有好几件事，就拆开分给几个宝；没有合适的宝，就新建一个。每个宝有一段**主对话**，负责统筹，具体的事再开成**讨论串**，互不干扰。

和云端助理不同，Kiki 跑在你自己的电脑上：模型随你选，对话记录是本地文件，"关于我"和每个宝的说明都是普通 Markdown。哪天不想用 Kiki 了，带走文件夹就行。

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-dark.png">
    <img src="docs/assets/screenshot-light.png" alt="Kiki 四栏界面：宝列表、宝的主对话、讨论串、这个宝的情况" width="100%">
  </picture>
  <p><sub>四栏界面：左边是奇奇和你的宝，中间是宝的主对话，右边打开讨论串，最右边是这个宝的情况。</sub></p>
</div>

## ✨ 核心特性

| | 特性 | 说明 |
|:---:|---|---|
| 📥 | **奇奇只做分派** | 随手丢一句话，奇奇判断交给哪个宝、接进哪段对话；简单问题直接答，一段话里几件事就拆开分 |
| 🤖 | **宝 = 一摊事** | 旅行、开发、健身……每个宝自带头像、主对话和说明，新建一个只要填名字和"负责什么" |
| 💬 | **主对话 + 讨论串** | 宝的主对话负责统筹，具体的事开成讨论串；对话里的卡片点开就在右栏看，还能接着说 |
| ⚡ | **前台聊，后台干** | 真要干活就丢到后台，做完回报到原对话；任务可排队、可重跑，重启不丢 |
| 🧠 | **会记事的宝** | 每段对话有一句话摘要；宝能看别的对话、给别的对话捎话，把要紧的事记进"关于我" |
| 🛡️ | **先问再动手** | 永久删除、强推、对外发送、花钱这四类收不回来的动作，做之前先问你一句 |
| 🖼️ | **看图、换模型** | 直接粘贴或拖进图片；输入框旁一键换模型，支持各家 API 密钥和订阅登录（ChatGPT、Claude、GitHub Copilot 等） |
| 🔒 | **本地优先** | 只监听本机，远程通过 Tailscale 加密访问；对话是 JSONL、资料是 Markdown，删掉的进回收站 |
| 🧩 | **可扩展** | 兼容 pi 扩展生态，设置里可加 MCP 服务器，格式和 Claude、Cursor 一样 |

## 📦 下载安装

推荐用法：Kiki 装在常开的 Mac mini 上，你在 MacBook、iPhone 上远程用。需要 macOS 13.5 或以上。

**方式一：终端一行安装**

```bash
curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
```

**方式二：下载安装包**

到 [发布页](https://github.com/lkyxuan/kiki/releases/latest) 下载 `.dmg`（Apple 芯片选 arm64，Intel 选 x64），把 Kiki 拖进「应用程序」，**从「应用程序」里**打开。Kiki 还没有苹果签名，第一次打开会提示无法验证开发者：点「完成」，到「系统设置 → 隐私与安全性」拉到最下面点「仍要打开」。

装好后打开 Kiki，按引导在设置里填一个模型密钥就能开始聊。

- **开箱即用**：Kiki.app 自带运行环境和 Kiki 内核，登录后自动在后台启动，崩溃自动拉起。
- **自动更新**：每小时查一次新版本，空闲时自动安装，起不来就自动回滚。
- **多台设备**：其他 Mac 上装个 Kiki.app 选"连接远程地址"，只当界面用；iPhone 用浏览器加到主屏幕。
- **安全远程**：Kiki 只监听本机，远程通过 [Tailscale](https://tailscale.com) 加密连接，只有你自己的设备能连上。

## 📝 更新日志

每个版本改了什么，写在 [Releases](https://github.com/lkyxuan/kiki/releases) 里。已装的 Kiki 会自己更新，更新后在 App 里也能看到这一版的更新日志。

## 💬 反馈

遇到问题或者想要什么功能，到 [Issues](https://github.com/lkyxuan/kiki/issues) 提。

## 📄 关于源代码

这个仓库只用来发布安装包和收反馈，不再放 Kiki 的源代码。

之前在这里公开过的代码，仍然按当时的许可证（MIT 或 FSL-1.1-ALv2）使用，可以在提交历史里找到。

“Kiki”“奇奇”名称和 Kiki 图标是商标。经过签名和公证的 Kiki 安装包只由官方发布。
