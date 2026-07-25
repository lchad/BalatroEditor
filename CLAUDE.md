# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 技术栈

- **纯 JS SPA** — 无框架、无构建步骤、无打包工具、无 package.json
- **无需服务器** — 直接在浏览器中打开 `index.html`，或用任意静态服务器托管
- **外部 CDN 依赖**：Font Awesome 7.1、Inter 字体（Google Fonts）、Press Start 2P、VT323、Pako 2.1.0（zlib 压缩库）

## 入口文件与脚本加载顺序

`index.html` 按严格的依赖顺序加载脚本 —— 不可打乱：

1. `pako.min.js`（CDN） — 用于 .jkr 二进制格式的 deflate/inflate 压缩/解压
2. `public/js/jkr-converter.js` — Lua 分词器 → 递归下降解析器 → JSON，编解码使用 `\t\f` 数字键往返技巧
3. `public/js/utils.js` — 共享工具：`CATEGORIES` 常量、`showNotification`、`formatName`、`exportBlob`、`debounce`、`showSafeDownloadModal`
4. `public/js/translations.js` — 国际化系统，中/英词典，`__()` 辅助函数，`initLanguage()`，`_currentLang`
5. `public/js/image-loader.js` — 多 CDN 图片 URL 回退链 + 带版本键的 `localStorage` 缓存
6. `public/js/meta.js` — meta.jkr 收藏集编辑器（卡片网格、解锁/锁定切换、骨架屏加载）
7. `public/js/profile.js` — profile.jkr 档案编辑器
8. `public/js/save-editor.js` — save.jkr 完整游戏存档编辑器（标签页：游戏、卡组、小丑牌、消耗品、优惠券、星球牌）

## 架构

### 状态模型（全部为全局可变变量 —— 无数据层）

- `metaData: { unlocked: {}, discovered: {}, alerted: {} }` — 收藏集切换状态
- `profileData` — 档案统计数据，导入前为 null
- `saveData` — 完整游戏存档状态，导入前为 null
- `currentCategory`、`searchTerm`、`editMode`、`_activeSaveTab` — UI 状态全局变量

### 渲染方式

通过 `container.innerHTML = html` 进行命令式渲染。无虚拟 DOM，无 Diff 算法。
- `renderCategory(category)` — 重新创建整个卡片网格
- `renderProfile()` — 重新创建整个档案视图
- `toggleItem(id)` — 修改 `metaData` + 直接操作 DOM + 调用 `updateStats()`
- `renderSaveEditor()` — 重新创建完整存档编辑器，支持标签页切换

### JKR 格式

Balatro 存档使用 Lua 序列化表，经 deflate-raw 压缩（pako）：
- `jkr-converter.js` 实现：Lua 分词器 → 递归下降解析器 → JSON
- 编解码往返：数字 Lua 键加 `\t\f` 前缀（因为 Lua 数组是 1 索引表）
- 已知 Token：`{`、`}`、`[`、`]`、`=`、`,`、字符串、数值、`true`/`false`/`nil`

## 关键文件

| 文件 | 行数 | 作用 |
|---|---|---|
| `public/js/jkr-converter.js` | 248 | Lua 解析器 + 通过 pako 进行 deflate/inflate raw 压缩 |
| `public/js/utils.js` | 180 | 通知单例、`CATEGORIES`（卡片分类）、`formatName`、`exportBlob`、`debounce`、`readFileAsArrayBuffer` |
| `public/js/translations.js` | 473 | 国际化中/英，`__()` 辅助函数支持 `{{变量}}` 模板插值 |
| `public/js/image-loader.js` | 263 | 多 CDN 回退链、带版本键的 `localStorage` 缓存（`IMAGE_CACHE_VERSION`）、`SPECIAL_CASES` 映射表、骨架屏 CSS 状态 |
| `public/js/meta.js` | 445 | 收藏集视图：骨架屏加载、卡片展示（绿色/已解锁、黄色/已发现、红色/已锁定）、批量解锁/锁定、导入/导出 |
| `public/js/profile.js` | 520 | 档案视图：统计信息编辑、高分记录、挑战进度、卡组统计、最常用小丑牌/消耗品 |
| `public/js/save-editor.js` | 1760 | 完整游戏存档编辑器：6 个标签页、卡组卡片编辑、小丑牌/优惠券管理、消耗品、赌注、盲注轮次 |
| `public/css/style.css` | 1088 | 通过 CSS 自定义属性实现的设计系统（暗色 Balatro 主题） |
| `data/meta.json` | 31621 | 默认演示收藏集状态（初始展示用的 meta.jkr 数据） |

