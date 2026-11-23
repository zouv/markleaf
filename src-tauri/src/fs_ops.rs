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

/// 在系统文件管理器中打开文件所在目录。只接受已存在的普通文件路径。
pub fn open_file_directory(raw_path: &str) -> Result<(), String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    let file = PathBuf::from(trimmed);
    if !file.exists() || !file.is_file() {
        return Err("文件不存在或不是普通文件".to_string());
    }
    let canonical = fs::canonicalize(&file).unwrap_or(file);
    let parent = canonical
        .parent()
        .ok_or_else(|| "无法定位文件所在目录".to_string())?;
    if !parent.is_dir() {
        return Err("文件所在目录不存在".to_string());
    }

    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    return Err("当前平台不支持打开文件目录".to_string());

    std::process::Command::new(program)
        .arg(parent)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开文件目录失败：{e}"))
}

/// 从一组文档参数中找出第一个存在且后缀受支持的 Markdown 路径。
/// 相对路径按 `base_dir` 解析（第二实例回调传来的 cwd）；传 `None` 时按当前工作目录。
pub fn extract_markdown_path_from_args<I, S>(args: I, base_dir: Option<&Path>) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    for arg in args {
        let raw = arg.as_ref();
        if raw.starts_with('-') {
            continue;
        }
        let cleaned = raw.strip_prefix("file:///").unwrap_or(raw);
        let candidate = Path::new(cleaned);
        let resolved = match base_dir {
            Some(base) if candidate.is_relative() => base.join(candidate),
            _ => candidate.to_path_buf(),
        };
        if resolved.is_file() && is_markdown_extension(&resolved) {
            let canonical = fs::canonicalize(&resolved).unwrap_or(resolved);
            return Some(normalize_display_path(&canonical));
        }
    }
    None
}

/// 从命令行启动参数中提取双击打开的 Markdown 文件路径（跳过第一个可执行文件参数和 `--` 标志参数）。
pub fn extract_cli_markdown_path() -> Option<String> {
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let cwd = std::env::current_dir().ok();
    extract_markdown_path_from_args(args, cwd.as_deref())
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

    #[test]
    fn extracts_markdown_path_from_forwarded_args() {
        let dir = std::env::temp_dir().join(format!("markleaf-args-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("create temp dir");
        let file = dir.join("note.md");
        fs::write(&file, "# note").expect("write temp markdown");
        let expected = normalize_display_path(&fs::canonicalize(&file).expect("canonicalize file"));

        let found = extract_markdown_path_from_args(
            ["--flag".to_string(), "note.md".to_string()],
            Some(&dir),
        );
        assert_eq!(found.as_deref(), Some(expected.as_str()));
        assert!(extract_markdown_path_from_args(["missing.md".to_string()], Some(&dir)).is_none());

        let _ = fs::remove_dir_all(&dir);
    }
}
