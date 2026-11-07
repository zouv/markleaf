use comrak::nodes::{AstNode, NodeValue};
use comrak::{format_html, parse_document, Arena, Options};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TocItem {
    pub id: String,
    pub text: String,
    pub level: u8,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocStats {
    pub chars: usize,
    pub chars_with_spaces: usize,
    pub words: usize,
    pub paragraphs: usize,
    pub lines: usize,
    pub reading_minutes: usize,
    pub tasks_total: usize,
    pub tasks_done: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderedMarkdown {
    pub html: String,
    pub toc: Vec<TocItem>,
    pub stats: DocStats,
}

pub fn build_comrak_options() -> Options<'static> {
    let mut options = Options::default();
    options.extension.strikethrough = true;
    options.extension.tagfilter = true;
    options.extension.table = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.superscript = true;
    options.extension.footnotes = true;
    options.extension.description_lists = true;
    options.extension.front_matter_delimiter = Some("---".to_owned());
    options.extension.multiline_block_quotes = true;
    options.extension.alerts = true;
    options.extension.math_dollars = true;
    options.extension.math_code = true;
    options.extension.wikilinks_title_after_pipe = true;
    options.extension.underline = true;
    options.extension.subscript = true;

    options.render.sourcepos = true;
    options.render.unsafe_ = false;
    options
}

fn collect_node_text<'a>(node: &'a AstNode<'a>, out: &mut String) {
    match &node.data.borrow().value {
        NodeValue::Text(t) | NodeValue::Code(comrak::nodes::NodeCode { literal: t, .. }) => {
            out.push_str(t);
        }
        NodeValue::SoftBreak | NodeValue::LineBreak => {
            out.push(' ');
        }
        _ => {}
    }
    for child in node.children() {
        collect_node_text(child, out);
    }
}

pub fn slugify_heading(text: &str, line: usize) -> String {
    let mut slug = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                slug.push(lower);
            }
        } else if (ch.is_whitespace() || ch == '-' || ch == '_') && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        format!("heading-line-{line}")
    } else {
        format!("{trimmed}-L{line}")
    }
}

pub fn compute_stats(
    markdown: &str,
    paragraphs: usize,
    tasks_total: usize,
    tasks_done: usize,
) -> DocStats {
    let lines = if markdown.is_empty() {
        1
    } else {
        markdown.lines().count().max(1)
    };
    let mut chars = 0usize;
    let mut chars_with_spaces = 0usize;
    let mut cjk_chars = 0usize;
    for ch in markdown.chars() {
        if ch != '\r' && ch != '\n' {
            chars_with_spaces += 1;
        }
        if !ch.is_whitespace() {
            chars += 1;
            if ('\u{4E00}'..='\u{9FFF}').contains(&ch) {
                cjk_chars += 1;
            }
        }
    }
    let ascii_words = markdown
        .split(|c: char| c.is_whitespace() || ('\u{4E00}'..='\u{9FFF}').contains(&c))
        .filter(|s| s.chars().any(|c| c.is_ascii_alphanumeric()))
        .count();
    let words = cjk_chars + ascii_words;
    let reading_minutes = (words.div_ceil(320)).max(1);
    DocStats {
        chars,
        chars_with_spaces,
        words,
        paragraphs: paragraphs.max(usize::from(chars > 0)),
        lines,
        reading_minutes,
        tasks_total,
        tasks_done,
    }
}

