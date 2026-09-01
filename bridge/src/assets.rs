use std::path::PathBuf;
use std::fs;
use sha2::{Sha256, Digest};
use base64::prelude::*;
use deadpool_postgres::{Client, Transaction};
use serde_json::Value;

pub fn get_assets_dir() -> PathBuf {
    std::env::var("ASSETS_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/assets"))
}

pub async fn extract_and_save_assets(files: &mut Value, tx: &Transaction<'_>) -> Result<(), String> {
    let assets_dir = get_assets_dir();
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    }

    let files_map = match files.as_object_mut() {
        Some(m) => m,
        None => return Ok(()),
    };

    for (file_id, file_data) in files_map.iter_mut() {
        let file_data_obj = match file_data.as_object_mut() {
            Some(o) => o,
            None => continue,
        };

        if let Some(data_url_val) = file_data_obj.get("dataURL") {
            if let Some(data_url) = data_url_val.as_str() {
                // If it's a valid base64 data URL
                if let Some(idx) = data_url.find("base64,") {
                    let base64_data = &data_url[idx + 7..];
                    let decoded = BASE64_STANDARD.decode(base64_data).map_err(|e| e.to_string())?;
                    
                    let mut hasher = Sha256::new();
                    hasher.update(&decoded);
                    let hash_bytes = hasher.finalize();
                    let hash_hex = hex::encode(hash_bytes);

                    // Name physical file based purely on hash
                    let relative_path = format!("{}.bin", hash_hex);
                    let physical_path = assets_dir.join(&relative_path);

                    let decoded_clone = decoded.clone();
                    let physical_path_clone = physical_path.clone();
                    let hash_hex_clone = hash_hex.clone();
                    let assets_dir_clone = assets_dir.clone();

                    // Escribir CAS con Idempotencia y Verificación post-escritura
                    tokio::task::spawn_blocking(move || -> Result<(), String> {
                        if physical_path_clone.exists() {
                            // Idempotencia: Verificar que el archivo existente no esté corrupto
                            let existing_bytes = fs::read(&physical_path_clone).map_err(|e| format!("Failed to read existing CAS file: {}", e))?;
                            let mut verify_hasher = Sha256::new();
                            verify_hasher.update(&existing_bytes);
                            if hex::encode(verify_hasher.finalize()) != hash_hex_clone {
                                return Err("Existing CAS file is corrupt (hash mismatch)".to_string());
                            }
                        } else {
                            // Escritura segura atómica
                            let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
                            let temp_name = format!("temp_{}_{}.bin", hash_hex_clone, timestamp);
                            let temp_path = assets_dir_clone.join(&temp_name);
                            
                            fs::write(&temp_path, &decoded_clone).map_err(|e| format!("Write failed: {}", e))?;
                            
                            match fs::rename(&temp_path, &physical_path_clone) {
                                Ok(_) => (),
                                Err(e) => {
                                    if physical_path_clone.exists() {
                                        let _ = fs::remove_file(&temp_path);
                                    } else {
                                        return Err(format!("Rename failed: {}", e));
                                    }
                                }
                            }
                            
                            // Verificación estricta post-escritura
                            if !physical_path_clone.exists() {
                                return Err("File missing immediately after rename".to_string());
                            }
                            let written_bytes = fs::read(&physical_path_clone).map_err(|e| format!("Verify read failed: {}", e))?;
                            let mut verify_hasher = Sha256::new();
                            verify_hasher.update(&written_bytes);
                            if hex::encode(verify_hasher.finalize()) != hash_hex_clone {
                                return Err("Hash mismatch after write operation".to_string());
                            }
                        }
                        Ok(())
                    }).await.map_err(|e| e.to_string())??;

                    // UPSERT into excalidraw.assets
                    let mime_type = file_data_obj.get("mimeType").and_then(|v| v.as_str()).unwrap_or("application/octet-stream").to_string();
                    let size_bytes = decoded.len() as i64;
                    
                    tx.execute(
                        "INSERT INTO excalidraw.assets (id, hash, mime_type, size_bytes, relative_path)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (id) DO UPDATE SET 
                             hash = EXCLUDED.hash,
                             mime_type = EXCLUDED.mime_type,
                             size_bytes = EXCLUDED.size_bytes,
                             relative_path = EXCLUDED.relative_path",
                        &[&file_id, &hash_hex, &mime_type, &size_bytes, &relative_path]
                    ).await.map_err(|e| format!("DB Error: {}", e))?;

                    // Remove dataURL from the JSON so it's not saved in boards
                    file_data_obj.remove("dataURL");
                }
            }
        }
    }

    Ok(())
}

pub async fn hydrate_assets(files: &mut Value, client: &Client) -> Result<(), String> {
    let assets_dir = get_assets_dir();

    let files_map = match files.as_object_mut() {
        Some(m) => m,
        None => return Ok(()),
    };

    for (file_id, file_data) in files_map.iter_mut() {
        let file_data_obj = match file_data.as_object_mut() {
            Some(o) => o,
            None => continue,
        };

        // If dataURL is already present (Phase 5 legacy / unmigrated), skip hydration
        if file_data_obj.contains_key("dataURL") {
            continue;
        }

        // Fetch from DB
        let row_opt = client.query_opt(
            "SELECT hash, mime_type, relative_path FROM excalidraw.assets WHERE id = $1",
            &[&file_id]
        ).await.map_err(|e| e.to_string())?;

        let row = match row_opt {
            Some(r) => r,
            None => return Err(format!("Missing Asset Metadata: FileId {} exists in board but not in excalidraw.assets", file_id)),
        };

        let hash_hex: String = row.get("hash");
        let mime_type: String = row.get("mime_type");
        let relative_path: String = row.get("relative_path");

        // PREVENT PATH TRAVERSAL (Even though relative_path is generated by us, enforce it)
        if relative_path.contains("..") || relative_path.contains("/") || relative_path.contains("\\") {
            return Err(format!("Security Error: Invalid relative_path for FileId {}", file_id));
        }

        let physical_path = assets_dir.join(&relative_path);
        let physical_path_clone = physical_path.clone();
        let hash_hex_clone = hash_hex.clone();
        
        let file_bytes = tokio::task::spawn_blocking(move || {
            let bytes = fs::read(&physical_path_clone).map_err(|_| format!("Missing Physical File: Asset exists in DB but file missing at {:?}", physical_path_clone))?;
            
            // Integrity check
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let calculated_hash = hex::encode(hasher.finalize());
            if calculated_hash != hash_hex_clone {
                return Err(format!("Integrity Error: File hash mismatch for {:?}. Expected {}, got {}", physical_path_clone, hash_hex_clone, calculated_hash));
            }
            Ok(bytes)
        }).await.map_err(|e| e.to_string())??;

        let base64_data = BASE64_STANDARD.encode(&file_bytes);
        let data_url = format!("data:{};base64,{}", mime_type, base64_data);

        file_data_obj.insert("dataURL".to_string(), serde_json::Value::String(data_url));
    }

    Ok(())
}
