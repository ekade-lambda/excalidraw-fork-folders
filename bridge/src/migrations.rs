
use std::error::Error;

pub async fn run_migrations(client: &mut tokio_postgres::Client) -> Result<(), Box<dyn Error>> {
    // Aseguramos que existe el schema de aislamiento y la tabla de control
    client.batch_execute("
        CREATE SCHEMA IF NOT EXISTS excalidraw;
        CREATE TABLE IF NOT EXISTS excalidraw.schema_migrations (
            version INT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        );
    ").await?;

    // Obtenemos la version actual
    let row = client.query_one("SELECT COALESCE(MAX(version), 0) FROM excalidraw.schema_migrations", &[]).await?;
    let current_version: i32 = row.get(0);

    println!("Version actual de la base de datos (excalidraw schema): {}", current_version);

    // Definimos las migraciones ordenadas
    let migrations = vec![
        (1, include_str!("migrations/001_initial.sql")),
        (2, include_str!("migrations/002_fase4_expansion.sql")),
    ];

    // Aplicamos las pendientes
    for (version, sql) in migrations {
        if version > current_version {
            println!("Aplicando migracion {}...", version);
            
            // Ejecutamos la migracion
            let transaction = client.transaction().await?;
            if let Err(e) = transaction.batch_execute(sql).await {
                println!("Error SQL en migracion {}: {:?}", version, e);
                return Err(Box::new(e));
            }
            
            // Guardamos el registro
            if let Err(e) = transaction.execute(
                "INSERT INTO excalidraw.schema_migrations (version) VALUES ($1)",
                &[&version],
            ).await {
                println!("Error insertando registro de migracion {}: {:?}", version, e);
                return Err(Box::new(e));
            }
            
            transaction.commit().await?;
            println!("Migracion {} aplicada con exito.", version);
        }
    }

    Ok(())
}

