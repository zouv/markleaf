# 代码链路图谱 · markleaf

> **本文件的目的**：给 AI（及人类）一份「读这一份就能定位代码」的导航地图，避免每次改动 / 排查都全量扫描源码，节省上下文与 token。
>
> **维护**：改了代码结构（新增入口 / 移动逻辑 / 改数据流 / 改接口），同步更新本文件（见 AGENTS §1）。
>
> **体量**：不超过 25,000 字（按字符计，命令见 AGENTS §4）；超了按 AGENTS §1.1 拆到 `arch/<module>.md`，总览只留 §0 / §0.5 / §1。单元格写「是什么、在哪、为什么」，一般不超过 150 字；不写日期、版本、改动经过（归 CHANGELOG / git log）。
>
> 文中「AGENTS §x」指 `AGENTS.md` 的章节；不带前缀的 §x 指本文件。

---

## 0. 一句话架构

Tauri 2（无边框自定义窗口 + Rust 原生 `comrak` 极速 Markdown 解析 + `encoding_rs` 无损编码读写 + CLI 秒开捕获）+ React 18（多页签拖拽工作台 + 8 套印刷级主题 + 行号锚定双击就地编辑 + 双栏偏好设置系统）。

```
双击 .md / CLI 参数 / 界面多页签打开
        │
        ▼
src-tauri/src/lib.rs & commands.rs (IPC 门面)
  ├── markdown.rs ──► comrak GFM/Alerts/TaskList/Footnotes/Math + data-sourcepos 行号映射 + 标题 #slug 锚点 + 4 维字数统计 + 任务框行级切换
  └── fs_ops.rs   ──► encoding_rs 编码探测读写 + 原生文件选择弹窗 + 同级目录 Markdown 文件树
        │
        ▼  src/api.ts (强类型 IPC 契约) + src/settings.ts (偏好设置持久化)
        │
src/App.tsx (React 18 多页签读写工作台)
  ├── src/components/TitleBar.tsx       ──► 无边框一体式顶栏 + 左上角品牌图标菜单 + 多页签拖拽排序/中键关闭/右键菜单 + 原生窗口三联控制按钮
  ├── src/components/SettingsDialog.tsx ──► 双栏偏好设置弹窗 (外观主题 / 渲染版式 / 编辑器行号与配对 / 文件保存策略 / 快捷键)
  ├── 极速阅读视图 (.ml-prose)           ──► 8 套主题 + 5 档版心行宽 + 代码块行号/折行/复制 + 标题锚点复制 + 专注模式 + 图片缩放灯箱
  └── 便捷编辑视图 (.ml-editor-pane)     ──► 完整/稀疏行号水槽 + 2D 网格建表器 + Alerts 选择器 + 符号自动配对 + 打字机居中滚动
```

架构约束：Rust 负责全部重计算（Markdown AST 解析、HTML 生成、TOC 提取、4 维字数统计、文件编码探测与行级原地修改），前端不跑重型虚拟 DOM 富文本状态机，确保冷启动与多页签大文档切换毫秒级响应。

---

## 0.5 任务作用域路由（先定范围，避免污染上下文）

> **怎么用**：动手前先在下表找到你的任务类型，只读「该读」列的文件 / 小节，「可忽略」列默认不打开（证据指向那里时除外，见 AGENTS §0）。

| 任务类型 | 该读（仅限） | 可忽略 | 入口小节 |
|---|---|---|---|
| 改标题栏 / 多页签拖拽 / 窗口控制 | `src/components/TitleBar.tsx`、`src/App.tsx`、`src/styles.css` | `src-tauri/src/markdown.rs` | §2.1 |
| 改偏好设置 / 主题 / 版心行宽 / 行号配置 | `src/settings.ts`、`src/components/SettingsDialog.tsx`、`src/App.tsx`、`src/styles.css` | `src-tauri/` 的 Rust 实现 | §2.1 |
| 改工具栏 / 编辑器 / 阅读交互 | `src/App.tsx`、`src/ui/Icon.tsx`、`src/demoDoc.ts`、`src/styles.css` | `src-tauri/` 的 Rust 实现、打包脚本 | §2.1 |
| 加 / 改 IPC 命令 | `src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`、`src/api.ts`、`tests/contract.test.mjs` | `src/styles.css`、窗口配置 | §2.2 |
| 改 Markdown 解析 / 大纲 / 任务勾选 | `src-tauri/src/markdown.rs`、`src-tauri/src/commands.rs` | 前端样式、打包脚本 | §2.3 |
| 改文件读写 / 编码识别 / 目录列表 | `src-tauri/src/fs_ops.rs`、`src-tauri/src/commands.rs` | `src-tauri/src/markdown.rs`、前端样式 | §2.4 |
| 改窗口 / 权限 / CSP / 图标生成 | `src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`、`scripts/generate-icons.mjs` | 业务代码 | §6 |

