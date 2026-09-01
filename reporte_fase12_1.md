# Reporte de Cierre - Fase 12.1

## Objetivo Cumplido
Se implementaron con éxito las tareas de reforzamiento y autonomía requeridas en la Fase 12.1, enfocadas en la estabilidad del Garbage Collector del CAS y Backup Retention, corrección de bugs, y automatización sin modificar el alcance hacia CRDT o funcionalidades colaborativas.

## Archivos Modificados
- `bridge/src/backup.rs`
- `bridge/src/backup_retention.rs`
- `bridge/src/main.rs`
- `bridge/src/api.rs`
- `bridge/src/migrations.rs`
- `bridge/src/restore.rs`
- `bridge/src/bin/test_dialog.rs`
- `excalidraw-app/tests/boards/phase11_3.test.ts`

## Archivos Creados
- `bridge/src/scheduler.rs`
- `reporte_fase12_1.md`
- `auditoria_cierre_fase12_1.md`

## Arquitectura y Cambios Implementados

### 1. Naming Final
El esquema de nombres de los Safety Backups se actualizó para incluir un UUID de 8 caracteres que previene colisiones absolutas al ejecutarse múltiples backups en el mismo segundo.
**Formato Nuevo:** `backup_excalidraw_YYYYMMDD_HHMMSS_{uuid}.zip`

### 2. Compatibilidad con Nombres Antiguos
El parser de retención en `backup_retention.rs` se actualizó para reconocer tanto el formato histórico (exactamente 37 caracteres sin UUID) como el nuevo formato. Todo backup antiguo que exista en `data/backups/` es leído y contabilizado correctamente.

### 3. Funcionamiento del Scheduler
Se implementó `scheduler.rs`, un loop asíncrono instanciado una sola vez en `main.rs` mediante `tokio::spawn`. Este scheduler invoca internamente las funciones públicas de `gc` y `backup_retention` respetando su idempotencia. Se garantiza que un fallo en el GC o en Retention generará un error en el log (`eprintln!`), pero **no** derrumbará el servidor ni interrumpirá el loop periódico, reiniciando su ejecución en la siguiente iteración programada. 

### 4. Semántica de `valid_backups_found`
El concepto pasó de ser "número de backups válidos hasta satisfacer el quorum" a **"cantidad total de backups válidos encontrados"**. Para lograr esto, se eliminó el early-exit (`break`) en la cuenta iterativa, permitiendo que Retention escanee todo el directorio pero registrando correctamente la marca temporal `t_quorum` al alcanzar los 5 backups. Los tests se ajustaron (y aprobaron exitosamente) bajo esta semántica real.

### 5. Eliminación de Warnings
Se pulió el código backend de Rust eliminando todos los unused imports y unused variables identificados previamente (`cargo check` arroja 0 advertencias).

## Quality Gates y Tests Adicionales
- Se añadieron `Test 6` (colisiones concurrentes) y `Test 7` (retrocompatibilidad) a `phase11_3.test.ts`.
- Ejecución `cargo check`: **PASS**.
- Ejecución `yarn tsc`: **PASS**.
- Verificación Aislamiento (`SELECT count(*) FROM boards;`): **PASS** (3).
- Test general de la API de Retention: **PASS**.

## Riesgos Residuales
- **Alineamiento de huso horario**: La generación de UUIDs mitiga los riesgos derivados de desincronizaciones del reloj, pero el parser sigue asumiendo el string UTC. Si el reloj del host varía bruscamente y retrocede, el parser leerá la fecha nueva como más antigua. Sin embargo, el GC y Retention respetan el UUID y los límites seguros.
