# MarkLeaf 图标

图标定位：**浅绿色系 Markdown 文档 + Leaf**。

- 浅绿圆角底：呼应 MarkLeaf 的「Leaf」名称与轻盈阅读；
- 奶油书页：表示 Markdown 文档；
- 深绿叶片：从书页左下延伸到右上，构成主视觉；
- 深绿 `M` 方块：位于书页左上角并随纸张轻微倾斜，作为 Markdown 标识，小尺寸下仍保留清晰轮廓。

## 文件

- `markleaf.svg`：可编辑矢量源，512 × 512 viewBox；无字体、脚本或外部依赖。
- `markleaf-1024.png`：大尺寸主图与复用源。
- `markleaf-{512,256,128,64,48,32,16}.png`：常用尺寸。
- `markleaf.ico`：Windows 多尺寸图标，含 16、24、32、48、64、128、256 px 七个 32 位 RGBA PNG 帧；24 px 帧仅内嵌于 ICO。
- `markleaf.icns`：macOS 图标，含 128、256、512、1024 px PNG 帧。
- `_build.py`：从 SVG 重新生成全部 PNG / ICO / ICNS，并复制到 `src-tauri/icons/`。

## 配色

- 圆角底：`#f4fdf8` → `#dff7e8` → `#bceacf` 浅绿渐变；描边 `#8fd6ad`。
- 书页：`#fffef9` → `#f4fbf0` 奶油白；描边 `#b6ddc5`。
- 叶片：`#86efac` → `#34d399` → `#15803d` 浅绿到深绿渐变。
- `M` 方块：`#166534` 深绿底，`#f2fdf7` 浅色笔画。

## 编辑与导出

- 本目录的 SVG 是唯一图形源；改完矢量后执行：

```bash
python docs/icons/_build.py
```

- 脚本用无头 Microsoft Edge 渲染 SVG（2048 × 2048），抠除洋红背景后按目标尺寸独立缩放，不逐级缩图。
- 需要 Python 3 + Pillow + NumPy，以及本机 Microsoft Edge；找不到 Edge 时用 `MARKLEAF_EDGE` 指向 `msedge.exe`。
- 生成后会替换 `src-tauri/icons/` 下的 `32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.png`、`icon.ico`、`icon.icns`。
- `.png` / `.ico` / `.icns` 是普通二进制文件（`.gitattributes` 已标记 `binary`），不要改成 Git LFS 指针；提交前确认 `src-tauri/icons/` 与 `docs/icons/` 的输出一致。
