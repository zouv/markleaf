// Windows 的 release 构建不弹控制台窗口；debug 保留终端方便看日志。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    markleaf_lib::run();
}
