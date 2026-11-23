use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const PREFERENCES_FILE: &str = "preferences.json";

/// Rust 侧需要读取的偏好设置镜像。
///
/// 前端设置仍以 `localStorage` 为准，但第二实例启动时前端还没机会参与，
/// 因此「单窗口模式」必须在应用配置目录留一份可供 Rust 同步读取的副本。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct AppPreferences {
    single_window_mode: bool,
}

fn preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(PREFERENCES_FILE))
        .map_err(|e| format!("无法定位应用配置目录：{e}"))
}

fn read_preferences(app: &AppHandle) -> AppPreferences {
    let Ok(path) = preferences_path(app) else {
        return AppPreferences::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return AppPreferences::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

/// 第二实例回调里读取；文件缺失或损坏时回退为默认的「多开」。
pub fn read_single_window_mode(app: &AppHandle) -> bool {
    read_preferences(app).single_window_mode
}

/// 由前端设置项同步写入，供之后启动的第二个实例在插件回调中读取。
pub fn set_single_window_mode(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let mut preferences = read_preferences(app);
    preferences.single_window_mode = enabled;
    write_preferences(app, &preferences)
}

fn write_preferences(app: &AppHandle, preferences: &AppPreferences) -> Result<(), String> {
    let path = preferences_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建应用配置目录失败：{e}"))?;
    }
    let text = serde_json::to_string_pretty(preferences)
        .map_err(|e| format!("序列化偏好设置失败：{e}"))?;

    // 先写临时文件再替换，避免第二实例恰好读到写了一半的 JSON。
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, text).map_err(|e| format!("写入偏好设置失败：{e}"))?;
    if let Err(err) = fs::rename(&temp, &path) {
        let _ = fs::remove_file(&temp);
        return Err(format!("保存偏好设置失败：{err}"));
    }
    Ok(())
}
