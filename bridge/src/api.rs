use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use deadpool_postgres::Pool;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::AppState;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IconDto {
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    pub id: String,
    pub name: String,
    pub icon: Option<IconDto>,
    pub parent_id: Option<String>,
    pub board_id: String,
    pub created_at: f64,
    pub updated_at: f64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FolderPointerDto {
    pub id: String,
    pub target_folder_id: String,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub created_at: f64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardMetadataDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "rootFolderId")]
    pub root_folder_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardsGraphDto {
    pub schema_version: i32,
    pub root_folder_id: String,
    pub folders: HashMap<String, FolderDto>,
    pub pointers: HashMap<String, FolderPointerDto>,
    pub boards: HashMap<String, BoardMetadataDto>,
    pub last_open_board_id: Option<String>,
    pub folder_counter: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardDataDto {
    pub schema_version: i32,
    pub board_id: String,
    pub elements: Vec<Value>,
    pub files: Value,
    pub viewport: Option<Value>,
    pub name: String,
    pub updated_at: i64,
    pub app_state: Option<Value>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CloneBoardsRequest {
    pub old_to_new_board_map: HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TransactionRequest {
    pub new_graph: BoardsGraphDto,
    pub deleted_boards: Vec<String>,
}

// ============================================================================
// HANDLERS
// ============================================================================

pub async fn get_graph(State(state): State<Arc<AppState>>) -> Result<Json<Option<BoardsGraphDto>>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 1. Read base config
    let config_row = client.query_opt("SELECT value FROM excalidraw.system_config WHERE id = 'graph_config'", &[]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let config_val: Value = match config_row {
        Some(row) => row.get(0),
        None => return Ok(Json(None)), // No graph initialized yet
    };

    let schema_version = config_val.get("schemaVersion").and_then(|v| v.as_i64()).unwrap_or(1) as i32;
    let root_folder_id = config_val.get("rootFolderId").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let last_open_board_id = config_val.get("lastOpenBoardId").and_then(|v| v.as_str()).map(|s| s.to_string());
    let folder_counter = config_val.get("folderCounter").and_then(|v| v.as_i64()).map(|n| n as i32);

    // 2. Read folders
    let mut folders = HashMap::new();
    let folder_rows = client.query("SELECT f.id, f.name, f.parent_id, f.created_at, f.updated_at, f.icon, b.id as board_id FROM excalidraw.folders f LEFT JOIN excalidraw.boards b ON b.folder_id = f.id WHERE f.deleted_at IS NULL", &[]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    for row in folder_rows {
        let id: String = row.get("id");
        let name: String = row.get("name");
        let parent_id: Option<String> = row.get("parent_id");
        let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");
        let updated_at: chrono::DateTime<chrono::Utc> = row.get("updated_at");
        let icon_val: Option<Value> = row.get("icon");
        let board_id: Option<String> = row.get("board_id");
        
        // El board_id es requerido por el modelo frontend
        let b_id = board_id.unwrap_or_else(|| "".to_string());

        folders.insert(id.clone(), FolderDto {
            id,
            name,
            icon: icon_val.and_then(|v| serde_json::from_value(v).ok()),
            parent_id,
            board_id: b_id,
            created_at: created_at.timestamp_millis() as f64,
            updated_at: updated_at.timestamp_millis() as f64,
        });
    }

    // 3. Read pointers
    let mut pointers = HashMap::new();
    let pointer_rows = client.query("SELECT id, target_folder_id, name, icon, created_at FROM excalidraw.pointers", &[]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    for row in pointer_rows {
        let id: String = row.get("id");
        let target_folder_id: String = row.get("target_folder_id");
        let name: Option<String> = row.get("name");
        let icon: Option<String> = row.get("icon");
        let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");

        pointers.insert(id.clone(), FolderPointerDto {
            id,
            target_folder_id,
            name,
            icon,
            created_at: created_at.timestamp_millis() as f64,
        });
    }

    // 4. Read board metadata
    let mut boards = HashMap::new();
    let board_rows = client.query("SELECT b.id, f.name, b.folder_id, b.created_at, b.updated_at FROM excalidraw.boards b LEFT JOIN excalidraw.folders f ON b.folder_id = f.id WHERE b.deleted_at IS NULL", &[]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    for row in board_rows {
        let id: String = row.get("id");
        let name_opt: Option<String> = row.get("name");
        let folder_id: Option<String> = row.get("folder_id");
        let created_at: chrono::DateTime<chrono::Utc> = row.get("created_at");
        let updated_at: chrono::DateTime<chrono::Utc> = row.get("updated_at");

        boards.insert(id.clone(), BoardMetadataDto {
            id,
            name: name_opt.unwrap_or_else(|| "Untitled".to_string()),
            root_folder_id: folder_id.unwrap_or_else(|| "".to_string()),
            created_at: created_at.timestamp_millis(),
            updated_at: updated_at.timestamp_millis(),
        });
    }

    let graph = BoardsGraphDto {
        schema_version,
        root_folder_id,
        folders,
        pointers,
        boards,
        last_open_board_id,
        folder_counter,
    };

    Ok(Json(Some(graph)))
}

pub async fn post_graph(State(state): State<Arc<AppState>>, Json(graph): Json<BoardsGraphDto>) -> Result<Json<()>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let mut client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let transaction = client.transaction().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let config_val = json!(graph);
    transaction.execute(
        "INSERT INTO excalidraw.system_config (id, value) VALUES ('graph_config', $1) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
        &[&config_val]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut folder_list: Vec<(&String, &FolderDto)> = graph.folders.iter().collect();
    let mut depths: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    
    let mut changed = true;
    while changed && depths.len() < folder_list.len() {
        changed = false;
        for (id, folder) in &folder_list {
            if depths.contains_key(*id) { continue; }
            match &folder.parent_id {
                None => {
                    depths.insert(id.to_string(), 0);
                    changed = true;
                },
                Some(parent_id) => {
                    if let Some(&parent_depth) = depths.get(parent_id) {
                        depths.insert(id.to_string(), parent_depth + 1);
                        changed = true;
                    }
                }
            }
        }
    }
    
    for (id, _) in &folder_list {
        if !depths.contains_key(*id) {
            depths.insert(id.to_string(), 9999);
        }
    }
    
    folder_list.sort_by_key(|(id, _)| depths.get(*id).unwrap_or(&0));

    for (id, folder) in folder_list {
        let icon_val = folder.icon.as_ref().map(|i| json!(i));
        transaction.execute(
            "INSERT INTO excalidraw.folders (id, name, parent_id, icon) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, icon = EXCLUDED.icon",
            &[&id, &folder.name, &folder.parent_id, &icon_val]
        ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    for (id, pointer) in &graph.pointers {
        transaction.execute(
            "INSERT INTO excalidraw.pointers (id, target_folder_id, name, icon) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET target_folder_id = EXCLUDED.target_folder_id, name = EXCLUDED.name, icon = EXCLUDED.icon",
            &[&id, &pointer.target_folder_id, &pointer.name, &pointer.icon]
        ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    for (id, board) in &graph.boards {
        let f_id = if board.root_folder_id.is_empty() { None } else { Some(board.root_folder_id.clone()) };
        transaction.execute(
            "UPDATE excalidraw.boards SET folder_id = $1 WHERE id = $2",
            &[&f_id, &id]
        ).await.map_err(|e| { println!("Error in board: {:?}", e); StatusCode::INTERNAL_SERVER_ERROR })?;
    }

    transaction.commit().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(()))
}

pub async fn get_board(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<Option<BoardDataDto>>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let row_opt = client.query_opt(
        "SELECT b.elements, b.files, b.viewport, b.schema_version, f.name, b.updated_at, b.app_state FROM excalidraw.boards b LEFT JOIN excalidraw.folders f ON b.folder_id = f.id WHERE b.id = $1 AND b.deleted_at IS NULL",
        &[&id]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match row_opt {
        Some(row) => {
            let elements: Value = row.get("elements");
            let mut files: Value = row.get("files");
            let viewport: Option<Value> = row.get("viewport");
            let schema_version: i32 = row.get("schema_version");
            let name_opt: Option<String> = row.get("name");
            let updated_at: chrono::DateTime<chrono::Utc> = row.get("updated_at");
            let app_state: Option<Value> = row.get("app_state");

            // Hidratar assets
            if let Err(e) = crate::assets::hydrate_assets(&mut files, &client).await {
                eprintln!("Error hidratando assets para board {}: {}", id, e);
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }

            // We must convert elements from JSONB array back to Vec<Value>
            let elements_vec = elements.as_array().cloned().unwrap_or_default();

            Ok(Json(Some(BoardDataDto {
                schema_version,
                board_id: id,
                elements: elements_vec,
                files,
                viewport,
                name: name_opt.unwrap_or_else(|| "Untitled".to_string()),
                updated_at: updated_at.timestamp_millis(),
                app_state,
            })))
        }
        None => Ok(Json(None)),
    }
}

pub async fn post_board(State(state): State<Arc<AppState>>, Path(id): Path<String>, Json(mut board): Json<BoardDataDto>) -> Result<Json<()>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let mut client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    let tx = client.transaction().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Extraer y guardar assets al filesystem de manera atómica con la DB
    if let Err(e) = crate::assets::extract_and_save_assets(&mut board.files, &tx).await {
        eprintln!("Error procesando assets: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let elements_val = json!(board.elements);
    let app_state_val = board.app_state.unwrap_or_else(|| json!({}));

    // Convert milliseconds to DateTime<Utc>
    let updated_at = chrono::DateTime::from_timestamp_millis(board.updated_at).unwrap_or_else(chrono::Utc::now);

    tx.execute(
        "INSERT INTO excalidraw.boards (id, elements, files, viewport, schema_version, app_state, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET 
            elements = EXCLUDED.elements, 
            files = EXCLUDED.files, 
            viewport = EXCLUDED.viewport, 
            schema_version = EXCLUDED.schema_version,
            app_state = EXCLUDED.app_state,
            updated_at = EXCLUDED.updated_at",
        &[&id, &elements_val, &board.files, &board.viewport, &board.schema_version, &app_state_val, &updated_at]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tx.commit().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(()))
}

pub async fn delete_board(State(state): State<Arc<AppState>>, Path(id): Path<String>) -> Result<Json<()>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Soft delete physical board
    client.execute(
        "UPDATE excalidraw.boards SET deleted_at = NOW() WHERE id = $1",
        &[&id]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(()))
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeletePatchDto {
    pub deleted_folder_ids: Option<Vec<String>>,
    pub deleted_board_ids: Option<Vec<String>>,
    pub deleted_pointer_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyTransactionRequest {
    pub new_graph: BoardsGraphDto,
    pub patch: DeletePatchDto,
}

pub async fn apply_transaction(State(state): State<Arc<AppState>>, Json(req): Json<ApplyTransactionRequest>) -> Result<Json<()>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let mut client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let transaction = client.transaction().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // 1. Soft-delete requested entities
    if let Some(folders) = req.patch.deleted_folder_ids {
        for f_id in folders {
            transaction.execute("UPDATE excalidraw.folders SET deleted_at = NOW() WHERE id = $1", &[&f_id]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
    }
    if let Some(boards) = req.patch.deleted_board_ids {
        for b_id in boards {
            transaction.execute("UPDATE excalidraw.boards SET deleted_at = NOW() WHERE id = $1", &[&b_id]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
    }
    for p_id in req.patch.deleted_pointer_ids {
        transaction.execute("DELETE FROM excalidraw.pointers WHERE id = $1", &[&p_id]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    // 2. Save the new graph
    let config_val = json!(req.new_graph);
    transaction.execute(
        "INSERT INTO excalidraw.system_config (id, value) VALUES ('graph_config', $1) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value",
        &[&config_val]
    ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut folder_list: Vec<(&String, &FolderDto)> = req.new_graph.folders.iter().collect();
    let mut depths: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    
    let mut changed = true;
    while changed && depths.len() < folder_list.len() {
        changed = false;
        for (id, folder) in &folder_list {
            if depths.contains_key(*id) { continue; }
            match &folder.parent_id {
                None => {
                    depths.insert(id.to_string(), 0);
                    changed = true;
                },
                Some(parent_id) => {
                    if let Some(&parent_depth) = depths.get(parent_id) {
                        depths.insert(id.to_string(), parent_depth + 1);
                        changed = true;
                    }
                }
            }
        }
    }
    
    for (id, _) in &folder_list {
        if !depths.contains_key(*id) {
            depths.insert(id.to_string(), 9999);
        }
    }
    
    folder_list.sort_by_key(|(id, _)| depths.get(*id).unwrap_or(&0));

    for (id, folder) in folder_list {
        let icon_val = folder.icon.as_ref().map(|i| json!(i));
        transaction.execute(
            "INSERT INTO excalidraw.folders (id, name, parent_id, icon) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, icon = EXCLUDED.icon",
            &[&id, &folder.name, &folder.parent_id, &icon_val]
        ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    for (id, pointer) in &req.new_graph.pointers {
        transaction.execute(
            "INSERT INTO excalidraw.pointers (id, target_folder_id, name, icon) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET target_folder_id = EXCLUDED.target_folder_id, name = EXCLUDED.name, icon = EXCLUDED.icon",
            &[&id, &pointer.target_folder_id, &pointer.name, &pointer.icon]
        ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    for (id, board) in &req.new_graph.boards {
        transaction.execute(
            "UPDATE excalidraw.boards SET folder_id = $1 WHERE id = $2",
            &[&board.root_folder_id, &id]
        ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    transaction.commit().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(()))
}

pub async fn clone_boards(State(state): State<Arc<AppState>>, Json(req): Json<CloneBoardsRequest>) -> Result<Json<()>, StatusCode> {
    let pool = state.db_pool.as_ref().ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let mut client = pool.get().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let transaction = client.transaction().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    for (old_id, new_id) in req.old_to_new_board_map {
        let row_opt = transaction.query_opt("SELECT elements, files, viewport, schema_version, app_state FROM excalidraw.boards WHERE id = $1 AND deleted_at IS NULL", &[&old_id]).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
        if let Some(row) = row_opt {
            let elements: Value = row.get("elements");
            let files: Value = row.get("files");
            let viewport: Option<Value> = row.get("viewport");
            let schema_version: i32 = row.get("schema_version");
            let app_state: Option<Value> = row.get("app_state");

            transaction.execute(
                "INSERT INTO excalidraw.boards (id, elements, files, viewport, schema_version, app_state) VALUES ($1, $2, $3, $4, $5, $6)",
                &[&new_id, &elements, &files, &viewport, &schema_version, &app_state]
            ).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        } else {
            return Err(StatusCode::NOT_FOUND);
        }
    }

    transaction.commit().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(()))
}
