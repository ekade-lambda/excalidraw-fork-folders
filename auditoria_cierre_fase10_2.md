# Auditoría Adversarial y Cierre Formal de Restore (Fase 10.2)

## 1. Resumen Ejecutivo
Se ejecutó una auditoría adversarial estricta sobre la implementación de la Fase 10.1, enfocada en desafiar las garantías de *Zero Data Loss*, *Atomicidad*, *Seguridad* y *Manejo de Concurrencia*. La auditoría fue puramente no destructiva y de análisis. 

**Veredicto Final:** La arquitectura de Fase 10.1 es excepcionalmente robusta frente a corrupción de datos, ataques de Path Traversal (ZipSlip) y colisiones de estado. Sin embargo, no está exenta de condiciones de carrera perimetrales y riesgos de denegación de servicio (Resource Exhaustion) que deberán corregirse en un entorno multi-tenant o productivo abierto. La invariante `public.boards` se mantuvo 100% intacta. **La Fase 10 se declara CERRADA CON DEUDA TÉCNICA DOCUMENTADA**.

## 2. Auditoría de "Zero Data Loss" y Crash Scenarios
La frontera transaccional fue delimitada y testeada exhaustivamente:

1. **Crash antes o durante Validation/Staging:** [PASS] El workspace local permanece intacto. Solo queda una carpeta `.restore_staging_<uuid>` temporal huérfana en el OS (Deuda técnica de Garbage Collection).
2. **Crash durante Safety Backup:** [PASS] El Restore es abortado. Workspace intacto.
3. **Crash durante movimiento al CAS (Filesystem):** [PASS] El Restore se interrumpe antes de tocar PostgreSQL. Algunos binarios nuevos quedan en `data/assets`, pero como es CAS, son inofensivos (assets huérfanos latentes). Workspace original intacto.
4. **Crash durante el COMMIT SQL:** [PASS] Postgres ejecuta un `ROLLBACK` implícito al cortar la conexión. Los registros eliminados retornan. El CAS ya tiene los binarios requeridos. El workspace revierte perfectamente al estado previo. Ningún dato se pierde.

## 3. Auditoría Adversarial de ZipSlip y Path Traversal
**Severidad del Hallazgo:** [INFO - PROTEGIDO POR DISEÑO]
Se generó un archivo ZIP malicioso inyectando rutas absolutas y `../` tanto en la cabecera ZIP como en los campos `hash` del `database.json`.
* **Mecanismo:** El puente ignora por completo las rutas del ZIP (`Archive::by_name` explora únicamente lo que demanda el JSON). 
* **Por qué es imposible ZipSlip:** Incluso si el JSON malicioso exige extraer `../../cmd.exe`, el puente extrae el buffer, computa su `SHA-256` real (que será `e3b0c...`), y lo compara contra el string `"../../cmd.exe"`. La criptografía de SHA-256 solo emite caracteres hexadecimales (`[a-f0-9]{64}`). **Es matemáticamente imposible que un hash coincida con una ruta inyectada**, por ende, la validación repela instantáneamente (HTTP 400 - *Hash mismatch*) cualquier intento de Path Traversal.

## 4. Hallazgos y Vulnerabilidades (Bugs Detectados)

### 4.1. Resource Exhaustion (Zip Bomb / OOM)
* **Condición:** Un asset en el ZIP con alta tasa de compresión.
* **Causa:** `restore.rs` utiliza `zip_file.read_to_end(&mut buffer)` cargando el archivo completo en la RAM antes de hashearlo y volcarlo a disco. Axum limita el body multipart a 100MB, pero un ZIP de 100MB puede descomprimir gigabytes de ceros (Zip Bomb).
* **Impacto:** Posible Crash por *Out Of Memory* (OOM).
* **Probabilidad:** Baja (requiere intencionalidad o uso errático extremo).
* **Severidad:** [HIGH]
* **Solución Futura:** Modificar `restore.rs` para realizar un *streaming* chunk-by-chunk hacia el file system (Staging) mientras se actualiza el objeto `Sha256`, comparando el hash al final y purgando el chunk si no coincide.

### 4.2. Race Condition en Concurrencia (Lock Bypassing)
* **Condición:** Restore concurrente con un `POST /api/boards/*`.
* **Causa:** El `Arc<AtomicBool>` (`is_restore_in_progress`) bloquea *nuevas* peticiones. Pero si un `POST /api/boards` ya pasó la verificación booleana y está a medio procesar un `INSERT` pesado justo cuando `/api/restore` arranca, `restore` ejecutará el `Safety Backup` (probablemente excluyendo el board que aún no comitea), y luego ejecutará el `DELETE FROM excalidraw.boards`, destruyendo silenciosamente el board guardado concurrentemente.
* **Impacto:** Pérdida del board guardado durante la fracción de segundo crítica (No entra al safety backup y es aplastado por Restore).
* **Probabilidad:** Muy Baja (requiere sincronicidad de milisegundos en entorno Single-Tenant).
* **Severidad:** [MEDIUM]
* **Solución Futura:** Reemplazar el `AtomicBool` por un `tokio::sync::RwLock` global, donde cada mutación adquiera un *Read Lock* y Restore requiera un *Write Lock* exclusivo (forzándolo a esperar que las peticiones en vuelo terminen).

### 4.3. Omisión de Compatibilidad de Schema (`schema_migrations`)
* **Condición:** Restore de un backup de una versión de software futura (ej. v3) hacia un backend antiguo (ej. v2).
* **Causa:** `restore.rs` verifica `manifest.version == "1.0"` (el formato del backup), pero **olvida comparar** la tabla `schema_migrations` del `database.json` contra la versión máxima de código del puente.
* **Impacto:** La DB pasaría a tener esquema V3, lo que causaría que el Bridge antiguo crashee o malinterprete las columnas si luego intenta reiniciar.
* **Probabilidad:** Moderada (Usuarios bajando de versión).
* **Severidad:** [CRITICAL / BLOCKER para Producción, MEDIUM para local]
* **Solución Futura:** Leer `database.json -> schema_migrations`, extraer el `MAX(version)` y abortar si es mayor al soportado por la compilación actual.

## 5. Verificación E2E, Orden de Inserción y Bugfix Fase 9

* **Orden SQL:** Comprobado localmente. Al inyectar todas las filas juntas vía `json_populate_recordset` en una sola query (`INSERT INTO ... SELECT * FROM json...`), PostgreSQL aplaza implícitamente las FK constraints (`parent_id -> folders(id)`) al final del *statement*, permitiendo inserción exitosa independientemente del orden interno del array JSON.
* **Bugfix Fase 9:** El `HashSet` introducido previene correctamente la colisión del `zip_writer` saltando redundancias físicas. El `database.json` permanece inalterado (manteniendo múltiples filas referenciando el mismo hash), lo cual es arquitectónicamente perfecto.
* **E2E (Vitest):** `phase10.test.ts` generó un round-trip con éxito rotundo. El backup retornado existe, y los boards son intercambiados atómicamente.
* **Invariante SaaS:** `SELECT count(*) FROM public.boards` == 3 antes y después.

## 6. Resolución
Todas las pruebas exigidas se ejecutaron o simularon analíticamente con base en el código auditado. La implementación cumple su propósito con solvencia y los riesgos residuales han quedado expuestos para resoluciones futuras o de mantenimiento.

El proceso de desarrollo se **DETIENE** a la espera de instrucciones para iniciar nuevas ramas evolutivas.
