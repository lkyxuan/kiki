# Kiki Mac App：安装、自动更新、远程使用

Kiki 装在 Mac mini 上一直开着，你在 MacBook、iPhone 上用浏览器（或添加到程序坞/主屏幕的“App”）远程用它。

## 它是什么样的

- **Kiki.app** 里自带运行环境（Node）和 Kiki 内核，Mac 上不用另装任何东西，也不会往系统里装全局命令。
- 双击 Kiki.app：打开 Kiki 自己的窗口（原生 macOS 窗口，有 Dock 图标和菜单），同时把 Kiki 登记成后台服务（登录后自动启动，崩了自动拉起）。关掉窗口或退出 App，Kiki 照样在后台跑，手机上照样能用。
- 数据都在 `~/kiki-data`，装、重装、更新都不会动它。日志在 `~/Library/Logs/Kiki/`。

## 安装

需要 macOS 12 或以上。在“终端”里跑一行（也可以到发布页下载 `.dmg`，见下面）。

```bash
curl -fsSL https://raw.githubusercontent.com/lkyxuan/kiki/main/packaging/install.sh | bash
```

它会下载最新版、核对校验和、放进“应用程序”、启动 Kiki。推荐用脚本装，是因为 Kiki 还没有苹果开发者签名，浏览器下载的 App 会被 macOS 拦一下。

不想用终端的话，到 [发布页](https://github.com/lkyxuan/kiki/releases/latest) 下载 `.dmg`（Apple 芯片选 arm64，Intel 选 x64），打开后把 Kiki 拖进「应用程序」，**从「应用程序」里**打开（直接在安装盘里双击，Kiki 会提示你先拖进去）。第一次打开会提示无法验证开发者：点「完成」，到「系统设置 → 隐私与安全性」拉到最下面点「仍要打开」。

还没有发布版时，也可以在仓库里自己打包再装（需要本机有 Node 22.19 以上）：

```bash
npm ci && packaging/build.sh arm64 && packaging/install.sh out/Kiki-mac-arm64.zip
```

### 第一次装好以后

1. 第一次打开选「在这台电脑上运行」，然后填模型密钥：点 Kiki 左下角「设置 → 模型与密钥」，粘贴 DeepSeek API 密钥（到 https://platform.deepseek.com/api_keys 申请），点「保存」，马上就能用。密钥存在 `~/kiki-data/.env`，只有你自己能读。

   进阶：不想让密钥以明文放在文件里，可以放进 macOS 钥匙串（登录后就能取）。Kiki 在后台运行、没人在电脑前点授权，所以密钥要放在它自己拿得到的地方：
   ```bash
   # 把 sk-… 换成你的密钥；用 1Password 的话可以写成 -w "$(op read 'op://保险库/条目/字段')"
   security add-generic-password -U -a "$USER" -s kiki-deepseek -w 'sk-…'
   ```
   然后在 `~/kiki-data/.env` 里写 `DEEPSEEK_API_KEY=keychain:kiki-deepseek`。
   写 `op://` 引用也支持，但后台进程每次重启都要 1Password 授权，没人点就拿不到密钥（Kiki 会照样启动，只是模型调不通），所以不推荐。
2. 手动改过 `.env` 的话，重启 Kiki 才生效（设置页里也有「立即重启」）：`launchctl kickstart -k gui/$(id -u)/com.lkyxuan.kiki`
3. 想让 Kiki 在 Mac mini 上一直可用，要打开“开机自动登录”（系统设置 → 用户与群组），Kiki 是跟着登录启动的。第一次装好时 macOS 会提示“已添加后台项目”，那就是 Kiki 的后台服务，允许即可。

## 自动更新

做法借鉴 Hermes 的 `hermes update`（它是 git pull + 自检 + 失败回滚 + 回执），Kiki 是打包好的 App，没有 git，所以改成从 GitHub Releases 下载：

1. 启动后和之后每小时查一次 GitHub 上的最新发布版。
2. 有新版本时，网页右上角会出现「新版本 vX · 更新」。默认在**没有对话在跑的时候自动装**；想手动装，在 `~/kiki-data/.env` 写 `KIKI_AUTO_UPDATE=0`。
3. 装的过程：下载 → 核对校验和 → 解压到暂存区 → 用新版本自己跑一次自检 → 备份 `registry.json`、`AGENTS.md`、`.env`（到 `~/kiki-data/backups/`，留最近 5 份）→ 换上新 App → 重启。
4. 新版本 45 秒内没起来，就自动换回旧版本，网页提示“已回滚”，这个版本不再自动重试。
5. 每次结果记在 `~/Library/Logs/Kiki/last-update.json` 和 `update.log`。上一个版本留在“应用程序”里的隐藏文件夹 `.Kiki-previous.app`，需要时可以手动换回去。

查更新不需要登录 GitHub。如果在 `.env` 里写了 `GITHUB_TOKEN`，或者本机登录了 `gh`，Kiki 会顺带用上，免得撞到 GitHub 匿名访问的次数限制（每小时 60 次，Kiki 每小时只查一次，一般用不着）。

### 怎么发布新版本（开发者）

把 `package.json` 里的版本号改大（比如 `npm version patch --no-git-tag-version`），合进 main。GitHub Actions 会检查、测试、打 arm64 和 x64 两个包，建好 Release。各台机器上的 Kiki 会在一小时内自己装上（等不及就点设置左下角的「检查更新」）。

## 在别的电脑上用 Kiki 的 App（前后端分离）

App 第一次打开会问：**在这台电脑上运行**，还是**连接远程地址**。比如 Kiki 跑在 Mac mini 上，MacBook 上也装一个 Kiki.app，选“连接远程地址”，填 Mac mini 的 Tailscale 地址（见下一节），这台 MacBook 就只当界面，不跑后台、不存数据。以后想换，菜单「Kiki → 连接到…」（⇧⌘K）。设置是 ⌘,，外观（跟随系统 / 浅色 / 深色）在设置里或菜单「显示 → 外观」。

界面是从后端加载的，所以后端（Mac mini）更新以后，各台电脑上看到的界面也跟着是新的。

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

想直接用 IP（Tailscale 分的 `100.x.x.x`）而不是名字：

1. 在跑 Kiki 的电脑上再开一个 http 端口：`tailscale serve --bg --http=8889 4567`，再用 `tailscale ip -4` 查它的 IP。
2. 客户端里填 `100.x.x.x:8889`（会自动用 http；HTTPS 证书只认 `.ts.net` 名字，IP 用不了。Tailscale 本身是加密的）。

注意：

- 用 `tailscale serve`，**不要用 `tailscale funnel`**（funnel 会公开到整个互联网）。
- Kiki 自己也加了一道守卫：只接受 `localhost`、`*.ts.net` 和 Tailscale 内网 IP（`100.64.0.0/10`）的访问，挡住恶意网页借你的浏览器偷偷给 Kiki 发指令。用别的域名访问要写进 `.env` 的 `KIKI_ALLOWED_HOSTS`。
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
