use std::path::PathBuf;
use windows::core::PWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, IShellItem, SIGDN_FILESYSPATH};
use windows::Win32::System::Com::CoUninitialize;

pub fn pick_file() -> Result<PathBuf, String> {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        if hr.is_err() && hr != windows::core::HRESULT(-2147417850) {
            // Error handling ignored
        }

        let result = (|| -> Result<PathBuf, String> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| format!("Failed to create IFileOpenDialog: {}", e))?;

            if dialog.Show(HWND::default()).is_err() {
                return Err("cancelled".into());
            }

            let item: IShellItem = dialog.GetResult()
                .map_err(|e| format!("Failed to get result from dialog: {}", e))?;

            let path_pwstr: PWSTR = item.GetDisplayName(SIGDN_FILESYSPATH)
                .map_err(|e| format!("Failed to get display name: {}", e))?;

            if path_pwstr.is_null() {
                return Err("Path is null".into());
            }

            let path_str = path_pwstr.to_string().map_err(|_| "Invalid string")?;
            windows::Win32::System::Com::CoTaskMemFree(Some(path_pwstr.as_ptr() as *const _));

            Ok(PathBuf::from(path_str))
        })();

        if hr.is_ok() {
            CoUninitialize();
        }

        result
    }
}
