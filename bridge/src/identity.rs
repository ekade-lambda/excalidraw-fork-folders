use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use windows::core::{PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, GENERIC_READ, INVALID_HANDLE_VALUE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, GetFileInformationByHandleEx, GetFinalPathNameByHandleW, GetVolumeNameForVolumeMountPointW,
    GetVolumePathNameW, OpenFileById, FileIdInfo, FILE_ID_128, FILE_ID_DESCRIPTOR,
    FILE_ID_INFO, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_SHARE_DELETE, OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_NAME_NORMALIZED
};

#[derive(Debug, Clone)]
pub struct FileIdentity {
    pub volume_guid: String,
    pub file_id: [u8; 16],
}

fn to_pcwstr(path: &Path) -> Vec<u16> {
    let mut v: Vec<u16> = path.as_os_str().encode_wide().collect();
    v.push(0);
    v
}

pub fn get_file_identity(path: &Path) -> Result<FileIdentity, String> {
    unsafe {
        let path_w = to_pcwstr(path);
        let mut volume_path = vec![0u16; 260];
        if GetVolumePathNameW(PCWSTR(path_w.as_ptr()), &mut volume_path).is_err() {
            return Err("Failed GetVolumePathNameW".into());
        }

        let mut volume_guid = vec![0u16; 260];
        if GetVolumeNameForVolumeMountPointW(PCWSTR(volume_path.as_ptr()), &mut volume_guid).is_err() {
            return Err("Failed GetVolumeNameForVolumeMountPointW".into());
        }
        
        let volume_guid_str = String::from_utf16_lossy(&volume_guid);
        let volume_guid_str = volume_guid_str.trim_end_matches('\0').to_string();

        let handle = CreateFileW(
            PCWSTR(path_w.as_ptr()),
            GENERIC_READ.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            HANDLE::default(),
        ).map_err(|e| format!("CreateFileW failed: {}", e))?;

        if handle == INVALID_HANDLE_VALUE {
            return Err("Invalid handle".into());
        }

        let mut file_id_info = FILE_ID_INFO::default();
        let res = GetFileInformationByHandleEx(
            handle,
            FileIdInfo,
            &mut file_id_info as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<FILE_ID_INFO>() as u32,
        );

        CloseHandle(handle).ok();

        if res.is_err() {
            return Err("GetFileInformationByHandleEx failed".into());
        }

        Ok(FileIdentity {
            volume_guid: volume_guid_str,
            file_id: file_id_info.FileId.Identifier,
        })
    }
}

pub fn resolve_file_identity(identity: &FileIdentity) -> Result<PathBuf, String> {
    unsafe {
        let mut vol_w: Vec<u16> = identity.volume_guid.encode_utf16().collect();
        vol_w.push(0);

        let vol_handle = CreateFileW(
            PCWSTR(vol_w.as_ptr()),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            HANDLE::default(),
        ).map_err(|e| format!("CreateFileW on volume failed: {}", e))?;

        if vol_handle == INVALID_HANDLE_VALUE {
            return Err("Invalid volume handle".into());
        }

        let mut desc = FILE_ID_DESCRIPTOR::default();
        desc.dwSize = std::mem::size_of::<FILE_ID_DESCRIPTOR>() as u32;
        desc.Type = windows::Win32::Storage::FileSystem::ExtendedFileIdType;
        desc.Anonymous.ExtendedFileId = FILE_ID_128 { Identifier: identity.file_id };

        let file_handle = OpenFileById(
            vol_handle,
            &desc,
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            FILE_FLAG_BACKUP_SEMANTICS,
        ).map_err(|e| {
            CloseHandle(vol_handle).ok();
            format!("OpenFileById failed: {}", e)
        })?;

        CloseHandle(vol_handle).ok();

        if file_handle == INVALID_HANDLE_VALUE {
            return Err("Invalid file handle from OpenFileById".into());
        }

        let mut path_buf = vec![0u16; 32768];
        let len = GetFinalPathNameByHandleW(
            file_handle,
            &mut path_buf,
            FILE_NAME_NORMALIZED,
        );

        CloseHandle(file_handle).ok();

        if len == 0 || len as usize >= path_buf.len() {
            return Err("GetFinalPathNameByHandleW failed".into());
        }

        let path_str = String::from_utf16_lossy(&path_buf[..len as usize]);
        let path_clean = if path_str.starts_with(r"\\?\") {
            path_str[4..].to_string()
        } else {
            path_str
        };

        Ok(PathBuf::from(path_clean.trim_end_matches('\0')))
    }
}
