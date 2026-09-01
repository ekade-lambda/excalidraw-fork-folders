use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use std::env;
use tokio_postgres::NoTls;

pub fn create_pool() -> Result<Pool, String> {
    let database_url = env::var("DATABASE_URL").map_err(|_| "DATABASE_URL must be set".to_string())?;
    let pg_config = database_url.parse::<tokio_postgres::Config>().map_err(|e| e.to_string())?;
    
    let mgr_config = ManagerConfig {
        recycling_method: RecyclingMethod::Fast
    };
    let mgr = Manager::from_config(pg_config, NoTls, mgr_config);
    let pool = Pool::builder(mgr).max_size(16).build().map_err(|e| e.to_string())?;
    
    Ok(pool)
}

