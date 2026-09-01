# Reporte de Implementación - Fase 11.3 (Backup Retention)

## 1. Archivos Modificados y Creados
* **[NUEVO] `bridge/src/backup_retention.rs`**: Módulo core de limpieza, aislado, determinista y lockless.
* **[MODIFICADO] `bridge/src/main.rs`**: Se registró el módulo y se agregó el endpoint administrativo `POST /api/backup-retention`.
* **[NUEVO] `excalidraw-app/tests/boards/phase11_3.test.ts`**: Batería de pruebas que verifica la política híbrida (tiempo + cantidad) y comportamiento frente a archivos huérfanos/corruptos.

## 2. Arquitectura de la Política Híbrida
El algoritmo `run_retention` consta de los siguientes pasos atómicos:
1. **Scan Lockless**: Itera `data/backups/` mediante `fs::read_dir`.
2. **Rechazo Default**: Archivos que no coinciden estrictamente con `^backup_excalidraw_(\d{8})_(\d{6})\.zip$` o `temp_backup_*.zip` son ignorados. Los symlinks son detectados y descartados.
3. **Limpieza de Temporales**: Si es un `temp_backup_*.zip` y su `mtime` tiene más de 24 horas de antigüedad, se elimina de forma segura y temprana.
4. **Validación Estructural Anti-DoS**: Por cada backup candidato, evalúa su tamaño en disco (límite duro de 10GB) y lee exclusivamente la Central Directory del ZIP (límite duro de 100,000 entradas). Si la lectura de Central Directory arroja que existen los archivos `manifest.json` y `database.json`, el backup suma al "quórum de validez". **Bajo ninguna circunstancia descomprime ni carga JSON en memoria**, logrando O(1) en RAM.
5. **Determinación del T_cutoff**: 
   * Extrae la fecha estampada en el propio nombre (independiente de `mtime`).
   * Calcula `T_7days` (fecha actual - 7 días).
   * Al alcanzar el 5to backup válido (descendente), memoriza su fecha como `T_quorum`. Si hay menos de 5, `T_quorum` es `-Infinity`.
   * El umbral final se define como `min(T_quorum, T_7days)`.
6. **Sweep Fail-Safe**: Todos los archivos (válidos o corruptos) con timestamp de nombre `< T_cutoff` se eliminan. Errores de filesystem (ej. archivo en uso por Restore) generan un log pasivo sin pánico, honrando el principio de idempotencia.

## 3. Resiliencia contra Vectores de Ataque
* **Rapid-Fire Restores**: 5 copias en el último minuto garantizan `T_quorum = actual`, pero `T_cutoff` cae a 7 días atrás. Esto retiene el historial de una semana por defecto, evitando que un ciclo intenso purgue backups legítimos anteriores.
* **Disk Exhaustion por Bugs**: Si el sistema generase copias corruptas sistemáticas, nunca sumarán al quórum de 5. `T_cutoff` permanecerá `-Infinity` y nunca se borrará nada. **Resultado deseado (Fail-Safe)**: Un humano se enterará por alerta de disco lleno, garantizando retención total de la escena del crimen y minimizando riesgo de Data Loss.

## 4. Invariantes Mantendidas
* `public.boards` se mantuvo incólume.
* `schema_migrations` ni la arquitectura persistente de la DB se alteró.
* El endpoint no expone `DELETE` destructivo de data viva, y al ser lockless no traba los recursos HTTP compartidos de Axum.
* **No se tocaron herramientas de GC (Fase 11.2).** Ambas herramientas conviven como endpoints administrativos complementarios y separados.
