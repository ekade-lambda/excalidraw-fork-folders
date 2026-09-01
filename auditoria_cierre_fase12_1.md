# Auditoría Adversarial de Cierre - Fase 12.1

## Escenarios Atacados

### 1. Colisión de Nombres
- **VERIFICADO EJECUTANDO PRUEBA**: El `Test 6` invoca de forma concurrente el endpoint `/api/backup`. Los dos archivos generados se guardan satisfactoriamente con el mismo timestamp pero diferente UUID, demostrando que ambos sobreviven.

### 2. Retrocompatibilidad
- **VERIFICADO EJECUTANDO PRUEBA**: El `Test 7` inyecta manualmente un backup antiguo (2024) sin UUID y uno nuevo (2024) con UUID. El motor de retención procesa el arreglo correctamente, identificando `valid_backups_found = 2` y conservando ambos.

### 3. Scheduler Duplicado
- **VERIFICADO POR INSPECCIÓN**: La invocación a `scheduler::start_scheduler` sucede únicamente una vez dentro de `async fn main()` justo antes de lanzar el `axum::serve`, y el servidor es single-instance de Tokio en su punto de entrada principal. No existe orquestación externa que derive en un duplicado del thread de mantenimiento.

### 4. Scheduler muerto después de errores
- **VERIFICADO POR INSPECCIÓN**: El loop implementado en `start_scheduler` cuenta con un `match` explícito para capturar los errores emitidos por `gc::run_gc` y `backup_retention::run_retention()`. Ambos devuelven un `Result` en lugar de causar panic, y el match convierte el `Err` en un simple `eprintln!`. El thread de Tokio continuará en su siguiente iteración del loop sin abortar.

### 5. Errores simultáneos de GC y Retention
- **VERIFICADO POR INSPECCIÓN**: Los bloques están aislados de forma secuencial, por lo cual, un error en `run_gc` se procesará e imprimirá, y el loop pasará de inmediato a intentar `run_retention`. La robustez de ambos flujos evita el bloqueo mutuo.

### 6. Servidor reiniciado
- **VERIFICADO POR INSPECCIÓN**: Puesto que el scheduler es lanzado por `tokio::spawn`, muere y se levanta limpiamente con el servidor. Todas las operaciones de GC (borrado de temporales y purgas condicionales) evalúan el estado real del filesystem por lo que son completamente seguras ante un reinicio abrupto.

### 7. Backup creado mientras Retention está ejecutándose
- **VERIFICADO POR INSPECCIÓN**: El motor de Retention obtiene los descriptores de archivo en el momento de escaneo; un nuevo `backup_excalidraw_...zip` creado *después* de iniciado el escaneo no entra a la lista de candidatos actuales. Y dado que el backup no ha cumplido todavía los 7 días mínimos, es de facto seguro de eliminaciones colaterales.

### 8. Retention o GC ejecutándose varias veces de forma manual (API) vs Scheduler
- **VERIFICADO POR INSPECCIÓN**: `restore_lock` se adquiere exclusivamente mediante bloqueo asíncrono para las mutaciones complejas en la etapa de Sweep (GC). Backup Retention y GC son arquitectónicamente operaciones idempotentes, si un request POST los lanza durante un loop del scheduler, las operaciones superpuestas en el peor de los casos solo reportarán *0 eliminados* si el FS ya no posee los candidatos originales.

### 9. Nombres maliciosos / Archivos temporales / Symlinks / Backups corruptos
- **VERIFICADO EJECUTANDO PRUEBA**: `Test 3`, `Test 4` y `Test 5` ejecutan pruebas con estos vectores y en todos los casos la plataforma previene la inclusión del archivo en el Quorum y evita borrados de componentes críticos.

### 10. Regresiones de Fases 11.2 / 11.3
- **VERIFICADO EJECUTANDO PRUEBA**: Todas las suites del archivo `phase11_3.test.ts` que validaban el Quorum temporal (Threshold de 5 backups validos y retención de < 7 días) completaron con PASS.

### 11. Pérdida de Backups Históricos
- **VERIFICADO EJECUTANDO PRUEBA**: Debido a que los backups antiguos forman parte oficial del arreglo de iteración del threshold (evaluado con `Test 7`), Retention es incapaz de ignorarlos para su retención indefinida a menos que las condiciones del quórum de limpieza estricta (más de 5 y > 7 días) se apliquen.

---
**CONCLUSIÓN DE LA AUDITORÍA**: La implementación de la Fase 12.1 cierra exitosamente todos los vectores expuestos bajo el principio estricto de autonomía y preservación transaccional delineado en el requirement principal, sin desbordamiento de alcance a la Fase 12.2.
