# 收发室

收发室是 Kiki 后台自带的常驻模块，负责一件事：**所有要告诉你的东西都先进同一个收件箱，再由奇奇分派。**

```
来源（进）                              收件箱                     出
───────────                            ───────                   ──
外部 agent 推过来（信箱、A2A、ACP）  ┐
定时检查（网页、RSS、接口、文件夹）  ├─► postroom/inbox.jsonl ─► 奇奇分派给宝 ─► 通知通道（现在：Kiki 界面）
Kiki 内部（后台任务、定时任务）      ┘                         └► 只通知（route: false）
```

- **收件箱**：`~/kiki-data/postroom/inbox.jsonl`，一条一行，先落盘再分派，重启不丢。
- **派出去的活**：`postroom/outbox.jsonl`。对方回复时带上派活编号（`re`），结果直接回到派活的那段对话。
- **通知通道**和收件箱分开（`src/notify.ts`）。现在只有 Kiki 界面这一种，以后 Telegram、微信、手机推送写成插件挂上去就行。
- 需要你看的事（对方出错、对方标了要看、分派失败）显示在最右一列的「收发室」卡片里。

## 及时：推来的马上处理，规则先分拣

- 推送类的来源一到就处理，不等每分钟巡视：信箱文件夹里一放进文件就收；本机程序可以直接 `POST /api/postroom/push/<来源名>`，body 写 `{"title", "text", "attention", "bao", "re"}`；ACP 做完立刻交回；A2A 配置里写了 `pushUrl`（对方能访问到的 Kiki 地址）时，对方做完会推过来。定时检查的来源才按间隔去拉。
- 先按规则快速分拣：对方标了 `attention`，或者命中 `postroom/重要规则.md`（每行写一条 `- 来自：xxx` 或 `- 包含：xxx`，两边加斜杠就是正则），程序会马上标成重要并提醒你，不等 AI，然后再照常交给奇奇。
- 收发室只管及时交出去。通知最后发到哪（系统通知、Telegram、Bark……）由通知通道插件决定，重要的会带着 `urgent` 标记。

## 登记来源

`postroom/mailbox/` 下每个文件夹自动算一个信箱。其余写进 `postroom/agents.json`：

| kind | 用来接 | 要写的 |
| --- | --- | --- |
| `mailbox` | 任何能读写文件夹的程序 | `dir`（可选，默认 `postroom/mailbox/<name>`） |
| `a2a` | 说 A2A 协议的 bot（比如 Grokbot） | `url`，可选 `headers` |
| `acp` | Claude Code、Codex 等编码 agent | `preset`：`claude-code` 或 `codex`（或者自己写 `command` + `args`），`cwd` 是干活的文件夹 |
| `watch` | 定时去看一个地方 | `url`（网页 / RSS / 接口）或 `path`（文件 / 文件夹），可选 `every`（分钟）、`route: false`（只通知不分派） |

例子见 `postroom/mailbox/README.md`。

### A2A

派活用 `message/send`（不阻塞），之后每轮用 `tasks/get` 查。做完、失败或对方要人回话时，算一条回音。叫停时调用 `tasks/cancel`。还在等的任务记在 `postroom/state/<name>.json` 里。

### ACP

Kiki 充当编辑器那一方：起 agent 进程，每件活新开一个会话，收集它回的文字，做完把回答交回。
对方要权限时，按 Kiki 的审批规则判断：命令先过 cc-safety-net，删除、强推、对外发送、花钱这几类会在派活的那段对话上挂审批卡片，其余直接同意。
没装 `claude-code-acp` 或 `codex-acp` 时用 `npx -y` 现拉官方适配包，这需要本机装了 Node。

### 定时检查

第一次只记下现状、不报。之后：订阅源和文件夹报新出现的条目或文件；网页、接口和文件报新出现的行。

## 给代码用

- 内部来源投一条：`postroom.post("后台任务", { title, text, route: false })`
- 派活：`postroom.send(agent, text, title, origin)`；如果要等结果（任务看板的外部执行者），用 `postroom.run(agent, text, { signal })`
- 宝的工具：`kiki_outside`（`list` / `send`）
