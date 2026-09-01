# Auditoría y Diseño Previo - Fase 9.1 (Export / Backup)

## 1. Esquema y Tablas Involucradas
La exportación se centrará **exclusivamente** en el esquema `excalidraw`. La tabla `public.boards` (legado SaaS) queda prohibida y completamente fuera del perímetro.
Las tablas que conforman el Workspace completo son:
1. `excalidraw.schema_migrations` (Versionado de BD).
2. `excalidraw.system_config` (Raíz del Grafo JSONB).
3. `excalidraw.folders` (Estructura de jerarquía).
4. `excalidraw.boards` (Lienzos individuales y su estado).
5. `excalidraw.pointers` (Referencias/Links directos).
6. `excalidraw.assets` (Índice de archivos físicos).

## 2. Relaciones y Dependencias
* `folders.parent_id` → `folders.id` (Relación jerárquica).
* `boards.folder_id` → `folders.id` (Asignación 1:1).
* `pointers.target_folder_id` → `folders.id` (Accesos directos).
* **Assets**: La relación es dinámica (el JSONB `boards.files` y `system_config` referencian los IDs de assets). Sin embargo, la tabla `excalidraw.assets` actúa como el repositorio autoritativo de todo lo que el sistema considera "vivo y poseído".

## 3. Estrategia de Exportación (`pg_dump` vs Programático)
**Decisión:** Extracción SQL Programática (convertida a JSON).
* **Por qué no `pg_dump`:** Exigiría que el usuario tenga instaladas las Client Tools de PostgreSQL (`pg_dump.exe`) en su máquina local o PATH. Excalidraw-Desktop busca portabilidad.
* **Por qué JSON Programático:** Rust puede hacer `SELECT *` de estas 6 tablas y serializarlas usando Serde a un archivo `database.json`. Es 100% portable, agnóstico al SO y trivial de parsear para hacer UPSERTs en la futura Fase 10 de restauración.

## 4. Estrategia de Consistencia (Atomicidad)
**El problema:** Modificaciones en caliente (un tablero guardándose mientras el backup ocurre).
**La solución:** 
1. El Bridge abrirá una transacción SQL con **`ISOLATION LEVEL REPEATABLE READ`** (o `SERIALIZABLE`).
2. Esto "congela" la vista de la BD en el tiempo. Se leen todas las tablas.
3. Se obtiene la lista exacta de `hash` desde `excalidraw.assets` dentro de esta misma transacción.
4. **Comportamiento FS:** Como el sistema CAS (Content-Addressable Storage) nunca modifica archivos in-place (solo crea nuevos), los archivos que la BD reclama **garantizadamente existen y están intactos**.
5. Si una petición concurrente crea nuevos assets, se añadirán al FS, pero como no existen en el snapshot `REPEATABLE READ`, serán ignorados en el ZIP. Esto garantiza **100% de coherencia** sin necesidad de bloquear la aplicación para el usuario.

## 5. Selección de Assets
**Decisión:** Exportar **únicamente** los assets registrados en la tabla `excalidraw.assets` durante el Snapshot.
* **Justificación:** Previene empaquetar archivos huérfanos, basura residual, o archivos creados por peticiones concurrentes posteriores al inicio del backup. Optimiza el tamaño del ZIP y garantiza que `Manifest -> SQL -> CAS` sea una triada exacta.

## 6. Formato del ZIP y Manifest
**Estructura del paquete ZIP:**
```text
backup_excalidraw_20260901.zip
├── manifest.json
├── database.json
└── assets/
    ├── a1b2c3d4e5f6...bin
    └── ...
```

**Formato del `manifest.json`:**
```json
{
  "version": "1.0",
  "created_at": "2026-09-01T12:00:00Z",
  "database": {
    "file": "database.json",
    "tables": { "boards": 12, "folders": 15, "assets": 5 }
  },
  "assets_count": 5,
  "assets": {
    "<hash_sha256>": {
      "path": "assets/<hash>.bin",
      "mime_type": "image/png",
      "size_bytes": 10240
    }
  }
}
```
*Este manifest permite que la Fase 10 valide matemáticamente el archivo antes de inyectarlo a la BD.*

## 7. Atomicidad del Archivo de Backup
1. Se abrirá un `File::create` temporal (`.temp_backup_<uuid>.zip`).
2. Se stremeará el contenido JSON y los bytes de los Assets usando la librería nativa de `zip` en Rust.
3. **Commit:** Solo al finalizar exitosamente y cerrar el archivo ZIP, el sistema emitirá un `fs::rename` al nombre final deseado.
4. **Rollback:** Si ocurre un error, Rust ejecuta `fs::remove_file` sobre el temporal.

## 8. Posibles Riesgos y Mitigaciones
* **Agotamiento de RAM (OOM):** Si se carga todo el JSON de los Boards y todos los Assets en memoria para crear el ZIP. 
  * *Mitigación:* Se utilizará serialización/escritura en flujo (Streaming). La librería `zip-rs` permite escribir archivo por archivo directamente a disco (I/O streaming).
* **Bloqueo del Thread Principal:** La compresión ZIP es CPU-intensive.
  * *Mitigación:* Se envolverá la rutina de exportación dentro de un `tokio::task::spawn_blocking` para no bloquear el Event Loop de Axum, permitiendo que la app siga respondiendo a otros requests de guardado concurrentes.

---
**ESTADO DE AUDITORÍA 9.1: COMPLETADA**
*Diseño Documentado. Sin modificaciones en código ni datos. A la espera de autorización para proceder con la implementación técnica (9.2 / 9.3).*
