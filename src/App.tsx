import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAppInfo,
  getStartupDocument,
  openMarkdownFile,
  pickMarkdownFile,
  renderMarkdown,
  saveMarkdownDialog,
  saveMarkdownFile,
  toggleMarkdownTask,
  type DocStats,
  type DocumentSession,
  type SiblingFile,
  type TocItem,
} from './api';
import SettingsDialog from './components/SettingsDialog';
import TitleBar, { type DocTabSummary } from './components/TitleBar';
import { DEMO_MARKDOWN } from './demoDoc';
import {
  FONT_PRESET_MAP,
  loadSettings,
  normalizeContentForSave,
  PAGE_WIDTH_MAP,
  saveSettings,
  THEME_OPTIONS,
  type AppSettings,
  type PageWidthMode,
  type StatsUnit,
  type ThemeId,
  type ViewMode,
} from './settings';
import Icon from './ui/Icon';

interface DocTabState {
  id: string;
  filePath: string | null;
  fileName: string;
  dirPath: string;
  encoding: string;
  content: string;
  savedContent: string;
  html: string;
  toc: TocItem[];
  stats: DocStats;
  siblings: SiblingFile[];
  activeLine: number;
}

const OPEN_PATHS_STORAGE_KEY = 'markleaf.openPaths.v1';

const EMPTY_STATS: DocStats = {
  chars: 0,
  charsWithSpaces: 0,
  words: 0,
  paragraphs: 1,
  lines: 1,
  readingMinutes: 1,
  tasksTotal: 0,
  tasksDone: 0,
};

let tabCounter = 1;
function createTabId(): string {
  tabCounter += 1;
  return `tab-${Date.now()}-${tabCounter}`;
}

