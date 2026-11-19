# 接力进度 / Handoff · markleaf

> **这是什么**：AI 断点续作的「交接包」。一次对话没干完，**下一个 AI 会话先读本文件**，就知道「做到哪、还剩什么、卡在哪、下一步从哪开始」。
>
> **维护规则见 AGENTS §5**（更新时机、收尾清理、信息去向）。要点：只留还在路上的内容；任务完结时在写入 CHANGELOG、ROADMAP 打 ✅ 的同一会话内删掉对应内容（标「已并入」不算删）；长期有效的坑与理由迁到 ARCH §7；全文不超过 8,000 字（按字符计，命令见 AGENTS §4）。
>
> **接手步骤**：读 `AGENTS.md` → 按「当前任务」的范围查 ARCH §0.5，只读相关文件 → 从「下一步」第 1 条开始 → 每完成一个子步骤就更新本文件。
>
> 文中「AGENTS §x」「ARCH §x」分别指 `AGENTS.md`、`ARCHITECTURE.md` 的章节。

---

## 状态快照

- **最近更新**：2026-11-19
- **整体状态**：✅ 无进行中任务（浅绿色系图标重设已完成）
- **工作分支**：主分支
- **最后验证状态**：`sh manager.sh check` ✅ / `sh manager.sh test` ✅ / `sh manager.sh package` ✅ / 原生边框四向实测 ✅ / 图标尺寸检查 ✅ / `sh check-docs.sh` ✅

---

## 当前任务（In Progress）

- （无。）

---

## 进行中（子步骤 / 半成品）

- （无。）

## 待验收（代码已完成，等用户确认）

- 打包可执行文件已改为 `MarkLeaf.exe`，`dist/dev` 与 `dist/release` 的 zip 内文件名一致。
- 双击窗口左 / 右边铺满可用宽度，双击上 / 下边铺满可用高度；最外层原生 resize 边框由 `window_edges.rs` 处理。铺满后从标题栏拖动会先恢复原尺寸再进入原生拖动，手动缩放则解除铺满状态。
- 设置中心已修复左侧分类导航与主题卡片排版，并新增「浅色 / 深色 / 跟随系统」主题模式切换。
- 浅绿色系图标已重设：`docs/icons/markleaf.svg` 为唯一矢量源，`python docs/icons/_build.py` 生成 PNG / ICO / ICNS 并安装到 `src-tauri/icons/`；`M` 方块位于书页左上角，无额外箭头。
- 左上角应用图标菜单改为左侧对齐窗口边缘、上侧对齐图标下边缘。
- 工具栏统计胶囊已移除，右下角状态栏统计 Tip 悬停显示明细、点击切换统计单位。

## 阻塞 / 待决策（Blockers）

- （无。）

---

## 下一步（Next Steps）

1. 启动新构建的 `MarkLeaf.exe`，验证三个交互点与打包产物。
2. 下一阶段里程碑 M2 仍从 `ROADMAP.md` 的 `P1-1` 开始。

---

## 本任务验证（Verify）

- `sh manager.sh check`：cargo fmt / clippy / tsc 全部通过。
- `sh manager.sh test`：9 项 Node 契约测试 + 6 项 Rust 单测全部通过。
- `sh manager.sh package`：Release + Debug 构建、事务发布成功；产物为 `MarkLeaf.exe`。
- `sh manager.sh package --skip-build`：复用已有构建，事务发布成功。
- `package.bat --skip-build`：纯 cmd 入口与 `process-guard.mjs` 路径通过。
- 原生边框实测：dev 与 `dist/release/unpack/MarkLeaf.exe` 在最外侧边框 4px 内双击，左右上下四向均正确铺满。
- 恢复原尺寸实测：合成标题栏 `mousedown` + `mousemove` 走真实拖拽入口，窗口从铺满宽度恢复为 `1376×868` 并移动到新位置。
- 设置弹窗截图检查：左侧分类为正常列表，主题卡片预览色块与说明文字显示完整，主题模式分段按钮可见。
- 图标构建：`python docs/icons/_build.py` 生成 1024 / 512 / 256 / 128 / 64 / 48 / 32 / 16 PNG、ICO、ICNS，并安装到 `src-tauri/icons/`；16 / 32 / 48 / 64 / 128 尺寸可辨认。
- zip 校验：`dist/dev/*-unpack-debug.zip` 与 `dist/release/*-unpack.zip` 内均为 `MarkLeaf.exe`。
- `sh check-docs.sh`：0 错误 0 警告。

---

## 本任务决策（Decisions）

- 长期架构决策与避坑经验已归档至 `ARCHITECTURE.md` §7。

---

## 待解问题 / 给用户的提问（Open Questions）

- （无。）
