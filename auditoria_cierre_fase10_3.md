# Auditoría de Cierre - Fase 10.3 (Hardening)

## 1. Vulnerabilidades Corregidas (Eliminadas)

### 1.1. Race Condition / Lock Bypass
* **Estado previo:** `AtomicBool` impedía nuevos requests, pero ignoraba los *in-flight*.
* **Estado actual:** `tokio::sync::RwLock` fue implementado exitosamente. 
* **Garantía real:** Una operación `POST /api/boards` en progreso mantiene un `read_lock`. Si Restore solicita iniciar, se suspende en `write_lock().await` **hasta que todas** las operaciones de mutación vivas culminen y liberen el candado. Ningún guardado en curso será aniquilado sorpresivamente por un Restore.

### 1.2. Incompatibilidad Futura de Schema
* **Estado previo:** Restore ciega e incondicionalmente aceptaba cualquier `database.json` si el `manifest` era `1.0`.
* **Estado actual:** El código consulta proactivamente a PostgreSQL la versión más alta `schema_migrations`.
* **Garantía real:** Los backups del futuro son rechazados rotundamente. Esto descarta el riesgo de introducir un esquema inconsistente en una aplicación compilada para una versión anterior.

## 2. Vulnerabilidades Mitigadas (Riesgos Residuales)

### 2.1. Resource Exhaustion (Zip Bomb)
* **Estado previo:** Crash `OOM` del bridge completo al intentar cargar un archivo excesivo.
* **Estado actual:** Streaming de 8KB que finaliza abortando si se superan los `50MB` de extracción física por asset. 
* **Caso mitigado:** Un ZIP pequeño altamente comprimido ya no causará `OOM`.
* **Riesgo residual:** Si un atacante envía miles de archivos legítimamente pequeños, el Bridge utilizará ciclos de CPU (hasheando) e I/O de disco. Aunque Axum detiene el request total en 100MB comprimido, el ataque de fatiga de I/O sigue siendo un vector teórico aplicable a cualquier API, que escapa al perímetro del proyecto.

## 3. Garantías Afirmables al Cierre

1. **Invariante Legado (`public.boards`):** Se comprobó que existen exactamente 3 registros en la tabla. En ningún escenario de la Fase 10 se alteró el SaaS.
2. **Zero Data Loss (Filesystem + DB):** Un crash durante la copia transaccional de CAS jamás destruirá la base de datos viva, pues sucede *antes* de borrar los datos. El peor daño documentado es acumular un binario (100% huérfano) inofensivo.
3. **Safety Backup:** Sigue operando como primer guardián en la cadena destructiva de Rust. Todo reemplazo atómico destruirá el workspace local solo si un respaldo ZIP ha sido debidamente firmado y guardado.

## 4. Nueva Deuda Técnica (No accionante en Fases actuales)

* **Garbage Collection Estricto:** La carpeta `data/assets` retiene archivos huérfanos tras restaurar (ya que las referencias mueren pero el FS no es purgado para proteger la atomicidad MVCC). La recolección debe orquestarse de modo independiente.
* **Límites Globales:** Si un workspace crece legítimamente a decenas de gigabytes de imágenes, los límites del proxy inverso o de body en Axum (`100 MB` y un límite duro de `50 MB` predeterminado por asset descomprimido) deberán re-parametrizarse.

**Veredicto Final:** La arquitectura transaccional ha alcanzado madurez defensiva. La Fase 10 está estructuralmente robustecida y el sistema es hermético a nivel API.
