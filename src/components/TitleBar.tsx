import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
} from '@tauri-apps/api/window';
import appIcon from '../../src-tauri/icons/32x32.png';
import aboutIcon from '../../src-tauri/icons/128x128.png';
import { isTauriRuntime } from '../api';
import Icon from '../ui/Icon';

type WindowEdge = 'left' | 'right' | 'top' | 'bottom';

const EDGE_FILL_THRESHOLD = 12;
const DRAG_RESTORE_THRESHOLD = 4;

function isTitlebarDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (!target.closest('[data-tauri-drag-region]')) return false;
  return !target.closest(
    'button, a, input, select, textarea, label, [role="tab"], .ml-tab, .ml-window-controls, .ml-title-app-btn',
  );
}

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
  onOpenFileDir: (path: string) => void;
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
  onOpenFileDir,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const [appMenuPos, setAppMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // 单向铺满前的原始窗口范围；用户拖拽/缩放窗口时用它恢复原尺寸。
  const singleFillRef = useRef<{ size: PhysicalSize; position: PhysicalPosition } | null>(null);
  const fillTargetRef = useRef<{ size: PhysicalSize; position: PhysicalPosition } | null>(null);
  const applyingFillRef = useRef(false);
  const fillTimerRef = useRef<number | null>(null);

  const scheduleFillSettle = useCallback(() => {
    applyingFillRef.current = true;
    if (fillTimerRef.current !== null) window.clearTimeout(fillTimerRef.current);
    fillTimerRef.current = window.setTimeout(() => {
      applyingFillRef.current = false;
      fillTimerRef.current = null;
    }, 500);
  }, []);

  const fillWindowFromEdge = useCallback(
    async (edge: WindowEdge) => {
      const win = getCurrentWindow();
      if (await win.isMaximized()) await win.unmaximize();
      const monitor = await currentMonitor();
      if (!monitor) return;
      const size = await win.innerSize();
      const position = await win.outerPosition();
      if (!singleFillRef.current) {
        singleFillRef.current = { size, position };
      }

      const workArea = monitor.workArea;
      let targetSize: PhysicalSize;
      let targetPosition: PhysicalPosition;
      if (edge === 'left' || edge === 'right') {
        targetSize = new PhysicalSize(workArea.size.width, size.height);
        targetPosition = new PhysicalPosition(workArea.position.x, position.y);
      } else {
        targetSize = new PhysicalSize(size.width, workArea.size.height);
        targetPosition = new PhysicalPosition(position.x, workArea.position.y);
      }
      fillTargetRef.current = { size: targetSize, position: targetPosition };
      scheduleFillSettle();
      await win.setSize(targetSize);
      await win.setPosition(targetPosition);
    },
    [scheduleFillSettle],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized).catch(() => {});
    void win
      .onResized(() => {
        void win
          .isMaximized()
          .then((isMaximized) => {
            setMaximized(isMaximized);
            if (isMaximized) {
              singleFillRef.current = null;
              fillTargetRef.current = null;
            }
          })
          .catch(() => {});
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 参考 Windows：铺满后继续拖动窗口时恢复原尺寸；手动缩放则直接解除铺满状态。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    let unlistenMoved: (() => void) | undefined;
    let unlistenResized: (() => void) | undefined;

    void win
      .onMoved(({ payload: position }) => {
        if (applyingFillRef.current) {
          const target = fillTargetRef.current;
          if (
            target &&
            Math.abs(position.x - target.position.x) <= 2 &&
            Math.abs(position.y - target.position.y) <= 2
          ) {
            return;
          }
        }
        const saved = singleFillRef.current;
        if (!saved) return;
        singleFillRef.current = null;
        fillTargetRef.current = null;
        scheduleFillSettle();
        void win
          .setSize(saved.size)
          .then(() => win.setPosition(position))
          .catch(() => {})
          .finally(() => {
            applyingFillRef.current = false;
          });
      })
      .then((fn) => {
        unlistenMoved = fn;
      })
      .catch(() => {});

    void win
      .onResized(({ payload: size }) => {
        if (applyingFillRef.current) {
          const target = fillTargetRef.current;
          if (
            target &&
            Math.abs(size.width - target.size.width) <= 2 &&
            Math.abs(size.height - target.size.height) <= 2
          ) {
            return;
          }
        }
        singleFillRef.current = null;
        fillTargetRef.current = null;
      })
      .then((fn) => {
        unlistenResized = fn;
      })
      .catch(() => {});

    return () => {
      if (unlistenMoved) unlistenMoved();
      if (unlistenResized) unlistenResized();
      if (fillTimerRef.current !== null) {
        window.clearTimeout(fillTimerRef.current);
        fillTimerRef.current = null;
      }
    };
  }, [scheduleFillSettle]);

  // 参考 Windows：铺满后从标题栏开始拖动时，先恢复原尺寸，再进入原生窗口拖动。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let pendingCleanup: (() => void) | null = null;

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail !== 1) return;
      if (!singleFillRef.current || !isTitlebarDragTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      const startX = event.screenX;
      const startY = event.screenY;
      let settled = false;

      const cleanup = () => {
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        pendingCleanup = null;
      };

      const restoreAndDrag = (moveEvent: MouseEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        const saved = singleFillRef.current;
        singleFillRef.current = null;
        fillTargetRef.current = null;
        void (async () => {
          const win = getCurrentWindow();
          try {
            if (saved) {
              const [currentPosition, currentSize] = await Promise.all([
                win.outerPosition(),
                win.innerSize(),
              ]);
              const relX =
                currentSize.width > 0
                  ? (moveEvent.screenX - currentPosition.x) / currentSize.width
                  : 0.5;
              const relY =
                currentSize.height > 0
                  ? (moveEvent.screenY - currentPosition.y) / currentSize.height
                  : 0.5;
              await win.setSize(saved.size);
              await win.setPosition(
                new PhysicalPosition(
                  Math.round(moveEvent.screenX - relX * saved.size.width),
                  Math.round(moveEvent.screenY - relY * saved.size.height),
                ),
              );
            }
            await win.startDragging();
          } catch {
            // 恢复失败时保持当前窗口，不影响后续操作。
          }
        })();
      };

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (
          Math.hypot(moveEvent.screenX - startX, moveEvent.screenY - startY) <
          DRAG_RESTORE_THRESHOLD
        ) {
          return;
        }
        restoreAndDrag(moveEvent);
      };
      const onMouseUp = () => {
        settled = true;
        cleanup();
      };

      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mouseup', onMouseUp, true);
      pendingCleanup = () => {
        settled = true;
        cleanup();
      };
    };

    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true);
      if (pendingCleanup) pendingCleanup();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const onEdgeDoubleClick = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const edges: Array<{ edge: WindowEdge; distance: number }> = [
        { edge: 'left', distance: event.clientX },
        { edge: 'right', distance: window.innerWidth - event.clientX },
        { edge: 'top', distance: event.clientY },
        { edge: 'bottom', distance: window.innerHeight - event.clientY },
      ];
      edges.sort((a, b) => a.distance - b.distance);
      const closest = edges[0];
      if (!closest || closest.distance > EDGE_FILL_THRESHOLD) return;
      event.preventDefault();
      event.stopPropagation();
      void fillWindowFromEdge(closest.edge).catch(() => {});
    };
    window.addEventListener('dblclick', onEdgeDoubleClick, true);
    return () => window.removeEventListener('dblclick', onEdgeDoubleClick, true);
  }, [fillWindowFromEdge]);

  // Windows 原生 resize 边框会吞掉最外层双击，由 Rust 侧窗口子类化转发此事件。
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    void listen<string>('window-edge-fill', (event) => {
      const edge = event.payload;
      if (edge === 'left' || edge === 'right' || edge === 'top' || edge === 'bottom') {
        void fillWindowFromEdge(edge).catch(() => {});
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, [fillWindowFromEdge]);

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
    singleFillRef.current = null;
    fillTargetRef.current = null;
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
            setAppMenuPos({ x: 0, y: rect.bottom });
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
                  onOpenFileDir(p);
                }}
              >
                <span>打开文件所在目录</span>
              </button>
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
              <img src={aboutIcon} width={64} height={64} alt="MarkLeaf" className="ml-about-logo" />
              <div className="ml-about-info">
                <h4 className="ml-about-name">MarkLeaf</h4>
                <p className="ml-about-version">版本 {appVersion} · 作者 @zouv</p>
                <p className="ml-about-desc">
                  极速、优雅、零格式破坏的桌面 Markdown 工作台。
                  <br />
                  内核：Tauri v2 · Rust <code>comrak</code> · <code>encoding_rs</code> 多编码引擎
                </p>
              </div>
            </div>
            <div className="ml-modal-footer ml-about-footer">
              <button type="button" className="ml-btn ml-btn-primary" onClick={() => setAboutOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