---

## 1. 文件职责速查（先看这张表）

| 文件 | 职责 | 何时改它 |
|---|---|---|
| `src/main.tsx` | React 18 挂载入口，加载 `App.tsx` 与 `styles.css` | 几乎不改 |
| `src/App.tsx` | 主工作台容器：管理多页签文档栈（`DocTabState[]`）、工具栏分组簇、左侧同级文件树、中央编辑器（含行号水槽与 2D 网格建表器）+ 阅读区、右侧 TOC、自动保存与图片灯箱 | 改多页签状态、工具栏、阅读/编辑联动、快捷键 |
| `src/components/TitleBar.tsx` | 无边框一体式自定义标题栏：左上角 MarkLeaf 图标下拉菜单、支持指针捕获拖拽重排与中键关闭的多页签栏、关于弹窗、右侧原生窗口控制按钮 | 改标题栏、页签拖拽交互、页签右键菜单 |
| `src/components/SettingsDialog.tsx` | 双栏偏好设置模态框：涵盖「外观与主题、阅读排版、编辑器、文件与大纲、快捷键速查」5 大分类及恢复默认设置 | 新增或调整偏好设置项 UI |
| `src/settings.ts` | 偏好设置类型定义、8 套精选主题元数据、5 档版心行宽映射、字体栈预设、`localStorage` 读写与保存前文本尾部换行/EOL 规范化函数 | 新增配置字段、主题或默认值 |
| `src/ui/Icon.tsx` | 零依赖 SVG 矢量图标组件（33 个语义化图标） | 新增工具栏或菜单图标 |
| `src/api.ts` | 前端唯一 IPC 调用层：封装全部 `invoke<...>('...')` 命令及浏览器预览模式（`web`）下的本地降级兜底 | 新增 / 修改 IPC 接口或类型定义 |
| `src/demoDoc.ts` | 内置欢迎与全语法演示文档 | 调整默认演示内容 |
| `src/styles.css` | 全局 UI 样式与 8 套 `.ml-prose` 印刷级主题（Paper / GitHub / Sepia / Solarized Light / Night / One Dark / Nord / Catppuccin Mocha） | 调排版美观度、主题配色、标题栏、行号水槽、弹窗样式 |
| `scripts/generate-icons.mjs` | 纯 Node.js 零依赖矢量光栅化图标生成器，生成 MarkLeaf 翠绿叶片 + 书页 `M` 徽章的多尺寸 PNG / ICO / ICNS 图标 | 重新设计或更新应用图标时 |
| `src-tauri/src/lib.rs` | Tauri 应用入口与 `generate_handler!` 命令注册表 | 新增或删除 Tauri 命令时 |
| `src-tauri/src/commands.rs` | `#[tauri::command]` 门面函数，连接 `markdown.rs` 与 `fs_ops.rs` | 新增或修改 IPC 命令签名 |
| `src-tauri/src/markdown.rs` | 基于 `comrak` 的 GFM + Alerts + TaskList + Footnotes + Math + `data-sourcepos` 渲染器、标题 `#slug` 锚点注入、TOC 提取、4 维字数统计与任务复选框行级写回 | 改 Markdown 语法支持、HTML 结构、大纲提取、复选框写回逻辑 |
| `src-tauri/src/fs_ops.rs` | CLI 启动路径提取、编码无损读写（UTF-8 / BOM / UTF-16 / GBK）、同目录 `.md` 文件列举、原生打开/保存文件对话框 | 改文件打开保存、编码探测、同级目录树扫描 |
| `tests/contract.test.mjs` | Node 契约测试：校验 `identifier`、CSP、capabilities 及 `commands.rs` ↔ `lib.rs` ↔ `src/api.ts` 三方 IPC 一致性 | 新增 IPC 命令或修改配置约束时 |

