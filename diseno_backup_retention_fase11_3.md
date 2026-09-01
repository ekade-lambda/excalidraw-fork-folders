# Diseño Arquitectónico: Backup Retention (Fase 11.3)

## 1. Alcance y Filosofía
El sistema de Backup Retention tiene como objetivo evitar el crecimiento infinito de la carpeta `data/backups/`, garantizando al mismo tiempo que **jamás se elimine un backup que pueda ser necesario para la recuperación del sistema**.
La filosofía estricta es **Falso Negativo > Falso Positivo**: ante cualquier duda, el backup se conserva.

## 2. Descubrimientos de la Auditoría Actual
1. **Naming Scheme y Atomicidad**: Los backups válidos se crean primero como `temp_backup_UUID.zip` y al finalizar se renombran atómicamente a `backup_excalidraw_YYYYMMDD_HHMMSS.zip`. Este diseño garantiza que un archivo con el nombre final está teóricamente completo.
2. **Independencia de Locks**: `/api/backup` (creación manual) NO toma ningún lock del sistema, pero ejecuta la lectura bajo PostgreSQL REPEATABLE READ. `/api/restore` SÍ toma un `write_lock` global.
3. **Peligro de usar `mtime`**: Basar la retención en `mtime` es inseguro porque una migración o copia de archivos puede alterar/restaurar timestamps. La **única fuente de verdad** del orden cronológico debe ser la fecha estampada en el propio nombre del archivo generado por el sistema.
4. **Validación Rápida**: Verificar que el archivo es un ZIP válido (`ZipArchive::new`) y contiene `manifest.json` y `database.json` en su Central Directory toma apenas milisegundos y garantiza que el archivo no quedó truncado por un crash.

## 3. Arquitectura Propuesta (Quorum-Threshold Deletion)

La retención no utilizará locks (`restore_lock`) porque operará exclusivamente sobre archivos inmutables y residuales, sin modificar el estado lógico activo (CAS ni Postgres). Su diseño es de tipo **Scan -> Verify -> Sweep Lockless**.

### El Algoritmo:
1. **Scan y Filtro Lockless**:
   - Leer `data/backups/`.
   - Ignorar todo lo que sea symlink, directorio, o no coincida con la expresión regular `^backup_excalidraw_(\d{8})_(\d{6})\.zip$`.
2. **Sort**:
   - Ordenar los archivos coincidentes de forma descendente (del más nuevo al más viejo) basándose en su nombre.
3. **Quorum Discovery (Verificación de Validez)**:
   - Recorrer la lista en orden.
   - Por cada archivo, intentar abrirlo como ZIP y buscar el índice de `manifest.json` y `database.json`.
   - Si es válido, incrementar `valid_count`.
   - Cuando `valid_count == 5`, registrar el timestamp de ese archivo como `T_Threshold` y detener el conteo.
4. **Sweep (Eliminación Segura)**:
   - Si nunca se alcanzaron 5 backups válidos (`valid_count < 5`), **ABORTAR**. No se elimina nada.
   - Si se alcanzó, recorrer el resto de los archivos descubiertos en el Scan.
   - Todo archivo cuyo timestamp en nombre sea ESTRICTAMENTE MENOR a `T_Threshold` será eliminado (`fs::remove_file`).

## 4. Por qué esta política supera al "Keep Last 5" ingenuo
Un "Keep Last 5" normal borraría los backups antiguos basándose solo en el orden temporal. Si el sistema sufre un fallo (ej. disco lleno) y genera 5 backups corruptos de 0 bytes, el GC borraría el backup número 6 (¡que era el último backup íntegro disponible!).
La arquitectura de **Quorum-Threshold** garantiza matemáticamente que **jamás se borrará un backup a menos que el sistema haya verificado la existencia de 5 backups MÁS NUEVOS Y PERFECTAMENTE VÁLIDOS**. Adicionalmente, preserva los backups corruptos recientes para análisis forense, eliminando los corruptos solo cuando ya son más antiguos que el umbral de seguridad.

## 5. Invariantes
1. **Zero Data Loss Invariant**: `count(valid_backups) >= min(5, total_created_valid_backups)`.
2. **Lock-Free Concurrency**: La retención no colisiona con Restore porque Restore lee el backup, adquiriendo un handle. Si Retention intenta borrar el backup que Restore está leyendo, el OS (Windows) rechazará el borrado, haciendo que Retention falle de forma segura sin romper el Restore.
3. **Aislamiento CAS**: `data/backups/` no comparte lógica ni locks con `data/assets/`.