## 设计系统（CSS 自定义属性）

所有值定义在 `style.css` 的 `:root` 中：
- `--bg-primary: #1A2228`、`--bg-secondary`、`--bg-tertiary`、`--bg-panel` — 暗色主题背景
- `--red-primary: #F04A4A`、`--blue-primary: #0A84FF`、`--gold: #FFB100`、`--purple: #A970FF`、`--cyan: #48D6FF`
- `--success: #2ECC71`、`--danger: #E74C3C`
- `--font-pixel: 'Press Start 2P'`、`--font-terminal: 'VT323'`、`--font-body: 'Inter'`
- 三个 CSS 文件 — `style.css`（基础 + 侧边栏 + 收藏集）、`profile.css`、`save-editor.css`

## 卡片分类（utils.js 中的 CATEGORIES）

```js
CATEGORIES = {
  jokers:    { prefix: 'j_', name: 'nav.jokers' },
  tarots:    { prefix: 'c_', name: 'nav.tarots', filter: [...] },
  planets:   { prefix: 'c_', name: 'nav.planets', filter: [...] },     // 共用前缀！通过 filter 区分
  spectrals: { prefix: 'c_', name: 'nav.spectrals', filter: [...] },   // 共用前缀！通过 filter 区分
  vouchers:  { prefix: 'v_', name: 'nav.vouchers' },
  decks:     { prefix: 'b_', name: 'nav.decks' },
  modifiers: { prefix: null, isMultiple: true, subcategories: [
    { prefix: 'm_', name: 'nav.enhancements' },
    { prefix: 'e_', name: 'nav.editions' },
    { prefix: 'soul', name: 'nav.seals', isSeal: true }
  ]},
  tags:      { prefix: 'tag_', name: 'nav.tags' },
  blinds:    { prefix: 'bl_', name: 'nav.blinds' },
}
```

## 已知特性与约定

- **类别共用 `c_` 前缀**：塔罗牌、行星牌和幽灵牌都使用 `c_` 前缀 —— 通过 `filter` 数组区分。Balatro 添加新牌时需要同步更新这些列表。
- **骨架屏加载**：固定至少 300ms + 计算时间。图片在骨架屏替换后异步加载，使用 `.loading`（脉冲动画）/ `.loaded`（不透明度 1）/ `.error`（淡出 + 破碎图标）CSS 状态。
- **档案文件校验**：通过检查 `unlocked`/`discovered`/`alerted` 键来拒绝错误的 meta.jkr 文件上传到档案标签页。
- **导出保护**：`_exportingMeta` / `_exportingProfile` / `_exportingSave` 标志防止并发导出。
- **焦点/键盘**：交互元素使用 `tabindex="0"` + `role="button"` + Enter/Space 事件处理。
- **通知单例**：同一时间只显示一条通知，新通知替换旧通知，通过 `showNotification()` 实现。
- **安全下载弹窗**：`showSafeDownloadModal()` 在导出 .jkr 文件前显示盾牌图标 + GitHub 链接（防止网络钓鱼）。
- **图片 URL 回退**：`getImageUrls()` 返回多个候选 URL —— 首个成功加载的胜出；`SPECIAL_CASES` 映射表处理非标准文件名到卡片 ID 的匹配。
- **Lua 数字键编码为 `\t\f` 前缀**：`encodeNumKey(key)` 在键前添加 `\t\f` 以便 JS 对象键能完整往返；`decodeNumKey` 将其剥离还原。
- **国际化**：HTML 元素上的 `data-i18n` 属性 + `document.documentElement.lang` —— `__()` 函数支持 `{{变量}}` 模板插值。

## 无测试框架

本项目没有自动化测试。所有测试均为手动完成 —— 在浏览器中打开 `index.html`，通过导入/导出 .jkr 文件并检查控制台错误进行验证。

## 命令

无需安装或构建。开发流程：
- 在浏览器中打开 `index.html` 预览更改（或使用 VS Code Live Server、任意静态服务器）
- 使用浏览器 DevTools 进行调试
- 无 linter、无类型检查、未配置 CI