---

## 2. 按「我要做什么」反查代码位置（任务 → 入口）

### 2.1 前端多页签工作台、自定义标题栏与偏好设置（`src/App.tsx`、`src/components/*`、`src/settings.ts`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 多页签新建、打开、切换、拖拽排序与关闭 | `handleNewTab` / `openPathInTab` / `handleReorderTabs` / `handleCloseTab` | `TitleBar.tsx` 使用 Pointer Capture 实现 6px 阈值防误触拖拽并绘制 `.ml-tab-insertion-line` |
| 阅读态双击段落跳入编辑态并落焦对应行 | `handleReaderDoubleClick` / `jumpEditorToLine` | 向上查找最近的 `[data-sourcepos]` 属性，解析起始行号并定位编辑器光标与行号水槽 |
| 阅读态直接点击 `[x]` 任务框写回原文件 | `handleReaderClick` | 拦截 `.ml-task-checkbox` 点击，取所在行号调 `toggleMarkdownTask` |
| 标题 `#slug` 锚点复制与图片点击灯箱 | `handleReaderClick` | 点击 `.ml-heading-anchor` 复制 `#id`；点击 `<img>` 打开支持滚轮缩放的灯箱 |
| 编辑器行号水槽（完整 / MarkText 稀疏行号 1,10,20...） | `.ml-editor-gutter` | 与 `<textarea>` 同步 `scrollTop`，高亮当前活跃行 |
| 编辑器括号/引号/Markdown 符号自动配对 | `handleEditorKeyDown` (`PAIR_MAP`) | 根据 `autoPairBracket` / `autoPairQuote` / `autoPairMarkdown` 设置自动补全或包裹选区 |
| 可视化 2D 网格建表器与多格式复制（富文本/HTML/MD） | `insertGridTable` / `handleCopyRichText` | 鼠标悬停选择 M×N 行列插入 GFM 表格；使用 `ClipboardItem` 写入 `text/html` 富文本 |
| 8 套主题与跟随系统亮暗切换 | `THEME_OPTIONS` / `effectiveTheme` | 在 `document.documentElement` 上同步 `data-theme`，CSS 变量定义在 `src/styles.css` |

### 2.2 IPC 契约层（`src-tauri/src/commands.rs`、`src/api.ts`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 获取应用名与版本号 | `app_info` / `getAppInfo` | 版本号来自 `src-tauri/Cargo.toml` |
| 获取命令行双击传入的初始文档 | `startup_document` / `getStartupDocument` | 双击 `.md` 秒开的核心首屏通道，一次性返回原文 + HTML + TOC + 同级文件 |
| 打开指定路径的 Markdown 文档 | `open_markdown_file` / `openMarkdownFile` | 读取文件、探测编码、渲染 HTML 并返回同目录 `.md` 列表 |
| 弹出系统原生文件选择框打开/保存 | `pick_markdown_file` / `save_markdown_dialog` | 使用 Rust 原生文件对话框选路径，符合 AGENTS §3 最小范围原则 |
| 原编码保存编辑后的 Markdown | `save_markdown_file` / `saveMarkdownFile` | 保留原文件编码（UTF-8 / BOM / GBK）写回并返回最新渲染结果 |
| 实时渲染 Markdown 文本（编辑预览） | `render_markdown` / `renderMarkdown` | 纯内存极速渲染，返回 HTML + TOC + 4 维统计数据 |
| 阅读态勾选任务复选框行级写回 | `toggle_markdown_task` / `toggleMarkdownTask` | 只替换目标行的 `[ ]` ↔ `[x]`，100% 不改动其余行格式与空行 |

### 2.3 Rust 极速 Markdown 引擎（`src-tauri/src/markdown.rs`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 配置 `comrak` 扩展（GFM/Alerts/Footnotes/Math/Sourcepos） | `build_comrak_options` | 开启 `sourcepos = true` 输出 `data-sourcepos="L1:C1-L2:C5"` |
| 渲染 HTML、注入标题锚点按钮并计算 4 维字数统计 | `render_markdown_payload` / `post_process_html` | 一次性产出安全 HTML、`TocItem` 列表与 `DocStats`（词数/字数/含空格字符/段落数/行数/任务进度） |
| 按源码行号精准切换任务列表状态 | `toggle_task_at_line` | 仅修改 `line_number`（1-based）所在行的 `- [ ]` / `- [x]`，保持 CRLF/LF 原样 |

