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
2. `packaging/sign.sh app`：由内向外签名，全部开「加固运行时」并打时间戳。依赖里的原生模块（`.node`）先签；自带的 Node 带上 `packaging/entitlements.plist` 里的权限（JIT、加载原生模块）；`Contents/MacOS/kiki-server` 脚本单独签；最后签整个 App。
3. `packaging/sign.sh notarize-app`：App 交给苹果公证，通过后把票据钉进 App，再打成自动更新用的 `.zip`。
4. `packaging/sign.sh dmg`：`.dmg` 签名、公证、钉票据。
5. 公证没通过，这一版直接不发布，日志里有苹果给的原因。

每个 PR 的检查（`check.yml`）会用本地签名把同样的加固运行时签名做一遍并跑自检，确认 Node 在公证要求下还能正常跑。

## 自动更新

- 已经装好的（本地签名的）Kiki 会照常升到第一个签名版。
- 从签名版开始，更新前会核对新版本的签名完整、而且和自己是同一个团队 ID，不是就放弃这次更新（`src/update.ts`）。
- 换成签名版后，系统可能会再问一次辅助功能、屏幕录制之类的权限；给过一次以后，后续更新不会再问。
