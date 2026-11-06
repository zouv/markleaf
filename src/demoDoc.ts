export const DEMO_MARKDOWN = `# 🍃 MarkLeaf — 极速、优雅、无损的 Markdown 阅读与编辑工作台

> **核心理念**：双击 \`.md\` 毫秒级秒开阅读，具备印刷级排版美感；需要修改时，**双击任意段落**即可精准落焦到对应源码行便捷编辑，且 **100% 绝不破坏原文件未修改行的格式与编码**。

---

## ✨ 为什么重写？（吸取 MarkText 前人经验）

传统基于 Electron + 自研重型富文本状态树的 Markdown 工具存在三大痛点，**MarkLeaf** 从底层架构彻底解决：

| 痛点维度 | 传统方案 (Electron + 重型虚拟 DOM) | MarkLeaf 方案 (Tauri 2 + Rust \`comrak\`) |
| :--- | :--- | :--- |
| **双击启动速度** | 冷启动 1.5s ~ 3s+，安装包 ~200MB | **Rust 原生微秒级直出 HTML**，安装包仅数 MB |
| **原文件格式保护** | 全文 Parse 再 Serialize，常吞空行或改缩进 | **阅读零改写 + 任务框行级原位替换 + 原编码保存** |
| **编辑与阅读切换** | 切换源码模式丢失滚动条与段落位置 | **\`data-sourcepos\` 行号锚定**，双击段落精准落焦该行 |

---

## 🚀 立即体验三大交互亮点

### 1. 阅读态直接点击勾选任务列表（零格式破坏）

在阅读模式下，你不需要进入编辑器，**直接点击下方复选框**即可切换完成状态（打开本地文件时会按行号原位写回磁盘，其余行字节纹丝不动）：

- [x] 采用 **Tauri v2 + Rust \`comrak\`** 构建微秒级 GFM 渲染内核
- [x] 支持 **UTF-8 / UTF-8 BOM / UTF-16 / GBK** 自动编码探测与原编码无损写回
- [ ] 试试直接点击勾选我！观察底部状态栏的任务进度变化
- [ ] **双击本段落任意文字**，体验直接跳转到编辑器对应行（第 28 行）

### 2. GitHub Alerts 精美提示卡片与 ==语法高亮==

MarkLeaf 原生支持 GitHub 风格五色告警块以及 ==行内重点荧光笔高亮== 语法：

> [!NOTE]
> **阅读优先设计**：默认以零开销的纯净阅读视图打开文档，滾动丝滑，支持 \`Ctrl + F\` 页内高亮检索与右侧大纲一键跳转。

> [!TIP]
> **双击段落就地编辑**：在阅读视图下，**双击任意标题、段落或列表**，会自动切换到编辑视图并将光标精准定位到你双击的那一行！也可随时按 \`Ctrl + E\` 在「阅读 / 分屏 / 编辑」间切换。

> [!WARNING]
> **编码与格式安全**：当打开历史 \`GBK\` 或带 \`BOM\` 的文档时，底部状态栏会显示真实编码，按 \`Ctrl + S\` 保存时严格沿用原编码。

### 3. 印刷级代码块（带语言角标与一键复制）

\`\`\`rust
// src-tauri/src/markdown.rs — 微秒级原生解析与行号锚定
pub fn render_markdown_payload(markdown: &str) -> RenderedMarkdown {
    let arena = Arena::new();
    let options = build_comrak_options(); // 开启 GFM + Alerts + sourcepos
    let root = parse_document(&arena, markdown, &options);
    // 直接产出带 data-sourcepos="L:C-L:C" 的安全 HTML 与大纲
    format_html(root, &options, &mut raw_html);
}
\`\`\`

\`\`\`typescript
// 双击阅读态任意段落 -> 精准定位到编辑器对应源码行
function jumpToSourceLine(element: HTMLElement) {
  const block = element.closest('[data-sourcepos]');
  const line = parseInt(block?.getAttribute('data-sourcepos')?.split(':')[0] ?? '1', 10);
  openEditorAtLine(line);
}
\`\`\`

---

## ⌨️ 常用快捷键速查

1. **打开文档**：\`Ctrl + O\`（同时自动扫描同级目录下的全部 \`.md\` 文件列在左侧栏）
2. **保存文档**：\`Ctrl + S\`（未落盘文档自动弹出另存为对话框）
3. **切换阅读 / 分屏预览**：\`Ctrl + E\`（或直接**双击正文段落**）
4. **文档内查找**：\`Ctrl + F\`
5. **切换排版主题**：点击右上角主题选择器（支持 **书页 Paper** / **GitHub** / **羊皮纸 Sepia** / **暗夜 Night**）
`;