### 2.4 文件编码与目录操作（`src-tauri/src/fs_ops.rs`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 自动识别 UTF-8 / UTF-16 / GBK 编码读取文本 | `decode_bytes_lossless` | 优先检查 BOM，其次严格 UTF-8，回退 GBK（`encoding_rs::GBK`），杜绝中文乱码 |
| 按原文件编码写回磁盘 | `encode_text_with_encoding` | 根据读取时记录的编码标签原样编码写回，避免静默破坏旧文件编码 |
| 扫描当前文件所在目录的同级 `.md` 文件 | `list_sibling_markdown_files` | 只读同级单层 `.md`/`.markdown`/`.mdx`，按自然顺序排列供侧栏秒切 |

---

## 3. 重点链路详解（高频改动区 / 容易写错的地方）

### 3.1 双击 `.md` 极速首屏直出链路

- **需求语义**：用户在资源管理器双击 `.md` 或通过命令行 `markleaf README.md` 启动时，首屏不等多次往返 IPC，一次调用直接拿到完整 HTML、TOC、统计与同级文件树。
- **关键坑**：MarkText 需要等 Electron 主进程启动 → 渲染进程加载庞大 Vue/Muya Bundle → 多轮 IPC 请求文件 → 前端 JS 解析构造 Block 树，耗时 1.5s~3s。
- **正确实现**：Rust 在 `startup_document` 中直接解析 `std::env::args_os()`，发现合法 `.md` 路径即在同一函数内完成 `fs::read` + `decode_bytes_lossless` + `render_markdown_payload` + `list_sibling_markdown_files` 并一次性返回 `DocumentSession`（涉及函数：`startup_document`、`load_document_from_path`）。
- **调用链**：`OS Args` → `commands::startup_document` → `fs_ops::extract_cli_markdown_path` → `fs_ops::load_document_from_path` → `markdown::render_markdown_payload` → `api::getStartupDocument` → `App.tsx`。

### 3.2 阅读态与编辑态的行号锚定（`data-sourcepos`）与无损保存

- **需求语义**：阅读态双击任意段落直接切入编辑态并定位到对应源码行；阅读态勾选复选框直接修改该行而不重排全文格式。
- **关键坑**：MarkText 把全文 parse 成状态树再 serialize，导致未修改段落的空行、列表缩进和标题风格被改写。
- **正确实现**：`comrak` 开启 `render.sourcepos = true`，所有块级元素自带 `data-sourcepos="起始行:列-结束行:列"`；双击时前端读取该属性算出 1-based 行号并跳转光标；勾选复选框调 `toggle_task_at_line` 仅替换该行第一个 `[ ]`/`[x]`，原文件其余字节纹丝不动。

---

## 4. 数据流 / 接口契约（模块边界）

| 调用方 | 路由 / 入口 | 鉴权 | 关键字段 / 约定 |
|---|---|---|---|
| `src/api.ts` | `app_info` | 内部 IPC | 返回 `{ name, version }` |
| `src/api.ts` | `startup_document` | 内部 IPC | 返回 `Option<DocumentSession>`（含 `path, fileName, content, encoding, html, toc, stats, siblings`） |
| `src/api.ts` | `open_markdown_file` | 内部 IPC + 路径校验 | 入参 `{ path }`；返回 `Result<DocumentSession, String>` |
| `src/api.ts` | `pick_markdown_file` | 原生文件框 | 弹出系统文件选择框并打开选中的 Markdown，返回 `Result<Option<DocumentSession>, String>` |
| `src/api.ts` | `save_markdown_file` | 内部 IPC + 路径校验 | 入参 `{ path, content, encoding }`；按原编码保存并返回更新后的 `DocumentSession` |
| `src/api.ts` | `save_markdown_dialog` | 原生保存框 | 入参 `{ defaultName, content }`；另存为新文件并返回 `Option<DocumentSession>` |
| `src/api.ts` | `render_markdown` | 内部 IPC | 入参 `{ content }`；纯内存极速渲染，返回 `RenderedMarkdown { html, toc, stats }` |
| `src/api.ts` | `toggle_markdown_task` | 内部 IPC | 入参 `{ content, lineNumber, path, encoding }`；切换指定行任务状态，若传了 `path` 则同步写盘 |

