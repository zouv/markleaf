# Agent 指南 · markleaf

> 本文件给在 **markleaf 内**工作的 AI 代理：定「怎么干、先读哪、改完要更新哪」。每次开工先读本文件，再读 `HANDOFF.md`。
> 文中「ARCH §x」指 `ARCHITECTURE.md` 的章节；不带前缀的 §x 指本文件。

---

## 0. 先读链路图谱，别全量扫代码

[`ARCHITECTURE.md`](./ARCHITECTURE.md) 是本项目的代码导航：文件职责、任务 → 代码位置、接口契约、重点链路、易踩坑。改代码或排查问题时：

1. 先看 **ARCH §0.5 作用域路由**，确定该读哪些文件、哪些可以不看；再按需看 ARCH §1 文件职责、ARCH §2 任务 → 入口。只读命中的小节，不必通读全文。
2. 按**函数名 / 注释锚点** grep 跳转，不依赖行号（行号会漂移）。图谱是加速索引不是权威：函数名搜不到或对不上时，以代码为准，并顺手订正那一行（ARCH §2 自愈规则）。
3. 只读作用域内的函数 / 小节，「可忽略」列的文件默认不打开。**证据优先**：报错栈、调用链或 grep 结果指向某个文件时，即使它在「可忽略」列也照读。
4. 碰到高频坑或关键链路，先看 ARCH §3 重点链路、ARCH §4 接口契约、ARCH §7 易踩坑，里面写了正确做法与反模式。

> 目的：节省上下文与 token，不让任务无关的代码干扰判断。

---

## 0.5 文档地图（各份文档各管什么）

| 文档 | 角色 | 何时读 | 何时写 |
|---|---|---|---|
| `AGENTS.md`（本文件） | **工作规则**（长期） | 每次开工 | 发现新的长期规则 / 约束时 |
| `ARCHITECTURE.md` | **代码链路图谱**（面向 AI） | 定位代码、排查问题前（先看 ARCH §0.5） | 代码结构变化后（见 §1） |
| `ROADMAP.md` | **总体开发计划**（规划与完成度） | 想知道「整体规划、做到哪了、还剩什么」 | 任务 / 里程碑完成后更新状态；规划调整时（见 §5.2） |
| `CHANGELOG.md` | **发布变更记录**（面向使用者） | 想知道「哪个版本发布了什么」 | 有使用者可感知的改动时记入 `[未发布]`；发版时归档（见 §5.3） |
| `HANDOFF.md` | **进行中状态**（临时） | 每次开工 | 开新任务、完成子步骤、会话结束 / 中断前（见 §5.1） |
| `docs/` | **使用 / 维护文档**（面向人，不一定懂代码） | 想知道「怎么用、为什么、有什么坑」 | 用户用 `doc-record` 要求记录时（见下） |

> 一句话区分：**ROADMAP = 计划与完成度**；**HANDOFF = 还在路上的活**；**CHANGELOG = 发布变更记录**。同一内容不在三处重复存放。
> **`docs/` vs `ARCHITECTURE.md`**：前者给**人**看（怎么用 / 为什么 / 有什么坑）；后者给 **AI** 看（代码在哪 / 怎么连）。每类信息的去处见 §5.0。
> **技能**（只在用户明确要求时使用，不自动触发；详见 `.claude/skills/<name>/SKILL.md`）：`doc-record`（「记进 docs」：把结论沉淀进 `docs/`）· `doc-audit`（「审一下文档」：查文档与代码的漂移）· `init-docs`（「初始化文档」：AI-INIT 没被执行时的手动入口）。

### 入口加载约定

- 项目根的 `CLAUDE.md` 只有一行 `@AGENTS.md`，让 Claude Code 每次开工自动加载本文件。上层目录有 `CLAUDE.md` 时 Claude Code 不会自己读 `AGENTS.md`，所以这一行不能省；其它代理工具直接读 `AGENTS.md`。本文件是唯一信息源，不在 `CLAUDE.md` 里重复内容。
- 回答用户用**中文**，且每次回复开头都要先喊一声「啊唯」。