/// 将非代码块内的 `==高亮文本==` 转换为 `<mark class="ml-highlight">高亮文本</mark>`，并给标题注入 id 与锚点按钮。
fn post_process_html(raw_html: &str, toc: &[TocItem]) -> String {
    let mut html = raw_html.to_string();

    // 1. 为带有 data-sourcepos 的 <h1..h6> 注入 id 与悬停锚点按钮
    for item in toc {
        let needle_prefix = format!("<h{} data-sourcepos=\"{}:", item.level, item.line);
        if let Some(pos) = html.find(&needle_prefix) {
            let insert_at = pos + 3; // `<hN` 之后
            let id_attr = format!(" id=\"{}\"", item.id);
            html.insert_str(insert_at, &id_attr);

            let close_tag = format!("</h{}>", item.level);
            if let Some(close_rel) = html[pos..].find(&close_tag) {
                let close_pos = pos + close_rel;
                let anchor_btn = format!(
                    "<button type=\"button\" class=\"ml-heading-anchor\" data-anchor=\"#{}\" title=\"复制标题锚点 #{}\">#</button>",
                    item.id, item.id
                );
                html.insert_str(close_pos, &anchor_btn);
            }
        }
    }

    // 2. 使阅读态下的任务列表复选框可交互（移除 disabled 属性并加上 class）
    html = html.replace(
        "<input type=\"checkbox\" disabled=\"\" checked=\"\" />",
        "<input type=\"checkbox\" class=\"ml-task-checkbox\" checked />",
    );
    html = html.replace(
        "<input type=\"checkbox\" disabled=\"\" />",
        "<input type=\"checkbox\" class=\"ml-task-checkbox\" />",
    );

    // 3. 转换非 <pre>/<code> 内部的 ==highlight== 语法
    transform_inline_highlights(&html)
}

fn transform_inline_highlights(html: &str) -> String {
    let mut result = String::with_capacity(html.len() + 64);
    let mut rest = html;
    let mut in_code = 0usize;

    while let Some(lt) = rest.find('<') {
        let text_seg = &rest[..lt];
        if in_code == 0 && text_seg.contains("==") {
            result.push_str(&replace_double_eq(text_seg));
        } else {
            result.push_str(text_seg);
        }
        rest = &rest[lt..];
        if let Some(gt) = rest.find('>') {
            let tag = &rest[..=gt];
            let lower = tag.to_ascii_lowercase();
            if lower.starts_with("<code") || lower.starts_with("<pre") {
                in_code += 1;
            } else if lower.starts_with("</code") || lower.starts_with("</pre") {
                in_code = in_code.saturating_sub(1);
            }
            result.push_str(tag);
            rest = &rest[gt + 1..];
        } else {
            result.push_str(rest);
            return result;
        }
    }
    if in_code == 0 && rest.contains("==") {
        result.push_str(&replace_double_eq(rest));
    } else {
        result.push_str(rest);
    }
    result
}

fn replace_double_eq(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    let mut rest = segment;
    while let Some(start) = rest.find("==") {
        out.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        if let Some(end) = after_start.find("==") {
            let inner = &after_start[..end];
            if !inner.is_empty() && !inner.starts_with(' ') && !inner.ends_with(' ') {
                out.push_str("<mark class=\"ml-highlight\">");
                out.push_str(inner);
                out.push_str("</mark>");
                rest = &after_start[end + 2..];
                continue;
            }
        }
        out.push_str("==");
        rest = after_start;
    }
    out.push_str(rest);
    out
}

pub fn render_markdown_payload(markdown: &str) -> RenderedMarkdown {
    let arena = Arena::new();
    let options = build_comrak_options();
    let root = parse_document(&arena, markdown, &options);

    let mut toc = Vec::new();
    let mut paragraphs = 0usize;
    let mut tasks_total = 0usize;
    let mut tasks_done = 0usize;

    for node in root.descendants() {
        let data = node.data.borrow();
        let line = data.sourcepos.start.line;
        match &data.value {
            NodeValue::Heading(heading) => {
                let level = heading.level;
                drop(data);
                let mut text = String::new();
                collect_node_text(node, &mut text);
                let clean = text.trim().to_string();
                if !clean.is_empty() {
                    let id = slugify_heading(&clean, line);
                    toc.push(TocItem {
                        id,
                        text: clean,
                        level,
                        line,
                    });
                }
            }
            NodeValue::Paragraph => {
                paragraphs += 1;
            }
            NodeValue::TaskItem(symbol) => {
                tasks_total += 1;
                if symbol.is_some() {
                    tasks_done += 1;
                }
            }
            _ => {}
        }
    }

    let mut raw_buf = Vec::with_capacity(markdown.len() * 2 + 128);
    let _ = format_html(root, &options, &mut raw_buf);
    let raw_html = String::from_utf8_lossy(&raw_buf);

    let html = post_process_html(&raw_html, &toc);
    let stats = compute_stats(markdown, paragraphs, tasks_total, tasks_done);

    RenderedMarkdown { html, toc, stats }
}

