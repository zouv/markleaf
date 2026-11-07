export type ThemeId =
  | 'paper'
  | 'github'
  | 'sepia'
  | 'solarized-light'
  | 'night'
  | 'one-dark'
  | 'nord'
  | 'catppuccin-mocha';

export type ViewMode = 'read' | 'split' | 'edit';

export type PageWidthMode = 'compact' | 'comfortable' | 'wide' | 'xwide' | 'full';

export type FontFamilyPreset = 'sans' | 'serif' | 'system';

export type LineNumbersMode = 'off' | 'full' | 'sparse';

export type TrailingNewlinePolicy = 'preserve' | 'single' | 'trim';

export type EndOfLinePolicy = 'preserve' | 'lf' | 'crlf';

export type StatsUnit = 'words' | 'chars' | 'charsWithSpaces' | 'paragraphs';

export interface AppSettings {
  // 外观与主题
  theme: ThemeId;
  followSystemTheme: boolean;
  lightTheme: ThemeId;
  darkTheme: ThemeId;
  uiZoom: number; // 85..130 (%)
  hideScrollbar: boolean;

  // 文档渲染区
  pageWidthMode: PageWidthMode;
  proseFontFamily: FontFamilyPreset;
  proseFontSize: number; // 13..24 (px)
  proseLineHeight: number; // 1.4..2.1
  showBlockLineBadge: boolean; // 悬停显示源码行号 Lx
  showHeadingAnchor: boolean; // 标题悬停显示 # 锚点复制
  codeBlockLineNumbers: boolean; // 代码块内显示行号
  wrapCodeBlocks: boolean; // 代码块内自动折行

  // 编辑器区
  editorLineNumbers: LineNumbersMode; // 关闭 | 完整行号 | MarkText 稀疏行号(1,10,20...)
  editorFontSize: number; // 12..22 (px)
  editorLineHeight: number; // 1.4..2.0
  editorWordWrap: boolean;
  tabSize: 2 | 4;
  autoPairBracket: boolean; // 自动补全 () [] {}
  autoPairQuote: boolean; // 自动补全 "" ''
  autoPairMarkdown: boolean; // 自动补全 ** == `
  typewriterMode: boolean; // 打字机模式（光标行保持视口黄金居中）
  focusMode: boolean; // 专注模式（仅高亮当前活跃段落）

  // 文件、侧栏与行为
  defaultViewMode: ViewMode;
  autoSave: boolean;
  autoSaveDelay: number; // 1000..10000 ms
  trailingNewline: TrailingNewlinePolicy;
  endOfLine: EndOfLinePolicy;
  wordWrapInToc: boolean;
  defaultLeftSidebar: boolean;
  defaultRightSidebar: boolean;
  statsUnit: StatsUnit;
}

export const SETTINGS_STORAGE_KEY = 'markleaf.settings.v2';

export const THEME_OPTIONS: ReadonlyArray<{
  id: ThemeId;
  label: string;
  group: 'light' | 'dark';
  previewBg: string;
  previewSurface: string;
  previewAccent: string;
  desc: string;
}> = [
  {
    id: 'paper',
    label: 'Paper · 书页暖白',
    group: 'light',
    previewBg: '#f6f4ef',
    previewSurface: '#fbfaf7',
    previewAccent: '#1a7f5a',
    desc: '微暖纸张底色配翠绿点缀，长文沉浸阅读首选',
  },
  {
    id: 'github',
    label: 'GitHub · 清爽浅色',
    group: 'light',
    previewBg: '#f6f8fa',
    previewSurface: '#ffffff',
    previewAccent: '#0969da',
    desc: '经典开源文档规范配色，高对比清晰干练',
  },
  {
    id: 'sepia',
    label: 'Sepia · 羊皮纸护眼',
    group: 'light',
    previewBg: '#efe6d5',
    previewSurface: '#f7f0e2',
    previewAccent: '#9c5221',
    desc: '复古暖棕羊皮纸质感，大幅降低蓝光刺激',
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light · 暖阳浅色',
    group: 'light',
    previewBg: '#eee8d5',
    previewSurface: '#fdf6e3',
    previewAccent: '#268bd2',
    desc: '源自 MarkText 经典主题，精密调校的光学对比度',
  },
  {
    id: 'night',
    label: 'Night · 极光暗夜',
    group: 'dark',
    previewBg: '#0f1115',
    previewSurface: '#181c23',
    previewAccent: '#34d399',
    desc: '深邃石墨黑配极光绿，夜间阅读与编码不刺眼',
  },
  {
    id: 'one-dark',
    label: 'One Dark · 经典暗色',
    group: 'dark',
    previewBg: '#1e222a',
    previewSurface: '#282c34',
    previewAccent: '#61afef',
    desc: '源自 MarkText / Atom 的标志性柔和暗色主题',
  },
  {
    id: 'nord',
    label: 'Nord · 极地冰蓝',
    group: 'dark',
    previewBg: '#242933',
    previewSurface: '#2e3440',
    previewAccent: '#88c0d0',
    desc: '北极冷调灰蓝配色，冷静克制的阅读氛围',
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin · 摩卡丝绒',
    group: 'dark',
    previewBg: '#181825',
    previewSurface: '#1e1e2e',
    previewAccent: '#cba6f7',
    desc: '柔和粉紫丝绒暗色，现代开发者高人气配色',
  },
];

