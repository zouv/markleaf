mod commands;
pub mod fs_ops;
pub mod markdown;
#[cfg(target_os = "windows")]
mod window_edges;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "windows")]
            window_edges::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::startup_document,
            commands::open_markdown_file,
            commands::pick_markdown_file,
            commands::save_markdown_file,
            commands::save_markdown_dialog,
            commands::render_markdown,
            commands::toggle_markdown_task
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri application");
}
