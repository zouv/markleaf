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

Tauri 2（Rust 原生 `comrak` 极速 Markdown 解析 + `encoding_rs` 无损编码读写 + 同级目录树与 CLI 秒开捕获）+ React 18（印刷级多主题阅读视图 + 行号锚定双击就地编辑 + 响应式浮动大纲与同级文件栏）。

```
双击 .md / CLI 参数 / 界面打开
        │
        ▼
src-tauri/src/lib.rs & commands.rs (IPC 门面)
  ├── markdown.rs ──► comrak GFM/Alerts/TaskList/Footnotes/Math + data-sourcepos 行号映射 + TOC 提取 + 任务框行级切换
  └── fs_ops.rs   ──► encoding_rs 编码探测读写 + 原生文件选择弹窗 + 同级目录 Markdown 文件树
        │
        ▼  src/api.ts (强类型 IPC 契约)
        │
src/App.tsx (React 18 读写双态工作台)
  ├── 极速阅读视图 (.ml-prose) ──► 多套精品主题 + 代码块一键复制 + 任务框直接点击写回 + 双击任意段落按行号精准落焦编辑
  ├── 便捷编辑视图             ──► フォーマット工具栏 (粗/斜/高亮/代码/链接/表格/Alerts) + 分屏实时预览 + Ctrl+S 原编码无损保存
  └── 效率侧栏 & 浮动大纲      ──► 同目录文件树切换 + 标题大纲定位 + 文档统计面板 + 全文关键字检索
```

架构约束：Rust 负责全部重计算（Markdown AST 解析、HTML 生成、TOC 提取、统计、文件编码探测与行级原地修改），前端不跑重型虚拟 DOM 富文本状态机，确保冷启动与大文档切换毫秒级响应。

---

## 0.5 任务作用域路由（先定范围，避免污染上下文）

> **怎么用**：动手前先在下表找到你的任务类型，只读「该读」列的文件 / 小节，「可忽略」列默认不打开（证据指向那里时除外，见 AGENTS §0）。

| 任务类型 | 该读（仅限） | 可忽略 | 入口小节 |
|---|---|---|---|
| 改界面 / 阅读主题 / 编辑器交互 | `src/App.tsx`、`src/demoDoc.ts`、`src/api.ts`、`src/styles.css` | `src-tauri/` 的 Rust 实现、打包脚本 | §2.1 |
| 加 / 改 IPC 命令 | `src-tauri/src/commands.rs`、`src-tauri/src/lib.rs`、`src/api.ts`、`tests/contract.test.mjs` | `src/styles.css`、窗口配置 | §2.2 |
| 改 Markdown 解析 / 大纲 / 任务勾选 | `src-tauri/src/markdown.rs`、`src-tauri/src/commands.rs` | 前端样式、打包脚本 | §2.3 |
| 改文件读写 / 编码识别 / 目录列表 | `src-tauri/src/fs_ops.rs`、`src-tauri/src/commands.rs` | `src-tauri/src/markdown.rs`、前端样式 | §2.4 |
| 改窗口 / 权限 / CSP / 文件关联 | `src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json` | 业务代码 | §6 |
| 改版本 / 打包 / 双击脚本 | `src-tauri/Cargo.toml`、`manager.sh`、`*.bat` | 前后端业务代码 | §6 |

---

## 1. 文件职责速查（先看这张表）

