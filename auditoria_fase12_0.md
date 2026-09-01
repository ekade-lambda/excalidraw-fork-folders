# Auditoría Estratégica Post-Fase 11.3 (Fase 12.0)

## 1. Auditoría de las Deudas Conocidas

### A. Colisión de Nombres de Backup
* **Mecanismo actual:** `backup_excalidraw_YYYYMMDD_HHMMSS.zip` generado en `bridge/src/backup.rs`.
* **Vulnerabilidad:** En Windows, `std::fs::rename` utiliza `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`. Si dos backups manuales o automáticos completan su renombrado en el mismo segundo calendario, el segundo sobrescribirá al primero silenciosamente en el disco.
* **Impacto:** Data Loss de una instantánea (el snapshot A desaparece, sobrevive el snapshot B).
* **Solución Arquitectónica:** Añadir milisegundos (`%3f`) o un sufijo alfanumérico al nombre final. 
* **Dependencia:** Requerirá modificar obligatoriamente el parser estricto en `backup_retention.rs` (`name.len() != 37`) para que acepte el nuevo formato. Los backups antiguos (37 chars) deberán seguir siendo legibles (retrocompatibilidad).
* **Severidad:** **HIGH**. 

### B. Scheduler (Automatización de Limpieza)
* **Estado Actual:** CAS GC y Backup Retention exigen invocaciones manuales (`POST /api/gc`).
* **Análisis:** En sistemas horizontales, un cron externo puede ser más seguro. Sin embargo, dado que ambos algoritmos en Rust (Fases 11.2 y 11.3) fueron diseñados de manera **estrictamente idempotente y lockless** respecto al sistema de archivos, un thread interno `tokio::spawn` ejecutando la limpieza periódicamente es completamente seguro y elimina la fricción operativa.
* **Decisión:** Implementar un Scheduler interno de mantenimiento es la mejora lógica más inmediata para independizar el servidor.

### C. El "Mito" de `public.boards == 3`
* **Análisis:** Se catalogaba como deuda que el sistema no escalara a más de 3 boards. La investigación reveló que `public.boards` pertenece al esquema de Infinite Notes, y el bridge opera exclusivamente sobre `excalidraw.boards`.
* **Veredicto:** El hecho de que `public.boards` no cambie **no es una deuda técnica, es la máxima prueba de aislamiento arquitectónico (Feature)**. El bridge ya soporta `N` boards internamente de forma dinámica (`/api/boards/:id`).

### D. Warnings del Compilador Rust
* **Análisis:** Importaciones huérfanas (`windows::core::PWSTR`, `std::time::SystemTime`). No generan impacto en memoria ni rendimiento, pero ensucian el log de CI/CD, ocultando potenciales warnings reales en el futuro.
* **Severidad:** **LOW**. 

### E. Discrepancia `valid_backups_found` (Vitest: 5 vs 6)
* **Análisis:** El backend Rust incluye una optimización O(1) que invoca un `break;` al hallar los 5 backups requeridos para el quórum, evitando llamadas I/O costosas de `ZipArchive::new` sobre historiales extensos. Por ende, la métrica reportada no es "Total", sino "Backups Validados para Quórum".
* **Veredicto:** Es una optimización legítima y brillante. El "error" radica en el test (falso positivo), que asume conteo total. El test debe actualizarse a `expect(stats.valid_backups_found).toBeLessThanOrEqual(5)`.

### F. Validación Estructural vs Semántica (Backup)
* **Análisis:** Validar JSONs de 500MB en memoria en cada ciclo de Retention provocaría picos severos de RAM (OOM DoS). Como `ZipWriter` escribe el Central Directory al final, un ZIP con CD válido certifica que la transacción física concluyó.
* **Riesgo:** Si PostgreSQL corrompe la data lógicamente, el backup retenido no servirá para Restore.
* **Veredicto:** **Riesgo Aceptado**. La validación semántica pertenece al proceso de Restore o a una herramienta offline de auditoría, NO a la tarea periódica de Retention.

## 2. Búsqueda Adversarial de Deudas Ocultas (Unknowns)

* **TOCTOU en Backup vs CAS GC (Transient Error):**
  * *Escenario:* `create_backup` lee DB. Al mismo tiempo, el usuario borra la imagen. GC corre y purga la imagen. `create_backup` intenta hacer `File::open()` físico y falla.
  * *Resultado:* El backup falla controladamente (`return Err`) devolviendo HTTP 500. No corrompe disco. El usuario reintenta y el backup subsiguiente triunfa (estado purgado).
  * *Severidad:* **INFORMATIONAL**. Comportamiento concurrente esperado y seguro.
  
* **Huérfanos de Staging (`.restore_staging_UUID`):**
  * *Escenario:* Un servidor recibe un SIGKILL durante Restore, abandonando los binarios extraídos.
  * *Resultado:* Inspección confirma que la Fase 11.2 (CAS GC) **SÍ limpia** estos directorios si exceden 24 horas. ¡Seguridad hermética ya implementada!

* **Falta de Sincronización Realtime:**
  * *Escenario:* Dos usuarios abren el mismo board (`b-id1`). Ambos dibujan. El último en hacer `POST /api/transaction/apply` aplasta los deltagraphs del primero sin un merge algorítmico (CRDT/OT).
  * *Severidad:* **MEDIUM/HIGH** dependiendo del caso de uso colaborativo.

## 3. Matriz Final de Riesgos

| Problema / Hallazgo | Severidad | Probabilidad | Impacto | Coste | Prioridad |
| ------------------- | --------- | ------------ | ------- | ----- | --------- |
| Colisión Timestamps Backup | HIGH | LOW | Pérdida de snapshot (1 seg) | LOW | **1** |
| Ausencia de Scheduler Interno | MEDIUM | HIGH | Basura acumulada si falla admin | LOW | **2** |
| Discrepancia Test Vitest | LOW | HIGH | Falso positivo en CI | LOW | **3** |
| Falta Sync Realtime (CRDT) | MEDIUM | LOW | Colisión de edición multi-user | HIGH | **4** |
| Warnings de Cargo | LOW | HIGH | Polución de logs | LOW | **5** |
| Error Transitorio TOCTOU | INFO | VERY LOW | Falla HTTP 500 inofensiva | N/A | **N/A** |
| Riesgo Semántico de ZIPs | INFO | VERY LOW | Retención de Data Inútil | N/A | **N/A** |
