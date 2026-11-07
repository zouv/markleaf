import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  FONT_PRESET_MAP,
  PAGE_WIDTH_MAP,
  THEME_OPTIONS,
  type AppSettings,
  type EndOfLinePolicy,
  type FontFamilyPreset,
  type LineNumbersMode,
  type PageWidthMode,
  type TrailingNewlinePolicy,
  type ViewMode,
} from '../settings';
import Icon from '../ui/Icon';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onSave: (next: AppSettings) => void;
  onClose: () => void;
}

type CategoryId = 'appearance' | 'rendering' | 'editor' | 'files' | 'shortcuts';

const CATEGORIES: ReadonlyArray<{ id: CategoryId; label: string; desc: string }> = [
  { id: 'appearance', label: '外观与主题', desc: '配色方案、亮暗跟随与界面缩放' },
  { id: 'rendering', label: '排版与阅读区', desc: '行宽模式、正文字体、字号与代码块样式' },
  { id: 'editor', label: '编辑器与辅助', desc: '行号水槽、自动配对、打字机与专注模式' },
  { id: 'files', label: '文件与大纲', desc: '自动保存、换行符规范与侧栏大纲行为' },
  { id: 'shortcuts', label: '快捷键速查', desc: '全局键盘快捷键一览' },
];

export default function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const [category, setCategory] = useState<CategoryId>('appearance');
  const [draft, setDraft] = useState<AppSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    // 实时预览变更并持久化
    onSave(next);
  };

  const handleResetDefaults = () => {
    setDraft({ ...DEFAULT_SETTINGS });
    onSave({ ...DEFAULT_SETTINGS });
  };

  return (
    <div className="ml-modal-backdrop" onMouseDown={onClose}>
      <div
        className="ml-modal ml-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="偏好设置"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ml-modal-header">
          <div className="ml-modal-title-group">
            <Icon name="settings" size={16} />
            <h3>偏好设置 (Preferences)</h3>
          </div>
          <button type="button" className="ml-icon-btn" onClick={onClose} title="关闭 (Esc)">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="ml-settings-layout">
          {/* 左侧分类导航 */}
          <nav className="ml-settings-nav" aria-label="设置分类">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ml-settings-cat ${category === item.id ? 'is-active' : ''}`}
                aria-current={category === item.id ? 'page' : undefined}
                onClick={() => setCategory(item.id)}
              >
                <span className="ml-settings-cat-title">{item.label}</span>
                <span className="ml-settings-cat-desc">{item.desc}</span>
              </button>
            ))}
          </nav>

          {/* 右侧配置面板 */}
          <section className="ml-settings-panel">
            {category === 'appearance' && (
              <>
                <div className="ml-settings-section">
                  <h4>主题配色 (Theme Gallery)</h4>
                  <p className="ml-settings-note">
                    精选 8 款印刷级亮色与暗色主题（融合 MarkLeaf 原创与 MarkText 经典主题）。点击即可实时切换：
                  </p>
                  <div className="ml-theme-grid">
                    {THEME_OPTIONS.map((t) => {
                      const active = draft.theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={`ml-theme-card ${active ? 'is-selected' : ''}`}
                          onClick={() => update('theme', t.id)}
                        >
                          <div
                            className="ml-theme-swatch"
                            style={{ background: t.previewBg, borderColor: t.previewAccent }}
                          >
                            <div className="ml-theme-swatch-surface" style={{ background: t.previewSurface }}>
                              <span
                                className="ml-theme-swatch-bar"
                                style={{ background: t.previewAccent }}
                              />
                              <span className="ml-theme-swatch-line" />
                            </div>
                          </div>
                          <div className="ml-theme-card-info">
                            <div className="ml-theme-card-name">
                              <span>{t.label}</span>
                              {active && <Icon name="check" size={13} />}
                            </div>
                            <span className="ml-theme-card-desc">{t.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ml-settings-section">
                  <h4>系统亮暗跟随与窗口显示</h4>
                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">跟随操作系统亮/暗模式自动切换</div>
                      <div className="ml-settings-note">开启后根据系统浅色/深色状态自动应用对应首选主题</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.followSystemTheme}
                      onChange={(e) => update('followSystemTheme', e.target.checked)}
                    />
                  </label>

                  {draft.followSystemTheme && (
                    <>
                      <div className="ml-setting-row">
                        <span className="ml-setting-label">浅色模式首选主题</span>
                        <select
                          value={draft.lightTheme}
                          onChange={(e) => update('lightTheme', e.target.value as AppSettings['lightTheme'])}
                        >
                          {THEME_OPTIONS.filter((t) => t.group === 'light').map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="ml-setting-row">
                        <span className="ml-setting-label">深色模式首选主题</span>
                        <select
                          value={draft.darkTheme}
                          onChange={(e) => update('darkTheme', e.target.value as AppSettings['darkTheme'])}
                        >
                          {THEME_OPTIONS.filter((t) => t.group === 'dark').map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">界面整体缩放比例 ({draft.uiZoom}%)</div>
                      <div className="ml-settings-note">适配高分屏或远距离阅读（85% ~ 130%）</div>
                    </div>
                    <div className="ml-range-control">
                      <input
                        type="range"
                        min={85}
                        max={130}
                        step={5}
                        value={draft.uiZoom}
                        onChange={(e) => update('uiZoom', Number(e.target.value))}
                      />
                      <span className="ml-range-val">{draft.uiZoom}%</span>
                    </div>
                  </div>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">隐藏滚动条 (沉浸式书页视图)</div>
                      <div className="ml-settings-note">保留滚轮与触控板滚动，隐藏视觉滚动条轨道</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.hideScrollbar}
                      onChange={(e) => update('hideScrollbar', e.target.checked)}
                    />
                  </label>
                </div>
              </>
            )}

            {category === 'rendering' && (
              <>
                <div className="ml-settings-section">
                  <h4>文档版心宽度与字体排版</h4>
                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">文档渲染与编辑区行宽模式</div>
                      <div className="ml-settings-note">支持固定舒适阅读最大行宽，或 100% 自适应铺满窗口宽度</div>
                    </div>
                    <select
                      value={draft.pageWidthMode}
                      onChange={(e) => update('pageWidthMode', e.target.value as PageWidthMode)}
                    >
                      {(Object.keys(PAGE_WIDTH_MAP) as PageWidthMode[]).map((k) => (
                        <option key={k} value={k}>
                          {PAGE_WIDTH_MAP[k].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">阅读区正文字体族</div>
                      <div className="ml-settings-note">在现代无衬线体与人文衬线书宋体间切换</div>
                    </div>
                    <select
                      value={draft.proseFontFamily}
                      onChange={(e) => update('proseFontFamily', e.target.value as FontFamilyPreset)}
                    >
                      {(Object.keys(FONT_PRESET_MAP) as FontFamilyPreset[]).map((k) => (
                        <option key={k} value={k}>
                          {FONT_PRESET_MAP[k].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="ml-setting-row">
                    <span className="ml-setting-label">阅读区正文字号 ({draft.proseFontSize}px)</span>
                    <div className="ml-range-control">
                      <input
                        type="range"
                        min={13}
                        max={24}
                        step={1}
                        value={draft.proseFontSize}
                        onChange={(e) => update('proseFontSize', Number(e.target.value))}
                      />
                      <span className="ml-range-val">{draft.proseFontSize}px</span>
                    </div>
                  </div>

                  <div className="ml-setting-row">
                    <span className="ml-setting-label">阅读区正文行高 ({draft.proseLineHeight.toFixed(2)})</span>
                    <div className="ml-range-control">
                      <input
                        type="range"
                        min={1.4}
                        max={2.1}
                        step={0.05}
                        value={draft.proseLineHeight}
                        onChange={(e) => update('proseLineHeight', Number(e.target.value))}
                      />
                      <span className="ml-range-val">{draft.proseLineHeight.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="ml-settings-section">
                  <h4>代码块与段落辅助显示</h4>
                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">代码块显示行号 (Code Block Line Numbers)</div>
                      <div className="ml-settings-note">在渲染态围栏代码块左侧显示逐行行号</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.codeBlockLineNumbers}
                      onChange={(e) => update('codeBlockLineNumbers', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">代码块自动折行 (Wrap Code Blocks)</div>
                      <div className="ml-settings-note">开启后超长代码行自动换行，不再出现横向滚动条</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.wrapCodeBlocks}
                      onChange={(e) => update('wrapCodeBlocks', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">鼠标悬停段落显示源码行号角标 (L1, L2…)</div>
                      <div className="ml-settings-note">提示双击该段落将跳转到编辑器的具体行号</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.showBlockLineBadge}
                      onChange={(e) => update('showBlockLineBadge', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">标题悬停显示 # 锚点复制按钮</div>
                      <div className="ml-settings-note">点击标题右侧 # 即可一键复制该小节锚点链接</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.showHeadingAnchor}
                      onChange={(e) => update('showHeadingAnchor', e.target.checked)}
                    />
                  </label>
                </div>
              </>
            )}

            {category === 'editor' && (
              <>
                <div className="ml-settings-section">
                  <h4>源码编辑器显示与排版</h4>
                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">编辑器行号显示模式</div>
                      <div className="ml-settings-note">
                        支持完整行号、MarkText 经典稀疏行号（仅显示第 1 行与每 10 行）或隐藏行号
                      </div>
                    </div>
                    <select
                      value={draft.editorLineNumbers}
                      onChange={(e) => update('editorLineNumbers', e.target.value as LineNumbersMode)}
                    >
                      <option value="full">完整行号 (1, 2, 3…)</option>
                      <option value="sparse">稀疏书页行号 (1, 10, 20… · MarkText 风格)</option>
                      <option value="off">隐藏行号</option>
                    </select>
                  </div>

                  <div className="ml-setting-row">
                    <span className="ml-setting-label">编辑器等宽字号 ({draft.editorFontSize}px)</span>
                    <div className="ml-range-control">
                      <input
                        type="range"
                        min={12}
                        max={22}
                        step={1}
                        value={draft.editorFontSize}
                        onChange={(e) => update('editorFontSize', Number(e.target.value))}
                      />
                      <span className="ml-range-val">{draft.editorFontSize}px</span>
                    </div>
                  </div>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">编辑器超长行自动折行 (Word Wrap)</div>
                      <div className="ml-settings-note">关闭后超长行将保持单行并允许横向滚动</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.editorWordWrap}
                      onChange={(e) => update('editorWordWrap', e.target.checked)}
                    />
                  </label>

                  <div className="ml-setting-row">
                    <span className="ml-setting-label">Tab 键缩进空格数</span>
                    <select
                      value={draft.tabSize}
                      onChange={(e) => update('tabSize', Number(e.target.value) === 4 ? 4 : 2)}
                    >
                      <option value={2}>2 个空格</option>
                      <option value={4}>4 个空格</option>
                    </select>
                  </div>
                </div>

                <div className="ml-settings-section">
                  <h4>智能书写辅助与专注模式 (源自 MarkText)</h4>
                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">打字机模式 (Typewriter Scrolling Mode)</div>
                      <div className="ml-settings-note">输入或移动光标时，自动将当前编辑行平滑保持在视口纵向居中位置</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.typewriterMode}
                      onChange={(e) => update('typewriterMode', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">专注模式 (Focus Mode)</div>
                      <div className="ml-settings-note">阅读与分屏下突出高亮当前活跃段落，柔和淡化周围非焦点段落</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.focusMode}
                      onChange={(e) => update('focusMode', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">自动配对括号 (), [], {}</div>
                      <div className="ml-settings-note">输入左括号时自动补全右括号（选中文本时自动包裹）</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.autoPairBracket}
                      onChange={(e) => update('autoPairBracket', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">自动配对引号 "" 与 ''</div>
                      <div className="ml-settings-note">输入单双引号时自动成对补全</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.autoPairQuote}
                      onChange={(e) => update('autoPairQuote', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">自动配对 Markdown 语法符号 (*, `, =, ~)</div>
                      <div className="ml-settings-note">选中文字后按 * / ` / = 直接将选中文本包裹为粗斜体、代码或高亮</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.autoPairMarkdown}
                      onChange={(e) => update('autoPairMarkdown', e.target.checked)}
                    />
                  </label>
                </div>
              </>
            )}

            {category === 'files' && (
              <>
                <div className="ml-settings-section">
                  <h4>文件打开与保存策略</h4>
                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">新打开文档默认视图模式</div>
                      <div className="ml-settings-note">双击 .md 文件启动或新建页签时的初始视图</div>
                    </div>
                    <select
                      value={draft.defaultViewMode}
                      onChange={(e) => update('defaultViewMode', e.target.value as ViewMode)}
                    >
                      <option value="read">阅读视图 (极速零干扰 · 推荐)</option>
                      <option value="split">分屏同步预览视图</option>
                      <option value="edit">纯源码编辑视图</option>
                    </select>
                  </div>

                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">自动保存已落盘文档 (Auto Save)</div>
                      <div className="ml-settings-note">修改已有磁盘路径的文档后，按设定延迟自动以原编码写回磁盘</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.autoSave}
                      onChange={(e) => update('autoSave', e.target.checked)}
                    />
                  </label>

                  {draft.autoSave && (
                    <div className="ml-setting-row">
                      <span className="ml-setting-label">自动保存延迟 ({draft.autoSaveDelay} ms)</span>
                      <div className="ml-range-control">
                        <input
                          type="range"
                          min={1000}
                          max={10000}
                          step={500}
                          value={draft.autoSaveDelay}
                          onChange={(e) => update('autoSaveDelay', Number(e.target.value))}
                        />
                        <span className="ml-range-val">{(draft.autoSaveDelay / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  )}

                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">保存时文件末尾换行处理 (Trim Trailing Newline)</div>
                      <div className="ml-settings-note">移植自 MarkText：默认 100% 保留原文件风格</div>
                    </div>
                    <select
                      value={draft.trailingNewline}
                      onChange={(e) => update('trailingNewline', e.target.value as TrailingNewlinePolicy)}
                    >
                      <option value="preserve">保留原文件尾部风格 (推荐 · 零格式破坏)</option>
                      <option value="single">确保文件末尾恰好保留一个换行符</option>
                      <option value="trim">移除文件末尾所有多余空行</option>
                    </select>
                  </div>

                  <div className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">保存时换行符格式 (End of Line)</div>
                      <div className="ml-settings-note">默认保持文档原有 CRLF / LF 不变</div>
                    </div>
                    <select
                      value={draft.endOfLine}
                      onChange={(e) => update('endOfLine', e.target.value as EndOfLinePolicy)}
                    >
                      <option value="preserve">保持原文档换行符 (Preserve)</option>
                      <option value="lf">统一使用 LF (\n)</option>
                      <option value="crlf">统一使用 CRLF (\r\n)</option>
                    </select>
                  </div>
                </div>

                <div className="ml-settings-section">
                  <h4>侧栏与大纲 (TOC)</h4>
                  <label className="ml-setting-row">
                    <div>
                      <div className="ml-setting-label">大纲目录长标题自动折行 (Word Wrap in TOC)</div>
                      <div className="ml-settings-note">开启后右侧大纲中的长标题完整多行展示，不再省略号截断</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={draft.wordWrapInToc}
                      onChange={(e) => update('wordWrapInToc', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <span className="ml-setting-label">启动时默认展开左侧同目录文件树</span>
                    <input
                      type="checkbox"
                      checked={draft.defaultLeftSidebar}
                      onChange={(e) => update('defaultLeftSidebar', e.target.checked)}
                    />
                  </label>

                  <label className="ml-setting-row">
                    <span className="ml-setting-label">启动时默认展开右侧文档大纲 (TOC)</span>
                    <input
                      type="checkbox"
                      checked={draft.defaultRightSidebar}
                      onChange={(e) => update('defaultRightSidebar', e.target.checked)}
                    />
                  </label>
                </div>
              </>
            )}

            {category === 'shortcuts' && (
              <div className="ml-settings-section">
                <h4>键盘快捷键一览</h4>
                <div className="ml-shortcut-list">
                  <div className="ml-shortcut-item">
                    <span>新建 Markdown 草稿页签</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>N</kbd> / <kbd>Ctrl</kbd> + <kbd>T</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>打开本地 Markdown 文件</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>O</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>保存当前页签文档</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>S</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>另存为新文件</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>关闭当前页签</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>W</kbd> / 鼠标中键点击页签
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>切换上 / 下一个页签</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>Tab</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>在「阅读 / 分屏 / 编辑」间快速切换</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>E</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>双击阅读区任意段落跳入对应源码行</span>
                    <div>
                      <kbd>鼠标左键双击段落</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>文档内查找关键字</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>F</kbd>
                    </div>
                  </div>
                  <div className="ml-shortcut-item">
                    <span>打开偏好设置弹窗</span>
                    <div>
                      <kbd>Ctrl</kbd> + <kbd>,</kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="ml-modal-footer">
          <button type="button" className="ml-btn" onClick={handleResetDefaults}>
            恢复默认设置
          </button>
          <button type="button" className="ml-btn ml-btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
