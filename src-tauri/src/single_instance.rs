use crate::fs_ops::extract_markdown_path_from_args;
use crate::preferences::read_single_window_mode;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

/// 子进程通过该环境变量跳过单实例插件，让「单窗口模式」关闭时仍能保留多开。
const MULTI_INSTANCE_CHILD_ENV: &str = "MARKLEAF_MULTI_INSTANCE_CHILD";
/// 通知前端排空待打开文档队列的事件名。
pub const OPEN_DOCUMENTS_EVENT: &str = "markleaf-open-documents";

/// 第二实例转发的文档路径。先入队再发事件，避免前端尚未挂载时丢文档。
static PENDING_OPEN_PATHS: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// 当前进程是否由已运行实例为了保持多开而重新拉起。
pub fn is_multi_instance_child() -> bool {
    std::env::var_os(MULTI_INSTANCE_CHILD_ENV).is_some()
}

/// 单实例插件回调：
/// - 单窗口模式开启：把双击的文档排入队列、唤醒主窗口并通知前端新开页签；
/// - 单窗口模式关闭：重新拉起一个跳过插件的独立进程，保持原有的多开行为。
pub fn handle_second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    if !read_single_window_mode(app) {
        spawn_detached_instance(&argv, &cwd);
        return;
    }

    let base_dir = if cwd.is_empty() {
        None
    } else {
        Some(Path::new(cwd.as_str()))
    };
    let document = extract_markdown_path_from_args(argv.iter().skip(1), base_dir);
    let has_document = document.is_some();

    if let Some(path) = document {
        if let Ok(mut pending) = PENDING_OPEN_PATHS.lock() {
            if !pending.iter().any(|existing| existing == &path) {
                pending.push(path);
            }
        }
    }

    focus_main_window(app);
    if has_document {
        let _ = app.emit(OPEN_DOCUMENTS_EVENT, ());
    }
}

/// 取出并清空待打开文档队列（前端启动完成后调用，兜底事件到达太早的情况）。
pub fn take_pending_open_documents() -> Vec<String> {
    PENDING_OPEN_PATHS
        .lock()
        .map(|mut pending| std::mem::take(&mut *pending))
        .unwrap_or_default()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn spawn_detached_instance(argv: &[String], cwd: &str) {
    // 优先用第二实例自己的可执行文件，避免开发版与安装版混用时拉起错误版本。
    let executable = argv
        .first()
        .map(|arg| PathBuf::from(arg.as_str()))
        .filter(|path| path.is_file())
        .or_else(|| std::env::current_exe().ok());
    let Some(executable) = executable else {
        return;
    };

    let mut command = Command::new(executable);
    if argv.len() > 1 {
        command.args(&argv[1..]);
    }
    if !cwd.is_empty() && Path::new(cwd).is_dir() {
        command.current_dir(cwd);
    }
    command.env(MULTI_INSTANCE_CHILD_ENV, "1");
    let _ = command.spawn();
}
