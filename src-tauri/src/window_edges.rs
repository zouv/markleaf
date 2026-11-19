// Windows-only: turn a double-click on the native resize border into the same
// single-axis fill as the webview edge handler.
//
// Tauri creates a child HWND above the webview for undecorated window resizing.
// That child owns the outermost border strip, so the webview never receives
// mouse events there. Subclassing the child lets us intercept
// WM_NCLBUTTONDBLCLK without touching Tauri's own resize logic.
#![allow(unsafe_code)] // Win32 subclassing is inherently unsafe; isolated here.

use tauri::{Emitter, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, GetWindowRect, WM_NCDESTROY, WM_NCLBUTTONDBLCLK,
};

const SUBCLASS_ID: usize = 0x4D4C_4544; // "MLED"
const EDGE_HIT_PX: i32 = 16;

#[derive(Clone, Copy)]
enum Edge {
    Left,
    Right,
    Top,
    Bottom,
}

impl Edge {
    fn as_str(self) -> &'static str {
        match self {
            Edge::Left => "left",
            Edge::Right => "right",
            Edge::Top => "top",
            Edge::Bottom => "bottom",
        }
    }
}

pub fn install(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Ok(parent) = window.hwnd() else {
        return;
    };
    // `tauri-runtime-wry` names its resize helper window like this. If a future
    // Tauri release renames it, the webview-side handler still covers inner edges.
    let Ok(child) = (unsafe {
        FindWindowExW(
            Some(parent),
            None,
            w!("TAURI_DRAG_RESIZE_BORDERS"),
            w!("TAURI_DRAG_RESIZE_WINDOW"),
        )
    }) else {
        return;
    };

    let data = Box::into_raw(Box::new(window.clone()));
    let parent_installed =
        unsafe { SetWindowSubclass(parent, Some(subclass_proc), SUBCLASS_ID, data as usize) };
    let child_data = Box::into_raw(Box::new(window));
    let child_installed = unsafe {
        SetWindowSubclass(
            child,
            Some(subclass_proc),
            SUBCLASS_ID + 1,
            child_data as usize,
        )
    };
    if !parent_installed.as_bool() {
        unsafe { drop(Box::from_raw(data)) };
    }
    if !child_installed.as_bool() {
        unsafe { drop(Box::from_raw(child_data)) };
    }
}

unsafe extern "system" fn subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    uidsubclass: usize,
    dwrefdata: usize,
) -> LRESULT {
    unsafe {
        if msg == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), uidsubclass);
            if dwrefdata != 0 {
                drop(Box::from_raw(dwrefdata as *mut WebviewWindow));
            }
            return DefSubclassProc(hwnd, msg, wparam, lparam);
        }

        if msg == WM_NCLBUTTONDBLCLK && dwrefdata != 0 {
            let window = &*(dwrefdata as *const WebviewWindow);
            if let Some(edge) = edge_from_click(hwnd, lparam) {
                let _ = window.emit("window-edge-fill", edge);
                return LRESULT(0);
            }
        }

        DefSubclassProc(hwnd, msg, wparam, lparam)
    }
}

fn edge_from_click(hwnd: HWND, lparam: LPARAM) -> Option<&'static str> {
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect).ok()? };

    let x = low_word(lparam.0);
    let y = high_word(lparam.0);
    let distances = [
        (Edge::Left, x - rect.left),
        (Edge::Right, rect.right - x),
        (Edge::Top, y - rect.top),
        (Edge::Bottom, rect.bottom - y),
    ];
    let (edge, distance) = distances
        .into_iter()
        .min_by_key(|(_, distance)| *distance)?;
    (distance <= EDGE_HIT_PX).then_some(edge.as_str())
}

fn low_word(value: isize) -> i32 {
    (value as u32 & 0xFFFF) as u16 as i16 as i32
}

fn high_word(value: isize) -> i32 {
    ((value as u32 >> 16) & 0xFFFF) as u16 as i16 as i32
}
