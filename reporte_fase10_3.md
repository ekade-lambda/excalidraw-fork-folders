# Reporte de Fase 10.3 (Hardening de Restore)

## 1. Modificaciones Realizadas

Para cerrar las vulnerabilidades detectadas en la Fase 10.2 manteniendo la garantía de *Zero Data Loss*, se realizaron correcciones estrictas únicamente a los aspectos identificados:

### Corrección 1: Zip Bomb / OOM Protection (Resource Exhaustion)
Se reimplementó la extracción del contenido `.zip` para que no utilice `read_to_end()` cargando el binario completo en la memoria RAM.
* **Flujo actual:** Se lee la entrada del zip en chunks de 8192 bytes.
* **Cálculo incremental:** El algoritmo inyecta los chunks en memoria directamente al procesador criptográfico (`Sha256::update(&chunk)`) e inmediatamente los vuelca físicamente al staging (`staging_file.write_all(&chunk)`).
* **Límite dinámico (Max Size):** Se estableció un tamaño constante máximo descomprimido `MAX_UNCOMPRESSED_ASSET_SIZE` (50 MB). Si durante la lectura la suma acumulada supera dicho valor, la extracción aborta, destruye el archivo temporal (`remove_file`) y la petición devuelve error, protegiendo al motor.
* **Verificación de Tamaño:** Se agregó la validación explícita `total_size != expected_size` para descartar assets truncados (protección contra descargas o zips rotos) antes de evaluarlo mediante Hash.

### Corrección 2: Compatibilidad Estricta de Schema (Time Travel Protection)
El sistema puente ahora corrobora si está cualificado para alojar el backup.
* En `restore_workspace_inner` se incluyó un query de preparación antes de montar el ZIP: `SELECT COALESCE(MAX(version), 0) FROM excalidraw.schema_migrations`.
* Durante la validación, el puente extrae el nodo `schema_migrations` del `database.json`, buscando su `MAX(version)`.
* **Regla fuerte:** Si la versión del backup *supera* la versión instalada en la BD activa (es decir, el backup pertenece al "futuro"), se rechaza inmediatamente la petición antes de ejecutar el Safety Backup y sin modificar disco/bd.

### Corrección 3: Race Conditions de Mutación (Sincronización `RwLock`)
El semáforo simple de concurrencia fue retirado en favor de un semáforo de bloqueo múltiple-lectura/escritura exclusiva (`tokio::sync::RwLock`).
* **Estado (`main.rs`):** `is_restore_in_progress` fue reemplazado por `restore_lock: Arc<tokio::sync::RwLock<()>>`.
* **Operaciones mutables regulares (Save/Delete/etc):** Ejecutan `state.restore_lock.try_read()`. Si el puente está restaurando, esto falla sin bloquear el hilo devolviendo de inmediato `HTTP 503`.
* **Proceso Restore (`restore.rs`):** Ejecuta un candado de escritura total `state.restore_lock.write().await`. Esto bloquea peticiones futuras, y fundamentalmente, **espera en modo await** a que las operaciones asíncronas de guardado que estaban en vuelo (en medio de su lectura del candado) terminen pacíficamente antes de empezar la lógica destructiva. Esto erradica por completo la ventana de pérdida en la que un guardado activo era cortado por la guillotina del Restore.

## 2. Testing Obligatorio Realizado
Se inyectaron tests *E2E* en Vitest (`phase10.test.ts`) emulando atacantes o corrupciones:
1. `Fase 10.3: Rechaza backup del futuro (schema_migrations incompatible)` (Simula un `manifest` v1.0 pero un schema `v99999`. Falló como se esperaba devolviendo HTTP 400).
2. `Fase 10.3: Limita descompresion (Zip Bomb)` (Intenta enviar un archivo falso afirmando medir `60MB` en un backend que topa en `50MB`. Falló devolviendo HTTP 400).

El conteo de `public.boards` se mantuvo incólume. No se modificó el frontend, no se agregaron features de GC ni UI.
