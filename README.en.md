<div align="center">

[简体中文](README.md) · **English**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-en-dark.svg">
  <img src="docs/assets/banner-en-light.svg" alt="Kiki · Create the next miracle. Your personal AI assistant, on your own Mac" width="100%">
</picture>

<p><em>创造下一个奇迹</em></p>

<p>
  <a href="https://github.com/lkyxuan/kiki/releases"><img src="https://img.shields.io/github/v/release/lkyxuan/kiki?style=flat-square&color=5b6cf0" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-macOS-000000?style=flat-square&logo=apple&logoColor=white" alt="macOS">
  <img src="https://img.shields.io/badge/data-100%25%20local-5b6cf0?style=flat-square" alt="Local first">
</p>

**Tell Qiqi once, and it hands the job to the right bot. Each bot owns one area of your life, each task gets its own thread, and your data never leaves your Mac.**

[Download](#-download) · [Features](#-features) · [Changelog](#-changelog) · [Feedback](#-feedback)

</div>

---

## 📖 Overview

**Kiki** is a local-first personal AI assistant built for an always-on Mac mini and packaged as a native Mac app.

You only ever talk to **Qiqi** (奇奇), your inbox. Quick questions get answered on the spot. Real work goes to the **bot** (宝, *bao*) that owns that area. A message that mixes several things gets split across several bots, and if no bot fits, Qiqi creates one. Every bot has a **main chat** that coordinates its work and opens **threads** for individual tasks, so contexts never get tangled.

Unlike cloud assistants, Kiki runs on your own computer. You choose the model, conversations are local files, and your "about me" profile and each bot's instructions are plain Markdown. If you ever stop using Kiki, just take the folder with you.

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/screenshot-dark.png">
    <img src="docs/assets/screenshot-light.png" alt="Kiki's four-column layout: bots, a bot's main chat, a thread and the bot's status" width="100%">
  </picture>
  <p><sub>Four columns: Qiqi and your bots on the left, the bot's main chat in the middle, a thread on the right, and the bot's status at the far right. (UI is in Chinese for now.)</sub></p>
</div>

## ✨ Features

| | Feature | Description |
|:---:|---|---|
| 📥 | **Qiqi only dispatches** | Drop in a message and Qiqi picks the bot and the conversation. Simple questions get a direct answer; mixed requests get split up |
| 🤖 | **One bot per area** | Travel, dev, fitness… each bot has an avatar, a main chat and its own instructions. Creating one takes a name and a sentence on what it handles |
| 💬 | **Main chat + threads** | A bot's main chat coordinates; concrete tasks become threads. Conversation cards open in the side column, where you can keep talking |
| ⚡ | **Chat in front, work in back** | Hand real work to the background and get the result back in the original conversation. Tasks queue, can be retried, and survive restarts |
| 🧠 | **Bots that keep track** | Every conversation has a one-line summary. Bots can read other conversations, pass messages between them, and save key facts to "about me" |
| 🛡️ | **Asks before acting** | Four kinds of irreversible actions (permanent deletes, force pushes, sending things out, spending money) need your OK first |
| 🖼️ | **Images and any model** | Paste or drop images. Switch models right from the input box, with API keys or subscription logins (ChatGPT, Claude, GitHub Copilot and more) |
| 🔒 | **Local first** | Listens only on localhost, with encrypted remote access through Tailscale. Conversations are JSONL, notes are Markdown, and deleted items go to a trash folder |
| 🧩 | **Extensible** | Compatible with the pi extension ecosystem; add MCP servers in Settings using the same format as Claude and Cursor |

## 📦 Download

Recommended setup: run Kiki on an always-on Mac mini and use it from your MacBook or iPhone. Requires macOS 13.5 or later.

**Option 1: one line in Terminal**

```bash
curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
```

**Option 2: download the installer**

Grab the `.dmg` from the [releases page](https://github.com/lkyxuan/kiki/releases/latest) (arm64 for Apple silicon, x64 for Intel) and drag Kiki into Applications, then open it **from Applications**. Kiki isn't signed by Apple yet, so the first launch shows an "unverified developer" warning: click Done, then go to System Settings → Privacy & Security, scroll to the bottom and click Open Anyway.

Open Kiki, follow the prompt to add a model key in Settings, and start chatting.

- **Works out of the box**: Kiki.app bundles its own runtime and the Kiki Engine, starts in the background at login, and restarts itself if it crashes.
- **Automatic updates**: checks for new versions every hour, installs when idle, and rolls back automatically if the new version fails to start.
- **Multiple devices**: install Kiki.app on another Mac and choose "connect to a remote address" to use it as a front end only; on iPhone, add it to your Home Screen from Safari.
- **Secure remote access**: Kiki listens only on localhost. Remote access goes through an encrypted [Tailscale](https://tailscale.com) connection, so only your own devices can reach it.

## 📝 Changelog

What changed in each version is on the [Releases](https://github.com/lkyxuan/kiki/releases) page. Kiki updates itself, and after an update the app shows the notes for that version.

## 💬 Feedback

Found a bug or want a feature? Open an [issue](https://github.com/lkyxuan/kiki/issues).

## 📄 About the source code

This repository is only for releases and feedback. Kiki's source code is no longer published here.

Code that was published here earlier stays under the license it was released with (MIT or FSL-1.1-ALv2) and is still in the commit history.

"Kiki", "奇奇" and the Kiki icon are trademarks. Signed and notarized Kiki installers are published only by us.
