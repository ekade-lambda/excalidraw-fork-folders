# Auditoría de Cierre - Fase 11.2 (Garbage Collector del CAS)

## 1. Verificación de Requisitos

### Arquitectura Mark-and-Sweep
* **VERIFICADO POR INSPECCIÓN**: La etapa MARK (sin lock) construye la lista de candidatos leyendo la DB y comprobando tiempos contra el filesystem. La etapa SWEEP adquiere `restore_lock.write().await`, re-consulta la base de datos (liveness real) y ejecuta una validación atómica `mtime > 24h` justo antes del borrado.

### Fuente de Verdad Absoluta
* **VERIFICADO POR INSPECCIÓN**: La implementación lee combinadamente:
  * `jsonb_object_keys(files)`
  * `elem->>'fileId'`
  Exclusivamente de registros donde `deleted_at IS NULL`. Esto cumple rigurosamente el diseño de Liveness, cubriendo todos los casos posibles de Excalidraw.

### Umbral Temporal y Fail-Safe
* **VERIFICADO EJECUTANDO PRUEBA**: El test de integración demostró contundentemente que un archivo huérfano de `25 horas` se borra, y uno de `1 hora` no se borra.
* **VERIFICADO POR INSPECCIÓN**: Si falla cualquier consulta SQL (ej. base de datos caída o esquema incompatible), la función retorna inmediatamente usando propagación `?`, preservando los archivos físicos. No se realizan inferencias peligrosas.

### Riesgos de Zip Bombs / Malicious Names / Symlinks
* **VERIFICADO EJECUTANDO PRUEBA**: Archivos maliciosos y symlinks se introdujeron y sobrevivieron al ciclo del GC sin causar errores ni ser borrados.
* **VERIFICADO POR INSPECCIÓN**: La rutina comprueba `name.len() == 68`, que termina en `.bin`, y que los 64 caracteres iniciales sean hexadecimales puros. Además, usa `fs::symlink_metadata` para rehusarse a seguir un symlink.

### Cleanup de Staging
* **VERIFICADO EJECUTANDO PRUEBA**: Los archivos tipo `.restore_staging_*` y `temp_restore_*.zip` huérfanos se procesan con idénticas garantías transaccionales (umbral > 24h).

### Invariantes del SaaS (`public.boards`)
* **VERIFICADO EJECUTANDO PRUEBA**: Una consulta manual comprobó que `public.boards` mantiene `count(*) == 3`.

### Quality Gates (Deuda Técnica)
* **VERIFICADO EJECUTANDO PRUEBA**: El comando estricto `yarn tsc` completó exitosamente. La deuda de TypeScript (TS2769 y TS2307) ha sido purgada del proyecto resolviendo la declaración de Tipos sobre BodyInit y JSZip, sin degradar el test original.

## 2. Decisiones Arquitectónicas Restantes y Riesgos Residuales

* **Backup Retention Excluido**: Fiel a la especificación estricta de la Fase 11.2, NO se abordó el manejo de ciclo de vida de los respaldos de `data/backups/`. Estos continúan acumulándose sin límite, lo que formará parte del alcance futuro (Fase 11.3 o Fase 12).
* **Frecuencia de GC**: El GC está montado sobre una arquitectura invocable por HTTP (`POST /api/gc`). NO se agregó un Cron local/Background Scheduler ni un proceso en Rust, delegando la responsabilidad de invocación (por diseño) al orquestador o entorno (que podría simplemente ser un comando CRON estándar). 

## 3. Conclusión de Auditoría

El sistema GC del CAS es resiliente frente a conmutaciones de carga y respeta las garantías "Zero Data Loss". Ha sido diseñado defensivamente. La Fase 11.2 queda acreditada, aprobada, y el entorno limpio.
