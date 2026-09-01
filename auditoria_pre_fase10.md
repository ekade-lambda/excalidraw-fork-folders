# Auditoría de Estado, Recuperación de Alcance y Diseño Previo - Fase 10.0 (Restore / Import)

## 1. Alcance Real de la Fase 10
**VERIFICADO:** El alcance original estipulado en `arquitectura_persistencia_fase1.md` define la Fase 10 como: *"Mecanismo inverso para tragarse el `.zip`. Volcar un `.zip` de la Máquina A en la Máquina B deja el Postgres y FS funcionales al 100%."*
El objetivo arquitectónico real es implementar la **restauración segura e íntegra de un workspace previamente exportado** (Fase 9). Esto no incluye la recolección de basura ni sincronización colaborativa (SaaS), sino el traspaso y recuperación de estado lógico en aplicaciones locales.

## 2. Formato Real del Backup (Auditoría Post-Fase 9)
**HECHO / VERIFICADO:** Inspeccioné el código y el binario ZIP generado en la Fase 9.
* **Estructura ZIP:** Contiene `manifest.json`, `database.json` y el directorio `assets/`.
* **`manifest.json`:** Contiene versión (1.0), fecha, y un diccionario matemático de cada asset (`hash -> path, mime, size`).
* **`database.json`:** Es un volcado JSON estricto (`json_agg`) de las 6 tablas del esquema `excalidraw` (`schema_migrations`, `system_config`, `folders`, `boards`, `pointers`, `assets`). Representa con fidelidad absoluta los tipos de datos nativos de Postgres en formato JSON.
* **Conclusión:** El formato contiene el 100% de la información referencial, binaria y jerárquica para reconstruir un entorno. **No hay BLOCKERS estructurales.**

## 3. Modelo de Restore Recomendado
**PROPUESTA DE DISEÑO:** Recomiendo el **Modelo A (Restore Destructivo) con la protección del Modelo D (Confirmación Explícita)**.
* *Por qué no Importación No Destructiva (B):* Requeriría regenerar cada UUID, reescribir FKs en el grafo JSON y mergear el `system_config` principal, poniendo en alto riesgo la integridad referencial.
* *Por qué Destructivo:* Al tratarse de un entorno *Single-Workspace* portable, el objetivo de Restore es que la máquina adopte la identidad exacta del backup. 
* *Regla:* El frontend advertirá la pérdida de datos actuales y requerirá confirmación. Se borrará (dentro de transacción) la data actual para alojar la nueva.

## 4. Garantía de Zero Data Loss y Fronteras Transaccionales
**PROPUESTA DE DISEÑO (Protocolo de 5 Etapas):**
El binario no modifica el sistema vivo hasta que la validez esté 100% probada.
1. **Validate**: Se descomprime en memoria/tmp el `manifest.json` y `database.json`. Se validan esquemas.
2. **Stage**: Se extraen los binarios a un directorio temporal `.restore_staging_<uuid>/`.
3. **Verify**: Se lee cada archivo en staging, se recalcula su SHA-256 y se compara contra la tabla `excalidraw.assets` del `database.json`.
4. **Commit**: Se abre una transacción PostgreSQL (`REPEATABLE READ` o `SERIALIZABLE`). Se purgan las 6 tablas de `excalidraw.*`. Se inserta masivamente el `database.json`. Se ejecuta `COMMIT`.
5. **Finalize**: Se mueven (rename atómico) los assets de staging a la carpeta real `data/assets/` (ignorando colisiones CAS). Se borra el staging.

## 5. Validación Criptográfica
**PROPUESTA DE DISEÑO:**
* El sistema NO confiará en los nombres de archivo del ZIP.
* El `manifest.json` actúa como ayuda, pero **la fuente de verdad criptográfica** será el propio `database.json` (tabla `excalidraw.assets`).
* Todo archivo candidato debe producir un SHA-256 exacto. Si sobra un archivo en el ZIP, se ignora. Si falta un archivo referenciado en el JSON, el Restore se **ABORTA** en la etapa 3 (Verify).

## 6. Protección contra Zip Slip / Path Traversal
**RIESGO / HECHO:** Rust `zip-rs` extrae rutas relativas que pueden ser manipuladas (`../../windows/system32`).
**PROPUESTA DE DISEÑO (Mitigación total):** El Restore ignorará los nombres de directorio internos del ZIP. Iterará los archivos, obtendrá el nombre base de cada asset (ej. `a1b2c3.bin`) y validará que coincida con el patrón Regex `^[a-f0-9]{64}\.bin$`. Los archivos se escribirán *exclusivamente* en la carpeta aislada de staging usando el hash provisto por el motor, erradicando cualquier Path Injection.

