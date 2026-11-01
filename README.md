# Kiki（奇奇）

基于 [pi](https://github.com/badlogic/pi-mono) 的个人助理路由器。主路由只做两件事：把一句话接到对的对话里，把结果送回来。具体的活都由各个 agent 的对话去干。

## v0 能做什么

在 Telegram 里：

| 命令 | 作用 |
|---|---|
| 直接说话 | 接进当前对话；还没选过就进 `life/默认` |
| `/new <agent> <名字>` | 在某个 agent 下新开一段具名对话，并切过去 |
| `/use <名字>` | 切到已有对话（重名时写 `agent/名字`） |
| `/list [agent]` | 列出对话，👉 是当前，⏳ 是正在跑 |
| `/bg <任务>` | 在当前 agent 下新开一段后台对话去做，马上回你，做完把结果推回来 |
| `/agents`、`/where`、`/help` | 看有哪些 agent、当前在哪、帮助 |

还没做（按计划往后排）：便宜模型自动路由（第一层自动化）、微信适配器、定时任务。

## 数据在哪

全部是本地普通文件，换掉路由器也不丢：

```
~/kiki-data/
  AGENTS.md              关于我：所有 agent 共享（pi 会从 agent 目录向上自动读到）
  registry.json          对话名册：有哪些具名对话、每个聊天当前接在哪
  agents/
    dev/AGENTS.md        dev 的说明：负责什么、怎么干、交回什么
    dev/sessions/*.jsonl 对话记录（pi 原生格式，也能用 pi --session <文件> 在终端里接着聊）
    life/...
```

加一个 agent 就是在 `agents/` 下建个文件夹、写一份 `AGENTS.md`，不用重启。

## 在 Mac mini 上跑起来

需要 Node.js 20.6 以上（`node -v` 看一下，没有就 `brew install node`）。

```bash
git clone https://github.com/lkyxuan/kiki.git ~/kiki
cd ~/kiki
npm install
cp .env.example .env     # 然后编辑 .env，填三样：
                         #   TELEGRAM_BOT_TOKEN（找 @BotFather 新建一个机器人）
                         #   DEEPSEEK_API_KEY
                         #   TELEGRAM_ALLOWED_CHATS（先空着，见下一步）
npm start
```

第一次启动会建好 `~/kiki-data`。给机器人发一句话，终端里会打印“忽略未授权的聊天 12345…”，把这个数字填进 `TELEGRAM_ALLOWED_CHATS`，重启 `npm start` 就能聊了。

想单独用 pi 的终端界面：`npm install -g @mariozechner/pi-coding-agent`，然后 `pi`。

## 注意

- agent 用的是 pi 自带的工具（读写文件、跑命令），工作目录是各自的 agent 文件夹。它在你的 Mac mini 上有真权限，所以 `TELEGRAM_ALLOWED_CHATS` 一定要填。
- 同一段对话里的消息按顺序排队；不同对话之间互不阻塞。
- 路由器重启后，正在跑的后台任务会中断（对话记录还在，可以 `/use` 进去让它接着做）。

## 代码结构

```
src/main.ts               读配置，把通道、路由器、pi 接起来
src/router.ts             命令解析和分派（不碰模型）
src/registry.ts           对话名册
src/agents.ts             pi 这一层：开对话、续对话、发消息拿回答
src/channels/channel.ts   通道接口
src/channels/telegram.ts  Telegram 适配器（长轮询，无第三方库）
```

`npm test` 跑路由逻辑的测试，`npm run check` 做类型检查。
