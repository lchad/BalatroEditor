# Balatro Editor — 项目架构文档

> 最后更新：2026-07-26

## 项目概述

Balatro Editor 是一个纯前端 SPA，用于编辑 Balatro 游戏的存档文件（meta.jkr、profile.jkr、save.jkr）。
- **Web 端**：已部署到 Cloudflare Pages（https://balatro-editor-lchad.pages.dev）
- **桌面端**：Electron 封装，自动加载游戏目录存档
- **技术栈**：Vanilla JS + CSS3，无框架无构建工具

## 目录结构

```
├── index.html                   ← 入口，严格按顺序加载 JS
├── package.json                 ← Electron 依赖（.gitignore 排除）
├── CLAUDE.md                    ← Claude Code 操作指引
├── ARCHITECTURE.md              ← 本文件
│
├── public/
│   ├── css/
│   │   ├── style.css            ← 设计系统（CSS 自定义属性）
│   │   ├── profile.css
│   │   └── save-editor.css
│   └── js/
│       ├── jkr-converter.js     ← Lua ↔ JSON 解析器 + deflate/inflate
│       ├── utils.js             ← 全局工具函数
│       ├── translations.js      ← 国际化系统（EN/ES/ZH）
│       ├── i18n-data.js         ★ 游戏数据中文映射表（自动生成）
│       ├── image-loader.js      ← 多源图片加载 + localStorage 缓存
│       ├── meta.js              ← 收藏集编辑器
│       ├── profile.js           ← 个人资料编辑器
│       ├── save-editor.js       ← 存档编辑器
│       └── electron-adapter.js  ← 桌面端适配器（浏览器无影响）
│
├── electron/
│   ├── main.js                  ← Electron 主进程
│   └── preload.js               ← 安全 IPC 桥接
│
├── scripts/
│   └── extract-zh-names.js      ← 从 Balatro 游戏文件提取中文名
│
├── data/
│   ├── meta.json                ← 演示数据
│   └── translations.json
│
└── .github/workflows/
    └── release.yml              ← 打 tag 自动构建 .dmg/.exe/.AppImage
```

## 国际化系统

### 架构

```
translations.js
├── _translations                ← 词典对象 { en: {...}, es: {...}, zh: {...} }
│   ├── en                       约 230 条 UI 文本
│   ├── es                       西班牙语
│   └── zh                       简体中文（约 230 条 UI 文本）
├── __(key, params)              ← 翻译函数，支持 {{变量}} 替换
├── initLanguage()               ← 从 localStorage / navigator.language 初始化
├── setLanguage(lang)            ← 切换语言，自动刷新各视图
└── getCurrentLanguage()         ← 返回当前语言代码

i18n-data.js                     ★ 由 extract-zh-names.js 自动生成
├── GAME_NAMES_ZH                ← 388 条游戏实体中文名
│   ├── jokers                   ← 150 张小丑牌
│   ├── vouchers                 ← 34 张优惠券
│   ├── tarots                   ← 22 张塔罗牌
│   ├── planets                  ← 12 张行星牌
│   ├── spectrals                ← 18 张幽灵牌
│   ├── editions                 ← 6 种版本（闪箔/镭射/多彩/负片）
│   ├── enhancements             ← 8 种强化牌
│   ├── stakes                   ← 8 种赌注
│   ├── tags                     ← 24 种标签
│   ├── blinds                   ← 30 种盲注
│   ├── backs                    ← 19 种卡组背面
│   ├── pokerHands               ← 13 种牌型
│   ├── suits                    ← 4 种花色
│   ├── ranks                    ← 13 种点数
│   ├── seals                    ← 4 种蜡封 + 别名
│   ├── highScores               ← 8 个高分统计项
│   └── challenges               ← 20 个挑战名
└── i18nGameName(key, lang)      ← 游戏实体名查表函数
```

### 数据源

所有中文名来自 **Balatro 官方游戏文件** `/Applications/Balatro.app/.../Balatro.love/localization/zh_CN.lua`（4,262 行）。

重新生成方式：
```bash
# 1. 解压游戏包
cp "/Applications/Balatro.app/Contents/Game/Balatro.app/Contents/Resources/Balatro.love" /tmp/
cd /tmp && unzip -o Balatro.love -d game

# 2. 运行提取脚本
node scripts/extract-zh-names.js /tmp/game/localization/zh_CN.lua
```

生成文件 `public/js/i18n-data.js`，包含 `GAME_NAMES_ZH` 对象和 `i18nGameName()` 函数。

### 翻译覆盖

