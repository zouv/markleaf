import { invoke } from '@tauri-apps/api/core';

export type AppInfo = {
  name: string;
  version: string;
};

export type TocItem = {
  id: string;
  text: string;
  level: number;
  line: number;
};

export type DocStats = {
  chars: number;
  charsWithSpaces: number;
  words: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
  tasksTotal: number;
  tasksDone: number;
};

export type SiblingFile = {
  name: string;
  path: string;
  active: boolean;
};

export type RenderedMarkdown = {
  html: string;
  toc: TocItem[];
  stats: DocStats;
};

export type DocumentSession = {
  path: string;
  fileName: string;
  dirPath: string;
  content: string;
  encoding: string;
  html: string;
  toc: TocItem[];
  stats: DocStats;
  siblings: SiblingFile[];
};

export type ToggledTaskResult = {
  content: string;
  rendered: RenderedMarkdown;
  saved: boolean;
};

/** 浏览器预览（sh manager.sh web）里没有 Tauri IPC。 */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getAppInfo(): Promise<AppInfo> {
  if (!isTauriRuntime()) {
    return Promise.resolve({ name: 'MarkLeaf (Web Preview)', version: '0.2.0' });
  }
  return invoke<AppInfo>('app_info');
}

export function getStartupDocument(): Promise<DocumentSession | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }
  return invoke<DocumentSession | null>('startup_document');
}

export function openMarkdownFile(path: string): Promise<DocumentSession> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error('浏览器预览模式下不支持直接读取本地磁盘路径，请使用 sh manager.sh dev。'));
  }
  return invoke<DocumentSession>('open_markdown_file', { path });
}

export function pickMarkdownFile(): Promise<DocumentSession | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }
  return invoke<DocumentSession | null>('pick_markdown_file');
}

export function saveMarkdownFile(path: string, content: string, encoding: string): Promise<DocumentSession> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error('浏览器预览模式下无法直接写入磁盘，请使用 sh manager.sh dev。'));
  }
  return invoke<DocumentSession>('save_markdown_file', { path, content, encoding });
}

export function saveMarkdownDialog(defaultName: string, content: string): Promise<DocumentSession | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }
  return invoke<DocumentSession | null>('save_markdown_dialog', { defaultName, content });
}

export function renderMarkdown(content: string): Promise<RenderedMarkdown> {
  if (!isTauriRuntime()) {
    return Promise.resolve(fallbackRenderInBrowser(content));
  }
  return invoke<RenderedMarkdown>('render_markdown', { content });
}

export function toggleMarkdownTask(
  content: string,
  lineNumber: number,
  path?: string | null,
  encoding?: string | null,
): Promise<ToggledTaskResult> {
  if (!isTauriRuntime()) {
    const updated = fallbackToggleTask(content, lineNumber);
    return Promise.resolve({
      content: updated,
      rendered: fallbackRenderInBrowser(updated),
      saved: false,
    });
  }
  return invoke<ToggledTaskResult>('toggle_markdown_task', {
    content,
    lineNumber,
    path: path ?? null,
    encoding: encoding ?? null,
  });
}

// ============================================================================
// 浏览器预览模式（sh manager.sh web）轻量降级渲染器，确保无 Rust 时界面也可完整交互
// ============================================================================
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark class="ml-highlight">$1</mark>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function fallbackToggleTask(content: string, lineNumber: number): string {
  const lines = content.split('\n');
  const idx = lineNumber - 1;
  if (idx >= 0 && idx < lines.length) {
    if (lines[idx].includes('[ ]')) {
      lines[idx] = lines[idx].replace('[ ]', '[x]');
    } else if (lines[idx].includes('[x]') || lines[idx].includes('[X]')) {
      lines[idx] = lines[idx].replace(/\[[xX]\]/, '[ ]');
    }
  }
  return lines.join('\n');
}

function fallbackRenderInBrowser(markdown: string): RenderedMarkdown {
  const lines = markdown.split(/\r?\n/);
  const toc: TocItem[] = [];
  const htmlParts: string[] = [];
  let tasksTotal = 0;
  let tasksDone = 0;
  let paragraphs = 0;
  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let codeStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
        codeStartLine = lineNo;
      } else {
        inCode = false;
        const langAttr = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
        htmlParts.push(
          `<pre data-sourcepos="${codeStartLine}:1-${lineNo}:3"><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
        );
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const id = `heading-L${lineNo}`;
      toc.push({ id, text, level, line: lineNo });
      htmlParts.push(
        `<h${level} id="${id}" data-sourcepos="${lineNo}:1-${lineNo}:${line.length}">${formatInline(text)}<button type="button" class="ml-heading-anchor" data-anchor="#${id}" title="复制标题锚点 #${id}">#</button></h${level}>`,
      );
      continue;
    }

    const taskMatch = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      tasksTotal += 1;
      const checked = taskMatch[1].toLowerCase() === 'x';
      if (checked) tasksDone += 1;
      htmlParts.push(
        `<ul data-sourcepos="${lineNo}:1-${lineNo}:${line.length}"><li><input type="checkbox" class="ml-task-checkbox" ${checked ? 'checked' : ''} /> ${formatInline(taskMatch[2])}</li></ul>`,
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      htmlParts.push(`<hr data-sourcepos="${lineNo}:1-${lineNo}:3" />`);
      continue;
    }

    if (line.trim().length > 0) {
      paragraphs += 1;
      htmlParts.push(`<p data-sourcepos="${lineNo}:1-${lineNo}:${line.length}">${formatInline(line)}</p>`);
    }
  }

  const nonSpaceChars = markdown.replace(/\s+/g, '').length;
  const charsWithSpaces = markdown.replace(/\r?\n/g, '').length;
  const words = Math.max(1, Math.ceil(nonSpaceChars / 2));

  return {
    html: htmlParts.join('\n'),
    toc,
    stats: {
      chars: nonSpaceChars,
      charsWithSpaces,
      words,
      paragraphs: Math.max(1, paragraphs),
      lines: Math.max(1, lines.length),
      readingMinutes: Math.max(1, Math.ceil(words / 320)),
      tasksTotal,
      tasksDone,
    },
  };
}
