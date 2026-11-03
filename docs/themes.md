# 外部主题

Kiki 自带浅色、深色两套外观。别的样子做成**主题包**，单独放在自己的仓库里，装的时候把文件夹拷进数据目录的 `themes/` 下：

```
~/kiki-data/themes/
  <主题 id>/          文件夹名就是 id：小写字母、数字、连字符，不能叫 system / light / dark
    theme.json        名字和基于哪套内置配色
    theme.css         样式（必需）
    preview.png       设置里的缩略图（可选，约 192×124）
    其他图片、字体     .png .jpg .svg .webp .woff2，在 CSS 里用相对路径引用
```

装好后打开 设置 › 外观 就能看到，不用重启。删掉文件夹就是卸载。

## theme.json

```json
{ "name": "显示的名字", "base": "light", "author": "谁做的", "description": "一句话介绍" }
```

`base` 是 `light` 或 `dark`：选中这个主题时，先套 Kiki 内置的浅色或深色配色，主题只需要改它想改的部分；原生窗口的标题栏也按它变。

## theme.css

- 所有规则都写在 `:root[data-theme="<主题 id>"]` 下面，别的主题完全不受影响。
- 先改颜色变量（`--bg`、`--side`、`--card`、`--text`、`--accent` 等，全部变量见 `public/theme.css`），大部分界面会自动跟着变。
- 要改造型（圆角、边框、装饰），用和页面里一样的选择器，前面加上 `:root[data-theme="<主题 id>"]`。主题样式在页面自己的样式后面加载，同样的选择器能盖过去。
- 只能放样式和静态资源，Kiki 不会加载主题里的脚本。

## 版权

主题包和 Kiki 分开放，Kiki 本身不带任何第三方作品的名字、logo、字体或素材。做主题时只借鉴风格，不要直接用别人作品的素材。

## 呼出菜单和沉浸模式

主题也能改这两样的造型（逻辑在 `public/menu.js`，默认样子在 `public/menu.css`）：

| 选择器 | 是什么 |
|---|---|
| `#ring-menu` | 呼出菜单（⌘J、空白处右键、点名牌） |
| `.rm-btn` / `.rm-ico` / `.rm-label` | 一竖列的圆形按钮、按钮里的图标、选中时旁边的名字；`.hl` 是当前选中，`.on` 是正开着的 |
| `.rm-sub` / `.rm-sub-head` / `.rm-row` | 选中一个宝时右边展开的列表、列表头、每一行；`::after` 是指回按钮的小三角 |
| `#hp` / `.hp-bar` / `.hp-fill` / `.hp-num` | 沉浸模式左上角的名牌和今天任务的进度条；`data-level` 是 `high` / `mid` / `low` |
| `body.focus` | 沉浸模式开着 |
