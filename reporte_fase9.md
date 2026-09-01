# Reporte Fase 9: Export / Backup

## Resumen de la Implementación
Se implementó exitosamente el sistema de exportación atómica del workspace (PostgreSQL + CAS) en un solo archivo `.zip`, sin afectar a `public.boards` ni los flujos de colaboración externos. 

## Archivos Modificados
1. `bridge/Cargo.toml`: Añadidas dependencias `zip` y `uuid`.
2. `bridge/src/backup.rs` (NUEVO): Lógica completa de backup atómico y validación de assets.
3. `bridge/src/main.rs`: Registro del nuevo endpoint `/api/backup`.
4. `excalidraw-app/tests/boards/phase9.test.ts` (NUEVO): Tests end-to-end de la nueva API.

## Arquitectura del Endpoint / API
* **Ruta**: `POST /api/backup`
* **Manejo de Errores**: Retorna `HTTP 500` si falla cualquier verificación interna (faltan assets, hash mismatch) y borra los temporales.
* **Respuesta**: `{ "ok": true, "filename": "backup_excalidraw_<timestamp>.zip" }`
* El puente procesa la compresión fuera del loop asíncrono vía `tokio::task::spawn_blocking`.

## Estrategias Críticas
* **Snapshot (`REPEATABLE READ`)**: En `backup.rs` se inicia una transacción con nivel de aislamiento Repeatable Read. Inmediatamente lee las tablas requeridas. Cualquier mutación (guardado de otro board) concurrente no afecta este backup.
* **Validación de Assets**: Antes de empaquetar, el puente itera sobre todos los hashes de `excalidraw.assets` dentro de la transacción, abre el físico (`.bin`), recalcula su SHA-256 en vuelo, y verifica coincidencia absoluta. Si falta o el SHA no calza, el backup aborta.
* **Atomicidad**: Se crea `temp_backup_xxxxx.zip`. Si y solo si el proceso completo finaliza, se aplica un `rename` a `backup_excalidraw_yyyy.zip`.
* **Uso de Memoria**: La API NO carga el ZIP entero en RAM. Se usa `zip::ZipWriter` junto a `File` que escribe en flujo (streaming de bytes) directamente al disco duro. 

## Formato del Backup
**Estructura:**
```
backup_excalidraw_20260901.zip
├── manifest.json
├── database.json
└── assets/
    ├── <sha256>.bin
    └── ...
```

**database.json:**
Volcado directo nativo de PostgreSQL convertido a JSONB. Contiene todas las filas de `system_config`, `schema_migrations`, `folders`, `boards`, `pointers` y `assets`.

**manifest.json:**
Metadata que certifica la validez matemática del paquete:
```json
{
  "version": "1.0",
  "created_at": "2026-09-01T08:00:00+00:00",
  "database": { "file": "database.json" },
  "assets_count": N,
  "assets": {
    "<sha256>": { "path": "assets/<sha256>.bin", "mime_type": "...", "size_bytes": 1024 }
  }
}
```

## Resultados Quality Gates
* `cargo check`: PASS
* `yarn tsc`: PASS
* `vitest` Phase 9: PASS (Valida export deduplicado y corrupciones simuladas)
* Invariante `public.boards`: Intacto (3 rows).

## Riesgos y Deuda Restante
* El frontend aún no tiene el botón visual (UI) para invocar `POST /api/backup` y descargar el `.zip` resultante. Está preparado a nivel Bridge.
* La Fase 10 (Restauración) deberá basarse estrictamente en la descompresión y lectura del `manifest.json`.
