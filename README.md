# markleaf

极速秒开、排版精美、编辑便捷的桌面 Markdown 阅读与编辑工具（基于 Tauri 2 + Rust + React 18）。

## 用途 / 动机

解决传统 Electron Markdown 工具（如 MarkText）冷启动慢（2s+）、内存占用高、以及「解析再序列化」改动用户原文件未修改行格式的痛点。MarkLeaf 采用 **Rust 原生 `comrak` 微秒级解析 + 读写双态分离架构**：
1. **双击 `.md` 极速秒开**：Rust 主进程直接捕获 CLI 文件路径并一次性完成编码探测、GFM/Alerts/TaskList 渲染、大纲提取与同级目录扫描，直出首屏 HTML。
2. **印刷级美观排版**：内置 Paper（暖白书页）、GitHub、Sepia（羊皮纸护眼）、Obsidian Night（暗夜）4 套精品阅读主题，支持代码块语法着色与一键复制、GitHub Alerts 卡片、优雅表格与数学公式块展示。
3. **便捷就地编辑 & 100% 保格式保存**：阅读态可直接点击勾选 `[x]` 任务复选框并按行号原位写回文件；双击任意正文段落即可按源码行号（`data-sourcepos`）精准跳入编辑态对应行，支持格式化工具栏与分屏实时预览，保存时保留原文件编码（UTF-8 / BOM / UTF-16 / GBK）与全部未修改行格式。

## 快速开始

需要 Rust、Node.js 与各平台的 Tauri 系统依赖（见下文）。首次：

```bash
sh manager.sh setup   # 安装前端依赖（npm ci）
sh manager.sh dev     # tauri dev：Vite + Rust，改前端热更新；Ctrl-C 退出
sh manager.sh package # 生产打包，安装包复制到 dist/
```

只想预览界面、不跑 Rust：`sh manager.sh web`（浏览器打开 Vite 地址，自动加载内置全语法演示文档）。

## manager.sh 命令一览

所有命令都通过 `sh manager.sh <命令>` 执行（Windows 用 Git Bash），与 `sh manager.sh help` 一致：

| 命令 | 说明 |
|---|---|
| `setup` | 首次安装前端依赖（`npm ci`；没有锁文件时 `npm install`） |
| `dev` | 开发模式：`tauri dev`（Vite + Rust，热更新） |
| `web` | 仅启动 Vite 预览前端（浏览器里，IPC 不可用） |
| `build` | 构建前端到 `dist/`（`tsc --noEmit` + `vite build`） |
| `test` | 跑 tsc + node 契约测试 + cargo test（全部跑完再汇总） |
| `check` | `cargo fmt --check` + `cargo clippy -D warnings` + tsc |
| `package` | `tauri build` 并复制安装包到 `dist/`（首次很慢） |
| `clean` | 清理 `dist/`、`src-tauri/target`、`.runtime`（`--all` 连 `node_modules`） |
| `check-docs` | 文档体系机械体检（同 `sh check-docs.sh`） |
| `help` | 显示帮助 |

## 双击脚本（Windows）

根目录的 `.bat` 是资源管理器里双击用的快捷入口，经 `_manager.bat` 定位 Git Bash 后转交 `manager.sh`（不含逻辑）：

| 脚本 | 作用 |
|---|---|
| `setup.bat` | 安装前端依赖 |
| `dev.bat` | 启动 `tauri dev`（Ctrl+C 停止） |
| `build.bat` | 构建前端到 `dist/` |
| `test.bat` | 跑全部测试 |
| `package.bat` | 打包并复制安装包到 `dist/` |
| `clean.bat` | 清理构建产物 |

设置环境变量 `MARKLEAF_NO_PAUSE=1` 可跳过结尾暂停；Git Bash 不在标准位置时用 `MARKLEAF_BASH_EXE` 指定 `bash.exe`。

## 依赖与前置条件

- **Rust** stable（[rustup](https://rustup.rs/)）与 Cargo；`cargo fmt` / `cargo clippy` 组件。
- **Node.js** 20.19+ 或 22.12+（Vite 要求），随带 npm；Tauri CLI 已作为本地 devDependency，无需全局安装。
- **平台依赖**（Tauri 2 要求）：
  - Windows：MSVC Build Tools + **WebView2 Runtime**（Windows 11 / 较新的 Windows 10 已自带；安装包默认用 `downloadBootstrapper` 兜底）。
  - macOS：Xcode Command Line Tools。
  - Linux：`webkit2gtk-4.1`、`libgtk-3`、`libayatana-appindicator3` 等，见 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)。
- 技术栈与选型理由见 [`docs/01-技术栈说明.md`](docs/01-技术栈说明.md)（单一信息源，勿在此重复维护）。

## 目录结构

```
src/                        # React 18 + TypeScript 前端
  main.tsx                  # 前端挂载入口
  App.tsx                   # 阅读/编辑双态主工作台、大纲、同目录文件树、快捷键与搜索
  api.ts                    # 类型化 IPC 封装与浏览器预览降级兜底
  demoDoc.ts                # 内置全语法演示文档
  styles.css                # 工作台与 4 套 .ml-prose 印刷级阅读主题样式
src-tauri/                  # Rust 后端与 Tauri 配置
  src/lib.rs                # Tauri Builder，IPC 命令注册
  src/commands.rs           # #[tauri::command] 命令门面
  src/markdown.rs           # comrak GFM/Alerts/TaskList/Sourcepos 极速解析、TOC 提取与任务行级切换
  src/fs_ops.rs             # CLI 启动路径捕获、encoding_rs 编码探测读写、同级目录树扫描与原生文件对话框
  capabilities/default.json # 窗口权限（默认只有 core:default）
  tauri.conf.json           # 窗口 / CSP / 打包 / identifier / devUrl
  icons/                    # 应用图标
tests/contract.test.mjs     # node:test：配置与 IPC 契约校验
dist/                       # 前端构建产物与复制出的安装包（不入库）
manager.sh                  # 统一管理脚本（所有命令的唯一来源）
*.bat                       # Windows 双击入口（_manager.bat 是共用部分）
docs/                       # 使用/维护文档（面向人）
AGENTS.md                   # AI 工作规则（AI 开工先读）
ARCHITECTURE.md             # 代码链路图谱（面向 AI）
ROADMAP.md                  # 开发路线图（总体计划与完成度）
CHANGELOG.md                # 发布变更记录（按版本）
HANDOFF.md                  # 会话接力（进行中状态）
```

## 约定

- **版本号**只在 `src-tauri/Cargo.toml` 的 `version`；`tauri.conf.json` 不写 `version`，前端经 `app_info` 命令读取。
- **App 标识**在 `src-tauri/tauri.conf.json` 的 `identifier`（`dev.markleaf.app`），发布后不可改。
- **图标**是占位图：`npm run tauri icon path/to/icon.png`（1024×1024）会重写 `src-tauri/icons/`。
- **IPC 契约**由 `tests/contract.test.mjs` 校验：Rust 命令、`generate_handler!` 注册、前端 `invoke` 必须三方一致。

> AI 协作说明：本项目采用一套「AI 协作文档体系」，AI 代理开工请先读 [`AGENTS.md`](./AGENTS.md)。
