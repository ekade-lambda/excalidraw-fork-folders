use std::thread;
use windows::core::PWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::UI::Shell::{FileOpenDialog, IFileOpenDialog, IShellItem, SIGDN_FILESYSPATH};

fn main() {
    let handle = thread::spawn(|| {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED | COINIT_DISABLE_OLE1DDE);
            println!("CoInitializeEx: {:?}", hr);

            let dialog: windows::core::Result<IFileOpenDialog> = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER);
            println!("CoCreateInstance: {:?}", dialog.is_ok());
            if let Ok(d) = dialog {
                println!("Calling Show...");
                let show_res = d.Show(HWND::default());
                println!("Show returned: {:?}", show_res);
            }
        }
    });
    handle.join().unwrap();
}
