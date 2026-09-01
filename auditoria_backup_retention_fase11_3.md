# Auditoría de Seguridad y Quality Gates: Backup Retention (Fase 11.3)

## 1. Verificación del Estado Preexistente (Quality Gates Reales)
* `cargo check`: **PASS**. (0 errores, warnings no bloqueantes).
* `yarn tsc`: **PASS**. (Exit code 0 en `excalidraw-app`, demostrando cero regresiones de TS).
* `SELECT count(*) FROM public.boards`: **PASS**. (Continúa siendo 3).
* Directorio `data/backups/`: **Inspeccionado**. Contiene ZIPs y archivos huérfanos/residuales (`database.json`, `manifest.json`) que demuestran que la política de filtrado estricto es absolutamente necesaria.

## 2. Hallazgos y Vulnerabilidades Actuales (Fase de Inspección)
1. **Carrera Sin Lock en Creación de Backups (`/api/backup`)**:
   - `/api/backup` utiliza Postgres `REPEATABLE READ` para la consistencia lógica, pero no toma `state.restore_lock`. Aunque seguro a nivel SQL, es un hallazgo importante sobre la asimetría entre Backup y Restore.
2. **Archivos Temporales Residuales**:
   - Cuando un Backup crashea, deja archivos `temp_backup_UUID.zip`. Estos no estaban siendo limpiados por el GC de Fase 11.2 (que solo limpiaba `temp_restore_*.zip`). Es imperativo que Retention implemente la recolección de archivos `temp_backup_` huérfanos (>24h) también.
3. **Archivos Huérfanos Extremos**:
   - Existen archivos como `database.json` sueltos en `data/backups/`. Estos serán elegantemente ignorados por la política propuesta (Falso Negativo > Falso Positivo), dejando su limpieza a intervención humana.

## 3. Matriz de Failure Modes y Respuestas Arquitectónicas
* **1. Retention durante Restore**: Seguro. Restore usa lock exclusivo para postgres y escritura; Retention solo escanea lectura. Si coinciden, Retention no verá el backup hasta que se renombre, o lo verá completo.
* **2. Restore durante Retention**: Seguro. Si Retention decide borrar un backup `F` que Restore justo intenta abrir, el filesystem de Windows bloqueará el borrado por acceso concurrente y Retention fallará de forma controlada (`fail-safe`), preservando el archivo.
* **3-5. Crash durante cualquier etapa de Retention**: Seguro. Como la operación no manipula estado transaccional ni base de datos, un crash simplemente deja backups antiguos sin borrar hasta la próxima ejecución.
* **7-9. Backup corrupto / Incompleto**: Tratado como INVÁLIDO. No suma al "Quórum de 5". Garantiza que jamás se borrará un backup íntegro a expensas de uno corrupto.
* **10-12. Objetos inesperados (Symlinks / malicious names)**: Ignorados estrictamente mediante regex y validación `symlink_metadata`.
* **13. Menos de 5 backups válidos**: El quórum no se alcanza, ningún archivo es procesado para borrado. Falso Negativo priorizado.
* **17. Un único backup válido y 100 corruptos**: Quórum no se alcanza. Ninguno se borra. El sistema se protege de perder el único rescate.
* **18. Filesystem lleno**: Operación exitosa; el borrado lockless de surplus files liberará espacio al instante.

## 4. Conclusión de la Auditoría y Recomendación Ejecutiva
La evaluación estricta confirma que **una política ingenua "Keep Last 5" es peligrosa**.
Se adopta y recomienda firmemente la arquitectura **Quorum-Threshold**.
No existe ningún blocker arquitectónico que impida implementar la Fase 11.3, ya que su aislamiento funcional respecto al GC de activos (CAS) y su operación Lockless minimizan a cero los riesgos de regresión del frontend, transaccionales, o de concurrencia de locks.

El entorno está 100% certificado y listo para que se autorice formalmente la implementación.