---

## 1. 改了代码结构，同步更新链路图谱

图谱过期会误导之后的每一次迭代，比没有图谱更糟，所以把更新它当成代码改动的一部分：

- 新增 / 删除 / 重命名 ARCH §2 已登记的入口函数，或出现新的常见改动入口 → 更新 ARCH §2。
- 新增 / 改动接口或字段 → 更新 ARCH §4。
- 改动关键链路 → 更新 ARCH §3。
- 新增 / 删除顶层文件或模块 → 更新 ARCH §1 与 ARCH §0.5。
- 踩到值得长期记住的坑、做了需要留下理由的设计取舍 → 记入 ARCH §7。

### 1.1 文档体量（防止文档自己变成 token 黑洞）

这几份文档每次开工都要读，越长越费 token、越不容易被遵循。上限按**字符数**计（`sh check-docs.sh` 会算）：

| 文档 | 上限 | 超了怎么办 |
|---|---|---|
| `AGENTS.md` | 200 行（Claude Code 官方建议） | 删过时规则；只对部分代码生效的规则下沉到 ARCH 对应小节 |
| `ARCHITECTURE.md` | 25,000 字 | 拆分：总览只留 ARCH §0 / §0.5 / §1，各模块的 §2 / §3 拆到 `arch/<module>.md`，由 ARCH §0.5「入口小节」列指向 |
| `arch/<module>.md` | 每份 25,000 字 | 按子模块继续拆 |
| `HANDOFF.md` | 8,000 字 | 按 §5.0 把不属于这里的内容迁走 |
| `ROADMAP.md` | 10,000 字 | 已交付里程碑的大纲条目删掉，在「已交付里程碑」压成一行（§5.2） |

写法：表格单元格一般不超过 150 字，写「是什么、在哪、为什么」即可；不写日期、版本、改动经过（归 CHANGELOG / git log）。ARCH §2 只登记常见改动的入口函数，不是全量函数表。

---

## 2. 本项目技术约束（动手前先知道）

- 技术栈：Rust / Tauri 2 + React 18 / TypeScript / Vite / node:test / cargo test·clippy·rustfmt。构建 / 运行 / 测试命令统一见 §4。
- 分层：`src-tauri/src/`（Rust 侧：`commands.rs` 是 IPC 入口，`markdown.rs` 负责 `comrak` 极速解析/大纲提取/行号映射/复选框精准切换，`fs_ops.rs` 负责编码识别读写与同级目录列举，`lib.rs` 做注册与 CLI 参数捕获）→ `src/`（React UI，薄；所有 IPC 经 `src/api.ts` 的类型化封装）→ `tests/`（node:test 契约测试）。组件里不直接 `invoke`，Rust 命令里不写 UI 逻辑。
- **版本号唯一出处 `src-tauri/Cargo.toml` 的 `version`**：`tauri.conf.json` 不写 `version`（省略时回退到 Cargo.toml）；前端经 `app_info` 命令读取；`package.json` 的 `version` 固定 `0.0.0` 且不使用。发版只改 Cargo.toml。
- **App 标识唯一出处 `src-tauri/tauri.conf.json` 的 `identifier`**（`dev.markleaf.app`）：它决定安装标识与用户数据目录，发布后不可改。
- **IPC 契约三方一致**：Rust `#[tauri::command]` + `lib.rs` 的 `generate_handler!` + `src/api.ts` 的 `invoke` 封装；新增命令时三处一起改，并让 `tests/contract.test.mjs` 通过。命令名 / 参数 / 返回类型都是契约，不要动态拼命令名。
- **能力最小化**：`src-tauri/capabilities/default.json` 只给用到的权限，默认只有 `core:default`。新增插件权限前先说明为什么现有命令做不到。
- **CSP 生产收紧**：`tauri.conf.json` 的 `app.security.csp` 不允许 `unsafe-eval`，`script-src` 不加 `unsafe-inline`；`devCsp` 只服务 Vite 热更新，不要把开发放宽项复制进 `csp`。
- **前端开发**：`sh manager.sh web` 只在浏览器预览界面（提供内置示例文档兜底）；完整开发用 `sh manager.sh dev`。Vite 端口只在 `tauri.conf.json` 的 `build.devUrl` 定义，`vite.config.ts` 从中读取，不要另写一份。
- 依赖：前端 `package-lock.json` 入库、脚本里用 `npm ci`；Rust 依赖在 `src-tauri/Cargo.toml`，首次构建生成的 `src-tauri/Cargo.lock` 入库。
- Rust 风格：`cargo fmt` / `cargo clippy -- -D warnings` 必须通过；可能失败的命令返回 `Result<T, E>`（E 实现 `Serialize`），不要 `unwrap` 用户输入或 IO 错误。