## 7. Validación Preflight
**PROPUESTA DE DISEÑO:** Un endpoint `POST /api/restore/preflight`.
* Recibe el ZIP (en memoria o multipart).
* Descomprime `database.json` y `manifest.json`.
* Verifica congruencia matemática y compatibilidad de esquema (`schema_migrations`).
* Retorna `{ "status": "VALID", "boards_count": 10, "assets_count": 25 }` o `{ "status": "INVALID", "reason": "..." }`. No toca DB.

## 8. Estrategia de Staging
**PROPUESTA DE DISEÑO:** Directorio `bridge/data/.restore_staging_<uuid>/`.
* **Crash durante staging:** Deja basura. Se mitigará con un recolector en el boot del Bridge que purgue subdirectorios `_staging_` con antigüedad > 24h.
* **Colisiones:** Imposibles debido al UUID único por request de Restore.

## 9. Conflictos de IDs
**PROPUESTA DE DISEÑO:** Ya que usaremos Restore Destructivo, los conflictos de IDs en Postgres se neutralizan porque la tabla se limpia antes (`TRUNCATE` o `DELETE cascade` dentro de transacción) y se insertan los IDs del backup que traen su integridad garantizada desde la exportación.

## 10. Compatibilidad de Esquema
**RIESGO:** Backup de la versión 1 intentando restaurarse en un Bridge versión 3, o viceversa.
**PROPUESTA DE DISEÑO:** Se contrastará `excalidraw.schema_migrations` del backup vs el puente actual. Si el backup proviene de una versión futura, se emite **RECHAZO DIRECTO** (Incompatible). Si proviene de una versión idéntica o pasada, se inyecta y luego el Bridge aplica sus propias rutinas de migración post-restore si corresponde.

## 11. Concurrencia
**RIESGO:** Que el Frontend modifique el lienzo mientras el Bridge ejecuta el paso 4 (Commit).
**PROPUESTA DE DISEÑO:** El Bridge mantendrá un cerrojo (Lock) en memoria `Arc<AtomicBool>`. Durante el proceso `Commit -> Finalize`, todas las peticiones `POST /api/boards/*` y `POST /api/graph` serán respondidas con `HTTP 503 Service Unavailable (Restore in progress)`.

## 12. Invariante `public.boards`
**VERIFICADO:** El alcance transaccional del borrado e inserción estará explícitamente limitado al namespace `excalidraw`. No se usará `TRUNCATE CASCADE` genérico sin esquemas. La sentencia será estricta (ej. `DELETE FROM excalidraw.system_config`). `public.boards` permanecerá intacta.

## 13. Error Recovery (Matriz de Riesgos)
* **Fallo en 1-3 (Validación/Staging):** Backend retorna 400. Se purga staging. BD y FS originales quedan intactos. Zero Data Loss.
* **Fallo en 4 (Modificar DB, antes de Commit):** Postgres hace `ROLLBACK`. La base de datos revierte al estado pre-restore. FS original intacto. Zero Data Loss.
* **Fallo en 5 (Crash tras Commit, antes de mover Assets):** *Warning/Riesgo.* La BD asume el nuevo grafo, pero los assets siguen en Staging. Cuando el frontend solicite las imágenes, no existirán en `data/assets/`. 
  * *Mitigación:* Si bien es un margen muy estrecho de nanosegundos, para hacerlo 100% atómico en un solo disco local, primero moveremos los assets de Staging a `data/assets/` (el CAS garantiza que añadir binarios huérfanos antes del Commit es inofensivo). Y LUEGO haremos el `COMMIT` en DB. Si DB falla, tenemos binarios inofensivos extra en CAS, pero Zero Data Loss. ¡Esta inversión del flujo elimina el riesgo!

## 14. Matriz de Pruebas Propuesta (Fase 10)
* **Casos Válidos:** Workspace vacío, Múltiples boards, Workspace masivo con múltiples assets.
* **Casos Inválidos (Se debe rechazar):** Manifest alterado (hash falso), binario manipulado que rompe el SHA, un path `../../` escondido en el Zip (ZipSlip).
* **Crash Safety:** Simulación de fallo en inserción SQL (verificando que la BD vieja siga disponible).

## 15. Decisiones que requieren Autorización
1. **Destrucción de datos:** ¿Autorizas el uso del Modelo A (Destrucción total del Workspace actual para suplantarlo por el Backup) siendo este el único mecanismo que garantiza 100% de coherencia sin refactorizar colisiones de UUIDs?
2. **Preflight endpoint:** ¿Prefieres integrar la validación directamente en la ejecución (falla rápido y devuelve error) o requieres imperativamente un endpoint `/preflight` independiente antes de ejecutar? (Un solo endpoint es más eficiente y seguro transaccionalmente).

---
**ESTADO:** DETENIDO COMPLETAMENTE.
No se ha modificado código ni bases de datos. A la espera de tu respuesta a las decisiones solicitadas y autorización formal para iniciar la Fase 10.1 (Implementación del Endpoint de Restore).
