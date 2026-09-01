use std::sync::Arc;
use tokio::time::{sleep, Duration};
use crate::AppState;

pub fn start_scheduler(state: Arc<AppState>, interval_secs: u64) {
    tokio::spawn(async move {
        loop {
            sleep(Duration::from_secs(interval_secs)).await;
            
            println!("[Scheduler] Iniciando ciclo de mantenimiento...");
            
            // 1. GC
            if let Some(pool) = state.db_pool.as_ref() {
                match crate::gc::run_gc(pool, &state.restore_lock).await {
                    Ok(stats) => println!("[Scheduler] GC OK: {} eliminados", stats.assets_deleted),
                    Err(e) => eprintln!("[Scheduler] GC Error: {}", e),
                }
            }
            
            // 2. Retention
            match crate::backup_retention::run_retention().await {
                Ok(stats) => println!("[Scheduler] Retention OK: {} eliminados", stats.final_backups_deleted),
                Err(e) => eprintln!("[Scheduler] Retention Error: {}", e),
            }
            
            println!("[Scheduler] Ciclo de mantenimiento finalizado.");
        }
    });
}