/// 按 1-based 行号原位切换任务复选框 `[ ]` ↔ `[x]`，100% 保留原文件未修改行、缩进与 CRLF/LF 换行符。
pub fn toggle_task_at_line(content: &str, line_number: usize) -> Option<String> {
    if line_number == 0 {
        return None;
    }
    let mut current_line = 1usize;
    let mut line_start = 0usize;

    for (idx, ch) in content.char_indices() {
        if current_line == line_number {
            line_start = idx;
            break;
        }
        if ch == '\n' {
            current_line += 1;
        }
    }
    if current_line != line_number {
        return None;
    }

    let line_end = content[line_start..]
        .find('\n')
        .map(|offset| line_start + offset)
        .unwrap_or(content.len());

    let line_slice = &content[line_start..line_end];
    let toggled_line = toggle_task_marker_in_line(line_slice)?;

    let mut updated = String::with_capacity(content.len());
    updated.push_str(&content[..line_start]);
    updated.push_str(&toggled_line);
    updated.push_str(&content[line_end..]);
    Some(updated)
}

fn toggle_task_marker_in_line(line: &str) -> Option<String> {
    if let Some(pos) = line.find("[ ]") {
        let mut s = String::with_capacity(line.len());
        s.push_str(&line[..pos]);
        s.push_str("[x]");
        s.push_str(&line[pos + 3..]);
        return Some(s);
    }
    if let Some(pos) = line.find("[x]").or_else(|| line.find("[X]")) {
        let mut s = String::with_capacity(line.len());
        s.push_str(&line[..pos]);
        s.push_str("[ ]");
        s.push_str(&line[pos + 3..]);
        return Some(s);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_gfm_alerts_toc_and_highlights() {
        let md = "# 欢迎使用 MarkLeaf\n\n这是一段包含 ==重点高亮== 的正文。\n\n> [!TIP]\n> 提示卡片内容\n\n- [ ] 待办事项一\n- [x] 已完成事项\n";
        let res = render_markdown_payload(md);
        assert_eq!(res.toc.len(), 1);
        assert_eq!(res.toc[0].text, "欢迎使用 MarkLeaf");
        assert_eq!(res.toc[0].line, 1);
        assert!(res.html.contains("data-sourcepos=\"1:1-1:"));
        assert!(res.html.contains(&res.toc[0].id));
        assert!(res.html.contains("ml-heading-anchor"));
        assert!(res
            .html
            .contains("<mark class=\"ml-highlight\">重点高亮</mark>"));
        assert!(res.html.contains("markdown-alert-tip"));
        assert_eq!(res.stats.tasks_total, 2);
        assert_eq!(res.stats.tasks_done, 1);
        assert!(res.stats.paragraphs >= 1);
        assert!(res.stats.chars_with_spaces >= res.stats.chars);
    }

    #[test]
    fn toggles_task_preserving_exact_formatting_and_crlf() {
        let original =
            "# Title\r\n\r\n  *   [ ] Keep weird indentation\r\n  *   [x] Second item\r\n\r\n\r\n";
        let toggled = toggle_task_at_line(original, 3).expect("should toggle line 3");
        assert_eq!(
            toggled,
            "# Title\r\n\r\n  *   [x] Keep weird indentation\r\n  *   [x] Second item\r\n\r\n\r\n"
        );
        let toggled_back = toggle_task_at_line(&toggled, 3).expect("should toggle back");
        assert_eq!(toggled_back, original);
    }
}