| 文件 | 职责 | 何时改它 |
|---|---|---|
| `src/main.tsx` | React 18 挂载入口，加载 `App.tsx` 与 `styles.css` | 几乎不改 |
| `src/App.tsx` | 主工作台界面：顶部极简栏、左侧同级目录文件树、中间阅读/编辑双态视图、右侧响应式大纲（TOC）、底部统计状态栏与快捷键处理 | 改 UI 布局、阅读/编辑切换、快捷键、搜索、主题切换 |
| `src/api.ts` | 前端唯一 IPC 调用层：封装全部 `invoke<...>('...')` 命令及浏览器预览模式（`web`）下的本地降级兜底 | 新增 / 修改 IPC 接口或类型定义 |
| `src/demoDoc.ts` | 内置欢迎与全语法演示文档（当未传 CLI 文件或处于 `sh manager.sh web` 预览时展示） | 调整默认演示内容 |
| `src/styles.css` | 全局 UI 样式与 `.ml-prose` 印刷级 Markdown 排版主题（Paper / GitHub / Nord Dark / Solarized 等 CSS 变量主题） | 调排版美观度、主题配色、代码块/表格/Alerts 样式 |
| `src-tauri/src/lib.rs` | Tauri 应用入口与 `generate_handler!` 命令注册表 | 新增或删除 Tauri 命令时 |
| `src-tauri/src/commands.rs` | `#[tauri::command]` 门面函数，连接 `markdown.rs` 与 `fs_ops.rs` | 新增或修改 IPC 命令签名 |
| `src-tauri/src/markdown.rs` | 基于 `comrak` 的 GFM + Alerts + TaskList + Footnotes + Math + `data-sourcepos` 渲染器、TOC 提取、字数统计与任务复选框行级写回 | 改 Markdown 语法支持、HTML 结构、大纲提取、复选框写回逻辑 |
| `src-tauri/src/fs_ops.rs` | CLI 启动路径提取、编码无损读写（UTF-8 / BOM / UTF-16 / GBK）、同目录 `.md` 文件列举、原生打开/保存文件对话框 | 改文件打开保存、编码探测、同级目录树扫描 |
| `tests/contract.test.mjs` | Node 契约测试：校验 `identifier`、CSP、capabilities 及 `commands.rs` ↔ `lib.rs` ↔ `src/api.ts` 三方 IPC 一致性 | 新增 IPC 命令或修改配置约束时 |

---

## 2. 按「我要做什么」反查代码位置（任务 → 入口）

### 2.1 前端工作台与读写双态交互（`src/App.tsx`、`src/styles.css`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 启动加载 CLI 文件或默认演示文档 | `initStartupDocument` | 调 `getStartupDocument()`，若无传入路径则渲染 `DEMO_MARKDOWN` |
| 阅读态双击段落跳入编辑态并落焦对应行 | `handleProseDoubleClick` | 向上查找最近的 `[data-sourcepos]` 属性，解析起始行号并定位编辑器光标 |
| 阅读态直接点击 `[x]` 任务框写回原文件 | `handleProseClick` | 拦截 `input[type="checkbox"]` 点击，取所在行号调 `toggleTaskOnLine` |
| 代码块一键复制按钮交互 | `handleProseClick` | 拦截 `.ml-code-copy` 按钮，复制对应 `<pre><code>` 文本并给视觉反馈 |
| 编辑态快捷格式化插入（粗体/标题/代码块/表格/Alert） | `applyEditorFormat` | 对当前 textarea 选区包裹或插入 Markdown 片段并触发实时预览 |
| 切换阅读主题（Paper / GitHub / Sepia / Night） | `ThemeMode` / `[data-theme=...]` | 根节点切换 `data-theme`，CSS 变量见 `src/styles.css` |

### 2.2 IPC 契约层（`src-tauri/src/commands.rs`、`src/api.ts`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 获取应用名与版本号 | `app_info` / `getAppInfo` | 版本号来自 `src-tauri/Cargo.toml` |
| 获取命令行双击传入的初始文档 | `startup_document` / `getStartupDocument` | 双击 `.md` 秒开的核心首屏通道，一次性返回原文 + HTML + TOC + 同级文件 |
| 打开指定路径的 Markdown 文档 | `open_markdown_file` / `openMarkdownFile` | 读取文件、探测编码、渲染 HTML 并返回同目录 `.md` 列表 |
| 弹出系统原生文件选择框打开/保存 | `pick_markdown_file` / `save_markdown_dialog` | 使用 Rust 原生文件对话框选路径，符合 AGENTS §3 最小范围原则 |
| 原编码保存编辑后的 Markdown | `save_markdown_file` / `saveMarkdownFile` | 保留原文件编码（UTF-8 / BOM / GBK）写回并返回最新渲染结果 |
| 实时渲染 Markdown 文本（编辑预览） | `render_markdown` / `renderMarkdown` | 纯内存极速渲染，返回 HTML + TOC + 统计数据 |
| 阅读态勾选任务复选框行级写回 | `toggle_markdown_task` / `toggleMarkdownTask` | 只替换目标行的 `[ ]` ↔ `[x]`，100% 不改动其余行格式与空行 |