---

## 3. 安全 / 数据约束（违反即 bug）

- **能力最小化（capabilities）**：只声明实际用到的权限，默认仅 `core:default`。不引入不必要的 `@tauri-apps/plugin-*`。
- **IPC 输入不可信 & 不破坏原文件编码与格式**：文件读写必须校验存在性与扩展名，自动探测 UTF-8 / UTF-8 BOM / UTF-16 / GBK 编码；阅读模式不改写原文件字节，勾选任务列表仅对目标行做精确行级替换并保留原换行符（LF/CRLF）。
- **HTML 安全消毒**：Rust `comrak` 渲染后的 HTML 或前端挂载前必须过滤危险标签/事件属性（禁止 `<script>`、`onload`/`onerror`、`javascript:` URL），防止恶意 `.md` 文件在桌面 WebView 中触发 XSS。
- **CSP 不可放宽成 `unsafe-eval`**：生产 `csp` 的 `script-src` 不加 `unsafe-inline`。
- **WebView 只加载本地打包资源**：不要在应用窗口里加载远程页面；`devUrl` 只在开发时使用。

### 3.1 个人信息与仓库卫生（铁律）

禁止提交**与项目无关的个人信息或本机数据**：
- 本机路径（`C:\Users\<用户名>\...`、`D:\...`、`/home/<用户名>/...`、`AppData\...`）与设备信息（计算机名、真实用户名、序列号、MAC、非示例 IP、硬件 / 系统指纹）。
- 个人身份（真实姓名、私人 / 工作邮箱、电话、社交账号、公司内部信息）与凭据 / 私有数据（密钥、token、cookie、私钥、浏览器 profile、聊天记录、用户数据库、日志、真实业务数据）。
- 截图中的用户名、路径、最近项目、窗口标题、通知，以及图片的 EXIF / GPS 等元数据。

示例统一使用占位符：`C:\path\to\project`、`/home/user/project`、`user@example.com`、`alice`；项目自身的公开仓库名、包名、版权主体与依赖来源不在此列。

**提交 / 推送前自检：** ① `git status --porcelain` 只包含预期文件，`.env`、`.runtime/`、日志、缓存、用户 profile 不入库；② 用 `git grep` 扫真实姓名、邮箱、用户名、本机路径、主机名与设备标识；③ `git log --format='%an <%ae>%n%cn <%ce>' | sort -u` 只显示项目约定身份；④ 提交信息只描述改动，不写个人联系方式或敏感上下文；⑤ 图片 / 二进制先查尺寸与元数据。

**发现泄露时：** 先清理工作树，不能以「文件已删除」代替历史清理。已进入历史时，先备份 bundle 并取得用户明确授权再重写。

---

## 4. 验证（改完怎么确认没坏）

命令的唯一来源是 `manager.sh`（`sh manager.sh help` 看全部）；新增或修改命令先改它，再同步这里和 README 的命令表（`sh check-docs.sh` 会核对 help 与 README 是否一致）：

- 开发运行：`sh manager.sh dev`（`tauri dev`：Vite + Rust；前端热更新，Rust 改动自动重编）
- 仅预览前端：`sh manager.sh web`（浏览器打开 Vite 地址；IPC 不可用时自动展示内置演示文档）
- 测试：`sh manager.sh test`（tsc + node:test 契约测试 + cargo test，三项都跑完再汇总）
- 交付前检查：`sh manager.sh check`（cargo fmt --check + cargo clippy -D warnings + tsc）
- 打包：`sh manager.sh package`（`tauri build`；安装包会复制到 `dist/`，首次编译很慢）
- Windows 资源管理器里双击：`setup.bat` `dev.bat` `build.bat` `test.bat` `package.bat` `clean.bat`

