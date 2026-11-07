import { useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import appIcon from '../../src-tauri/icons/32x32.png';
import { isTauriRuntime } from '../api';
import Icon from '../ui/Icon';

export interface DocTabSummary {
  id: string;
  fileName: string;
  filePath: string | null;
  dirty: boolean;
  encoding: string;
}

interface TitleBarProps {
  tabs: DocTabSummary[];
  activeTabId: string;
  appVersion: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOtherTabs: (id: string) => void;
  onCloseTabsToRight: (id: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onNewTab: (afterTabId?: string) => void;
  onOpenFile: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onCopyRichText: () => void;
  onCopyHtml: () => void;
  onCopyMarkdown: () => void;
  onOpenSettings: () => void;
  onCopyPath: (path: string) => void;
}

interface DragState {
  tabId: string;
  fromIndex: number;
  startX: number;
  startY: number;
  dragging: boolean;
  insertIndex: number;
  indicatorLeft: number | null;
}

export default function TitleBar({
  tabs,
  activeTabId,
  appVersion,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onReorderTabs,
  onNewTab,
  onOpenFile,
  onSave,
  onSaveAs,
  onCopyRichText,
  onCopyHtml,
  onCopyMarkdown,
  onOpenSettings,
  onCopyPath,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const [appMenuPos, setAppMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized).catch(() => {});
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!appMenuPos && !tabMenu) return;
    const closeMenus = () => {
      setAppMenuPos(null);
      setTabMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenus();
    };
    window.addEventListener('mousedown', closeMenus);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', closeMenus);
      window.removeEventListener('keydown', onKey);
    };
  }, [appMenuPos, tabMenu]);

  // 切换页签时确保活跃页签在可视滚动区域内
  useEffect(() => {
    const el = tabRefs.current.get(activeTabId);
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [activeTabId]);

  const handleMinimize = () => {
    if (!isTauriRuntime()) return;
    void getCurrentWindow().minimize();
  };

  const handleToggleMaximize = () => {
    if (!isTauriRuntime()) return;
    void getCurrentWindow().toggleMaximize();
  };

  const handleCloseWindow = () => {
    if (!isTauriRuntime()) {
      window.close();
      return;
    }
    void getCurrentWindow().close();
  };

  const computeInsertion = (clientX: number, fromIndex: number) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return { index: fromIndex, left: null };
    const scrollRect = scrollEl.getBoundingClientRect();
    const rects = tabs.map((t) => {
      const node = tabRefs.current.get(t.id);
      return node ? node.getBoundingClientRect() : null;
    });

    let insertIndex = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r && clientX > r.left + r.width / 2) {
        insertIndex = i + 1;
      }
    }

    let indicatorX = scrollRect.left;
    if (insertIndex === 0 && rects[0]) {
      indicatorX = rects[0].left;
    } else if (insertIndex > 0 && rects[insertIndex - 1]) {
      indicatorX = rects[insertIndex - 1]!.right;
    }
    const relativeLeft = indicatorX - scrollRect.left + scrollEl.scrollLeft;
    return { index: insertIndex, left: relativeLeft };
  };

  const handleTabPointerDown = (e: React.PointerEvent<HTMLDivElement>, tabId: string, index: number) => {
    if (e.button === 1) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.ml-tab-close')) return;

    onSelectTab(tabId);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      tabId,
      fromIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      insertIndex: index,
      indicatorLeft: null,
    });
  };

  const handleTabPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    const isDragging = dragState.dragging || dist >= 6;
    if (!isDragging) return;

    const { index, left } = computeInsertion(e.clientX, dragState.fromIndex);
    setDragState({
      ...dragState,
      dragging: true,
      insertIndex: index,
      indicatorLeft: left,
    });
  };

  const handleTabPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (dragState.dragging) {
      let targetIndex = dragState.insertIndex;
      if (targetIndex > dragState.fromIndex) {
        targetIndex -= 1;
      }
      if (targetIndex !== dragState.fromIndex) {
        onReorderTabs(dragState.fromIndex, targetIndex);
      }
    }
    setDragState(null);
  };

  const contextTab = tabMenu ? tabs.find((t) => t.id === tabMenu.tabId) : null;
  const contextTabIdx = tabMenu ? tabs.findIndex((t) => t.id === tabMenu.tabId) : -1;

  return (
    <>
      <header className="ml-titlebar" data-tauri-drag-region>
        {/* 左上角品牌图标菜单按钮 */}
        <button
          type="button"
          className="ml-title-app-btn"
          title="MarkLeaf 菜单"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setAppMenuPos({ x: rect.left + 4, y: rect.bottom + 4 });
          }}
        >
          <img src={appIcon} width={20} height={20} alt="MarkLeaf" draggable={false} />
        </button>

        {/* 中部多页签栏 */}
        <div
          className="ml-tabs-container"
          data-tauri-drag-region
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) handleToggleMaximize();
          }}
        >
          <div
            ref={scrollRef}
            className="ml-tabs-scroll"
            data-tauri-drag-region
            onWheel={(e) => {
              if (scrollRef.current && e.deltaY !== 0) {
                scrollRef.current.scrollLeft += e.deltaY;
              }
            }}
          >
            <div className="ml-tabs-list" role="tablist">
              {tabs.map((tab, idx) => {
                const isActive = tab.id === activeTabId;
                const isDragging = dragState?.dragging && dragState.tabId === tab.id;
                return (
                  <div
                    key={tab.id}
                    ref={(node) => {
                      if (node) tabRefs.current.set(tab.id, node);
                      else tabRefs.current.delete(tab.id);
                    }}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    className={`ml-tab ${isActive ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
                    title={tab.filePath ? `${tab.filePath} (${tab.encoding})` : `${tab.fileName} (未保存草稿)`}
                    onPointerDown={(e) => handleTabPointerDown(e, tab.id, idx)}
                    onPointerMove={handleTabPointerMove}
                    onPointerUp={handleTabPointerUp}
                    onPointerCancel={() => setDragState(null)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        onCloseTab(tab.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTabMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <Icon name="file" size={13} />
                    <span className="ml-tab-name">{tab.fileName}</span>
                    {tab.dirty && <span className="ml-tab-dirty" title="有未保存修改" />}
                    <button
                      type="button"
                      className="ml-tab-close"
                      title="关闭页签 (Ctrl+W / 中键)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                );
              })}
              {dragState?.dragging && dragState.indicatorLeft !== null && (
                <div className="ml-tab-insertion-line" style={{ left: `${dragState.indicatorLeft}px` }} />
              )}
            </div>

            <button
              type="button"
              className="ml-tab-add-btn"
              title="新建 Markdown 草稿页签 (Ctrl+T / Ctrl+N)"
              onClick={() => onNewTab()}
            >
              <Icon name="plus" size={14} />
            </button>

            <div
              className="ml-tabs-blank"
              data-tauri-drag-region
              onDoubleClick={handleToggleMaximize}
            />
          </div>
        </div>

        {/* 右侧原生窗口三联按钮 */}
        <div className="ml-window-controls">
          <button
            type="button"
            className="ml-win-btn"
            title="最小化"
            onClick={handleMinimize}
          >
            <Icon name="minimize" size={14} />
          </button>
          <button
            type="button"
            className="ml-win-btn"
            title={maximized ? '向下还原' : '最大化'}
            onClick={handleToggleMaximize}
          >
            <Icon name={maximized ? 'restore' : 'maximize'} size={13} />
          </button>
          <button
            type="button"
            className="ml-win-btn ml-win-close"
            title="关闭窗口 (Alt+F4)"
            onClick={handleCloseWindow}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </header>

      {/* 左上角应用菜单 */}
      {appMenuPos && (
        <div
          className="ml-context-menu"
          style={{ left: appMenuPos.x, top: appMenuPos.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onNewTab();
            }}
          >
            <span>新建草稿页签</span>
            <kbd>Ctrl+N</kbd>
          </button>
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onOpenFile();
            }}
          >
            <span>打开 Markdown 文件…</span>
            <kbd>Ctrl+O</kbd>
          </button>
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onSave();
            }}
          >
            <span>保存当前文档</span>
            <kbd>Ctrl+S</kbd>
          </button>
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onSaveAs();
            }}
          >
            <span>另存为…</span>
            <kbd>Ctrl+Shift+S</kbd>
          </button>
          <div className="ml-menu-sep" />
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onCopyRichText();
            }}
          >
            <span>复制为富文本 (可粘贴至 Word/飞书/Notion)</span>
          </button>
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onCopyHtml();
            }}
          >
            <span>复制渲染后 HTML 代码</span>
          </button>
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onCopyMarkdown();
            }}
          >
            <span>复制 Markdown 源码</span>
          </button>
          <div className="ml-menu-sep" />
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              onOpenSettings();
            }}
          >
            <span>偏好设置…</span>
            <kbd>Ctrl+,</kbd>
          </button>
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              setAppMenuPos(null);
              setAboutOpen(true);
            }}
          >
            <span>关于 MarkLeaf</span>
          </button>
          <div className="ml-menu-sep" />
          <button
            type="button"
            className="ml-context-item is-danger"
            onClick={() => {
              setAppMenuPos(null);
              handleCloseWindow();
            }}
          >
            <span>退出应用</span>
            <kbd>Alt+F4</kbd>
          </button>
        </div>
      )}

      {/* 页签右键菜单 */}
      {tabMenu && contextTab && (
        <div
          className="ml-context-menu"
          style={{ left: tabMenu.x, top: tabMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              const id = contextTab.id;
              setTabMenu(null);
              onNewTab(id);
            }}
          >
            <span>在右侧新建页签</span>
          </button>
          <div className="ml-menu-sep" />
          <button
            type="button"
            className="ml-context-item"
            onClick={() => {
              const id = contextTab.id;
              setTabMenu(null);
              onCloseTab(id);
            }}
          >
            <span>关闭当前页签</span>
            <kbd>Ctrl+W</kbd>
          </button>
          <button
            type="button"
            className="ml-context-item"
            disabled={tabs.length <= 1}
            onClick={() => {
              const id = contextTab.id;
              setTabMenu(null);
              onCloseOtherTabs(id);
            }}
          >
            <span>关闭其他页签</span>
          </button>
          <button
            type="button"
            className="ml-context-item"
            disabled={contextTabIdx < 0 || contextTabIdx >= tabs.length - 1}
            onClick={() => {
              const id = contextTab.id;
              setTabMenu(null);
              onCloseTabsToRight(id);
            }}
          >
            <span>关闭右侧页签</span>
          </button>
          {contextTab.filePath && (
            <>
              <div className="ml-menu-sep" />
              <button
                type="button"
                className="ml-context-item"
                onClick={() => {
                  const p = contextTab.filePath!;
                  setTabMenu(null);
                  onCopyPath(p);
                }}
              >
                <span>复制文件完整路径</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 关于 MarkLeaf 弹窗 */}
      {aboutOpen && (
        <div className="ml-modal-backdrop" onMouseDown={() => setAboutOpen(false)}>
          <div className="ml-modal ml-about-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ml-modal-header">
              <h3>关于 MarkLeaf</h3>
              <button type="button" className="ml-icon-btn" onClick={() => setAboutOpen(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="ml-modal-body ml-about-body">
              <img src={appIcon} width={56} height={56} alt="MarkLeaf" className="ml-about-logo" />
              <div>
                <h4>MarkLeaf v{appVersion}</h4>
                <p className="ml-about-desc">
                  极速、优雅、零格式破坏的桌面 Markdown 阅读与编辑工作台。
                </p>
                <p className="ml-about-meta">
                  内核：Tauri v2 · Rust <code>comrak</code> (CommonMark / GFM) · <code>encoding_rs</code> 多编码无损引擎
                </p>
              </div>
            </div>
            <div className="ml-modal-footer">
              <button type="button" className="ml-btn ml-btn-primary" onClick={() => setAboutOpen(false)}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
