use crate::fs_ops::{
    extract_cli_markdown_path, load_document_from_path, save_document_to_path, DocumentSession,
};
use crate::markdown::{render_markdown_payload, toggle_task_at_line, RenderedMarkdown};
use serde::Serialize;

/// 返回给前端的应用信息。新增命令时：这里定义 + lib.rs 注册 + src/api.ts 封装 + tests/contract.test.mjs。
#[derive(Debug, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggledTaskResult {
    pub content: String,
    pub rendered: RenderedMarkdown,
    pub saved: bool,
}

/// 应用名与版本。版本唯一来源是 `src-tauri/Cargo.toml`。
#[tauri::command]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
    }
}

/// 启动时检查命令行参数是否有双击传入的 `.md` 文件，若有则一次性解析返回首屏数据。
#[tauri::command]
pub fn startup_document() -> Result<Option<DocumentSession>, String> {
    if let Some(cli_path) = extract_cli_markdown_path() {
        let session = load_document_from_path(&cli_path)?;
        Ok(Some(session))
    } else {
        Ok(None)
    }
}

/// 打开指定路径的 Markdown 文件，自动识别编码并扫描同目录 `.md` 文件。
#[tauri::command]
pub fn open_markdown_file(path: String) -> Result<DocumentSession, String> {
    load_document_from_path(&path)
}

/// 弹出系统原生文件选择框，选择并打开 Markdown 文件。
#[tauri::command]
pub async fn pick_markdown_file() -> Result<Option<DocumentSession>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("打开 Markdown 文档")
        .add_filter(
            "Markdown",
            &["md", "markdown", "mdown", "mkd", "mdx", "txt"],
        )
        .pick_file();

    match picked {
        Some(path) => {
            let path_str = path.to_string_lossy().to_string();
            let session = load_document_from_path(&path_str)?;
            Ok(Some(session))
        }
        None => Ok(None),
    }
}

/// 按原文件编码保存 Markdown 内容到指定路径，并返回最新渲染结果。
#[tauri::command]
pub fn save_markdown_file(
    path: String,
    content: String,
    encoding: String,
) -> Result<DocumentSession, String> {
    save_document_to_path(&path, &content, &encoding)
}

/// 弹出系统原生保存对话框，将当前文档另存为新文件。
#[tauri::command]
pub async fn save_markdown_dialog(
    default_name: String,
    content: String,
) -> Result<Option<DocumentSession>, String> {
    let file_name = if default_name.trim().is_empty() {
        "Untitled.md".to_string()
    } else {
        default_name
    };
    let target = rfd::FileDialog::new()
        .set_title("另存为 Markdown 文档")
        .set_file_name(&file_name)
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .save_file();

    match target {
        Some(path) => {
            let path_str = path.to_string_lossy().to_string();
            let session = save_document_to_path(&path_str, &content, "UTF-8")?;
            Ok(Some(session))
        }
        None => Ok(None),
    }
}

/// 纯内存极速渲染 Markdown 文本（用于未保存缓冲或编辑态实时预览）。
#[tauri::command]
pub fn render_markdown(content: String) -> RenderedMarkdown {
    render_markdown_payload(&content)
}

/// 阅读态直接点击任务列表复选框时，按 1-based 行号原位切换 `[ ]` ↔ `[x]`，不破坏原文件其余行格式。
#[tauri::command]
pub fn toggle_markdown_task(
    content: String,
    line_number: usize,
    path: Option<String>,
    encoding: Option<String>,
) -> Result<ToggledTaskResult, String> {
    let updated = toggle_task_at_line(&content, line_number)
        .ok_or_else(|| format!("未在第 {line_number} 行找到可切换的任务复选框"))?;

    let mut saved = false;
    if let Some(ref p) = path {
        if !p.trim().is_empty() {
            let enc = encoding.as_deref().unwrap_or("UTF-8");
            save_document_to_path(p, &updated, enc)?;
            saved = true;
        }
    }

    let rendered = render_markdown_payload(&updated);
    Ok(ToggledTaskResult {
        content: updated,
        rendered,
        saved,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cargo_version_is_semver_like() {
        let version = env!("CARGO_PKG_VERSION");
        let parts: Vec<&str> = version.split('.').collect();
        assert_eq!(parts.len(), 3, "版本号应为 x.y.z：{version}");
        assert!(
            parts
                .iter()
                .all(|part| part.chars().next().is_some_and(|c| c.is_ascii_digit())),
            "版本号的每一段都应以数字开头：{version}"
        );
    }

    #[test]
    fn render_and_toggle_commands_work_in_memory() {
        let md = "# Test\n\n- [ ] Task A\n".to_string();
        let res = toggle_markdown_task(md, 3, None, None).expect("toggle should succeed");
        assert!(res.content.contains("- [x] Task A"));
        assert!(!res.saved);
        assert_eq!(res.rendered.stats.tasks_done, 1);
    }
}
