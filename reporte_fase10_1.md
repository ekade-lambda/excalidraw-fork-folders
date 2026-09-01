# Reporte de Implementación - Fase 10.1 (Restore / Import Seguro)

## 1. Resumen de Implementación
Se ha implementado de manera estricta el endpoint `POST /api/restore`, garantizando un mecanismo seguro de importación destructiva de workspaces desde archivos `.zip` (generados en la Fase 9). La arquitectura favorece la seguridad, la protección contra pérdida humana/técnica de datos (Zero Data Loss) y el estricto aislamiento respecto del entorno SaaS heredado (`public.boards`).

## 2. Archivos Modificados y Nuevos
* **[NUEVO] `bridge/src/restore.rs`:** Lógica core del Restore (Validate -> Stage -> Verify -> Backup -> Prepare CAS -> Transaction -> Finalize).
* **[MODIFICADO] `bridge/src/main.rs`:** Integración de `restore.rs`, adición de lock global de concurrencia (`is_restore_in_progress: Arc<AtomicBool>`).
* **[MODIFICADO] `bridge/src/api.rs`:** Inyección del lock global en endpoints que mutan el estado (`post_graph`, `post_board`, `delete_board`, `apply_transaction`, `clone_boards`), retornando `503 Service Unavailable` durante un restore activo.
* **[MODIFICADO] `bridge/src/backup.rs`:** Extracción de la lógica transaccional de backup a la función pública e interna `create_backup()`, que ahora es reutilizada como el *Safety Backup* del proceso de restore. Adicionalmente, se corrigió un warning oculto de la Fase 9 donde assets con múltiples referencias generaban escrituras redundantes al ZIP, mediante un control en memoria basado en hash (`processed_hashes`).
* **[NUEVO] `excalidraw-app/tests/boards/phase10.test.ts`:** Suite de E2E en Vitest que simula el ciclo de vida completo de Restore.

## 3. Flujo Arquitectónico Ejecutado (Zero Data Loss)
El endpoint `POST /api/restore` realiza el siguiente pipeline transaccional en Rust:

1. **Mutex (Lock):** Activa el `AtomicBool`. Mutaciones vía API (save, delete, sync) son bloqueadas con HTTP 503.
2. **Receive & Save:** Descarga el binario `.zip` a `data/backups/temp_restore_<uuid>.zip`.
3. **Validate & Preflight (In-memory/Tmp):** Lee `manifest.json` y `database.json`. Valida versiones (1.0).
4. **Stage & Cryptographic Verify:** Extrae assets a una carpeta `.restore_staging_<uuid>/`. **No confía en los nombres del ZIP (Mitigación Zip Slip).** Solo busca `assets/<hash>.bin` basado en el `database.json`. Una vez leído, computa el SHA-256 en memoria y verifica su tamaño. Si coincide exactamente, lo escribe a Staging.
5. **Safety Backup:** Invoca internamente `backup::create_backup(pool)` para empaquetar el workspace actual (vivo) antes de destruirlo. Si esto falla, aborta todo y purga el staging.
6. **Prepare CAS:** Mueve los assets de `staging` hacia `data/assets/`. Si un binario idéntico ya existe, simplemente se omite/sobrescribe limpiamente gracias a la naturaleza inmutable de CAS. (Se hace *antes* del commit SQL para evitar assets huérfanos).
7. **Transacción PostgreSQL (ISOLATION LEVEL SERIALIZABLE):**
   * Purgado controlado: `DELETE FROM excalidraw.<tablas>`. (Nunca se toca `public.*`).
   * Inyección JSON Nativa: Usa `json_populate_recordset` para insertar el `database.json` en masa en orden inverso (respetando Foreign Keys: `system_config`, `assets`, `folders`, `boards`, `pointers`).
8. **Commit & Finalize:** Se confirma en PostgreSQL. Se borra el ZIP temporal. Se libera el Lock.
9. **Respuesta:** Retorna el conteo restaurado y el nombre del ZIP de seguridad.

## 4. Decisiones Técnicas y Limitaciones
* **Atomicidad Limitada (Filesystem + DB):** Documentado internamente: El traslado del CAS a `data/assets` ocurre antes del COMMIT de DB. Un crasheo del OS/Docker en ese milisegundo exacto dejaría binarios huérfanos en FS, pero **mantendría el workspace anterior 100% íntegro**.
* **Zip Slip Imposible:** Como los extractores no usan los nombres crudos de los `.zip`, es matemáticamente imposible que un archivo se guarde fuera de staging, incluso si el ZIP contiene `../../windows/system32`.

## 5. Pruebas y Quality Gates
* `yarn tsc` y `cargo check`: Pasan exitosamente.
* **Vitest `phase10.test.ts`**: Pasa. Simula creación de Workspace A, creación de Workspace B, y vuelta exitosa al Workspace A vía `POST /api/restore`.
* **Invariantes:** Se ejecutó `SELECT count(*) FROM public.boards` resultando exactamente en `3`.
