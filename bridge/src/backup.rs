use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::fs::File;
use std::io::{Write, Read};
use zip::write::SimpleFileOptions;
use chrono::Utc;
use uuid::Uuid;
use sha2::{Sha256, Digest};
use std::sync::Arc;
use crate::AppState;

pub async fn backup_workspace(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let mut client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let transaction = client.transaction().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // REPEATABLE READ snapshot
    transaction.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ", &[]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let tables = vec![
        "schema_migrations",
        "system_config",
        "folders",
        "boards",
        "pointers",
        "assets"
    ];

    let mut database_json = serde_json::Map::new();

    for table in &tables {
        let query = format!("SELECT COALESCE(json_agg(t), '[]'::json) FROM excalidraw.{} t", table);
        let row = transaction.query_one(&query, &[]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let data: Value = row.get(0);
        database_json.insert(table.to_string(), data);
    }

    // Extract assets list specifically
    let assets_value = database_json.get("assets").unwrap().clone();
    let assets_list = assets_value.as_array().unwrap().clone();

    // End transaction
    transaction.rollback().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let db_json_val = Value::Object(database_json);
    let db_json_str = serde_json::to_string(&db_json_val).unwrap();

    // Generate zip in blocking task
    let zip_filename = format!("backup_excalidraw_{}.zip", Utc::now().format("%Y%m%d_%H%M%S"));
    let temp_filename = format!("temp_backup_{}.zip", Uuid::new_v4());
    
    let backups_dir = PathBuf::from("./data/backups");
    if !backups_dir.exists() {
        std::fs::create_dir_all(&backups_dir).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    
    let temp_path = backups_dir.join(&temp_filename);
    let final_path = backups_dir.join(&zip_filename);
    
    let assets_dir = crate::assets::get_assets_dir();

    let temp_path_clone = temp_path.clone();
    let final_path_clone = final_path.clone();
    
    let zip_result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = File::create(&temp_path_clone).map_err(|e| format!("Failed creating temp zip: {}", e))?;
        let mut zip_writer = zip::ZipWriter::new(file);
        
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        
        // Write database.json
        zip_writer.start_file("database.json", options.clone()).map_err(|e| e.to_string())?;
        zip_writer.write_all(db_json_str.as_bytes()).map_err(|e| e.to_string())?;
        
        let mut manifest_assets = serde_json::Map::new();
        
        // Write physical assets
        for asset in assets_list {
            let hash = asset.get("hash").unwrap().as_str().unwrap();
            let relative_path = asset.get("relative_path").unwrap().as_str().unwrap();
            let size_bytes = asset.get("size_bytes").unwrap().as_i64().unwrap();
            let mime_type = asset.get("mime_type").unwrap().as_str().unwrap();
            
            let physical_path = assets_dir.join(relative_path);
            if !physical_path.exists() {
                return Err(format!("Asset not found physically: {}", relative_path));
            }
            
            let mut asset_file = File::open(&physical_path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            asset_file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            
            let mut hasher = Sha256::new();
            hasher.update(&buffer);
            let calculated_hash = hex::encode(hasher.finalize());
            
            if calculated_hash != hash {
                return Err(format!("Asset hash mismatch: expected {}, got {}", hash, calculated_hash));
            }
            
            let zip_asset_path = format!("assets/{}", relative_path);
            zip_writer.start_file(&zip_asset_path, options.clone()).map_err(|e| e.to_string())?;
            zip_writer.write_all(&buffer).map_err(|e| e.to_string())?;
            
            manifest_assets.insert(hash.to_string(), json!({
                "path": zip_asset_path,
                "mime_type": mime_type,
                "size_bytes": size_bytes
            }));
        }
        
        // Write manifest.json
        let manifest = json!({
            "version": "1.0",
            "created_at": Utc::now().to_rfc3339(),
            "database": {
                "file": "database.json"
            },
            "assets_count": manifest_assets.len(),
            "assets": manifest_assets
        });
        
        zip_writer.start_file("manifest.json", options).map_err(|e| e.to_string())?;
        zip_writer.write_all(serde_json::to_string_pretty(&manifest).unwrap().as_bytes()).map_err(|e| e.to_string())?;
        
        zip_writer.finish().map_err(|e| e.to_string())?;
        
        std::fs::rename(&temp_path_clone, &final_path_clone).map_err(|e| e.to_string())?;
        
        Ok(())
    }).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match zip_result {
        Ok(_) => Ok(Json(json!({ "ok": true, "filename": zip_filename }))),
        Err(msg) => {
            let _ = std::fs::remove_file(&temp_path);
            eprintln!("Backup failed: {}", msg);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
