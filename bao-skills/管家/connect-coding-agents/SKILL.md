---
name: connect-coding-agents
description: 把用户的 Claude Code、Codex 接到 Kiki，让 Kiki 知道它们在做什么任务、做得怎样（开始、等批准、做完）。用户说“接入/连上 Claude Code、Codex”“让 Kiki 管我的编程任务”时用。
---

# 接入 Claude Code / Codex

原理：给 Claude Code 装几个 hook、给 Codex 配 notify，它们在开始、要批准、一轮做完、关掉时，把一小段 JSON 发给 Kiki。
Kiki 只记状态，显示在右栏，按项目文件夹归到宝下面。脚本只用系统自带的 `sh` 和 `curl`，不用装 Node。

下面的命令都在**跑 Kiki 的这台电脑**上执行。Kiki 的地址是 `http://127.0.0.1:${PORT:-4567}`，下面写作 `$K`：

```sh
K="http://127.0.0.1:${PORT:-4567}"
```

## 1. 先看情况

```sh
curl -s "$K/api/coders/setup"
```

返回里：
- `claude.found` / `codex.found`：这台电脑上有没有 Claude Code（`~/.claude`）、Codex（`~/.codex`）
- `claude.on` / `codex.on`：是不是已经接好了
- `tailscale`：这台电脑的 Tailscale 地址（空数组表示没装或没登录）
- `lastPing`：最近一次收到 hook 的时间

## 2. 本机：直接装

本机有哪个就装哪个，不用问用户（会先备份原配置，只加 Kiki 自己的条目，不碰用户原有的 hook）：

```sh
curl -s -X POST "$K/api/coders/setup" -H 'content-type: application/json' -d '{"target":"claude","on":true}'
curl -s -X POST "$K/api/coders/setup" -H 'content-type: application/json' -d '{"target":"codex","on":true}'
```

装完自检一次（发一条测试消息，不会在界面上留卡片），再看 `lastPing` 有没有更新：

```sh
curl -s -X POST "$K/api/coders/test"
curl -s "$K/api/coders/setup"
```

告诉用户：已经开着的 Claude Code / Codex 会话要重新开一个才生效。

## 3. 另一台电脑上的 Claude Code / Codex

只有用户说 Claude Code 跑在**别的电脑**上时才需要这一步。纯本机用不到 Tailscale，别提它。

- `tailscale` 有地址（比如 `100.123.241.60`）：把下面这行给用户，让他在那台电脑的终端里跑（那台也要登录同一个 Tailscale）：

  ```sh
  curl -sf http://<Tailscale 地址>:${PORT:-4567}/api/coders/install.sh | sh
  ```

  跑完会打印“接好了：Claude Code Codex”。那台电脑上 Kiki 连不上时，进展先存在那边的 `~/.kiki/spool/`，下次连上补发。
- `tailscale` 是空的：告诉用户两台电脑要先装 Tailscale 并登录同一个账号（https://tailscale.com/download），装好后再来找你。

## 4. 撤掉

```sh
curl -s -X POST "$K/api/coders/setup" -H 'content-type: application/json' -d '{"target":"claude","on":false}'
curl -s -X POST "$K/api/coders/setup" -H 'content-type: application/json' -d '{"target":"codex","on":false}'
```

Codex 原来有自己的 notify 的，撤掉时会放回去。

## 出问题时

- 返回里有 `error`：照原话告诉用户，常见的是 `~/.claude/settings.json` 不是合法 JSON，或 `~/.codex/config.toml` 里的 notify 写成了多行。
- 装好了但右栏一直没出现：确认用户是在**新开**的会话里说过话；再看 `lastPing`。
- 某个项目被归错了宝：用户在右栏卡片上可以改投；也可以 `curl -s -X POST "$K/api/coders/bao" -H 'content-type: application/json' -d '{"cwd":"/项目/文件夹","bao":"宝名"}'`。