改代码后至少跑测试或 lint；**文档体检**：改了文档后跑 `sh check-docs.sh`，有 FAIL 时退出码为 1。

---

## 5. 随开发维护 HANDOFF / ROADMAP / CHANGELOG

这三份文档随开发推进主动维护，是工作的一部分，不需要用户提醒。

### 5.0 信息去向

| 信息 | 去处 |
|---|---|
| 当前任务、半成品位置、下一步、阻塞 | `HANDOFF.md` |
| 代码已完成、等用户验收 | `HANDOFF.md`「待验收」（最多 5 条） |
| 本任务内的临时决策 | `HANDOFF.md`「本任务决策」；收尾时仍长期有效的迁到 ARCH §7 |
| 计划、优先级、里程碑完成度 | `ROADMAP.md`（条目级：✅ + 日期 + 一句话结论） |
| 长期有效的代码坑、约束、设计理由 | ARCH §7（或对应分册） |
| 运行 / 测试 / 环境注意事项 | 本文 §4 |
| 面向人的使用 / 维护 / 调试知识 | `docs/`（用户要求时用 doc-record） |
| 使用者可感知的已完成改动 | `CHANGELOG.md` 的 `[未发布]` |
| 改动经过、历次测试基线、提交 hash | 不记，git log 可查 |

### 5.1 `HANDOFF.md`（进行中状态）

1. **开工（先读再动）**：读「当前任务 / 进行中 / 待验收 / 下一步」，从断点续作。
2. **接新任务（先写后做）**：动手前写下目标、范围（按 ARCH §0.5）、完成定义、下一步动作清单。
3. **干活中（即时同步，不要攒）**：每完成一个子步骤就勾选，写清半成品的确切位置（文件 + 函数）和代码状态，刷新「下一步」。
4. **会话结束 / 被中断前**：至少留下当前任务与完成定义、半成品确切位置与代码状态、下一步第一条动作、最后验证状态、状态日期。
5. **任务完结（最容易漏）**：成果写入 CHANGELOG、计划条目在 ROADMAP 打 ✅ 的同一会话内，把开工时写下的计划痕迹一并清掉，状态快照改回「无进行中任务」。

### 5.2 `ROADMAP.md`（总体开发计划）

- 任务完成 → 对应条目打 ✅ + 日期（任务名加 ~~删除线~~）。
- 里程碑交付 → 把它在大纲里的已完成条目删掉，在「已交付里程碑」压成一行。
- 新规划 / 优先级调整 → 更新大纲表。

### 5.3 `CHANGELOG.md`（发布变更记录）

- 完成一个**使用者可感知的改动** → 记入 `[未发布]`，按 `新增 / 变更 / 修复 / 移除 / 废弃 / 安全` 归类。
- **发版**：把 `[未发布]` 整理到新版本号下，清空 `[未发布]`；版本号只在 `src-tauri/Cargo.toml` 维护。
- **分支策略**：开发时直接在主分支提交，不要另建功能 / 修复分支；只有用户明确要求时才新建分支。

### 5.4 完成定义（Definition of Done）

- **轻量改动**：满足第 1、2 条即可。
- **常规 / 结构性改动**：下面 6 条都满足才算完成：① 代码验证通过；② 只读/只改作用域内文件；③ `ARCHITECTURE.md` 同步；④ `CHANGELOG.md` 记入 `[未发布]`；⑤ `ROADMAP.md` 更新；⑥ `HANDOFF.md` 收尾且 `sh check-docs.sh` 通过。

<!-- vibe-coding-starter 2026-11-10.1 · 文档体系版本标记：初始化时保留，用来判断本项目的规则是否需要随模板升级（变更记录见模板仓库 vibe-coding-starter/README.md） -->
