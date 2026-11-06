import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAppInfo,
  getStartupDocument,
  openMarkdownFile,
  pickMarkdownFile,
  renderMarkdown,
  saveMarkdownDialog,
  saveMarkdownFile,
  toggleMarkdownTask,
  type AppInfo,
  type DocStats,
  type DocumentSession,
  type SiblingFile,
  type TocItem,
} from './api';
import { DEMO_MARKDOWN } from './demoDoc';

export type ViewMode = 'read' | 'split' | 'edit';
export type ThemeMode = 'paper' | 'github' | 'sepia' | 'night';

const THEME_OPTIONS: { id: ThemeMode; label: string; badge: string }[] = [
  { id: 'paper', label: '书页 Paper', badge: '暖白' },
  { id: 'github', label: 'GitHub', badge: '纯净' },
  { id: 'sepia', label: '羊皮纸 Sepia', badge: '护眼' },
  { id: 'night', label: '暗夜 Night', badge: '深色' },
];

function extractStartLine(sourcepos: string | null): number | null {
  if (!sourcepos) return null;
  const firstPart = sourcepos.split('-')[0];
  const lineStr = firstPart?.split(':')[0];
  const parsed = Number.parseInt(lineStr ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** 为代码块注入语言头部栏与一键复制按钮，并做轻量关键词着色 */
function enhanceRenderedDom(container: HTMLElement | null, searchQuery: string) {
  if (!container) return;

  const pres = container.querySelectorAll('pre');
  pres.forEach((pre) => {
    if (pre.querySelector('.ml-code-header')) return;
    const codeEl = pre.querySelector('code');
    const className = codeEl?.className ?? '';
    const langMatch = className.match(/language-([a-zA-Z0-9_-]+)/);
    const lang = (langMatch?.[1] ?? 'text').toUpperCase();

    const header = document.createElement('div');
    header.className = 'ml-code-header';

    const langBadge = document.createElement('span');
    langBadge.className = 'ml-code-lang';
    langBadge.textContent = lang;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ml-code-copy';
    copyBtn.textContent = '复制代码';

    header.appendChild(langBadge);
    header.appendChild(copyBtn);
    pre.insertBefore(header, pre.firstChild);
  });

  // 为每个块级带 data-sourcepos 的元素添加悬停行号提示属性
  const blocks = container.querySelectorAll<HTMLElement>('[data-sourcepos]');
  blocks.forEach((block) => {
    const startLine = extractStartLine(block.getAttribute('data-sourcepos'));
    if (startLine) {
      block.setAttribute('data-line-number', String(startLine));
    }
  });

  // 搜索词高亮提示
  container.querySelectorAll('.ml-search-hit').forEach((el) => {
    el.classList.remove('ml-search-hit');
  });
  const q = searchQuery.trim().toLowerCase();
  if (q.length >= 2) {
    blocks.forEach((block) => {
      if ((block.textContent ?? '').toLowerCase().includes(q)) {
        block.classList.add('ml-search-hit');
      }
    });
  }
}

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo>({ name: 'MarkLeaf', version: '0.1.0' });
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('欢迎使用 MarkLeaf.md');
  const [dirPath, setDirPath] = useState<string>('');
  const [encoding, setEncoding] = useState<string>('UTF-8');
  const [content, setContent] = useState<string>(DEMO_MARKDOWN);
  const [savedContent, setSavedContent] = useState<string>(DEMO_MARKDOWN);
  const [html, setHtml] = useState<string>('');
  const [toc, setToc] = useState<TocItem[]>([]);
  const [stats, setStats] = useState<DocStats>({
    chars: 0,
    words: 0,
    lines: 1,
    readingMinutes: 1,
    tasksTotal: 0,
    tasksDone: 0,
  });
  const [siblings, setSiblings] = useState<SiblingFile[]>([]);
  const [siblingFilter, setSiblingFilter] = useState<string>('');

  const [viewMode, setViewMode] = useState<ViewMode>('read');
  const [theme, setTheme] = useState<ThemeMode>('paper');
  const [fontSize, setFontSize] = useState<number>(16);
  const [showLeftSidebar, setShowLeftSidebar] = useState<boolean>(true);
  const [showRightOutline, setShowRightOutline] = useState<boolean>(true);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeLine, setActiveLine] = useState<number>(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const proseRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const isDirty = content !== savedContent;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const applyDocumentSession = useCallback((session: DocumentSession) => {
    setFilePath(session.path);
    setFileName(session.fileName);
    setDirPath(session.dirPath);
    setEncoding(session.encoding);
    setContent(session.content);
    setSavedContent(session.content);
    setHtml(session.html);
    setToc(session.toc);
    setStats(session.stats);
    setSiblings(session.siblings);
    setActiveLine(1);
  }, []);

  // 启动时初始化：读取 app_info + 检查是否有双击传入的 CLI Markdown 文件
  const initStartupDocument = useCallback(async () => {
    try {
      const info = await getAppInfo();
      setAppInfo(info);
    } catch {
      // 忽略预览环境错误
    }

    try {
      const startupSession = await getStartupDocument();
      if (startupSession) {
        applyDocumentSession(startupSession);
        showToast(`已秒开：${startupSession.fileName}`);
        return;
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }

    const rendered = await renderMarkdown(DEMO_MARKDOWN);
    setHtml(rendered.html);
    setToc(rendered.toc);
    setStats(rendered.stats);
  }, [applyDocumentSession, showToast]);

  useEffect(() => {
    void initStartupDocument();
  }, [initStartupDocument]);

  // 当 html 或搜索词变化时，增强代码块头部与行号标记
  useEffect(() => {
    enhanceRenderedDom(proseRef.current, searchQuery);
  }, [html, searchQuery, viewMode]);

  // 编辑态下内容变化时，极速实时重新渲染 HTML 与 TOC
  const updateMarkdownContent = useCallback(async (nextContent: string) => {
    setContent(nextContent);
    try {
      const rendered = await renderMarkdown(nextContent);
      setHtml(rendered.html);
      setToc(rendered.toc);
      setStats(rendered.stats);
    } catch {
      // 忽略单次渲染异常
    }
  }, []);

  // 定位编辑器光标到指定 1-based 行号并居中滚动
  const jumpEditorToLine = useCallback((targetLine: number) => {
    setActiveLine(targetLine);
    window.requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;
      const lines = textarea.value.split('\n');
      const clampedLine = Math.max(1, Math.min(targetLine, lines.length));
      let charOffset = 0;
      for (let i = 0; i < clampedLine - 1; i++) {
        charOffset += lines[i].length + 1;
      }
      const lineLength = lines[clampedLine - 1]?.length ?? 0;
      textarea.focus();
      textarea.setSelectionRange(charOffset, charOffset + lineLength);

      const lineHeight = 24;
      const targetScroll = Math.max(0, (clampedLine - 5) * lineHeight);
      textarea.scrollTop = targetScroll;
    });
  }, []);

  // 阅读态双击任意段落 -> 自动切入分屏/编辑态并落焦到对应源码行
  const handleProseDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.tagName === 'A') {
        return;
      }
      const sourceBlock = target.closest<HTMLElement>('[data-sourcepos]');
      const line = extractStartLine(sourceBlock?.getAttribute('data-sourcepos') ?? null) ?? 1;
      setViewMode((prev) => (prev === 'read' ? 'split' : prev));
      jumpEditorToLine(line);
      showToast(`已定位到第 ${line} 行进入便捷编辑`);
    },
    [jumpEditorToLine, showToast],
  );

  // 阅读态点击事件委托：处理任务列表复选框原位切换 & 代码块一键复制
  const handleProseClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // 1. 代码块一键复制
      if (target.classList.contains('ml-code-copy')) {
        const pre = target.closest('pre');
        const code = pre?.querySelector('code');
        const text = code?.textContent ?? '';
        try {
          await navigator.clipboard.writeText(text);
          target.textContent = '✓ 已复制';
          window.setTimeout(() => {
            target.textContent = '复制代码';
          }, 1500);
        } catch {
          showToast('复制失败，请手动选择复制');
        }
        return;
      }

      // 2. 阅读态直接点击任务复选框 -> 行级无损写回
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
        e.preventDefault();
        const li = target.closest<HTMLElement>('[data-sourcepos]');
        const lineNo = extractStartLine(li?.getAttribute('data-sourcepos') ?? null);
        if (!lineNo) return;

        try {
          const result = await toggleMarkdownTask(content, lineNo, filePath, encoding);
          setContent(result.content);
          if (result.saved) {
            setSavedContent(result.content);
          }
          setHtml(result.rendered.html);
          setToc(result.rendered.toc);
          setStats(result.rendered.stats);
          showToast(
            result.saved
              ? `已更新第 ${lineNo} 行任务并无损保存`
              : `已切换第 ${lineNo} 行任务状态`,
          );
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [content, encoding, filePath, showToast],
  );

  // 打开文件对话框
  const handleOpenFileDialog = useCallback(async () => {
    try {
      const session = await pickMarkdownFile();
      if (session) {
        applyDocumentSession(session);
        showToast(`已打开：${session.fileName}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [applyDocumentSession, showToast]);

  // 切换左侧同级目录中的 Markdown 文件
  const handleSelectSibling = useCallback(
    async (targetPath: string) => {
      if (targetPath === filePath) return;
      try {
        const session = await openMarkdownFile(targetPath);
        applyDocumentSession(session);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
    },
    [applyDocumentSession, filePath, showToast],
  );

  // 保存当前文件（按原编码无损保存）
  const handleSave = useCallback(async () => {
    try {
      if (filePath) {
        const session = await saveMarkdownFile(filePath, content, encoding);
        applyDocumentSession(session);
        showToast(`已保存（${session.encoding}）`);
      } else {
        const session = await saveMarkdownDialog(fileName, content);
        if (session) {
          applyDocumentSession(session);
          showToast(`已另存为：${session.fileName}`);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [applyDocumentSession, content, encoding, fileName, filePath, showToast]);

  // 另存为新文件
  const handleSaveAs = useCallback(async () => {
    try {
      const session = await saveMarkdownDialog(fileName, content);
      if (session) {
        applyDocumentSession(session);
        showToast(`已另存为：${session.fileName}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [applyDocumentSession, content, fileName, showToast]);

  // 新建空白文档
  const handleNewDocument = useCallback(async () => {
    const initial = '# 未命名文档\n\n在此输入正文内容...\n';
    setFilePath(null);
    setFileName('Untitled.md');
    setDirPath('');
    setEncoding('UTF-8');
    setContent(initial);
    setSavedContent('');
    const rendered = await renderMarkdown(initial);
    setHtml(rendered.html);
    setToc(rendered.toc);
    setStats(rendered.stats);
    setViewMode('split');
    jumpEditorToLine(3);
  }, [jumpEditorToLine]);

  // 编辑器快捷格式化工具栏指令
  const applyEditorFormat = useCallback(
    (
      kind:
        | 'h1'
        | 'h2'
        | 'h3'
        | 'bold'
        | 'italic'
        | 'highlight'
        | 'code'
        | 'codeblock'
        | 'quote'
        | 'alert'
        | 'task'
        | 'table'
        | 'link',
    ) => {
      const textarea = editorRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.slice(start, end);

      let replacement = '';
      let cursorOffset = 0;

      switch (kind) {
        case 'h1':
          replacement = `# ${selected || '一级标题'}`;
          cursorOffset = replacement.length;
          break;
        case 'h2':
          replacement = `## ${selected || '二级标题'}`;
          cursorOffset = replacement.length;
          break;
        case 'h3':
          replacement = `### ${selected || '三级标题'}`;
          cursorOffset = replacement.length;
          break;
        case 'bold':
          replacement = `**${selected || '粗体文本'}**`;
          cursorOffset = selected ? replacement.length : 2 + 4;
          break;
        case 'italic':
          replacement = `*${selected || '斜体文本'}*`;
          cursorOffset = selected ? replacement.length : 1 + 4;
          break;
        case 'highlight':
          replacement = `==${selected || '重点高亮'}==`;
          cursorOffset = selected ? replacement.length : 2 + 4;
          break;
        case 'code':
          replacement = `\`${selected || 'code'}\``;
          cursorOffset = replacement.length;
          break;
        case 'codeblock':
          replacement = `\n\`\`\`ts\n${selected || '// 代码块'}\n\`\`\`\n`;
          cursorOffset = replacement.length - 5;
          break;
        case 'quote':
          replacement = `> ${selected || '引用文本'}`;
          cursorOffset = replacement.length;
          break;
        case 'alert':
          replacement = `\n> [!TIP]\n> ${selected || '在这里输入提示内容'}\n`;
          cursorOffset = replacement.length;
          break;
        case 'task':
          replacement = `- [ ] ${selected || '待办事项'}`;
          cursorOffset = replacement.length;
          break;
        case 'table':
          replacement = `\n| 列标题 A | 列标题 B | 列标题 C |\n| :--- | :--- | :--- |\n| 内容 1 | 内容 2 | 内容 3 |\n`;
          cursorOffset = replacement.length;
          break;
        case 'link':
          replacement = `[${selected || '链接文字'}](https://example.com)`;
          cursorOffset = replacement.length;
          break;
      }

      const next = content.slice(0, start) + replacement + content.slice(end);
      void updateMarkdownContent(next);

      window.requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + cursorOffset;
        textarea.setSelectionRange(pos, pos);
      });
    },
    [content, updateMarkdownContent],
  );

  // 全局快捷键监听：Ctrl+O / Ctrl+S / Ctrl+E / Ctrl+F / Ctrl+N
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        void handleOpenFileDialog();
      } else if (key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          void handleSaveAs();
        } else {
          void handleSave();
        }
      } else if (key === 'e') {
        e.preventDefault();
        setViewMode((prev) => (prev === 'read' ? 'split' : 'read'));
      } else if (key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (key === 'n') {
        e.preventDefault();
        void handleNewDocument();
      } else if (key === 'b' && viewMode !== 'read') {
        e.preventDefault();
        applyEditorFormat('bold');
      } else if (key === 'i' && viewMode !== 'read') {
        e.preventDefault();
        applyEditorFormat('italic');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyEditorFormat, handleNewDocument, handleOpenFileDialog, handleSave, handleSaveAs, viewMode]);

  // 点击右侧大纲跳转
  const handleTocClick = useCallback(
    (item: TocItem) => {
      setActiveLine(item.line);
      const headingEl = document.getElementById(item.id);
      if (headingEl) {
        headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (viewMode !== 'read') {
        jumpEditorToLine(item.line);
      }
    },
    [jumpEditorToLine, viewMode],
  );

  const filteredSiblings = useMemo(() => {
    const q = siblingFilter.trim().toLowerCase();
    if (!q) return siblings;
    return siblings.filter((item) => item.name.toLowerCase().includes(q));
  }, [siblingFilter, siblings]);

  return (
    <div className="ml-workbench" data-theme={theme}>
      {/* ==================== 顶部工具栏 ==================== */}
      <header className="ml-topbar">
        <div className="ml-topbar-left">
          <button
            type="button"
            className={`ml-icon-btn ${showLeftSidebar ? 'is-active' : ''}`}
            onClick={() => setShowLeftSidebar((v) => !v)}
            title="切换同级目录面板"
          >
            ☰ 目录
          </button>
          <button
            type="button"
            className="ml-btn"
            onClick={handleOpenFileDialog}
            title="打开 Markdown 文件 (Ctrl+O)"
          >
            📂 打开
          </button>
          <button
            type="button"
            className="ml-btn"
            onClick={handleNewDocument}
            title="新建文档 (Ctrl+N)"
          >
            ＋ 新建
          </button>
          <button
            type="button"
            className={`ml-btn ${isDirty ? 'ml-btn-primary' : ''}`}
            onClick={handleSave}
            title="保存文档 (Ctrl+S)"
          >
            💾 保存
          </button>
        </div>

        <div className="ml-topbar-center">
          <div className="ml-doc-title" title={filePath ?? '内置演示文档（未落盘）'}>
            <span className="ml-leaf-badge">🍃</span>
            <span className="ml-doc-filename">{fileName}</span>
            {isDirty && <span className="ml-dirty-dot" title="有未保存的修改">●</span>}
          </div>

          <div className="ml-mode-segmented" role="tablist" aria-label="视图模式切换">
            <button
              type="button"
              className={`ml-seg-btn ${viewMode === 'read' ? 'is-active' : ''}`}
              onClick={() => setViewMode('read')}
              title="纯净阅读模式 (双击任意段落可就地编辑)"
            >
              📖 阅读
            </button>
            <button
              type="button"
              className={`ml-seg-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="分屏实时预览模式 (Ctrl+E)"
            >
              ◫ 分屏
            </button>
            <button
              type="button"
              className={`ml-seg-btn ${viewMode === 'edit' ? 'is-active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="专注源码编辑模式"
            >
              ✍️ 编辑
            </button>
          </div>
        </div>

        <div className="ml-topbar-right">
          <button
            type="button"
            className={`ml-icon-btn ${searchOpen ? 'is-active' : ''}`}
            onClick={() => {
              setSearchOpen((v) => !v);
              window.requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            title="页内查找 (Ctrl+F)"
          >
            🔍 查找
          </button>

          <div className="ml-font-controls" title="调节正文字号">
            <button
              type="button"
              className="ml-mini-btn"
              onClick={() => setFontSize((s) => Math.max(13, s - 1))}
            >
              A-
            </button>
            <span className="ml-font-label">{fontSize}px</span>
            <button
              type="button"
              className="ml-mini-btn"
              onClick={() => setFontSize((s) => Math.min(24, s + 1))}
            >
              A+
            </button>
          </div>

          <select
            className="ml-theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeMode)}
            aria-label="选择阅读排版主题"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                🎨 {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`ml-icon-btn ${showRightOutline ? 'is-active' : ''}`}
            onClick={() => setShowRightOutline((v) => !v)}
            title="切换右侧大纲 (TOC)"
          >
            📑 大纲
          </button>
        </div>
      </header>

      {/* ==================== 页内检索条 ==================== */}
      {searchOpen && (
        <div className="ml-search-bar">
          <input
            ref={searchInputRef}
            type="search"
            className="ml-search-input"
            placeholder="输入关键字高亮匹配段落（支持实时过滤）…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
              }
            }}
          />
          <button
            type="button"
            className="ml-mini-btn"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
          >
            关闭 (Esc)
          </button>
        </div>
      )}

      {/* ==================== 主体三栏工作区 ==================== */}
      <div className="ml-body">
        {/* 左侧栏：同级目录 Markdown 文件树 */}
        {showLeftSidebar && (
          <aside className="ml-sidebar-left">
            <div className="ml-panel-header">
              <span>📁 同级目录文档</span>
              <span className="ml-badge-count">{siblings.length}</span>
            </div>
            {dirPath && (
              <div className="ml-dir-path" title={dirPath}>
                {dirPath}
              </div>
            )}
            <div className="ml-sidebar-search">
              <input
                type="search"
                placeholder="过滤同目录 .md 文件…"
                value={siblingFilter}
                onChange={(e) => setSiblingFilter(e.target.value)}
              />
            </div>

            <div className="ml-file-list">
              {filteredSiblings.length > 0 ? (
                filteredSiblings.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`ml-file-item ${item.path === filePath || item.active ? 'is-active' : ''}`}
                    onClick={() => handleSelectSibling(item.path)}
                    title={item.path}
                  >
                    <span className="ml-file-icon">📄</span>
                    <span className="ml-file-name">{item.name}</span>
                  </button>
                ))
              ) : (
                <div className="ml-empty-hint">
                  <p>当前为内置欢迎文档。</p>
                  <p>
                    点击上方 <strong>📂 打开</strong> 或直接双击系统中的 <code>.md</code>{' '}
                    文件，此处会自动列出同文件夹下的所有 Markdown 文档供一键秒切。
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* 中间主工作区：便捷编辑器 + 印刷级阅读视图 */}
        <main className={`ml-main-stage mode-${viewMode}`}>
          {/* 编辑面板（在 split 或 edit 模式下展示） */}
          {viewMode !== 'read' && (
            <section className="ml-editor-pane">
              <div className="ml-editor-toolbar">
                <button type="button" onClick={() => applyEditorFormat('h1')} title="一级标题">
                  H1
                </button>
                <button type="button" onClick={() => applyEditorFormat('h2')} title="二级标题">
                  H2
                </button>
                <button type="button" onClick={() => applyEditorFormat('h3')} title="三级标题">
                  H3
                </button>
                <span className="ml-toolbar-divider" />
                <button
                  type="button"
                  onClick={() => applyEditorFormat('bold')}
                  title="粗体 (Ctrl+B)"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorFormat('italic')}
                  title="斜体 (Ctrl+I)"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorFormat('highlight')}
                  title="荧光笔高亮 ==text=="
                >
                  🖍 高亮
                </button>
                <button type="button" onClick={() => applyEditorFormat('code')} title="行内代码">
                  {'</>'}
                </button>
                <span className="ml-toolbar-divider" />
                <button
                  type="button"
                  onClick={() => applyEditorFormat('task')}
                  title="插入任务复选框"
                >
                  ☑ 任务
                </button>
                <button type="button" onClick={() => applyEditorFormat('quote')} title="引用块">
                  ❝ 引用
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorFormat('alert')}
                  title="插入 GitHub Alert 提示卡片"
                >
                  💡 Alert
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorFormat('codeblock')}
                  title="插入代码块"
                >
                  📦 代码块
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorFormat('table')}
                  title="插入 GFM 表格"
                >
                  ⊞ 表格
                </button>
                <button
                  type="button"
                  onClick={() => applyEditorFormat('link')}
                  title="插入超链接"
                >
                  🔗 链接
                </button>
              </div>

              <textarea
                ref={editorRef}
                className="ml-editor-textarea"
                value={content}
                onChange={(e) => void updateMarkdownContent(e.target.value)}
                onClick={(e) => {
                  const target = e.currentTarget;
                  const line = target.value.slice(0, target.selectionStart).split('\n').length;
                  setActiveLine(line);
                }}
                onKeyUp={(e) => {
                  const target = e.currentTarget;
                  const line = target.value.slice(0, target.selectionStart).split('\n').length;
                  setActiveLine(line);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const target = e.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const next = content.slice(0, start) + '  ' + content.slice(end);
                    void updateMarkdownContent(next);
                    window.requestAnimationFrame(() => {
                      target.selectionStart = target.selectionEnd = start + 2;
                    });
                  }
                }}
                spellCheck={false}
                placeholder="输入 Markdown 内容…"
              />
            </section>
          )}

          {/* 阅读/预览面板（在 read 或 split 模式下展示） */}
          {viewMode !== 'edit' && (
            <section className="ml-reader-pane">
              <article
                ref={proseRef}
                className="ml-prose"
                style={{ fontSize: `${fontSize}px` }}
                onClick={handleProseClick}
                onDoubleClick={handleProseDoubleClick}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </section>
          )}
        </main>

        {/* 右侧栏：响应式浮动大纲 (TOC) */}
        {showRightOutline && (
          <aside className="ml-sidebar-right">
            <div className="ml-panel-header">
              <span>📑 文档大纲</span>
              <span className="ml-badge-count">{toc.length}</span>
            </div>
            <nav className="ml-toc-list" aria-label="文档章节大纲">
              {toc.length > 0 ? (
                toc.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ml-toc-item level-${item.level} ${activeLine === item.line ? 'is-active' : ''}`}
                    onClick={() => handleTocClick(item)}
                    title={`跳转到第 ${item.line} 行：${item.text}`}
                  >
                    <span className="ml-toc-text">{item.text}</span>
                    <span className="ml-toc-line">L{item.line}</span>
                  </button>
                ))
              ) : (
                <div className="ml-empty-hint">文档暂无标题章节</div>
              )}
            </nav>
          </aside>
        )}
      </div>

      {/* ==================== 底部状态栏 ==================== */}
      <footer className="ml-statusbar">
        <div className="ml-status-left">
          <span className="ml-status-pill">
            <strong>{appInfo.name}</strong> v{appInfo.version}
          </span>
          <span className="ml-status-item">定位：第 {activeLine} 行</span>
          <span className="ml-status-item" title="保存时将严格沿用该文件编码">
            编码：{encoding}
          </span>
          {viewMode === 'read' && (
            <span className="ml-status-tip">💡 提示：双击任意段落可精准定位到该行进行编辑</span>
          )}
        </div>

        <div className="ml-status-right">
          {stats.tasksTotal > 0 && (
            <span className="ml-status-item ml-task-stat">
              ☑ 任务 {stats.tasksDone}/{stats.tasksTotal}
            </span>
          )}
          <span className="ml-status-item">{stats.words} 词</span>
          <span className="ml-status-item">{stats.chars} 字符</span>
          <span className="ml-status-item">{stats.lines} 行</span>
          <span className="ml-status-item">约 {stats.readingMinutes} 分钟阅读</span>
        </div>
      </footer>

      {toastMessage && <div className="ml-toast">{toastMessage}</div>}
    </div>
  );
}