| 项目 | 状态 |
|---|---|
| UI 文本（按钮、通知、标签） | ✅ EN/ES/ZH 完整 |
| 缺失键修复（Deck, Stake, app.description） | ✅ 三语言已补 |
| save-editor 硬编码 UI 字符串 | ✅ 全部改为 __() |
| save-editor 游戏数据（小丑名/赌注/卡组/牌型/花色/点数/强化/版本/蜡封） | ✅ 走 `i18nGameName()` |
| meta.js 卡牌名显示 | ✅ 走 `i18nGameName()` |
| meta.js 搜索（支持中英文搜索） | ✅ |
| profile.js 消耗品/牌型/挑战名 | ✅ |
| 语言切换自动刷新各视图 | ✅ |
| 浏览器语言自动检测 | ✅ |
| 图片 URL 引用（formatName） | ✅ 不改，只用于 URL |

## Electron 桌面端

### 架构

```
electron/
├── main.js          ← 主进程
│   ├── 窗口管理
│   ├── IPC 处理
│   │   ├── fs:readBalatroFile     ← 读游戏目录 JKR 文件
│   │   ├── fs:writeBalatroFile    ← 写回游戏目录
│   │   ├── fs:showSaveDialog      ← 系统保存对话框
│   │   ├── fs:writeFile           ← 写入任意路径
│   │   ├── app:getPlatform        ← 获取平台信息
│   │   ├── app:getSavePaths       ← 获取游戏存档路径
│   │   └── fs:startWatching / fs:stopWatching  ← 文件监视
│   └── 存档路径自动检测
│       ├── macOS: ~/Library/Application Support/Balatro/1/
│       ├── Windows: %APPDATA%/Balatro/1/
│       └── Linux: ~/.local/share/Balatro/1/
│
└── preload.js       ← contextBridge 暴露 balatroDesktop API
```

### 渲染进程适配

`public/js/electron-adapter.js` 在 Electron 环境条件执行：

- **覆盖 `loadMetaJSON`** — 跳过 `fetch('data/meta.json')`，改为加载真实存档
- **覆盖 `exportBlob`** — 直接写回游戏目录，无需下载
- **覆盖 `showSafeDownloadModal`** — 跳过安全提示
- **自动加载** meta.jkr / profile.jkr / save.jkr（注意：`metaData`、`profileData`、`saveData` 用 `let` 声明，别用 `window.` 前缀访问）
- **语言自动切换** — 通过 `app.getLocale()` 获取系统语言，若为中文自动调用 `setLanguage('zh')`
- **隐藏导入/导出按钮** — 桌面端直接读写游戏目录，不需要导入导出
- **文件监视** — 游戏保存后通知用户刷新

**浏览器端** `window.balatroDesktop` 为 undefined，所有适配代码不执行。

### 打包与发布

```bash
# 本地运行
npm install
npm start

# 打包
npm run build:mac      # .dmg
npm run build:win      # .exe
npm run build:linux    # .AppImage

# 发布到 GitHub Releases（自动触发 CI）
git tag v2.5.0 && git push --tags
```

CI 配置：`.github/workflows/release.yml` — 推送 `v*` tag 触发，三平台并行构建。

### 已知问题

- **macOS「已损坏」错误**：因无 Apple Developer 证书，Ad-hoc 签名仅避免"已损坏"报错，但仍会提示"无法验证开发者"
  - 临时绕过（适用于已下载的旧版本）：`xattr -cr /Applications/Balatro\ Editor.app`
  - 推荐打开方式：右键 → 打开（选择仍要打开）
  - 终局方案：购买 $99/年 Apple Developer 证书后，CI 可自动签名公证

## 关键约定

### 脚本加载顺序（不可打乱）

`index.html` 的 `<script>` 顺序严格依赖：

```
pako (CDN) → jkr-converter.js → utils.js → translations.js →
i18n-data.js → image-loader.js → meta.js → profile.js →
save-editor.js → electron-adapter.js
```

### 卡牌 ID 前缀规则

| 前缀 | 分类 |
|---|---|
| `j_` | 小丑牌 Jokers |
| `c_` | 塔罗牌 / 行星牌 / 幽灵牌（通过 filter 区分） |
| `v_` | 优惠券 Vouchers |
| `b_` | 卡组 Decks |
| `m_` | 增强 Enhancements |
| `e_` | 版本 Editions |
| `tag_` | 标签 Tags |
| `bl_` | 盲注 Blinds |

### CATEGORIES 常量

定义在 `utils.js`，控制收藏集页面的分类。`c_` 前缀的塔罗/行星/幽灵通过 `filter` 数组区分。

### 游戏数据更新

Balatro 更新后如果新增卡牌，需要：
1. 解压新版 `Balatro.love` 的 `zh_CN.lua`
2. 重跑 `node scripts/extract-zh-names.js`
3. 同时更新 `_jokerNames`、`CATEGORIES` filter 数组

### i18n 新增

添加新键时需同时维护：
- `en` 词典（translations.js）
- `es` 词典（translations.js）
- `zh` 词典（translations.js）
