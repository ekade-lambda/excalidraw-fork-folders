# Auditoría Final de Seguridad y Evidencia de Restore (Fase 10.4)

## 1. Auditoría de Zip Bomb / Resource Exhaustion

Se analizó rigurosamente la protección implementada en la Fase 10.3 frente a vectores de *Resource Exhaustion*.

* **Protección implementada (Assets):** Efectiva. El uso de lectura en *chunks* (8192 bytes) con validación incremental y el límite estricto de `MAX_UNCOMPRESSED_ASSET_SIZE` (50MB) impide OOM al desempaquetar imágenes/binarios masivos.
* **VULNERABILIDAD DESCUBIERTA (High/Critical):** La lectura de metadatos evade esta protección. La función `read_zip_file("manifest.json")` y `read_zip_file("database.json")` utiliza internamente `file.read_to_string(&mut contents)`. Un atacante puede crear un archivo `database.json` relleno con 2 GB de espacios en blanco (que comprimido pesa apenas 2 MB) y causar un OOM inmediato y catastrófico en el puente al forzar una alocación de memoria RAM que supera los límites del sistema o de Axum.
* **Límites Faltantes:** No existe restricción en la cantidad total de archivos extraídos ni en la suma del tamaño global descomprimido. Un ZIP con 10,000 archivos válidos de 49MB pasaría el límite individual, consumiendo 500GB de disco e I/O.

## 2. Auditoría de Validación Criptográfica (ZipSlip y Manipulación)

La cadena de confianza `database.json → Hash Esperado → Extracción → Hash Real` es invulnerable a ataques por diseño matemático, no solo por validación.
* **ZipSlip (`../`):** Imposible. Dado que el extractor impone buscar el archivo bajo el nombre `assets/{hash_declarado}.bin`, inyectar un *path traversal* requeriría falsificar una colisión de SHA-256 (`e3b0c...`) cuyo valor hexadecimal literálmente se deletree como `../../cmd.exe`, lo cual es criptográficamente absurdo.
* **Mismatch de Nombres/IDs:** Rechazado correctamente.
* **Archivos Extra en el ZIP:** Ignorados. El código solo itera sobre el `database.json`; los elementos extra (maliciosos o no) nunca son procesados.
* **Veredicto Criptográfico:** VERIFICADO REALMENTE y robusto.

## 3. Auditoría de Compatibilidad de Schema (Time Travel)

* **Protección implementada (Futuro):** VERIFICADA REALMENTE. Backups de versiones > a la BD actual son rechazados (Ej. v9999).
* **VULNERABILIDAD DESCUBIERTA (Downgrade - Critical):** El código permite restaurar un backup con `MAX(version) < current_db_version` (ej. Backup V1 en un Bridge V2). Aunque la inserción de filas funciona porque `json_populate_recordset` inyecta `NULL` en columnas nuevas, la tabla `excalidraw.schema_migrations` será **sobreescrita a la versión V1**. Al reiniciar, el sistema intentará correr migraciones (ej. `ALTER TABLE ... ADD COLUMN`) que ya están estructuralmente aplicadas a la tabla de Postgres, provocando un **Crash Permanente del Bridge por fallo de DDL**.

## 4. Matriz de Fallo: Zero Data Loss

La arquitectura exhibe un aislamiento brillante gracias al MVCC de PostgreSQL y la inmutabilidad de CAS:
| Escenario de Crash | Estado PostgreSQL | Estado CAS (Físico) | Safety Backup | ¿Pérdida de Datos? |
| :--- | :--- | :--- | :--- | :--- |
| En Validación / Staging | Intacto | Intacto | No iniciado | Cero. (Queda Staging huérfano) |
| Durante Safety Backup | Intacto | Intacto | Corrupto/Incompleto | Cero. Restore aborta. |
| Moviendo assets al CAS | Intacto | Contiene binarios extra | Creado y Completo | Cero. Assets huérfanos inofensivos. |
| Durante `DELETE` SQL | Rollback Automático | Restore completo | Creado y Completo | Cero. Workspace anterior sobrevive. |
| Durante `INSERT` SQL | Rollback Automático | Restore completo | Creado y Completo | Cero. Workspace anterior sobrevive. |
| Post-Commit SQL | Restaurado (Nuevo) | Restaurado (Nuevo) | Creado y Completo | Éxito total. ZIP Temp huérfano. |

## 5. Auditoría del Mecanismo de Concurrencia (`RwLock`)

* **Exclusión Mutua:** VERIFICADA REALMENTE. Todos los métodos de API en `api.rs` (`post_board`, `post_graph`, `apply_transaction`, etc.) solicitan `.try_read()`. El Restore solicita `.write().await`.
* **In-Flight Requests:** Si un "Save" está en curso (tiene el read lock), Restore espera pasivamente (`.await`) garantizando que no se mutile la petición activa.
* **Concurrent Restores:** Si dos usuarios mandan Restores simultáneos, se encolan sin pisarse porque los temporales de staging utilizan directorios y archivos diferenciados mediante `Uuid::new_v4()`. Es seguro y uno sobreescribirá al otro atómicamente generando dos Safety Backups escalonados.
* **Bypass de Lock:** Los métodos de consulta (`get_board`, `get_graph`) no adquieren lock, pero están 100% seguros gracias a que PostgreSQL bloqueará la lectura o retornará la versión previa (MVCC) si colisiona con el `DELETE` del Restore.

## 6. Auditoría de Invariantes y Límites

* **Invariante `public.boards`:** VERIFICADA REALMENTE (Conteo = 3 antes y después). No existen cláusulas `CASCADE` peligrosas ni sentencias dinámicas que afecten esquemas hermanos. Todo el SQL está prefijado con `excalidraw.`.
* **Prueba E2E (Round-trip):** VERIFICADA REALMENTE mediante `phase10.test.ts`. El contenido JSON, los punteros y las referencias al filesystem son idempotentes en los flujos de ciclo cerrado.

## 7. Falsos Positivos o Garantías no Demostradas
* **Test de Zip Bomb:** *PARCIALMENTE VERIFICADO/INFERIDO*. El test `4. Fase 10.3: Limita descompresion` falsea la metadata del `database.json` declarando 60MB, pero no envía un archivo real de 60MB comprimido como bomba. El puente lo aborta *antes* del streaming por la declaración de tamaño, pero no pone a prueba el limitador acumulativo en RAM ni el loop de I/O real del streaming.

## 8. Conclusión y Veredicto Final

A pesar de que el núcleo arquitectónico es brillante, transaccionalmente seguro (Zero Data Loss real) y fuertemente protegido contra Path Traversals, la presencia de dos bugs que conllevan a un Crash inminente de memoria (Zip Bomb vía JSONs) y un Crash permanente de DB (Corrupción del DDL tracker por Downgrades), impide catalogar el código actual como "Production Ready".

**Recomendación:** La Fase 10 NO debe declararse cerrada todavía. Debe abrirse una brecha final de corrección focalizada en:
1. Reemplazar `read_to_string` por un iterador/lector estricto de bytes para los metadatos JSON.
2. Evitar reemplazar `schema_migrations` en la DB durante el restore (solo usarlo para validación) O impedir el Restore de versiones estructuralmente inferiores si no hay mecanismos de Rollback de DDL.
