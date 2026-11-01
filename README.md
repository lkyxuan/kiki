# Kiki（奇奇）

跑在自己 Mac mini 上的开源个人助理，思路类似 Grok Bot：一个主 bot 当收件箱，下面挂几个分 bot，每个分 bot 里有多段具名对话。底座是 [pi](https://pi.dev)。

第一步是一个本机聊天网页，之后再包成 Mac App。

## 三层结构

```
主 bot（收件箱 + 路由）
 ├─ dev（分 bot）
 │   ├─ 对话「Kiki 开发」
 │   └─ 对话「Mac mini 维护」
 └─ life（分 bot）
     ├─ 对话「默认」
     └─ 对话「旅行计划」
```

- **主 bot**：做得很薄。你随手丢一句话进来，它只判断该接进哪段已有对话，还是在哪个分 bot 下新开一段，然后把结果转回给你。它自己不干活。
- **分 bot**：`~/kiki-data/agents/` 下的一个文件夹，里面一份 `AGENTS.md` 写清楚它负责什么、怎么干、交回什么。加一个分 bot 就是加一个文件夹。
- **对话**：分 bot 下的具名 session，存成 pi 原生的 JSONL 文件。讨论就在对话里直接聊，真要干活可以丢到后台去做，做完把结果送回来。

## 原则

- **数据是你的**：关于我、各 bot 的说明、笔记都是本地 Markdown，对话是 JSONL。换掉 Kiki 也不丢。
- **Kiki 只是外壳**：编排层可以随时换，不绑定任何一家的模型或服务。
- **够用就好**：先把本机聊天跑顺，不提前做用不上的东西。

## 数据目录

```
~/kiki-data/
  AGENTS.md                 关于我：所有 bot 共享（pi 会从 bot 目录向上自动读到）
  registry.json             对话名册：有哪些具名对话、各在哪个 bot 下
  main.jsonl                主 bot 的收件记录
  agents/
    dev/AGENTS.md           dev 的说明
    dev/sessions/*.jsonl    dev 的对话记录（也能用 pi --session <文件> 在终端里接着聊）
    life/...
```

第一次启动会从 `data-template/` 拷一份过去，记得先改 `AGENTS.md`（关于我）。

## 在 Mac mini 上跑起来

需要 Node.js 22.19 以上（`node -v` 看一下，不够就 `brew install node`）。

```bash
git clone https://github.com/lkyxuan/kiki.git ~/kiki
cd ~/kiki
npm install
cp .env.example .env     # 编辑 .env，填上模型的 API key
npm start
```

然后打开 <http://localhost:4567>。左边是主 bot 和各分 bot 的对话列表，右边聊天，回答流式输出。网页只监听 127.0.0.1，不对外开放。

`.env` 里能改的：

| 变量 | 默认 | 作用 |
|---|---|---|
| `DEEPSEEK_API_KEY` | | 模型的 key |
| `MODEL` | `deepseek/deepseek-v4-flash` | 格式 `provider/model`，pi 支持的都行 |
| `DATA_DIR` | `~/kiki-data` | 数据目录 |
| `DEFAULT_AGENT` | `life` | 没选对话时直接说话，落到哪个分 bot |
| `PORT` | `4567` | 网页端口 |

## 在主 bot 里怎么用

| 命令 | 作用 |
|---|---|
| 直接说话 | 接进当前对话 |
| `/new <bot> <名字>` | 在某个分 bot 下新开一段具名对话，并切过去 |
| `/use <名字>` | 切到已有对话（重名时写 `bot/名字`） |
| `/list [bot]` | 列出对话 |
| `/bg <任务>` | 在当前分 bot 下开一段后台对话去做，做完把结果送回来 |
| `/agents`、`/where`、`/help` | 看有哪些分 bot、当前在哪、帮助 |

现在主 bot 靠命令路由，以后再加“用便宜模型自动判断该接哪段对话”。

## 推荐的 pi 扩展

- [pi-web-access](https://www.npmjs.com/package/pi-web-access)：让 bot 能上网搜索、读网页。安装：`pi install npm:pi-web-access`。
- [cc-safety-net](https://ccsafetynet.com/docs/installation/pi)：拦住 `rm -rf` 这类危险命令和读密钥文件，按链接里的 pi 安装说明装。

`pi install` 要先装 pi 的命令行：`npm install -g @earendil-works/pi-coding-agent`（装好后也能直接敲 `pi` 用终端界面）。

bot 用的是 pi 自带的工具（读写文件、跑命令），在你的 Mac mini 上有真权限，第二个建议装。

## 路线

1. **本机聊天网页**（进行中）：主 bot、分 bot、具名对话、后台任务回报。
2. **Mac App**：把网页包成原生 App。
3. **消息通道插件**：微信等社交渠道做成插件接口，按需接入。

## 代码结构

```
src/main.ts       入口：读配置，把网页、路由、pi 接起来
src/server.ts     本机网页和 API；以后接别的通道也从这里接，通道只需调 router.handle(chatId, text, reply)
src/router.ts     主 bot：命令解析和分派（不碰模型）
src/registry.ts   对话名册
src/agents.ts     pi 这一层：建对话、续对话、流式事件、读历史
public/index.html 聊天网页
```

`npm test` 跑测试，`npm run check` 做类型检查。底座是 [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) 1.4。