const PAIR_MAP: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
  '*': '*',
  '`': '`',
  '=': '=',
  '~': '~',
};

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );
  const [appVersion, setAppVersion] = useState<string>('0.2.0');

  // 视图与面板状态
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadSettings().defaultViewMode);
  const [leftOpen, setLeftOpen] = useState<boolean>(() => loadSettings().defaultLeftSidebar);
  const [rightOpen, setRightOpen] = useState<boolean>(() => loadSettings().defaultRightSidebar);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // 多页签状态
  const [tabs, setTabs] = useState<DocTabState[]>(() => [
    {
      id: 'tab-welcome',
      filePath: null,
      fileName: '欢迎使用 MarkLeaf.md',
      dirPath: '',
      encoding: 'UTF-8',
      content: DEMO_MARKDOWN,
      savedContent: DEMO_MARKDOWN,
      html: '',
      toc: [],
      stats: EMPTY_STATS,
      siblings: [],
      activeLine: 1,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-welcome');

  // 搜索、过滤器与弹出菜单状态
  const [fileFilter, setFileFilter] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState<boolean>(false);
  const [tablePickerOpen, setTablePickerOpen] = useState<boolean>(false);
  const [tableHover, setTableHover] = useState<{ rows: number; cols: number }>({ rows: 3, cols: 4 });
  const [alertMenuOpen, setAlertMenuOpen] = useState<boolean>(false);
  const [statsHover, setStatsHover] = useState<boolean>(false);

  // 内置图片灯箱状态
  const [lightbox, setLightbox] = useState<{ src: string; alt: string; scale: number } | null>(null);

  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const readerRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId],
  );

  const isDirty = activeTab ? activeTab.content !== activeTab.savedContent : false;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2400);
  }, []);

  // 监听操作系统亮暗模式变化
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const effectiveTheme: ThemeId = useMemo(() => {
    if (settings.followSystemTheme) {
      return systemDark ? settings.darkTheme : settings.lightTheme;
    }
    return settings.theme;
  }, [settings.followSystemTheme, settings.darkTheme, settings.lightTheme, settings.theme, systemDark]);

  // 同步主题与全局样式属性到 document.documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.documentElement.setAttribute(
      'data-hide-scrollbar',
      settings.hideScrollbar ? 'true' : 'false',
    );
  }, [effectiveTheme, settings.hideScrollbar]);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const updateTabById = useCallback((tabId: string, updater: (prev: DocTabState) => DocTabState) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
  }, []);

  const sessionToTabState = useCallback((session: DocumentSession, existingId?: string): DocTabState => {
    return {
      id: existingId ?? createTabId(),
      filePath: session.path,
      fileName: session.fileName,
      dirPath: session.dirPath,
      encoding: session.encoding,
      content: session.content,
      savedContent: session.content,
      html: session.html,
      toc: session.toc,
      stats: session.stats,
      siblings: session.siblings,
      activeLine: 1,
    };
  }, []);

  // 初始化：读取应用版本、CLI 双击打开的文档或上次打开的文档列表，并渲染初始欢迎页
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const info = await getAppInfo();
        if (!cancelled && info?.version) {
          setAppVersion(info.version);
        }
      } catch {
        // ignore
      }

      try {
        const startup = await getStartupDocument();
        if (!cancelled && startup) {
          const newTab = sessionToTabState(startup, 'tab-startup');
          setTabs([newTab]);
          setActiveTabId(newTab.id);
          return;
        }
      } catch {
        // fallback to welcome tab
      }

      const rendered = await renderMarkdown(DEMO_MARKDOWN);
      if (!cancelled) {
        updateTabById('tab-welcome', (prev) => ({
          ...prev,
          html: rendered.html,
          toc: rendered.toc,
          stats: rendered.stats,
        }));
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [sessionToTabState, updateTabById]);

  // 持久化已打开的磁盘文件路径列表
  useEffect(() => {
    try {
      const paths = tabs.map((t) => t.filePath).filter((p): p is string => Boolean(p));
      localStorage.setItem(OPEN_PATHS_STORAGE_KEY, JSON.stringify(paths));
    } catch {
      // ignore
    }
  }, [tabs]);

  // 当当前活跃页签的 content 变化时，防抖调用 Rust 引擎重绘 HTML、TOC 与字数统计
  useEffect(() => {
    if (!activeTab) return;
    let cancelled = false;
    const currentId = activeTab.id;
    const currentContent = activeTab.content;

    const timer = window.setTimeout(async () => {
      try {
        const res = await renderMarkdown(currentContent);
        if (!cancelled) {
          updateTabById(currentId, (prev) => ({
            ...prev,
            html: res.html,
            toc: res.toc,
            stats: res.stats,
          }));
        }
      } catch (err) {
        console.error('renderMarkdown failed:', err);
      }
    }, 35);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab?.id, activeTab?.content, updateTabById]);

  // 自动保存（移植自 MarkText：仅对已有落盘路径且有未保存修改的页签触发）
  useEffect(() => {
    if (!settings.autoSave || !activeTab || !activeTab.filePath) return;
    if (activeTab.content === activeTab.savedContent) return;

    const targetId = activeTab.id;
    const targetPath = activeTab.filePath;
    const targetEncoding = activeTab.encoding;
    const rawContent = activeTab.content;

    const timer = window.setTimeout(async () => {
      try {
        const normalized = normalizeContentForSave(
          rawContent,
          settings.trailingNewline,
          settings.endOfLine,
        );
        const session = await saveMarkdownFile(targetPath, normalized, targetEncoding);
        updateTabById(targetId, (prev) => ({
          ...prev,
          content: session.content,
          savedContent: session.content,
          encoding: session.encoding,
          html: session.html,
          toc: session.toc,
          stats: session.stats,
          siblings: session.siblings,
        }));
        showToast(`已自动保存 ${session.fileName}`);
      } catch {
        // ignore auto-save error
      }
    }, settings.autoSaveDelay);

    return () => window.clearTimeout(timer);
  }, [
    settings.autoSave,
    settings.autoSaveDelay,
    settings.trailingNewline,
    settings.endOfLine,
    activeTab,
    updateTabById,
    showToast,
  ]);

  // 为渲染区代码块挂载头部工具栏（语言角标 + 一键复制按钮）以及按设置包裹代码行号
  useEffect(() => {
    const container = readerRef.current;
    if (!container) return;

    const preNodes = container.querySelectorAll<HTMLPreElement>('pre');
    preNodes.forEach((pre) => {
      if (!pre.querySelector('.ml-code-header')) {
        const codeEl = pre.querySelector('code');
        const langClass = codeEl?.className ?? '';
        const match = langClass.match(/language-([\w+-]+)/);
        const lang = match ? match[1].toUpperCase() : 'TEXT';

        // 为代码块构建逐行容器，以便支持行号显示与折行控制
        if (codeEl && !codeEl.hasAttribute('data-lines-enhanced')) {
          const rawText = codeEl.textContent ?? '';
          const trimmed = rawText.replace(/\n$/, '');
          const lines = trimmed.split('\n');
          codeEl.setAttribute('data-raw-code', trimmed);
          codeEl.setAttribute('data-lines-enhanced', 'true');
          codeEl.innerHTML = lines
            .map((lineText, idx) => {
              const escaped = lineText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              return `<span class="ml-code-line" data-ln="${idx + 1}">${escaped || ' '}</span>`;
            })
            .join('\n');
        }

        const header = document.createElement('div');
        header.className = 'ml-code-header';

        const langBadge = document.createElement('span');
        langBadge.className = 'ml-code-lang';
        langBadge.textContent = lang;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'ml-code-copy';
        copyBtn.textContent = '复制代码';
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const text = codeEl?.getAttribute('data-raw-code') ?? codeEl?.textContent ?? '';
          void navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '✓ 已复制';
            window.setTimeout(() => {
              copyBtn.textContent = '复制代码';
            }, 1500);
          });
        });

        header.appendChild(langBadge);
        header.appendChild(copyBtn);
        pre.insertBefore(header, pre.firstChild);
      }
    });

    // 为所有带 data-sourcepos 的元素标注起始行号（供 CSS 悬停提示与专注模式高亮）
    const posElements = container.querySelectorAll<HTMLElement>('[data-sourcepos]');
    posElements.forEach((el) => {
      const raw = el.getAttribute('data-sourcepos') ?? '';
      const startLine = parseInt(raw.split(':')[0] ?? '0', 10);
      if (startLine > 0) {
        el.setAttribute('data-line-number', String(startLine));
      }
      if (settings.focusMode && activeTab) {
        const parts = raw.split('-');
        const endLine = parseInt((parts[1] ?? parts[0] ?? '0').split(':')[0] ?? '0', 10);
        const isFocused = activeTab.activeLine >= startLine && activeTab.activeLine <= Math.max(startLine, endLine);
        el.classList.toggle('is-focus-block', isFocused);
      } else {
        el.classList.remove('is-focus-block');
      }
    });
  }, [activeTab?.html, activeTab?.activeLine, settings.focusMode, viewMode]);

  // 页内搜索高亮
  useEffect(() => {
    const container = readerRef.current;
    if (!container) return;
    const blocks = container.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote');
    const q = searchQuery.trim().toLowerCase();
    let firstMatch: HTMLElement | null = null;
    blocks.forEach((el) => {
      if (q && (el.textContent ?? '').toLowerCase().includes(q)) {
        el.classList.add('ml-search-hit');
        if (!firstMatch) firstMatch = el;
      } else {
        el.classList.remove('ml-search-hit');
      }
    });
    if (firstMatch) {
      (firstMatch as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchQuery, activeTab?.html]);

  // 关闭外部下拉菜单
  useEffect(() => {
    if (!copyMenuOpen && !tablePickerOpen && !alertMenuOpen) return;
    const closeAll = () => {
      setCopyMenuOpen(false);
      setTablePickerOpen(false);
      setAlertMenuOpen(false);
    };
    window.addEventListener('mousedown', closeAll);
    return () => window.removeEventListener('mousedown', closeAll);
  }, [copyMenuOpen, tablePickerOpen, alertMenuOpen]);

  // ============================================================================
  // 多页签与文件操作
  // ============================================================================
  const handleNewTab = useCallback(
    async (afterTabId?: string) => {
      const untitledNum = tabs.filter((t) => !t.filePath).length + 1;
      const initialMd = `# 未命名文档 ${untitledNum}\n\n在此开始编写 Markdown…\n`;
      const rendered = await renderMarkdown(initialMd);
      const newTab: DocTabState = {
        id: createTabId(),
        filePath: null,
        fileName: `未命名-${untitledNum}.md`,
        dirPath: activeTab?.dirPath ?? '',
        encoding: 'UTF-8',
        content: initialMd,
        savedContent: initialMd,
        html: rendered.html,
        toc: rendered.toc,
        stats: rendered.stats,
        siblings: activeTab?.siblings ?? [],
        activeLine: 3,
      };
      setTabs((prev) => {
        if (!afterTabId) return [...prev, newTab];
        const idx = prev.findIndex((t) => t.id === afterTabId);
        if (idx === -1) return [...prev, newTab];
        const next = [...prev];
        next.splice(idx + 1, 0, newTab);
        return next;
      });
      setActiveTabId(newTab.id);
      if (viewMode === 'read') {
        setViewMode('split');
      }
    },
    [tabs, activeTab, viewMode],
  );

  const openPathInTab = useCallback(
    async (path: string) => {
      const existing = tabs.find((t) => t.filePath && t.filePath.toLowerCase() === path.toLowerCase());
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      try {
        const session = await openMarkdownFile(path);
        const newTab = sessionToTabState(session);
        setTabs((prev) => {
          if (
            prev.length === 1 &&
            prev[0].id === 'tab-welcome' &&
            prev[0].content === prev[0].savedContent
          ) {
            return [newTab];
          }
          return [...prev, newTab];
        });
        setActiveTabId(newTab.id);
        showToast(`已打开 ${session.fileName} (${session.encoding})`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
    },
    [tabs, sessionToTabState, showToast],
  );

  const handlePickFile = useCallback(async () => {
    try {
      const session = await pickMarkdownFile();
      if (!session) return;
      const existing = tabs.find(
        (t) => t.filePath && t.filePath.toLowerCase() === session.path.toLowerCase(),
      );
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
      const newTab = sessionToTabState(session);
      setTabs((prev) => {
        if (
          prev.length === 1 &&
          prev[0].id === 'tab-welcome' &&
          prev[0].content === prev[0].savedContent
        ) {
          return [newTab];
        }
        return [...prev, newTab];
      });
      setActiveTabId(newTab.id);
      showToast(`已打开 ${session.fileName} (${session.encoding})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [tabs, sessionToTabState, showToast]);

  const handleSave = useCallback(async () => {
    if (!activeTab) return;
    try {
      const normalized = normalizeContentForSave(
        activeTab.content,
        settings.trailingNewline,
        settings.endOfLine,
      );
      if (activeTab.filePath) {
        const session = await saveMarkdownFile(activeTab.filePath, normalized, activeTab.encoding);
        updateTabById(activeTab.id, (prev) => ({
          ...prev,
          content: session.content,
          savedContent: session.content,
          encoding: session.encoding,
          html: session.html,
          toc: session.toc,
          stats: session.stats,
          siblings: session.siblings,
        }));
        showToast(`已保存 ${session.fileName} (${session.encoding})`);
      } else {
        const session = await saveMarkdownDialog(activeTab.fileName, normalized);
        if (session) {
          updateTabById(activeTab.id, () => sessionToTabState(session, activeTab.id));
          showToast(`已另存为 ${session.fileName}`);
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [activeTab, settings.trailingNewline, settings.endOfLine, updateTabById, sessionToTabState, showToast]);

  const handleSaveAs = useCallback(async () => {
    if (!activeTab) return;
    try {
      const normalized = normalizeContentForSave(
        activeTab.content,
        settings.trailingNewline,
        settings.endOfLine,
      );
      const session = await saveMarkdownDialog(activeTab.fileName, normalized);
      if (session) {
        updateTabById(activeTab.id, () => sessionToTabState(session, activeTab.id));
        showToast(`已另存为 ${session.fileName}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  }, [activeTab, settings.trailingNewline, settings.endOfLine, updateTabById, sessionToTabState, showToast]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const target = tabs.find((t) => t.id === tabId);
      if (!target) return;
      if (target.content !== target.savedContent) {
        const ok = window.confirm(`文档「${target.fileName}」有未保存的修改，确定关闭该页签吗？`);
        if (!ok) return;
      }
      if (tabs.length === 1) {
        void renderMarkdown(DEMO_MARKDOWN).then((rendered) => {
          const fallback: DocTabState = {
            id: createTabId(),
            filePath: null,
            fileName: '欢迎使用 MarkLeaf.md',
            dirPath: '',
            encoding: 'UTF-8',
            content: DEMO_MARKDOWN,
            savedContent: DEMO_MARKDOWN,
            html: rendered.html,
            toc: rendered.toc,
            stats: rendered.stats,
            siblings: [],
            activeLine: 1,
          };
          setTabs([fallback]);
          setActiveTabId(fallback.id);
        });
        return;
      }
      const idx = tabs.findIndex((t) => t.id === tabId);
      const nextTabs = tabs.filter((t) => t.id !== tabId);
      setTabs(nextTabs);
      if (activeTabId === tabId) {
        const nextActive = nextTabs[Math.min(idx, nextTabs.length - 1)];
        if (nextActive) setActiveTabId(nextActive.id);
      }
    },
    [tabs, activeTabId],
  );

  const handleCloseOtherTabs = useCallback(
    (keepId: string) => {
      const keep = tabs.find((t) => t.id === keepId);
      if (!keep) return;
      setTabs([keep]);
      setActiveTabId(keep.id);
    },
    [tabs],
  );

  const handleCloseTabsToRight = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      const nextTabs = tabs.slice(0, idx + 1);
      setTabs(nextTabs);
      if (!nextTabs.some((t) => t.id === activeTabId)) {
        setActiveTabId(tabId);
      }
    },
    [tabs, activeTabId],
  );

  const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  // ============================================================================
  // 多格式剪贴板复制（移植自 MarkText：富文本 / HTML / Markdown）
  // ============================================================================
  const handleCopyRichText = useCallback(async () => {
    if (!activeTab) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const htmlBlob = new Blob([activeTab.html], { type: 'text/html' });
        const textBlob = new Blob([activeTab.content], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ]);
        showToast('已复制为富文本（可直接粘贴至 Word / 飞书 / Notion）');
      } else {
        await navigator.clipboard.writeText(activeTab.html);
        showToast('已复制渲染 HTML');
      }
    } catch {
      await navigator.clipboard.writeText(activeTab.content);
      showToast('已复制文档内容');
    }
  }, [activeTab, showToast]);

  const handleCopyHtml = useCallback(async () => {
    if (!activeTab) return;
    await navigator.clipboard.writeText(activeTab.html);
    showToast('已复制 HTML 源码到剪贴板');
  }, [activeTab, showToast]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!activeTab) return;
    await navigator.clipboard.writeText(activeTab.content);
    showToast('已复制 Markdown 源码到剪贴板');
  }, [activeTab, showToast]);

  // ============================================================================
  // 编辑器定位、打字机滚动、行号水槽与自动配对
  // ============================================================================
  const jumpEditorToLine = useCallback(
    (lineNumber: number) => {
      if (!activeTab) return;
      const targetMode: ViewMode = viewMode === 'read' ? 'split' : viewMode;
      setViewMode(targetMode);
      updateTabById(activeTab.id, (prev) => ({ ...prev, activeLine: lineNumber }));

      window.requestAnimationFrame(() => {
        const ta = editorRef.current;
        if (!ta) return;
        const lines = activeTab.content.split('\n');
        const clampedLine = Math.max(1, Math.min(lineNumber, lines.length));
        let charOffset = 0;
        for (let i = 0; i < clampedLine - 1; i++) {
          charOffset += lines[i].length + 1;
        }
        const lineEndOffset = charOffset + (lines[clampedLine - 1]?.length ?? 0);
        ta.focus();
        ta.setSelectionRange(charOffset, lineEndOffset);

        const lineHeightPx = Math.round(settings.editorFontSize * settings.editorLineHeight);
        ta.scrollTop = Math.max(0, (clampedLine - 5) * lineHeightPx);
        if (gutterRef.current) {
          gutterRef.current.scrollTop = ta.scrollTop;
        }
      });
    },
    [activeTab, viewMode, updateTabById, settings.editorFontSize, settings.editorLineHeight],
  );

  // 阅读区点击与双击事件代理：复选框原位切换 + 标题锚点复制 + 图片灯箱 + 双击段落跳源码行
  const handleReaderClick = useCallback(
    async (e: React.MouseEvent<HTMLElement>) => {
      if (!activeTab) return;
      const target = e.target as HTMLElement;

      // 1. 标题右侧 # 锚点复制按钮
      const anchorBtn = target.closest<HTMLElement>('.ml-heading-anchor');
      if (anchorBtn) {
        e.preventDefault();
        e.stopPropagation();
        const slug = anchorBtn.getAttribute('data-anchor') ?? '';
        if (slug) {
          await navigator.clipboard.writeText(slug);
          showToast(`已复制标题锚点 ${slug}`);
        }
        return;
      }

      // 2. 点击图片打开内置缩放灯箱（移植自 MarkText SimpleImageViewer）
      if (target instanceof HTMLImageElement) {
        e.preventDefault();
        setLightbox({
          src: target.src,
          alt: target.alt || '图片预览',
          scale: 1,
        });
        return;
      }

      // 3. 阅读态直接点击任务列表复选框
      if (target instanceof HTMLInputElement && target.classList.contains('ml-task-checkbox')) {
        const li = target.closest('[data-sourcepos]');
        if (!li) return;
        const sourcepos = li.getAttribute('data-sourcepos') ?? '';
        const lineStr = sourcepos.split(':')[0];
        const lineNumber = parseInt(lineStr, 10);
        if (!Number.isFinite(lineNumber) || lineNumber <= 0) return;

        try {
          const canAutoWrite = activeTab.filePath && activeTab.content === activeTab.savedContent;
          const res = await toggleMarkdownTask(
            activeTab.content,
            lineNumber,
            canAutoWrite ? activeTab.filePath : null,
            canAutoWrite ? activeTab.encoding : null,
          );
          updateTabById(activeTab.id, (prev) => ({
            ...prev,
            content: res.content,
            savedContent: res.saved ? res.content : prev.savedContent,
            html: res.rendered.html,
            toc: res.rendered.toc,
            stats: res.rendered.stats,
          }));
          showToast(
            res.saved ? `已更新第 ${lineNumber} 行任务并写回磁盘` : `已切换第 ${lineNumber} 行任务状态`,
          );
        } catch (err) {
          showToast(err instanceof Error ? err.message : String(err));
        }
      }
    },
    [activeTab, updateTabById, showToast],
  );

  const handleReaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLButtonElement ||
        target instanceof HTMLImageElement ||
        target.closest('.ml-code-header')
      ) {
        return;
      }
      const block = target.closest('[data-sourcepos]');
      if (!block) return;
      const sourcepos = block.getAttribute('data-sourcepos') ?? '';
      const lineNumber = parseInt(sourcepos.split(':')[0] ?? '1', 10);
      if (Number.isFinite(lineNumber) && lineNumber > 0) {
        jumpEditorToLine(lineNumber);
        showToast(`已定位到第 ${lineNumber} 行源码`);
      }
    },
    [jumpEditorToLine, showToast],
  );

  // 编辑器快捷插入与包裹
  const insertAroundSelection = useCallback(
    (prefix: string, suffix = '', placeholder = '文本') => {
      const ta = editorRef.current;
      if (!ta || !activeTab) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = activeTab.content.slice(start, end) || placeholder;
      const next =
        activeTab.content.slice(0, start) + prefix + selected + suffix + activeTab.content.slice(end);
      updateTabById(activeTab.id, (prev) => ({ ...prev, content: next }));
      window.requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
      });
    },
    [activeTab, updateTabById],
  );

  const insertGridTable = useCallback(
    (rows: number, cols: number) => {
      const headerCells = Array.from({ length: cols }, (_, i) => `列 ${i + 1}`).join(' | ');
      const sepCells = Array.from({ length: cols }, () => ':---').join(' | ');
      const bodyRows = Array.from({ length: Math.max(1, rows - 1) }, () =>
        `| ${Array.from({ length: cols }, () => '内容').join(' | ')} |`,
      ).join('\n');
      const tableMd = `\n| ${headerCells} |\n| ${sepCells} |\n${bodyRows}\n`;
      insertAroundSelection(tableMd, '', '');
      setTablePickerOpen(false);
    },
    [insertAroundSelection],
  );

  // 编辑器按键拦截：支持 Tab 缩进与括号/引号/Markdown 符号自动成对补全
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeTab) return;
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (e.key === 'Tab') {
      e.preventDefault();
      const spaces = ' '.repeat(settings.tabSize);
      const next = activeTab.content.slice(0, start) + spaces + activeTab.content.slice(end);
      updateTabById(activeTab.id, (prev) => ({ ...prev, content: next }));
      window.requestAnimationFrame(() => {
        ta.setSelectionRange(start + spaces.length, start + spaces.length);
      });
      return;
    }

    const closeChar = PAIR_MAP[e.key];
    if (!closeChar) return;

    const isBracket = e.key === '(' || e.key === '[' || e.key === '{';
    const isQuote = e.key === '"' || e.key === "'";
    const isMd = e.key === '*' || e.key === '`' || e.key === '=' || e.key === '~';

    if (
      (isBracket && !settings.autoPairBracket) ||
      (isQuote && !settings.autoPairQuote) ||
      (isMd && !settings.autoPairMarkdown)
    ) {
      return;
    }

    if (isMd && start === end && e.key !== '`') {
      return;
    }

    e.preventDefault();
    const selected = activeTab.content.slice(start, end);
    const next =
      activeTab.content.slice(0, start) + e.key + selected + closeChar + activeTab.content.slice(end);
    updateTabById(activeTab.id, (prev) => ({ ...prev, content: next }));
    window.requestAnimationFrame(() => {
      ta.setSelectionRange(start + 1, start + 1 + selected.length);
    });
  };

  // 更新光标所在行号 + 打字机模式自动居中滚动
  const syncEditorCursorLine = (ta: HTMLTextAreaElement) => {
    if (!activeTab) return;
    const pos = ta.selectionStart;
    const line = activeTab.content.slice(0, pos).split('\n').length;
    if (line !== activeTab.activeLine) {
      updateTabById(activeTab.id, (prev) => ({ ...prev, activeLine: line }));
    }
    if (settings.typewriterMode) {
      const lineHeightPx = Math.round(settings.editorFontSize * settings.editorLineHeight);
      const targetScroll = line * lineHeightPx - ta.clientHeight * 0.42;
      if (Math.abs(ta.scrollTop - targetScroll) > lineHeightPx * 1.2) {
        ta.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
      }
    }
  };

  // 全局快捷键监听
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          void handleSaveAs();
        } else {
          void handleSave();
        }
      } else if (mod && key === 'o') {
        e.preventDefault();
        void handlePickFile();
      } else if (mod && (key === 'n' || key === 't')) {
        e.preventDefault();
        void handleNewTab();
      } else if (mod && key === 'w') {
        e.preventDefault();
        if (activeTab) handleCloseTab(activeTab.id);
      } else if (mod && key === 'e') {
        e.preventDefault();
        setViewMode((m) => (m === 'read' ? 'split' : m === 'split' ? 'edit' : 'read'));
      } else if (mod && key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        window.requestAnimationFrame(() => searchInputRef.current?.focus());
      } else if (mod && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (mod && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length > 1) {
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const nextIdx = e.shiftKey
            ? (idx - 1 + tabs.length) % tabs.length
            : (idx + 1) % tabs.length;
          setActiveTabId(tabs[nextIdx].id);
        }
      } else if (e.key === 'Escape') {
        if (lightbox) {
          setLightbox(null);
        } else if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery('');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleSave,
    handleSaveAs,
    handlePickFile,
    handleNewTab,
    handleCloseTab,
    activeTab,
    tabs,
    activeTabId,
    lightbox,
    searchOpen,
  ]);

  const filteredSiblings = useMemo(() => {
    const list = activeTab?.siblings ?? [];
    const q = fileFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => f.name.toLowerCase().includes(q));
  }, [activeTab?.siblings, fileFilter]);

  const tabSummaries: DocTabSummary[] = useMemo(
    () =>
      tabs.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        filePath: t.filePath,
        dirty: t.content !== t.savedContent,
        encoding: t.encoding,
      })),
    [tabs],
  );

  const editorLineCount = useMemo(() => {
    if (!activeTab) return 1;
    return Math.max(1, activeTab.content.split('\n').length);
  }, [activeTab?.content]);

  const cycleStatsUnit = () => {
    const order: StatsUnit[] = ['words', 'chars', 'charsWithSpaces', 'paragraphs'];
    const idx = order.indexOf(settings.statsUnit);
    const nextUnit = order[(idx + 1) % order.length];
    updateSettings({ ...settings, statsUnit: nextUnit });
  };

  const cyclePageWidth = () => {
    const modes: PageWidthMode[] = ['compact', 'comfortable', 'wide', 'xwide', 'full'];
    const idx = modes.indexOf(settings.pageWidthMode);
    const nextMode = modes[(idx + 1) % modes.length];
    updateSettings({ ...settings, pageWidthMode: nextMode });
    showToast(`版心宽度：${PAGE_WIDTH_MAP[nextMode].label}`);
  };

  const stats = activeTab?.stats ?? EMPTY_STATS;
  const statsBadgeText = useMemo(() => {
    switch (settings.statsUnit) {
      case 'words':
        return `${stats.words} 词`;
      case 'chars':
        return `${stats.chars} 字`;
      case 'charsWithSpaces':
        return `${stats.charsWithSpaces} 字符`;
      case 'paragraphs':
        return `${stats.paragraphs} 段落`;
    }
  }, [settings.statsUnit, stats]);

  return (
    <div
      className="ml-workbench"
      style={{
        zoom: settings.uiZoom / 100,
      }}
    >
      {/* 1. 一体化无边框标题栏 + 多页签栏 */}
      <TitleBar
        tabs={tabSummaries}
        activeTabId={activeTab.id}
        appVersion={appVersion}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseTabsToRight={handleCloseTabsToRight}
        onReorderTabs={handleReorderTabs}
        onNewTab={(afterId) => void handleNewTab(afterId)}
        onOpenFile={() => void handlePickFile()}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onCopyRichText={() => void handleCopyRichText()}
        onCopyHtml={() => void handleCopyHtml()}
        onCopyMarkdown={() => void handleCopyMarkdown()}
        onOpenSettings={() => setSettingsOpen(true)}
        onCopyPath={(p) => {
          void navigator.clipboard.writeText(p);
          showToast('已复制文件完整路径');
        }}
      />

      {/* 2. 主工具栏（复刻 git-extensions 分组簇 + SVG 图标风格） */}
      <div className="ml-toolbar">
        {/* 左侧：侧栏开关与文件操作簇 */}
        <div className="ml-toolbar-group">
          <button
            type="button"
            className={`ml-tool-btn ${leftOpen ? 'is-active' : ''}`}
            title="切换同目录文件侧栏"
            onClick={() => setLeftOpen((v) => !v)}
          >
            <Icon name="sidebar-left" size={15} />
          </button>
          <button
            type="button"
            className="ml-tool-btn"
            title="新建草稿页签 (Ctrl+N)"
            onClick={() => void handleNewTab()}
          >
            <Icon name="plus" size={15} />
            <span className="ml-tool-label">新建</span>
          </button>
          <button
            type="button"
            className="ml-tool-btn"
            title="打开本地 Markdown 文件 (Ctrl+O)"
            onClick={() => void handlePickFile()}
          >
            <Icon name="folder" size={15} />
            <span className="ml-tool-label">打开</span>
          </button>
          <button
            type="button"
            className={`ml-tool-btn ${isDirty ? 'is-primary' : ''}`}
            title="保存当前文档 (Ctrl+S)"
            onClick={() => void handleSave()}
          >
            <Icon name="save" size={15} />
            <span className="ml-tool-label">{isDirty ? '保存*' : '保存'}</span>
          </button>

          {/* 复制导出下拉按钮 */}
          <div className="ml-dropdown-anchor" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ml-tool-btn"
              title="多格式复制 (富文本 / HTML / Markdown)"
              onClick={() => setCopyMenuOpen((v) => !v)}
            >
              <Icon name="copy" size={14} />
              <span className="ml-tool-label">复制为</span>
              <Icon name="chevron-down" size={12} />
            </button>
            {copyMenuOpen && (
              <div className="ml-popover-menu">
                <button
                  type="button"
                  className="ml-context-item"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    void handleCopyRichText();
                  }}
                >
                  <span>复制为富文本 (Word / 飞书 / Notion)</span>
                </button>
                <button
                  type="button"
                  className="ml-context-item"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    void handleCopyHtml();
                  }}
                >
                  <span>复制 HTML 源码</span>
                </button>
                <button
                  type="button"
                  className="ml-context-item"
                  onClick={() => {
                    setCopyMenuOpen(false);
                    void handleCopyMarkdown();
                  }}
                >
                  <span>复制 Markdown 源码</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="ml-toolbar-sep" />

        {/* 中部：阅读/分屏/源码三态切换器 + 版心行宽 + 打字机/专注模式 */}
        <div className="ml-toolbar-group">
          <div className="ml-mode-segmented" role="group" aria-label="视图模式切换">
            <button
              type="button"
              className={`ml-seg-btn ${viewMode === 'read' ? 'is-active' : ''}`}
              onClick={() => setViewMode('read')}
              title="纯净阅读模式 (双击正文任意段落可跳入对应源码行)"
            >
              <Icon name="eye" size={14} />
              <span>阅读</span>
            </button>
            <button
              type="button"
              className={`ml-seg-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="左编右读实时分屏模式 (Ctrl+E)"
            >
              <Icon name="columns" size={14} />
              <span>分屏</span>
            </button>
            <button
              type="button"
              className={`ml-seg-btn ${viewMode === 'edit' ? 'is-active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="专注源码编辑模式"
            >
              <Icon name="edit" size={14} />
              <span>源码</span>
            </button>
          </div>

          <button
            type="button"
            className={`ml-tool-btn ${settings.pageWidthMode === 'full' ? 'is-active' : ''}`}
            title={`当前行宽：${PAGE_WIDTH_MAP[settings.pageWidthMode].label}（点击循环切换）`}
            onClick={cyclePageWidth}
          >
            <Icon name="width" size={15} />
            <span className="ml-tool-label">
              {settings.pageWidthMode === 'full' ? '全宽' : PAGE_WIDTH_MAP[settings.pageWidthMode].cssMaxWidth}
            </span>
          </button>

          <button
            type="button"
            className={`ml-tool-btn ${settings.typewriterMode ? 'is-active' : ''}`}
            title="打字机滚动模式：编辑时光标行始终保持纵向居中"
            onClick={() => {
              const next = !settings.typewriterMode;
              updateSettings({ ...settings, typewriterMode: next });
              showToast(next ? '已开启打字机居中滚动模式' : '已关闭打字机滚动模式');
            }}
          >
            <Icon name="typewriter" size={15} />
          </button>

          <button
            type="button"
            className={`ml-tool-btn ${settings.focusMode ? 'is-active' : ''}`}
            title="专注模式：突出高亮当前活跃段落，柔和淡化周围段落"
            onClick={() => {
              const next = !settings.focusMode;
              updateSettings({ ...settings, focusMode: next });
              showToast(next ? '已开启段落专注模式' : '已关闭段落专注模式');
            }}
          >
            <Icon name="focus" size={15} />
          </button>
        </div>

        <div className="ml-toolbar-spacer" />

        {/* 右侧：内嵌搜索框、MarkText 四维字数胶囊、快速主题选择、大纲与设置按钮 */}
        <div className="ml-toolbar-group">
          <div className={`ml-filter-box ${searchOpen || searchQuery ? 'is-active' : ''}`}>
            <Icon name="search" size={13} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="查找正文 (Ctrl+F)…"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="ml-filter-clear"
                title="清空查找"
                onClick={() => setSearchQuery('')}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          {/* 移植自 MarkText TitleBar 的可点击切换维度字数统计胶囊 */}
          <div
            className="ml-stats-pill-wrap"
            onMouseEnter={() => setStatsHover(true)}
            onMouseLeave={() => setStatsHover(false)}
          >
            <button
              type="button"
              className="ml-stats-pill"
              title="点击切换统计单位 (词数 / 字数 / 字符 / 段落)"
              onClick={cycleStatsUnit}
            >
              <span>{statsBadgeText}</span>
              <span className="ml-stats-pill-dot">·</span>
              <span>约 {stats.readingMinutes} 分钟</span>
            </button>
            {statsHover && (
              <div className="ml-stats-popover">
                <div className="ml-stats-popover-title">文档实时统计 (点击胶囊切换单位)</div>
                <div className="ml-stats-popover-row">
                  <span>词数 (Words)</span>
                  <strong>{stats.words}</strong>
                </div>
                <div className="ml-stats-popover-row">
                  <span>字数 (不含空格)</span>
                  <strong>{stats.chars}</strong>
                </div>
                <div className="ml-stats-popover-row">
                  <span>总字符 (含空格)</span>
                  <strong>{stats.charsWithSpaces}</strong>
                </div>
                <div className="ml-stats-popover-row">
                  <span>段落数 (Paragraphs)</span>
                  <strong>{stats.paragraphs}</strong>
                </div>
                <div className="ml-stats-popover-row">
                  <span>总行数 (Lines)</span>
                  <strong>{stats.lines}</strong>
                </div>
                {stats.tasksTotal > 0 && (
                  <div className="ml-stats-popover-row">
                    <span>任务列表完成度</span>
                    <strong>
                      {stats.tasksDone} / {stats.tasksTotal}
                    </strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 主题快速选择器 */}
          <select
            className="ml-theme-select"
            value={effectiveTheme}
            onChange={(e) =>
              updateSettings({
                ...settings,
                followSystemTheme: false,
                theme: e.target.value as ThemeId,
              })
            }
            title="快速切换排版主题"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`ml-tool-btn ${rightOpen ? 'is-active' : ''}`}
            title="切换右侧大纲目录 (TOC)"
            onClick={() => setRightOpen((v) => !v)}
          >
            <Icon name="sidebar-right" size={15} />
          </button>

          <button
            type="button"
            className="ml-tool-btn"
            title="偏好设置 (Ctrl+,)"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="settings" size={15} />
          </button>
        </div>
      </div>

      {/* 3. 主工作台：左侧同级文件树 + 中央画布 + 右侧浮动大纲 */}
      <div className="ml-body">
        {leftOpen && (
          <aside className="ml-sidebar-left">
            <div className="ml-panel-header">
              <span>同级目录文档</span>
              <span className="ml-badge-count">{activeTab.siblings.length}</span>
            </div>
            {activeTab.dirPath && (
              <div className="ml-dir-path" title={activeTab.dirPath}>
                {activeTab.dirPath}
              </div>
            )}
            <div className="ml-sidebar-search">
              <input
                type="text"
                placeholder="筛选文件名…"
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
              />
            </div>
            <div className="ml-file-list">
              {filteredSiblings.length === 0 ? (
                <div className="ml-empty-hint">
                  {activeTab.filePath
                    ? '没有匹配的同级 .md 文件'
                    : '点击「打开」加载本地 .md 文件后，此处将自动列出同目录下的全部 Markdown 文档。'}
                </div>
              ) : (
                filteredSiblings.map((item) => {
                  const isCurrent =
                    activeTab.filePath &&
                    item.path.toLowerCase() === activeTab.filePath.toLowerCase();
                  return (
                    <button
                      key={item.path}
                      type="button"
                      className={`ml-file-item ${isCurrent ? 'is-active' : ''}`}
                      onClick={() => void openPathInTab(item.path)}
                      title={item.path}
                    >
                      <Icon name="file" size={13} />
                      <span className="ml-file-name">{item.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* 中央主舞台：编辑区（带行号水槽 + 网格建表器） & 阅读区 */}
        <main className={`ml-main-stage mode-${viewMode}`}>
          {(viewMode === 'edit' || viewMode === 'split') && (
            <section className="ml-editor-pane">
              {/* 编辑器格式化快捷工具条 */}
              <div className="ml-editor-toolbar">
                <div className="ml-toolbar-group">
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('## ', '', '二级标题')}
                    title="插入二级标题"
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('### ', '', '三级标题')}
                    title="插入三级标题"
                  >
                    H3
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('**', '**', '加粗文本')}
                    title="粗体 (**文本**)"
                  >
                    <Icon name="bold" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('*', '*', '斜体文本')}
                    title="斜体 (*文本*)"
                  >
                    <Icon name="italic" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('~~', '~~', '删除线文本')}
                    title="删除线 (~~文本~~)"
                  >
                    <Icon name="strikethrough" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('==', '==', '重点高亮')}
                    title="荧光笔高亮 (==文本==)"
                  >
                    <Icon name="highlight" size={13} />
                  </button>
                </div>

                <div className="ml-toolbar-sep" />

                <div className="ml-toolbar-group">
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('`', '`', 'code')}
                    title="行内代码 (`code`)"
                  >
                    <Icon name="code" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('\n```rust\n', '\n```\n', '// 代码块')}
                    title="插入代码块"
                  >
                    <Icon name="code-block" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('> ', '', '引用内容')}
                    title="插入引用"
                  >
                    <Icon name="quote" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('- [ ] ', '', '待办事项')}
                    title="插入任务列表"
                  >
                    <Icon name="task" size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertAroundSelection('[', '](https://)', '链接文字')}
                    title="插入超链接"
                  >
                    <Icon name="link" size={13} />
                  </button>

                  {/* 移植自 MarkText 的可视化 2D 网格建表器 (Table Chessboard) */}
                  <div className="ml-dropdown-anchor" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="可视化网格插入表格 (Table Picker)"
                      onClick={() => setTablePickerOpen((v) => !v)}
                    >
                      <Icon name="table" size={13} />
                      <span>表格</span>
                    </button>
                    {tablePickerOpen && (
                      <div className="ml-table-picker-popover">
                        <div className="ml-table-picker-header">
                          插入表格：{tableHover.rows} 行 × {tableHover.cols} 列
                        </div>
                        <div className="ml-table-grid">
                          {Array.from({ length: 6 }, (_, rIdx) => {
                            const r = rIdx + 1;
                            return (
                              <div key={r} className="ml-table-grid-row">
                                {Array.from({ length: 7 }, (_, cIdx) => {
                                  const c = cIdx + 1;
                                  const active = r <= tableHover.rows && c <= tableHover.cols;
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      className={`ml-table-cell ${active ? 'is-active' : ''}`}
                                      onMouseEnter={() => setTableHover({ rows: Math.max(2, r), cols: Math.max(2, c) })}
                                      onClick={() => insertGridTable(Math.max(2, r), Math.max(2, c))}
                                    />
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* GitHub Alerts 五色提示块下拉选择器 */}
                  <div className="ml-dropdown-anchor" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="插入 GitHub Alerts 提示卡片"
                      onClick={() => setAlertMenuOpen((v) => !v)}
                    >
                      <Icon name="alert" size={13} />
                      <span>提示块</span>
                    </button>
                    {alertMenuOpen && (
                      <div className="ml-popover-menu">
                        {(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'] as const).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            className="ml-context-item"
                            onClick={() => {
                              setAlertMenuOpen(false);
                              insertAroundSelection(`\n> [!${kind}]\n> `, '\n', '在此输入提示内容');
                            }}
                          >
                            <span>[!{kind}] 提示卡片</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => insertAroundSelection('\n---\n', '', '')}
                    title="插入水平分割线"
                  >
                    <Icon name="hr" size={13} />
                  </button>
                </div>
              </div>

              {/* 编辑器主体（左侧行号水槽 + 右侧源码编辑区） */}
              <div className="ml-editor-body">
                {settings.editorLineNumbers !== 'off' && (
                  <div
                    ref={gutterRef}
                    className="ml-editor-gutter"
                    style={{
                      fontSize: `${settings.editorFontSize}px`,
                      lineHeight: settings.editorLineHeight,
                    }}
                    aria-hidden="true"
                  >
                    {Array.from({ length: editorLineCount }, (_, idx) => {
                      const ln = idx + 1;
                      const isActive = ln === activeTab.activeLine;
                      const showLabel =
                        settings.editorLineNumbers === 'full' ||
                        ln === 1 ||
                        ln % 10 === 0 ||
                        isActive;
                      return (
                        <div
                          key={ln}
                          className={`ml-gutter-line ${isActive ? 'is-active' : ''}`}
                        >
                          {showLabel ? ln : '·'}
                        </div>
                      );
                    })}
                  </div>
                )}

                <textarea
                  ref={editorRef}
                  className="ml-editor-textarea"
                  value={activeTab.content}
                  wrap={settings.editorWordWrap ? 'soft' : 'off'}
                  style={{
                    fontSize: `${settings.editorFontSize}px`,
                    lineHeight: settings.editorLineHeight,
                    tabSize: settings.tabSize,
                  }}
                  onChange={(e) => {
                    const nextText = e.target.value;
                    updateTabById(activeTab.id, (prev) => ({ ...prev, content: nextText }));
                    syncEditorCursorLine(e.currentTarget);
                  }}
                  onClick={(e) => syncEditorCursorLine(e.currentTarget)}
                  onKeyUp={(e) => syncEditorCursorLine(e.currentTarget)}
                  onKeyDown={handleEditorKeyDown}
                  onScroll={(e) => {
                    if (gutterRef.current) {
                      gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  spellCheck={false}
                  placeholder="在此输入 Markdown 内容…"
                />
              </div>
            </section>
          )}

          {(viewMode === 'read' || viewMode === 'split') && (
            <section
              ref={readerRef}
              className="ml-reader-pane"
              onClick={(e) => void handleReaderClick(e)}
              onDoubleClick={handleReaderDoubleClick}
            >
              <article
                className={[
                  'ml-prose',
                  settings.showBlockLineBadge ? 'show-line-badge' : '',
                  settings.showHeadingAnchor ? 'show-heading-anchor' : '',
                  settings.codeBlockLineNumbers ? 'show-code-ln' : '',
                  settings.wrapCodeBlocks ? 'wrap-code' : '',
                  settings.focusMode ? 'focus-mode' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  maxWidth: PAGE_WIDTH_MAP[settings.pageWidthMode].cssMaxWidth,
                  fontFamily: FONT_PRESET_MAP[settings.proseFontFamily].cssValue,
                  fontSize: `${settings.proseFontSize}px`,
                  lineHeight: settings.proseLineHeight,
                }}
                dangerouslySetInnerHTML={{ __html: activeTab.html }}
              />
            </section>
          )}
        </main>

        {/* 右侧文档目录大纲 (TOC) */}
        {rightOpen && (
          <aside className="ml-sidebar-right">
            <div className="ml-panel-header">
              <span>文档大纲 (TOC)</span>
              <span className="ml-badge-count">{activeTab.toc.length}</span>
            </div>
            <nav className={`ml-toc-list ${settings.wordWrapInToc ? 'is-wrapped' : ''}`}>
              {activeTab.toc.length === 0 ? (
                <div className="ml-empty-hint">当前文档暂无标题大纲</div>
              ) : (
                activeTab.toc.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`ml-toc-item level-${item.level} ${
                      activeTab.activeLine === item.line ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      updateTabById(activeTab.id, (prev) => ({ ...prev, activeLine: item.line }));
                      if (viewMode === 'edit') {
                        jumpEditorToLine(item.line);
                      } else {
                        const headingEl = document.getElementById(item.id);
                        headingEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    title={`跳转到第 ${item.line} 行：${item.text}`}
                  >
                    <span className="ml-toc-text">{item.text}</span>
                    <span className="ml-toc-line">L{item.line}</span>
                  </button>
                ))
              )}
            </nav>
          </aside>
        )}
      </div>

      {/* 4. 底部状态栏 */}
      <footer className="ml-statusbar">
        <div className="ml-status-left">
          <span title="文件编码（保存时严格按原编码写回，不乱码）">编码: {activeTab.encoding}</span>
          <span>行 {activeTab.activeLine} / 共 {stats.lines} 行</span>
          <span>版心: {PAGE_WIDTH_MAP[settings.pageWidthMode].label}</span>
          {stats.tasksTotal > 0 && (
            <span className="ml-task-stat">
              任务进度: {stats.tasksDone}/{stats.tasksTotal}
            </span>
          )}
        </div>
        <div className="ml-status-right">
          {viewMode === 'read' && (
            <span className="ml-status-tip">💡 双击任意段落精准跳至对应源码行 · 点击任务框直接写回</span>
          )}
          <span>{stats.words} 词</span>
          <span>{stats.chars} 字</span>
          <span>约 {stats.readingMinutes} 分钟阅读</span>
        </div>
      </footer>

      {/* 5. 偏好设置双栏弹窗 */}
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onSave={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {/* 6. 内置图片灯箱预览器 (Lightbox Viewer) */}
      {lightbox && (
        <div className="ml-lightbox-backdrop" onClick={() => setLightbox(null)}>
          <div className="ml-lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
            <span>{lightbox.alt}</span>
            <button
              type="button"
              onClick={() =>
                setLightbox((prev) =>
                  prev ? { ...prev, scale: Math.max(0.25, prev.scale - 0.25) } : null,
                )
              }
            >
              缩小 -
            </button>
            <span>{Math.round(lightbox.scale * 100)}%</span>
            <button
              type="button"
              onClick={() =>
                setLightbox((prev) =>
                  prev ? { ...prev, scale: Math.min(4, prev.scale + 0.25) } : null,
                )
              }
            >
              放大 +
            </button>
            <button
              type="button"
              onClick={() => setLightbox((prev) => (prev ? { ...prev, scale: 1 } : null))}
            >
              1:1
            </button>
            <button type="button" onClick={() => setLightbox(null)}>
              关闭 (Esc)
            </button>
          </div>
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            className="ml-lightbox-img"
            style={{ transform: `scale(${lightbox.scale})` }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.stopPropagation();
              const delta = e.deltaY < 0 ? 0.15 : -0.15;
              setLightbox((prev) =>
                prev ? { ...prev, scale: Math.min(5, Math.max(0.2, prev.scale + delta)) } : null,
              );
            }}
          />
        </div>
      )}

      {toast && <div className="ml-toast">{toast}</div>}
    </div>
  );
}

export default App;