export const PAGE_WIDTH_MAP: Record<PageWidthMode, { label: string; cssMaxWidth: string }> = {
  compact: { label: '紧凑书页 (720px)', cssMaxWidth: '720px' },
  comfortable: { label: '标准阅读 (840px · 推荐)', cssMaxWidth: '840px' },
  wide: { label: '宽屏文档 (980px)', cssMaxWidth: '980px' },
  xwide: { label: '超宽工作台 (1160px)', cssMaxWidth: '1160px' },
  full: { label: '自适应全宽 (100% 铺满)', cssMaxWidth: '100%' },
};

export const FONT_PRESET_MAP: Record<FontFamilyPreset, { label: string; cssValue: string }> = {
  sans: {
    label: '现代无衬线 (Inter / 苹方 / 鸿蒙黑体 / 微软雅黑)',
    cssValue:
      "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
  },
  serif: {
    label: '人文衬线书宋 (Georgia / 思源宋体 / 宋体)',
    cssValue:
      "'Georgia', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif",
  },
  system: {
    label: '系统原生界面字体 (Segoe UI / system-ui)',
    cssValue: "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'paper',
  followSystemTheme: false,
  lightTheme: 'paper',
  darkTheme: 'night',
  uiZoom: 100,
  hideScrollbar: false,

  pageWidthMode: 'comfortable',
  proseFontFamily: 'sans',
  proseFontSize: 16,
  proseLineHeight: 1.75,
  showBlockLineBadge: true,
  showHeadingAnchor: true,
  codeBlockLineNumbers: true,
  wrapCodeBlocks: false,

  editorLineNumbers: 'full',
  editorFontSize: 14,
  editorLineHeight: 1.65,
  editorWordWrap: true,
  tabSize: 2,
  autoPairBracket: true,
  autoPairQuote: true,
  autoPairMarkdown: true,
  typewriterMode: false,
  focusMode: false,

  defaultViewMode: 'read',
  autoSave: false,
  autoSaveDelay: 3000,
  trailingNewline: 'preserve',
  endOfLine: 'preserve',
  wordWrapInToc: false,
  defaultLeftSidebar: true,
  defaultRightSidebar: true,
  statsUnit: 'words',
};

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function oneOf<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  return typeof val === 'string' && (allowed as readonly string[]).includes(val) ? (val as T) : fallback;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const themeIds = THEME_OPTIONS.map((t) => t.id);
    return {
      theme: oneOf(parsed.theme, themeIds, DEFAULT_SETTINGS.theme),
      followSystemTheme: Boolean(parsed.followSystemTheme ?? DEFAULT_SETTINGS.followSystemTheme),
      lightTheme: oneOf(parsed.lightTheme, themeIds, DEFAULT_SETTINGS.lightTheme),
      darkTheme: oneOf(parsed.darkTheme, themeIds, DEFAULT_SETTINGS.darkTheme),
      uiZoom: clampNumber(parsed.uiZoom, 85, 130, DEFAULT_SETTINGS.uiZoom),
      hideScrollbar: Boolean(parsed.hideScrollbar ?? DEFAULT_SETTINGS.hideScrollbar),

      pageWidthMode: oneOf(
        parsed.pageWidthMode,
        ['compact', 'comfortable', 'wide', 'xwide', 'full'],
        DEFAULT_SETTINGS.pageWidthMode,
      ),
      proseFontFamily: oneOf(
        parsed.proseFontFamily,
        ['sans', 'serif', 'system'],
        DEFAULT_SETTINGS.proseFontFamily,
      ),
      proseFontSize: clampNumber(parsed.proseFontSize, 13, 24, DEFAULT_SETTINGS.proseFontSize),
      proseLineHeight: clampNumber(parsed.proseLineHeight, 1.4, 2.1, DEFAULT_SETTINGS.proseLineHeight),
      showBlockLineBadge: Boolean(parsed.showBlockLineBadge ?? DEFAULT_SETTINGS.showBlockLineBadge),
      showHeadingAnchor: Boolean(parsed.showHeadingAnchor ?? DEFAULT_SETTINGS.showHeadingAnchor),
      codeBlockLineNumbers: Boolean(parsed.codeBlockLineNumbers ?? DEFAULT_SETTINGS.codeBlockLineNumbers),
      wrapCodeBlocks: Boolean(parsed.wrapCodeBlocks ?? DEFAULT_SETTINGS.wrapCodeBlocks),

      editorLineNumbers: oneOf(
        parsed.editorLineNumbers,
        ['off', 'full', 'sparse'],
        DEFAULT_SETTINGS.editorLineNumbers,
      ),
      editorFontSize: clampNumber(parsed.editorFontSize, 12, 22, DEFAULT_SETTINGS.editorFontSize),
      editorLineHeight: clampNumber(parsed.editorLineHeight, 1.4, 2.0, DEFAULT_SETTINGS.editorLineHeight),
      editorWordWrap: Boolean(parsed.editorWordWrap ?? DEFAULT_SETTINGS.editorWordWrap),
      tabSize: parsed.tabSize === 4 ? 4 : 2,
      autoPairBracket: Boolean(parsed.autoPairBracket ?? DEFAULT_SETTINGS.autoPairBracket),
      autoPairQuote: Boolean(parsed.autoPairQuote ?? DEFAULT_SETTINGS.autoPairQuote),
      autoPairMarkdown: Boolean(parsed.autoPairMarkdown ?? DEFAULT_SETTINGS.autoPairMarkdown),
      typewriterMode: Boolean(parsed.typewriterMode ?? DEFAULT_SETTINGS.typewriterMode),
      focusMode: Boolean(parsed.focusMode ?? DEFAULT_SETTINGS.focusMode),

      defaultViewMode: oneOf(parsed.defaultViewMode, ['read', 'split', 'edit'], DEFAULT_SETTINGS.defaultViewMode),
      autoSave: Boolean(parsed.autoSave ?? DEFAULT_SETTINGS.autoSave),
      autoSaveDelay: clampNumber(parsed.autoSaveDelay, 1000, 10000, DEFAULT_SETTINGS.autoSaveDelay),
      trailingNewline: oneOf(
        parsed.trailingNewline,
        ['preserve', 'single', 'trim'],
        DEFAULT_SETTINGS.trailingNewline,
      ),
      endOfLine: oneOf(parsed.endOfLine, ['preserve', 'lf', 'crlf'], DEFAULT_SETTINGS.endOfLine),
      wordWrapInToc: Boolean(parsed.wordWrapInToc ?? DEFAULT_SETTINGS.wordWrapInToc),
      defaultLeftSidebar: Boolean(parsed.defaultLeftSidebar ?? DEFAULT_SETTINGS.defaultLeftSidebar),
      defaultRightSidebar: Boolean(parsed.defaultRightSidebar ?? DEFAULT_SETTINGS.defaultRightSidebar),
      statsUnit: oneOf(
        parsed.statsUnit,
        ['words', 'chars', 'charsWithSpaces', 'paragraphs'],
        DEFAULT_SETTINGS.statsUnit,
      ),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

/** 根据用户配置的尾部换行策略与换行符策略规范化即将保存的文本 */
export function normalizeContentForSave(
  content: string,
  trailingPolicy: TrailingNewlinePolicy,
  eolPolicy: EndOfLinePolicy,
): string {
  let out = content;
  if (trailingPolicy === 'trim') {
    out = out.replace(/(?:\r?\n)+$/, '');
  } else if (trailingPolicy === 'single') {
    const hasCrlf = out.includes('\r\n');
    const newline = eolPolicy === 'crlf' ? '\r\n' : eolPolicy === 'lf' ? '\n' : hasCrlf ? '\r\n' : '\n';
    out = out.replace(/(?:\r?\n)*$/, newline);
  }
  if (eolPolicy === 'lf') {
    out = out.replace(/\r\n/g, '\n');
  } else if (eolPolicy === 'crlf') {
    out = out.replace(/\r?\n/g, '\r\n');
  }
  return out;
}
