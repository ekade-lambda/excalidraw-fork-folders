use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use deadpool_postgres::Pool;
use tokio::sync::RwLock;

use crate::assets::get_assets_dir;

use serde::Serialize;
use axum::{extract::State, response::Json, http::StatusCode};
use crate::AppState;

#[derive(Serialize)]
pub struct GcStats {
    pub assets_scanned: usize,
    pub assets_deleted: usize,
    pub staging_dirs_deleted: usize,
    pub temp_zips_deleted: usize,
}

#[derive(Serialize)]
pub struct GcResponse {
    pub status: String,
    pub stats: Option<GcStats>,
    pub error: Option<String>,
}

pub async fn gc_endpoint(State(state): State<Arc<AppState>>) -> Result<Json<GcResponse>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    
    match run_gc(pool, &state.restore_lock).await {
        Ok(stats) => Ok(Json(GcResponse {
            status: "success".to_string(),
            stats: Some(stats),
            error: None,
        })),
        Err(e) => Ok(Json(GcResponse {
            status: "error".to_string(),
            stats: None,
            error: Some(e.to_string()),
        })),
    }
}

// 24 hours in seconds
const GRACE_PERIOD_SECS: u64 = 24 * 60 * 60;

fn is_valid_cas_filename(name: &str) -> bool {
    if name.len() != 68 || !name.ends_with(".bin") {
        return false;
    }
    let hex_part = &name[..64];
    hex_part.chars().all(|c| c.is_ascii_hexdigit())
}

async fn get_live_hashes(pool: &Pool) -> Result<HashSet<String>, String> {
    let client = pool.get().await.map_err(|e| format!("DB Error: {}", e))?;
    let mut live_hashes = HashSet::new();

    // 1. Hashes from files object
    let rows_files = client.query("SELECT jsonb_object_keys(files) AS hash FROM excalidraw.boards WHERE deleted_at IS NULL", &[])
        .await.map_err(|e| format!("Query files error: {}", e))?;
    for row in rows_files {
        let hash: String = row.get("hash");
        live_hashes.insert(hash);
    }

    // 2. Hashes from elements array
    let rows_elements = client.query("SELECT DISTINCT elem->>'fileId' AS hash FROM excalidraw.boards b, jsonb_array_elements(b.elements) AS elem WHERE elem->>'fileId' IS NOT NULL AND b.deleted_at IS NULL", &[])
        .await.map_err(|e| format!("Query elements error: {}", e))?;
    for row in rows_elements {
        let hash: String = row.get("hash");
        live_hashes.insert(hash);
    }

    Ok(live_hashes)
}

fn is_older_than_grace_period(metadata: &fs::Metadata) -> bool {
    if let Ok(mtime) = metadata.modified() {
        if let Ok(elapsed) = mtime.elapsed() {
            return elapsed.as_secs() > GRACE_PERIOD_SECS;
        }
    }
    false
}

pub async fn run_gc(pool: &Pool, restore_lock: &Arc<RwLock<()>>) -> Result<GcStats, String> {
    let mut stats = GcStats {
        assets_scanned: 0,
        assets_deleted: 0,
        staging_dirs_deleted: 0,
        temp_zips_deleted: 0,
    };

    // ==========================================
    // STAGE A: MARK / SCAN (No Write Lock)
    // ==========================================
    
    // Scan temp files / staging dirs
    let data_dir = Path::new("data"); // Staging dirs are placed in data/
    if data_dir.exists() && data_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(data_dir) {
            for entry in entries.filter_map(Result::ok) {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(".restore_staging_") {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_dir() && is_older_than_grace_period(&meta) {
                            if fs::remove_dir_all(entry.path()).is_ok() {
                                stats.staging_dirs_deleted += 1;
                            }
                        }
                    }
                } else if name.starts_with("temp_restore_") && name.ends_with(".zip") {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() && is_older_than_grace_period(&meta) {
                            if fs::remove_file(entry.path()).is_ok() {
                                stats.temp_zips_deleted += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Scan CAS assets
    let initial_live_hashes = get_live_hashes(pool).await?;
    let assets_dir = get_assets_dir();
    
    let mut candidate_assets: Vec<PathBuf> = Vec::new();

    if assets_dir.exists() && assets_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&assets_dir) {
            for entry in entries.filter_map(Result::ok) {
                stats.assets_scanned += 1;
                
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if !is_valid_cas_filename(&name) {
                    continue; // Skip invalid filenames
                }

                // File metadata (use symlink_metadata to detect symlinks)
                if let Ok(meta) = fs::symlink_metadata(&path) {
                    if !meta.is_file() {
                        continue; // Skip symlinks or dirs
                    }
                    if is_older_than_grace_period(&meta) {
                        let hash = &name[..64];
                        if !initial_live_hashes.contains(hash) {
                            candidate_assets.push(path);
                        }
                    }
                }
            }
        }
    }

    if candidate_assets.is_empty() {
        return Ok(stats);
    }

    // ==========================================
    // STAGE B: SWEEP (With Write Lock)
    // ==========================================
    
    // Acquire Write Lock to prevent concurrent Save/Restore
    let _lock = restore_lock.write().await;

    // Re-verify live hashes under lock
    let final_live_hashes = get_live_hashes(pool).await?;

    for path in candidate_assets {
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        let hash = &name[..64];

        // 1. Check if it became live again
        if final_live_hashes.contains(hash) {
            continue;
        }

        // 2. Re-verify metadata directly before unlink (failsafe)
        if let Ok(meta) = fs::symlink_metadata(&path) {
            if !meta.is_file() {
                continue;
            }
            if !is_older_than_grace_period(&meta) {
                continue; // Someone touched it recently
            }
            
            // Delete!
            if fs::remove_file(&path).is_ok() {
                stats.assets_deleted += 1;
            }
        }
    }

    Ok(stats)
}
