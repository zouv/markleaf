use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalSize, WindowEvent};

const STATE_FILE: &str = "window-size.json";

#[derive(Serialize, Deserialize)]
struct WindowSize {
    width: u32,
    height: u32,
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(STATE_FILE))
}

/// 在窗口创建后恢复上次关闭时保存的内容尺寸。
pub fn restore(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Some(path) = state_path(app) else {
        return;
    };
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    let Ok(saved) = serde_json::from_str::<WindowSize>(&text) else {
        return;
    };
    if saved.width == 0 || saved.height == 0 {
        return;
    }

    let mut width = saved.width;
    let mut height = saved.height;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let work_area = monitor.work_area();
        width = width.min(work_area.size.width);
        height = height.min(work_area.size.height);
    }
    width = width.max(640);
    height = height.max(400);
    let _ = window.set_size(PhysicalSize::new(width, height));
}

/// 关闭窗口时保存正常状态下的尺寸；最大化状态不覆盖已有尺寸。
pub fn install(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Some(path) = state_path(app) else {
        return;
    };

    let window_for_event = window.clone();
    window.on_window_event(move |event| {
        if !matches!(event, WindowEvent::CloseRequested { .. }) {
            return;
        }
        if window_for_event.is_maximized().unwrap_or(false) {
            return;
        }
        let Ok(size) = window_for_event.inner_size() else {
            return;
        };
        if size.width == 0 || size.height == 0 {
            return;
        }
        let state = WindowSize {
            width: size.width,
            height: size.height,
        };
        let Ok(text) = serde_json::to_string(&state) else {
            return;
        };
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&path, text);
    });
}
