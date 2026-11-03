# 苹果签名和公证

签名和公证以后，别人从网页下载 `.dmg` 双击就能打开，不会再弹「无法验证开发者」。
发布流程（`.github/workflows/release.yml`）已经接好，**仓库 Secrets 里填了证书才会做**；没填就和以前一样只做本地签名，什么都不会坏。

## 要在仓库里填的 Secrets

在 <https://github.com/lkyxuan/kiki/settings/secrets/actions> 新建：

| 名字 | 内容 | 什么时候要 |
| --- | --- | --- |
| `MACOS_CERT_P12` | Developer ID Application 证书导出的 .p12，`base64 -i kiki-cert.p12 \| pbcopy` 得到的文字 | 必填 |
| `MACOS_CERT_PASSWORD` | 导出 .p12 时设的密码 | 必填 |
| `ASC_KEY_P8` | App Store Connect API 密钥 .p8 文件的全部内容 | 公证方式 A（推荐） |
| `ASC_KEY_ID` | 这把密钥的 ID | 公证方式 A |
| `ASC_ISSUER_ID` | Issuer ID | 公证方式 A |
| `APPLE_ID` | Apple ID 邮箱 | 公证方式 B |
| `APPLE_APP_PASSWORD` | App 专用密码 | 公证方式 B |
| `APPLE_TEAM_ID` | 10 位团队 ID | 公证方式 B |

证书和密钥怎么申请，一步步的说明在项目文档《Kiki 苹果签名与公证：账号批下来之后怎么做》里。

## 发布时做了什么

1. 把证书导入一个临时钥匙串（跑完就删）。
2. `packaging/sign.sh app`：由内向外签名，全部开「加固运行时」并打时间戳。依赖里的原生模块（`.node`）先签；自带的 Node 包在「Kiki 后台」小 App（`Contents/Helpers/KikiAgent.app`）里，带上 `packaging/entitlements.plist` 里的权限（JIT、加载原生模块、自动化和日历/通讯录/照片/麦克风/摄像头这些隐私权限）；`Contents/MacOS/kiki-server` 脚本单独签；最后签整个 App。
3. 打 `.dmg`，`packaging/sign.sh dmg`：给 `.dmg` 签名，整个交给苹果公证（每种芯片只交一次，里面的 App 一起公证），通过后把票据钉进 `.dmg` 和 App。
4. 再从钉好票据的 App 打自动更新用的 `.zip`。
5. 公证没通过或者等超过 2 小时，这一版直接不发布，日志里有苹果给的原因。新账号刚开始时苹果审得慢（第一次要等一小时左右），之后一般几分钟。

每个 PR 的检查（`check.yml`）会用本地签名把同样的加固运行时签名做一遍并跑自检，确认 Node 在公证要求下还能正常跑。

## 自动更新

- 已经装好的（本地签名的）Kiki 会照常升到第一个签名版。
- 从签名版开始，更新前会用 `codesign -R` 核对新版本：签名完整、证书链通到苹果、是 Developer ID 证书、团队 ID 和自己相同；不满足就放弃这次更新（`src/update.ts`）。
- 换成签名版后，系统可能会再问一次辅助功能、屏幕录制之类的权限；给过一次以后，后续更新不会再问。

## 系统权限（隐私与安全性）

- 真正干活的是 launchd 跑的「Kiki 后台」（`Contents/Helpers/KikiAgent.app`，标识 `com.lkyxuan.kiki.agent`），系统的隐私权限都记在它头上，设置里显示“Kiki 后台”。`Resources/node/bin/node` 只是指向它的链接。
- 加固运行时下，没在 `entitlements.plist` 里声明的隐私权限，系统连弹窗都不出、直接拒；要用的说明文字写在 `packaging/agent-Info.plist`。以后要加新权限，两边都要加。
- 第一次打开 Kiki 会自动进设置的「Mac 权限」页，“一键申请全部”由后台自己依次弹出辅助功能、屏幕录制、各 App 的自动化对话框；完全磁盘访问苹果不给弹窗，会打开设置页并在 Finder 里指出“Kiki 后台”（`src/macperm.ts`）。
- 签名标识和团队 ID 不变，自动更新后已经给过的权限还在。
