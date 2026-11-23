mod commands;
pub mod fs_ops;
pub mod markdown;
mod preferences;
mod single_instance;
#[cfg(target_os = "windows")]
mod window_edges;
mod window_state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 单实例插件必须最先注册：第二个实例会在窗口与其余初始化执行前被转发并退出。
    // 单窗口模式关闭时，回调会重新拉起带环境变量的独立进程，保持原有的多开行为。
    if !single_instance::is_multi_instance_child() {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            single_instance::handle_second_instance,
        ));
    }

    builder
        .setup(|app| {
            #[cfg(target_os = "windows")]
            window_edges::install(app.handle());
            window_state::restore(app.handle());
            window_state::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::startup_document,
            commands::open_markdown_file,
            commands::open_file_directory,
            commands::pick_markdown_file,
            commands::save_markdown_file,
            commands::save_markdown_dialog,
            commands::render_markdown,
            commands::toggle_markdown_task,
            commands::set_single_window_mode,
            commands::take_pending_open_documents
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Tauri application");
}