**数据 / 单位约定**：所有行号（`line` / `lineNumber`）统一使用 **1-based**（与 `comrak` 的 `data-sourcepos` 一致）；文件编码使用标准名称（`"UTF-8"` / `"UTF-8 BOM"` / `"GBK"` / `"UTF-16LE"`）。

---

## 5. 样式 / 资源分段地图（`src/styles.css`）

| 区段 | 注释锚点（搜这个） | 内容 |
|---|---|---|
| 主题变量表 | `/* === [SECTION: THEMES] === */` | Paper、GitHub、Sepia、Solarized Light、Night、One Dark、Nord、Catppuccin Mocha 共 8 套亮/暗主题 CSS 变量 |
| 工作台壳体布局 | `/* === [SECTION: WORKBENCH] === */` | 无边框一体式标题栏与多页签栏、分组簇主工具栏、字数统计胶囊悬浮窗、三栏弹性工作区 |
| 印刷级正文排版 | `/* === [SECTION: PROSE] === */` | `.ml-prose` 5 档版心行宽、标题与 `#` 锚点按钮、GitHub Alerts、任务列表、代码块行号与折行、专注模式样式 |
| 便捷编辑器与模态框 | `/* === [SECTION: EDITOR] === */` | 格式化工具条、2D 网格建表选择器、同步滚动行号水槽、双栏偏好设置弹窗与图片灯箱样式 |

---

## 6. 运维 / 脚本（启停 / 配置 / 打包）—— 不碰业务即可独立维护

> 做运维任务只读本节 + `manager.sh` 及下列脚本，不用打开业务 / 前端代码。
> 具体操作步骤以 [`docs/02-使用说明.md`](docs/02-使用说明.md) 为准。

- **命令唯一来源**：`manager.sh`（`setup / dev / web / build / test / check / package / clean / check-docs`）；改命令先改它，再同步 README 与 AGENTS §4。
- **双击脚本**：根目录 `setup.bat dev.bat build.bat test.bat package.bat clean.bat` 经 `_manager.bat` 转交 `manager.sh`。
- **版本号**：只在 `src-tauri/Cargo.toml` 的 `version`；`tauri.conf.json` 省略 `version`；`package.json` 固定 `0.0.0`。
- **App 标识**：`src-tauri/tauri.conf.json` 的 `identifier`（`dev.markleaf.app`）。
- **无边框窗口与权限**：`tauri.conf.json` 中 `decorations: false`，`src-tauri/capabilities/default.json` 中显式声明 `core:window:allow-minimize`、`core:window:allow-toggle-maximize`、`core:window:allow-close`、`core:window:allow-start-dragging`。

---

## 7. 易踩的坑 / 设计取舍

- **`tests/contract.test.mjs` 的正则匹配约束**：契约测试通过正则 `/#\[tauri::command\][\s\S]*?pub (?:async )?fn (\w+)/g` 扫描 `src-tauri/src/commands.rs`，并扫描 `src/api.ts` 中的 `/invoke<[^>]+>\('([^']+)'(?:,|\))/g`。因此**所有 Tauri 命令必须定义在 `commands.rs` 中，且 `src/api.ts` 中每个命令调用必须写成单行 `invoke<ReturnType>('cmd_name', ...)` 形式**。
- **禁止引入 `@tauri-apps/plugin-*` npm 包**：`tests/contract.test.mjs` 明确断言 `package.json` 不含 `@tauri-apps/plugin-*` 且 `capabilities/default.json` 只含 `core:*` 权限。因此文件打开/保存对话框直接在 Rust 侧用轻量 `rfd` crate 实现并走自有 IPC 命令，无边框窗口控制使用 `@tauri-apps/api/window` 内置的 `core:window:*` 权限。
- **不破坏原文件格式铁律**：阅读态勾选复选框绝不能用 AST 序列化回写全文，必须走 `markdown::toggle_task_at_line` 按行号原位替换，保留原文件全部空行、缩进与换行符（CRLF/LF）。
