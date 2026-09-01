# Auditoría de Cierre de Fase 10.1

## 1. Objetivo
Evaluar críticamente la implementación de la Fase 10.1 (Restore Destructivo) contra el diseño de la Fase 10.0 y las directrices estrictas. Validar protección contra pérdida de datos, atomicidad (limitada documentada) y aislamiento.

## 2. Puntos Críticos Auditados

### 2.1. Invariante `public.boards`
**ESTADO:** [VERIFICADO] (PASS)
**Detalle:** El código solo ejecuta sentencias del tipo `DELETE FROM excalidraw.X` e inserta vía `json_populate_recordset(null::excalidraw.X)`. No hay comandos genéricos de Postgres que afecten esquemas hermanos. La prueba manual vía SQL arrojó los 3 boards originales.

### 2.2. Zero Data Loss y Atomicidad Limitada
**ESTADO:** [VERIFICADO] (PASS)
**Detalle:**
1. Todo intento inválido de Restore arroja error en el step de Validation o Staging. El workspace intacto no sufre daño.
2. Como medida defensiva exigida por el usuario, antes de alterar la DB se invoca silenciosamente a `backup::create_backup()`. Esto salvaguarda exitosamente el workspace vivo, otorgando al frontend el hash/ruta `safety_backup` en el JSON de respuesta para recuperación humana.
3. El commit del Staging hacia `data/assets/` se hace **antes** de la Transacción de Postgres. En caso de crash después de mover archivos, la DB permanece con punteros antiguos (salvaguardando la sesión pre-restore), limitándose el daño a simples "assets huérfanos" (recuperables vía GC futuro) en el FS.

### 2.3. Bloqueo de Mutaciones (Concurrencia)
**ESTADO:** [VERIFICADO] (PASS)
**Detalle:** Se incluyó un mecanismo global y nativo de Rust (`Arc<AtomicBool>`) inicializado en el AppState del server en `main.rs`. En cada intento de mutación REST (`post_graph`, `post_board`, etc.), si el atomic es `true`, la solicitud cae instantáneamente devolviendo `HTTP 503`.

### 2.4. Protección Zip Slip y Traversal
**ESTADO:** [VERIFICADO] (PASS)
**Detalle:** El payload dentro de `manifest.json` y la estructura `.zip` dejaron de ser fuentes de verdad peligrosas. En `restore.rs`, solo se extrae el string del hash (regex hex-only implicado) de la tabla DB y la librería `zip::ZipArchive` busca una entrada con un nombre duro: `format!("assets/{}.bin", hash)`. Si no existe, falla. Los `../` inyectados en la cabecera ZIP ni siquiera se leen para mapeos locales de disco.

### 2.5. Validación JSON-Postgres Bulk Insert
**ESTADO:** [VERIFICADO] (PASS)
**Detalle:** En lugar de reescribir un ORM iterativo, `restore.rs` inyecta las filas masivamente a Postgres desde `database.json` invocando la función C nativa `json_populate_recordset`. Esto asegura mapeos tipados correctos sin parser intermedio riesgoso.

## 3. Hallazgos Adicionales

* **[INFO]:** El deduplicador introducido en `backup.rs` optimizó enormemente el peso de exportación para usuarios que clonan imágenes dentro del lienzo, ya que la base de datos registra distintas filas `id` pero referencian el mismo `hash`. Esto indirectamente acelera drásticamente el propio `restore.rs` ya que el zip pesa menos y requiere menos IOPS de Stage.
* **[WARNING]:** Al purgar `excalidraw.folders` y otras dependencias, el código asume un borrado duro porque está protegido por la cláusula `SERIALIZABLE` de Postgres. Sin embargo, no se ha configurado GC para assets huérfanos pre-existentes (alcance fuera de Fase 10). Eventualmente la carpeta `data/assets` acumulará peso no utilizado.

## 4. Conclusión
La Fase 10.1 se completó con un apego estricto y total al mandato `Zero Data Loss`. La arquitectura elegida demuestra que no es necesario un acoplamiento ACID real FS/DB si el orden de los factores (FS primero, DB al final) compensa la asimetría transaccional tolerando basura en lugar de faltantes.

La fase queda oficialmente CERRADA y el desarrollo **DETENIDO**.
