use axum::{
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc, TimeZone, NaiveDateTime};

#[derive(serde::Serialize)]
pub struct RetentionStats {
    pub total_scanned: usize,
    pub valid_backups_found: usize,
    pub final_backups_deleted: usize,
    pub temp_backups_deleted: usize,
    pub ignored_files: usize,
    pub errors: usize,
}

#[derive(Debug)]
struct BackupCandidate {
    path: PathBuf,
    name: String,
    timestamp: DateTime<Utc>,
    is_valid: bool,
}

pub async fn retention_endpoint() -> Result<impl IntoResponse, StatusCode> {
    match run_retention().await {
        Ok(stats) => Ok(Json(json!({ "status": "success", "stats": stats }))),
        Err(err) => {
            eprintln!("Backup retention error: {}", err);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

pub async fn run_retention() -> Result<RetentionStats, String> {
    let mut stats = RetentionStats {
        total_scanned: 0,
        valid_backups_found: 0,
        final_backups_deleted: 0,
        temp_backups_deleted: 0,
        ignored_files: 0,
        errors: 0,
    };

    let backups_dir = PathBuf::from("./data/backups");
    if !backups_dir.exists() {
        return Ok(stats); // Nothing to do
    }

    let entries = fs::read_dir(&backups_dir).map_err(|e| format!("Failed to read backups dir: {}", e))?;
    
    let mut candidates: Vec<BackupCandidate> = Vec::new();
    let now = Utc::now();
    let cutoff_24h = now - chrono::Duration::hours(24);

    for entry_res in entries {
        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => {
                stats.errors += 1;
                continue;
            }
        };

        stats.total_scanned += 1;
        let path = entry.path();
        
        let meta = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => {
                stats.errors += 1;
                continue;
            }
        };

        if !meta.is_file() {
            stats.ignored_files += 1;
            continue;
        }

        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => {
                stats.ignored_files += 1;
                continue;
            }
        };

        // Rule 3: Temp Backup Cleanup ( > 24h by mtime )
        if name.starts_with("temp_backup_") && name.ends_with(".zip") {
            if let Ok(mtime) = meta.modified() {
                let mtime_dt = DateTime::<Utc>::from(mtime);
                if mtime_dt < cutoff_24h {
                    if fs::remove_file(&path).is_ok() {
                        stats.temp_backups_deleted += 1;
                    } else {
                        stats.errors += 1;
                    }
                }
            } else {
                // Uncertainty -> Fail safe
                stats.ignored_files += 1;
            }
            continue;
        }

        // Parse final backup
        if let Some(timestamp) = parse_backup_name(&name) {
            let is_valid = is_valid_backup(&path);
            candidates.push(BackupCandidate {
                path,
                name,
                timestamp,
                is_valid,
            });
        } else {
            stats.ignored_files += 1;
        }
    }

    // Sort descending by timestamp (newest first). 
    // If timestamps are identical, sort by name descending as tie-breaker.
    candidates.sort_by(|a, b| {
        b.timestamp.cmp(&a.timestamp).then_with(|| b.name.cmp(&a.name))
    });

    let mut valid_count = 0;
    let mut t_quorum: Option<DateTime<Utc>> = None;

    for cand in &candidates {
        if cand.is_valid {
            valid_count += 1;
            if valid_count == 5 {
                t_quorum = Some(cand.timestamp);
            }
        }
    }

    stats.valid_backups_found = valid_count;

    let t_7days = now - chrono::Duration::days(7);
    
    // T_cutoff = min(T_quorum, T_7days)
    // If we didn't reach 5 valid backups, T_quorum is essentially -Infinity, so T_cutoff is -Infinity
    let t_cutoff = match t_quorum {
        Some(t_q) => std::cmp::min(t_q, t_7days),
        None => return Ok(stats), // Not enough valid backups, abort sweep
    };

    // Sweep pass
    for cand in candidates {
        // Strict strictly older condition
        if cand.timestamp < t_cutoff {
            if fs::remove_file(&cand.path).is_ok() {
                stats.final_backups_deleted += 1;
            } else {
                stats.errors += 1;
            }
        }
    }

    Ok(stats)
}

fn parse_backup_name(name: &str) -> Option<DateTime<Utc>> {
    if !name.starts_with("backup_excalidraw_") || !name.ends_with(".zip") { return None; }

    let inner = &name[18..name.len()-4];
    if inner.len() < 15 { return None; }

    let date_str = &inner[0..8];
    let underscore = &inner[8..9];
    let time_str = &inner[9..15];

    if underscore != "_" { return None; }

    // Backward and forward compatibility:
    // If it's longer than 15 chars, it must be the new format which separates the suffix with an underscore.
    if inner.len() > 15 && !inner[15..].starts_with('_') { return None; }

    let parse_str = format!("{} {}", date_str, time_str);
    if let Ok(naive) = NaiveDateTime::parse_from_str(&parse_str, "%Y%m%d %H%M%S") {
        return Some(Utc.from_utc_datetime(&naive));
    }
    None
}

fn is_valid_backup(path: &Path) -> bool {
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() == 0 || meta.len() > 10 * 1024 * 1024 * 1024 { 
            return false; // Reject empty or >10GB
        }
    }
    
    if let Ok(file) = std::fs::File::open(path) {
        if let Ok(mut archive) = zip::ZipArchive::new(file) {
            if archive.len() > 100_000 { return false; } // Reject >100k entries
            
            if archive.by_name("manifest.json").is_ok() && archive.by_name("database.json").is_ok() {
                return true;
            }
        }
    }
    false
}
