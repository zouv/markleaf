use crate::markdown::{render_markdown_payload, DocStats, TocItem};
use encoding_rs::{GBK, UTF_16BE, UTF_16LE};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SiblingFile {
    pub name: String,
    pub path: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSession {
    pub path: String,
    pub file_name: String,
    pub dir_path: String,
    pub content: String,
    pub encoding: String,
    pub html: String,
    pub toc: Vec<TocItem>,
    pub stats: DocStats,
    pub siblings: Vec<SiblingFile>,
}

pub fn is_markdown_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkd" | "mdx" | "txt"
            )
        })
        .unwrap_or(false)
}

/// 自动探测字节流的文本编码（UTF-8 BOM / UTF-16LE / UTF-16BE / UTF-8 / GBK）并解码为 String。
pub fn decode_bytes_lossless(bytes: &[u8]) -> (String, String) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let text = String::from_utf8_lossy(&bytes[3..]).into_owned();
        return (text, "UTF-8 BOM".to_string());
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, _) = UTF_16LE.decode(&bytes[2..]);
        return (cow.into_owned(), "UTF-16LE".to_string());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, _) = UTF_16BE.decode(&bytes[2..]);
        return (cow.into_owned(), "UTF-16BE".to_string());
    }
    if let Ok(utf8) = std::str::from_utf8(bytes) {
        return (utf8.to_string(), "UTF-8".to_string());
    }
    let (cow, _, _) = GBK.decode(bytes);
    (cow.into_owned(), "GBK".to_string())
}

/// 按指定编码将文本编码回字节流，避免静默改变用户原文件编码。
pub fn encode_text_with_encoding(content: &str, encoding: &str) -> Vec<u8> {
    match encoding {
        "UTF-8 BOM" => {
            let mut out = Vec::with_capacity(content.len() + 3);
            out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
            out.extend_from_slice(content.as_bytes());
            out
        }
        "UTF-16LE" => {
            let mut out = Vec::with_capacity(content.len() * 2 + 2);
            out.extend_from_slice(&[0xFF, 0xFE]);
            for unit in content.encode_utf16() {
                out.extend_from_slice(&unit.to_le_bytes());
            }
            out
        }
        "UTF-16BE" => {
            let mut out = Vec::with_capacity(content.len() * 2 + 2);
            out.extend_from_slice(&[0xFE, 0xFF]);
            for unit in content.encode_utf16() {
                out.extend_from_slice(&unit.to_be_bytes());
            }
            out
        }
        "GBK" => {
            let (cow, _, _) = GBK.encode(content);
            cow.into_owned()
        }
        _ => content.as_bytes().to_vec(),
    }
}

pub fn normalize_display_path(path: &Path) -> String {
    let raw = path.to_string_lossy().to_string();
    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        raw
    }
}

pub fn list_sibling_markdown_files(file_path: &Path) -> Vec<SiblingFile> {
    let Some(parent) = file_path.parent() else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(parent) else {
        return Vec::new();
    };
    let canonical_target = fs::canonicalize(file_path).unwrap_or_else(|_| file_path.to_path_buf());
    let mut siblings = Vec::new();

    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() && is_markdown_extension(&p) {
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("untitled.md")
                .to_string();
            let canonical_item = fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
            let active = canonical_item == canonical_target;
            siblings.push(SiblingFile {
                name,
                path: normalize_display_path(&canonical_item),
                active,
            });
        }
    }

    siblings.sort_by_key(|a| a.name.to_lowercase());
    siblings
}

pub fn load_document_from_path(raw_path: &str) -> Result<DocumentSession, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    let path_str = trimmed.strip_prefix("file:///").unwrap_or(trimmed);
    let candidate = PathBuf::from(path_str);
    if !candidate.exists() || !candidate.is_file() {
        return Err(format!("文件不存在或不是普通文件：{trimmed}"));
    }
    let canonical = fs::canonicalize(&candidate).unwrap_or(candidate);
    if !is_markdown_extension(&canonical) {
        return Err("仅支持打开 Markdown / 文本文件（.md / .markdown / .mdx / .txt）".to_string());
    }

    let bytes = fs::read(&canonical).map_err(|e| format!("读取文件失败：{e}"))?;
    let (content, encoding) = decode_bytes_lossless(&bytes);
    let rendered = render_markdown_payload(&content);
    let siblings = list_sibling_markdown_files(&canonical);

    let file_name = canonical
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled.md")
        .to_string();
    let dir_path = canonical
        .parent()
        .map(normalize_display_path)
        .unwrap_or_default();

    Ok(DocumentSession {
        path: normalize_display_path(&canonical),
        file_name,
        dir_path,
        content,
        encoding,
        html: rendered.html,
        toc: rendered.toc,
        stats: rendered.stats,
        siblings,
    })
}

pub fn save_document_to_path(
    raw_path: &str,
    content: &str,
    encoding: &str,
) -> Result<DocumentSession, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("保存路径不能为空".to_string());
    }
    let target = PathBuf::from(trimmed);
    if !is_markdown_extension(&target) {
        return Err("仅允许保存为 Markdown / 文本文件后缀".to_string());
    }
    let bytes = encode_text_with_encoding(content, encoding);
    fs::write(&target, bytes).map_err(|e| format!("写入文件失败：{e}"))?;
    load_document_from_path(trimmed)
}

/// 从命令行启动参数中提取双击打开的 Markdown 文件路径（跳过第一个可执行文件参数和 `--` 标志参数）。
pub fn extract_cli_markdown_path() -> Option<String> {
    for arg in std::env::args_os().skip(1) {
        let s = arg.to_string_lossy();
        if s.starts_with('-') {
            continue;
        }
        let cleaned = s.strip_prefix("file:///").unwrap_or(&s);
        let p = Path::new(cleaned);
        if p.exists() && p.is_file() && is_markdown_extension(p) {
            return Some(cleaned.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrips_utf8_bom_and_gbk_encodings() {
        let sample = "# 中文标题\n正文内容 ABC 123";
        let bom_bytes = encode_text_with_encoding(sample, "UTF-8 BOM");
        let (decoded_bom, enc_bom) = decode_bytes_lossless(&bom_bytes);
        assert_eq!(enc_bom, "UTF-8 BOM");
        assert_eq!(decoded_bom, sample);

        let gbk_bytes = encode_text_with_encoding(sample, "GBK");
        let (decoded_gbk, enc_gbk) = decode_bytes_lossless(&gbk_bytes);
        assert_eq!(enc_gbk, "GBK");
        assert_eq!(decoded_gbk, sample);
    }

    #[test]
    fn validates_markdown_extensions() {
        assert!(is_markdown_extension(Path::new("README.md")));
        assert!(is_markdown_extension(Path::new("guide.MARKDOWN")));
        assert!(!is_markdown_extension(Path::new("binary.exe")));
    }
}
