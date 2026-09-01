use axum::{
    body::Bytes,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::fs::File;
use std::io::{Write, Read};
use zip::ZipArchive;
use uuid::Uuid;
use sha2::{Sha256, Digest};
use std::sync::Arc;
use crate::AppState;

const MAX_MANIFEST_SIZE: u64 = 1 * 1024 * 1024; // 1 MB
const MAX_DATABASE_SIZE: u64 = 100 * 1024 * 1024; // 100 MB
const MAX_UNCOMPRESSED_ASSET_SIZE: u64 = 50 * 1024 * 1024; // 50 MB per asset
const MAX_TOTAL_UNCOMPRESSED_SIZE: u64 = 2 * 1024 * 1024 * 1024; // 2 GB global limit

pub async fn restore_workspace(State(state): State<Arc<AppState>>, bytes: Bytes) -> Result<impl IntoResponse, StatusCode> {
    // Acquire exclusive lock: waits for in-flight requests, blocks new ones
    let _write_lock = state.restore_lock.write().await;
    
    let result = restore_workspace_inner(state.clone(), bytes).await;
    
    match result {
        Ok(res) => Ok(Json(res)),
        Err(e) => {
            eprintln!("Restore failed: {}", e);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

async fn restore_workspace_inner(state: Arc<AppState>, bytes: Bytes) -> Result<serde_json::Value, String> {
    let pool = state.db_pool.as_ref().ok_or("No DB pool".to_string())?;
    
    // First, determine current backend schema version
    let mut current_db_version: i64 = 0;
    {
        let client = pool.get().await.map_err(|e| e.to_string())?;
        let row = client.query_one("SELECT COALESCE(MAX(version), 0)::bigint FROM excalidraw.schema_migrations", &[]).await;
        if let Ok(row) = row {
            current_db_version = row.get(0);
        }
    }

    let backups_dir = PathBuf::from("./data/backups");
    if !backups_dir.exists() {
        std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    }
    
    let temp_zip_filename = format!("temp_restore_{}.zip", Uuid::new_v4());
    let temp_zip_path = backups_dir.join(&temp_zip_filename);
    
    // Save bytes to disk
    {
        let mut file = File::create(&temp_zip_path).map_err(|e| format!("Failed to save temp zip: {}", e))?;
        file.write_all(&bytes).map_err(|e| format!("Failed to write temp zip: {}", e))?;
    }
    
    let staging_dir = PathBuf::from(format!("./data/.restore_staging_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&staging_dir).map_err(|e| e.to_string())?;
    
    let staging_dir_clone = staging_dir.clone();
    let temp_zip_path_clone = temp_zip_path.clone();
    
    let validation_result = tokio::task::spawn_blocking(move || -> Result<(Value, Value), String> {
        let file = File::open(&temp_zip_path_clone).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        
        let mut global_extracted_size: u64 = 0;

        let manifest_str = read_zip_file_with_limit(&mut archive, "manifest.json", MAX_MANIFEST_SIZE)?;
        global_extracted_size += manifest_str.len() as u64;
        
        let database_str = read_zip_file_with_limit(&mut archive, "database.json", MAX_DATABASE_SIZE)?;
        global_extracted_size += database_str.len() as u64;
        
        let manifest: Value = serde_json::from_str(&manifest_str).map_err(|e| format!("Invalid manifest: {}", e))?;
        let database: Value = serde_json::from_str(&database_str).map_err(|e| format!("Invalid database: {}", e))?;
        
        if manifest.get("version").and_then(|v| v.as_str()) != Some("1.0") {
            return Err("Incompatible manifest version".to_string());
        }
        
        // Schema compatibility check
        let db_migrations = database.get("schema_migrations").and_then(|v| v.as_array()).ok_or("No schema_migrations in backup")?;
        let mut backup_max_version = 0;
        for m in db_migrations {
            let v = m.get("version").and_then(|v| v.as_i64()).unwrap_or(0);
            if v > backup_max_version { backup_max_version = v; }
        }
        
        if backup_max_version != current_db_version {
            return Err(format!("Backup schema version ({}) must exactly match current backend version ({}) to avoid DDL inconsistencies", backup_max_version, current_db_version));
        }
        
        let assets_val = database.get("assets").ok_or("No assets table in database.json")?;
        let assets_arr = assets_val.as_array().ok_or("Assets is not array")?;
        
        for asset in assets_arr {
            let expected_hash = asset.get("hash").and_then(|h| h.as_str()).ok_or("Asset missing hash")?;
            let expected_size = asset.get("size_bytes").and_then(|s| s.as_i64()).unwrap_or(0);
            
            if expected_size < 0 || expected_size as u64 > MAX_UNCOMPRESSED_ASSET_SIZE {
                return Err(format!("Asset {} claims size {} which is out of bounds", expected_hash, expected_size));
            }
            
            let zip_asset_path = format!("assets/{}.bin", expected_hash);
            let mut zip_file = archive.by_name(&zip_asset_path).map_err(|_| format!("Asset missing in ZIP: {}", expected_hash))?;
            
            let staging_file_path = staging_dir_clone.join(format!("{}.bin", expected_hash));
            let mut staging_file = File::create(&staging_file_path).map_err(|e| e.to_string())?;
            
            let mut hasher = Sha256::new();
            let mut asset_extracted_size: u64 = 0;
            let mut chunk = vec![0u8; 8192];
            
            loop {
                let n = zip_file.read(&mut chunk).map_err(|e| e.to_string())?;
                if n == 0 { break; }
                asset_extracted_size += n as u64;
                global_extracted_size += n as u64;
                
                if asset_extracted_size > MAX_UNCOMPRESSED_ASSET_SIZE {
                    drop(staging_file);
                    let _ = std::fs::remove_file(&staging_file_path);
                    return Err(format!("Asset {} exceeds max size during extraction (Zip Bomb protection)", expected_hash));
                }
                
                if global_extracted_size > MAX_TOTAL_UNCOMPRESSED_SIZE {
                    drop(staging_file);
                    let _ = std::fs::remove_file(&staging_file_path);
                    return Err("Restore exceeds global max uncompressed size (Zip Bomb protection)".to_string());
                }
                
                hasher.update(&chunk[..n]);
                staging_file.write_all(&chunk[..n]).map_err(|e| e.to_string())?;
            }
            
            if asset_extracted_size != expected_size as u64 {
                drop(staging_file);
                let _ = std::fs::remove_file(&staging_file_path);
                return Err(format!("Size mismatch for asset: {}", expected_hash));
            }
            
            let calculated_hash = hex::encode(hasher.finalize());
            if calculated_hash != expected_hash {
                drop(staging_file);
                let _ = std::fs::remove_file(&staging_file_path);
                return Err(format!("Hash mismatch for asset: {}", expected_hash));
            }
        }
        
        Ok((manifest, database))
    }).await.map_err(|_| "Tokio spawn error")?;
    
    let _ = std::fs::remove_file(&temp_zip_path);
    let (_manifest, database) = validation_result?;
    
    // Safety backup of current workspace
    let backup_res = crate::backup::create_backup(pool).await;
    if backup_res.is_err() {
        let _ = std::fs::remove_dir_all(&staging_dir);
        return Err(format!("Safety backup failed: {}", backup_res.err().unwrap()));
    }
    
    // Prepare CAS (Move from staging to assets)
    let assets_dir = crate::assets::get_assets_dir();
    let staged_files = std::fs::read_dir(&staging_dir).map_err(|e| e.to_string())?;
    for entry in staged_files {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_file() {
                let filename = path.file_name().unwrap();
                let dest = assets_dir.join(filename);
                if !dest.exists() {
                    let _ = std::fs::rename(path, dest);
                }
            }
        }
    }
    
    let _ = std::fs::remove_dir_all(&staging_dir);
    
    let mut client = pool.get().await.map_err(|e| e.to_string())?;
    let transaction = client.transaction().await.map_err(|e| e.to_string())?;
    
    transaction.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE", &[]).await.map_err(|e| e.to_string())?;
    
    let tables = vec![
        // "schema_migrations" is intentionally excluded so we don't tamper with DDL tracking
        "pointers",
        "boards",
        "folders",
        "assets",
        "system_config",
    ];
    for table in &tables {
        let query = format!("DELETE FROM excalidraw.{}", table);
        transaction.execute(&query, &[]).await.map_err(|e| format!("Failed to delete {}: {}", table, e))?;
    }
    
    let insert_tables = vec![
        // "schema_migrations" is intentionally excluded
        "system_config",
        "assets",
        "folders",
        "boards",
        "pointers",
    ];
    
    for table in &insert_tables {
        if let Some(arr) = database.get(table.to_string()).and_then(|v| v.as_array()) {
            if !arr.is_empty() {
                let json_data = serde_json::to_string(arr).unwrap();
                let query = format!("INSERT INTO excalidraw.{} SELECT * FROM json_populate_recordset(null::excalidraw.{}, $1::json)", table, table);
                transaction.execute(&query, &[&json_data]).await.map_err(|e| format!("Failed to insert {}: {}", table, e))?;
            }
        }
    }
    
    transaction.commit().await.map_err(|e| e.to_string())?;
    
    let boards_count = database.get("boards").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let folders_count = database.get("folders").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    let assets_count = database.get("assets").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
    
    Ok(json!({
        "ok": true,
        "message": "Workspace restored successfully",
        "safety_backup": backup_res.unwrap(),
        "boards_count": boards_count,
        "folders_count": folders_count,
        "assets_count": assets_count
    }))
}

fn read_zip_file_with_limit(archive: &mut ZipArchive<File>, filename: &str, limit_bytes: u64) -> Result<String, String> {
    let mut file = archive.by_name(filename).map_err(|_| format!("{} not found in zip", filename))?;
    let mut contents = String::new();
    
    // We use a custom loop to enforce limits since `take` creates a new Read adapter
    // and we still want to know if there's more data left
    let mut total_read: u64 = 0;
    let mut chunk = vec![0u8; 8192];
    let mut vec_contents = Vec::new();
    
    loop {
        let n = file.read(&mut chunk).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        total_read += n as u64;
        if total_read > limit_bytes {
            return Err(format!("File {} exceeds size limit of {} bytes", filename, limit_bytes));
        }
        vec_contents.extend_from_slice(&chunk[..n]);
    }
    
    contents = String::from_utf8(vec_contents).map_err(|_| format!("File {} is not valid UTF-8", filename))?;
    Ok(contents)
}
