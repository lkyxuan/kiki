# Kiki Mac App：安装、自动更新、远程使用

Kiki 装在 Mac mini 上一直开着，你在 MacBook、iPhone 上用浏览器（或添加到程序坞/主屏幕的“App”）远程用它。

## 它是什么样的

- **Kiki.app** 里自带运行环境（Node）和 Kiki 内核，Mac 上不用另装任何东西，也不会往系统里装全局命令。
- 双击 Kiki.app：把 Kiki 登记成后台服务（登录后自动启动，崩了自动拉起），然后打开网页 `http://localhost:4567`。关掉网页 Kiki 也照样在后台跑。
- 数据都在 `~/kiki-data`，装、重装、更新都不会动它。日志在 `~/Library/Logs/Kiki/`。

## 安装

在 Mac mini 的“终端”里跑一行。

```bash
curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
```

它会下载最新版、核对校验和、放进“应用程序”、启动 Kiki。用脚本装而不是浏览器下载，是因为 Kiki 还没有苹果开发者签名，浏览器下载的 App 会被 macOS 拦下来。

还没有发布版时，也可以在仓库里自己打包再装（需要本机有 Node 22.19 以上）：

```bash
npm ci && packaging/build.sh arm64 && packaging/install.sh out/Kiki-mac-arm64.zip
```

### 第一次装好以后

1. 填模型密钥：编辑 `~/kiki-data/.env`，写 `DEEPSEEK_API_KEY=...`，然后 `chmod 600 ~/kiki-data/.env`。
   想继续用 1Password：`.env` 里照旧写 `op://` 引用，Kiki 发现装了 `op` 就会用 `op run` 注入。但开机无人值守时 1Password 可能还锁着，这种情况要用 1Password 的服务账号（`OP_SERVICE_ACCOUNT_TOKEN`），否则 Kiki 起不来。
2. 改完 `.env` 重启 Kiki：`launchctl kickstart -k gui/$(id -u)/com.lkyxuan.kiki`
3. Mac mini 要“开机自动登录”（系统设置 → 用户与群组），Kiki 是跟着登录启动的。

## 自动更新

做法借鉴 Hermes 的 `hermes update`（它是 git pull + 自检 + 失败回滚 + 回执），Kiki 是打包好的 App，没有 git，所以改成从 GitHub Releases 下载：

1. 启动后和之后每 6 小时查一次 GitHub 上的最新发布版。
2. 有新版本时，网页右上角会出现「新版本 vX · 更新」。默认在**没有对话在跑的时候自动装**；想手动装，在 `~/kiki-data/.env` 写 `KIKI_AUTO_UPDATE=0`。
3. 装的过程：下载 → 核对校验和 → 解压到暂存区 → 用新版本自己跑一次自检 → 备份 `registry.json`、`AGENTS.md`、`.env`（到 `~/kiki-data/backups/`，留最近 5 份）→ 换上新 App → 重启。
4. 新版本 45 秒内没起来，就自动换回旧版本，网页提示“已回滚”，这个版本不再自动重试。
5. 每次结果记在 `~/Library/Logs/Kiki/last-update.json` 和 `update.log`。上一个版本留在“应用程序”里的隐藏文件夹 `.Kiki-previous.app`，需要时可以手动换回去。

查更新不需要登录 GitHub。如果在 `.env` 里写了 `GITHUB_TOKEN`，或者本机登录了 `gh`，Kiki 会顺带用上，免得撞到 GitHub 匿名访问的次数限制（每小时 60 次，Kiki 每 6 小时只查一次，一般用不着）。

### 怎么发布新版本（开发者）

把 `package.json` 里的版本号改大（比如 `npm version patch --no-git-tag-version`），合进 main。GitHub Actions 会检查、测试、打 arm64 和 x64 两个包，建好 Release。各台机器上的 Kiki 会在 6 小时内自己装上。

## 远程使用（安全地）

Kiki 能在 Mac mini 上读写文件、跑命令，所以**绝不能直接暴露到公网**。它只监听本机（127.0.0.1），也没有自己的登录。远程用的推荐办法是 Tailscale：只有你登录了同一个 Tailscale 账号的设备才连得上，传输全程加密，还有 HTTPS。

在 Mac mini 上：

1. 装 Tailscale（App Store 或 `brew install --cask tailscale`），登录。
2. 终端里跑一次（会自动开机生效）：
   ```bash
   tailscale serve --bg 4567
   ```
   第一次会提示去 Tailscale 后台开启 HTTPS，点链接开一下。完成后它会告诉你地址，形如 `https://mac-mini.xxxx.ts.net`。

在 iPhone / MacBook 上：

1. 也装 Tailscale，登录同一个账号。
2. 打开上面那个地址就是 Kiki。
3. 当 App 用：iPhone 上 Safari「分享 → 添加到主屏幕」；Mac 上 Safari「文件 → 添加到程序坞」。

注意：

- 用 `tailscale serve`，**不要用 `tailscale funnel`**（funnel 会公开到整个互联网）。
- Kiki 自己也加了一道守卫：只接受 `localhost` 和 `*.ts.net` 的访问，挡住恶意网页借你的浏览器偷偷给 Kiki 发指令。用别的域名访问要写进 `.env` 的 `KIKI_ALLOWED_HOSTS`。
- 你的 Tailscale 网络里不要加别人的设备，进了这个网络的设备都能用 Kiki。

## 卸载

```bash
launchctl bootout gui/$(id -u)/com.lkyxuan.kiki
rm ~/Library/LaunchAgents/com.lkyxuan.kiki.plist
rm -rf /Applications/Kiki.app /Applications/.Kiki-previous.app
# 数据在 ~/kiki-data，要不要删你自己决定
```

## 以后可以做的

- 苹果开发者签名和公证（每年 99 美元）：之后可以直接从网页下载 .dmg 双击安装，不用终端。
- 原生窗口外壳（现在用浏览器/“添加到程序坞”代替）。
