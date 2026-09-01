# Auditoría Crítica de Cierre - Fase 9 (Export / Backup)

## 1. Verificación de Completitud y Riesgos
Esta auditoría evalúa la integridad y robustez del mecanismo implementado en `POST /api/backup` sin ejecutar código destructivo.

### Aspectos Positivos y Garantías
* **Protección ante sobrescrituras:** El bridge utiliza `uuid::Uuid::new_v4()` para los archivos temporales y estampa la hora con formato `YYYYMMDD_HHMMSS` en el final. Es altamente improbable colisionar backups del mismo segundo.
* **Seguridad de Traversal:** El ZIP contiene directorios fijos quemados por código (`assets/<hash>.bin`). Es imposible que un path injection desde la BD corrompa la estructura del ZIP porque los nombres se filtran como hashes estáticos y la lectura física también está restringida por la concatenación sobre `assets_dir`.
* **Coherencia Snapshot-Filesystem:** Al recolectar primero la lista de assets de `excalidraw.assets` *dentro del scope* del `REPEATABLE READ`, si un elemento fue modificado o guardado mientras el ZIP se generaba, o si se escribió un temporal, ese nuevo asset no formará parte de la lista a respaldar. Se empaca exactamente lo referenciado.

### Hallazgos de la Auditoría Crítica (Posibles Debilidades)
1. **[WARNING] No se borran temporalmente Backups Antiguos:** Al alojarse los zips generados en la ruta `bridge/data/backups/`, llamar repetitivamente al endpoint generará archivos de forma aditiva. Sin Garbage Collection o rutinas de límite, podría llenar el disco local a largo plazo.
2. **[INFO] Retorno del Archivo al Cliente (UI Frontend):** La API actual retorna `{ "ok": true, "filename": "backup_excalidraw_XYZ.zip" }`. El frontend no implementa aún la UI para descargar ese archivo. Para la Fase 10 (Restore) o para descargar, el Bridge podría necesitar un endpoint como `GET /api/backup/:filename` para servir los bytes en el browser. Esto se delega como deuda técnica controlada a implementar junto al UI.
3. **[INFO] Deduplicación y Consumo:** El test `phase9.test.ts` valida contundentemente que la deduplicación de CAS se traslada al ZIP de manera perfecta. Dos Boards que contienen exactamente la misma imagen, escriben el mismo `hash` en JSONB, el sistema lee la tabla `excalidraw.assets` (donde aparece 1 fila para esa imagen), y el ZIP la empaca exactamente 1 vez.

## 2. Invariantes
* El comando SQL no toca `public.boards`.
* La DB no recibe modificaciones en las consultas de backup. Todo es `SELECT`.
* Si un archivo falla (e.g. fue borrado manualmente de Windows), el Result emite Err, el backup aborta, retorna `500` y elimina el archivo `<temp>.zip`. Se verificó en tests que no quedan residuos corrompidos.

## 3. Preparación para Fase 10
El formato diseñado soporta la validación criptográfica (a través del Manifest que contiene hashes y tamaños esperados) requerida para un Restore seguro (Fase 10). Una futura máquina podrá abrir el ZIP, validar en memoria que todo coincida con el Manifest, y solo tras pasar la auditoría local, inyectar el JSON y mover los archivos a disco.

**VEREDICTO:** La Fase 9 está formalmente **CERRADA y ESTABLE**.
