use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use windows::core::PCWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOW;

fn to_pcwstr(path: &Path) -> Vec<u16> {
    let mut v: Vec<u16> = path.as_os_str().encode_wide().collect();
    v.push(0);
    v
}

pub fn open_file_with_shell(path: &Path) -> Result<(), String> {
    unsafe {
        let path_w = to_pcwstr(path);
        
        let op: Vec<u16> = "open\0".encode_utf16().collect();

        let hinst = ShellExecuteW(
            HWND::default(),
            PCWSTR(op.as_ptr()),
            PCWSTR(path_w.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOW,
        );

        let hinst_val = hinst.0 as usize;
        if hinst_val <= 32 {
            return Err(format!("ShellExecuteW failed with code {}", hinst_val));
        }

        Ok(())
    }
}