### 2.3 Rust 极速 Markdown 引擎（`src-tauri/src/markdown.rs`）

| 我要改的东西 | 关键函数 / 锚点 | 备注 |
|---|---|---|
| 配置 `comrak` 扩展（GFM/Alerts/Footnotes/Math/Sourcepos） | `build_comrak_options` | 开启 `sourcepos = true` 输出 `data-sourcepos="L1:C1-L2:C5"` |
| 渲染 HTML 并增强代码块头部与安全过滤 | `render_markdown_payload` | 一次性产出安全 HTML、`TocItem` 列表与 `DocStats`（字数/行数/阅读时长） |
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
| 主题变量表 | `/* === [SECTION: THEMES] === */` | Paper（默认暖白书页）、GitHub Light、Sepia（羊皮纸护眼）、Obsidian Night（深色）四套 CSS 变量 |
| 工作台壳体布局 | `/* === [SECTION: WORKBENCH] === */` | 顶栏、三栏弹性工作区（左侧同级文件、中间阅读/编辑区、右侧浮动大纲）、底部状态栏 |
| 印刷级正文排版 | `/* === [SECTION: PROSE] === */` | `.ml-prose` 标题、段落、表格、GitHub Alerts、任务列表、代码块头部与行号、引用块、脚注样式 |
| 便捷编辑器与工具栏 | `/* === [SECTION: EDITOR] === */` | 格式化快捷工具栏、源码/分屏实时预览编辑器、搜索栏与快捷键提示样式 |

---

## 6. 运维 / 脚本（启停 / 配置 / 打包）—— 不碰业务即可独立维护

> 做运维任务只读本节 + `manager.sh` 及下列脚本，不用打开业务 / 前端代码。
> 具体操作步骤以 [`docs/02-使用说明.md`](docs/02-使用说明.md) 为准。

- **命令唯一来源**：`manager.sh`（`setup / dev / web / build / test / check / package / clean / check-docs`）；改命令先改它，再同步 README 与 AGENTS §4。
- **双击脚本**：根目录 `setup.bat dev.bat build.bat test.bat package.bat clean.bat` 经 `_manager.bat` 转交 `manager.sh`。
- **版本号**：只在 `src-tauri/Cargo.toml` 的 `version`；`tauri.conf.json` 省略 `version`；`package.json` 固定 `0.0.0`。
- **App 标识**：`src-tauri/tauri.conf.json` 的 `identifier`（`dev.markleaf.app`）。
- **开发端口**：只在 `tauri.conf.json` 的 `build.devUrl` 定义。

---

## 7. 易踩的坑 / 设计取舍

- **`tests/contract.test.mjs` 的正则匹配约束**：契约测试通过正则 `/#\[tauri::command\][\s\S]*?pub (?:async )?fn (\w+)/g` 扫描 `src-tauri/src/commands.rs`，并扫描 `src/api.ts` 中的 `/invoke<[^>]+>\('([^']+)'\)/g`。因此**所有 Tauri 命令必须定义在 `commands.rs` 中，且 `src/api.ts` 中每个命令调用必须写成单行 `invoke<ReturnType>('cmd_name', ...)` 形式**，不要把泛型拆成多行或封装二级 helper 隐藏命令名字符串，否则契约测试会报错。
- **禁止引入 `@tauri-apps/plugin-*` npm 包**：`tests/contract.test.mjs` 明确断言 `package.json` 不含 `@tauri-apps/plugin-*` 且 `capabilities/default.json` 只含 `core:*` 权限。因此文件打开/保存对话框直接在 Rust 侧用轻量 `rfd` crate 实现并走自有 IPC 命令，既安全又不触发插件权限膨胀。
- **不破坏原文件格式铁律**：阅读态勾选复选框绝不能用 AST 序列化回写全文，必须走 `markdown::toggle_task_at_line` 按行号原位替换，保留原文件全部空行、缩进与换行符（CRLF/LF）。
