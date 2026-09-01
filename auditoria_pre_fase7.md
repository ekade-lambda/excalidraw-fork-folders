# Auditoría de Estado y Diseño Previo - Fase 7

Siguiendo tus directrices estrictas, he inspeccionado de manera no destructiva el sistema completo y recuperado la intención arquitectónica original sin realizar ninguna modificación al código ni a PostgreSQL.

## 1. Recuperación del Alcance Original de Fase 7
Basado en `arquitectura_persistencia_fase1.md` y `fase_1_link_to_file_diseno.md`, la Fase 7 se define originalmente como:
- **Objetivo Original:** "Integración Completa: Validar Custom Tools (Pointer, Folder, LinkToFile). Los metadatos en JSONB se resuelven correctamente; no se rompen relaciones ni el hit test."
- **Funcionalidades Previstas:** Asegurar que los nodos visuales inyectados en el lienzo (Pointer, Folder, LinkToFile) sobrevivan a la persistencia en SQL/CAS, retengan sus CustomData y respondan al doble clic (Ej. invocando `/open` vía Bridge para abrir archivos reales, o navegando hacia otros boards).
- **Archivos intervinientes:** `excalidraw-app/boards/link-to-file/*`, `host/pointerService.ts`, UI de hit testing, API nativa de Rust (`/resolve`, `/open`).
- **NO pertenece a Fase 7:** Garbage collection (limpieza de activos/archivos temporales huérfanos), sincronización colaborativa (optimistic locking), refactors mayores del modelo relacional.

## 2. Auditoría del Estado Actual Post-Fase 6
- **PostgreSQL:** `excalidraw` schema completamente provisionado (5 tablas). Ninguna anomalía.
- **Bridge Rust:** Plenamente integrado; CAS y Base64 operan atómicamente; los endpoints `/pick-file` y `/open` (utilizados por la Fase 7 de LinkToFile) ya están implementados y activos.
- **Filesystem / CAS:** Operacional bajo `data/assets`, sin condiciones de carrera.
- **Repository TS:** Todo el almacenamiento de Excalidraw opera a través de HTTP delegando al Bridge; IndexedDB está deprecado lógicamente para estos flujos.

## 3. Separación Conceptual Board vs Folder (Análisis)
**[WARNING] Deuda de Sincronización**
- **Diferencia conceptual:** Sí son diferentes. `Folder` es el nodo del File Explorer (árbol); `Board` es el lienzo físico.
- **Propiedad del Nombre:** Arquitectónicamente, el backend asume que el nombre pertenece al `Folder` (`LEFT JOIN excalidraw.folders`).
- **Problema Detectado:** Si un usuario renombra "Board X" escribiendo en la *cabecera del lienzo* (dentro del UI de Excalidraw), Excalidraw modifica `BoardData.name` y guarda el board. Pero en Rust, `post_board` IGNORA el nombre. Al recargar, volverá a leer el nombre desde el `Folder` devolviendo su valor antiguo.
- **Impacto:** Modificar el nombre en el lienzo se perderá silenciosamente. Solo renombrar la carpeta en el File Explorer persiste el cambio.

## 4. Auditoría de Invariantes del Board System
- **Folders y Boards:** Los Soft Deletes se mantienen (columna `deleted_at`). `Boards` mantiene su Foreign Key `ON DELETE RESTRICT` hacia Folders. Ningún ciclo ni orfandad encontrada.
- **Pointers:** Target id válido y sin orfandad estructural (cuando se borran, se eliminan físicamente `DELETE FROM excalidraw.pointers`).
- **Assets:** La semántica CAS está garantizada. Distintos pointers al mismo SVG utilizan solo 1 archivo en disco.

## 5. Auditoría de Relaciones de Eliminación
- Cuando el frontend elimina un `Folder`, la capa de TS (vía `domain/delete.ts -> descendantIds()`) acumula **todos** los subfolders, boards contenidos y pointers físicos que estaban en ese subárbol, generando un `DeletePatch` masivo y determinista que `/api/transaction/apply` aplica atómicamente.
- **Seguridad:** [PASS]. Todo se resuelve en un solo commit ACID.
- **Huérfanos resultantes:** Quedan archivos `.bin` y registros SQL en `assets` para los cuales no existen boards activos que los usen. Esto es seguro y reversible (es decir, el soft-undelete de boards los re-activaría). No hay corrupción.

## 6. DB ↔ Filesystem y Garbage Collection
- Fase 7 **NO** necesita interactuar con Garbage Collection o reparación de assets. El comportamiento actual (soft deletes que dejan los archivos físicos vivos y temporales huérfanos tras caídas del proceso) es aceptable en esta etapa del proyecto. Se considerará una mejora de operaciones futura (cron de limpieza).

## 7. Problemas Pendientes Anteriores
1. **Name Ignorado (WARNING):** [Activo, prioridad ALTA para Fase 7 o UI]. El input del header de Excalidraw debe comunicarse con el FolderService, no solo con el BoardService.
2. **Archivos Temporales Huérfanos (WARNING):** [Activo, prioridad BAJA]. Aplazable.
3. **Optimistic Locking / N+1 Clone:** [Activos, prioridad BAJA]. Aplazables por ser problemas de rendimiento/concurrencia de red.

## 8. Backward Compatibility y Legacy
- **Legacy aisalado:** `SELECT count(*) FROM public.boards;` -> `3`. **[PASS]**.
- Tableros fase 5 con `dataURL` en crudo son interceptados por `hydrate_assets` pasivamente y se extraen al filesystem al momento de volver a guardarse.

## 10. Quality Gates
Se ejecutó de forma limpia y no destructiva:
- `yarn tsc`: **0 errores**.
- `yarn vitest run PostgresBoardRepository`: **5/5 tests passed**.

## 11. Diseño Propuesto para Fase 7
- **A. Objetivo:** Garantizar que los nodos visuales `Pointer`, `Folder` y `LinkToFile` retengan sus metadatos (`customData` JSONB) bajo el nuevo backend PostgreSQL y respondan exitosamente a los eventos de usuario (doble clic) interactuando con la API del OS subyacente.
- **B. Arquitectura:** El hit testing de la interfaz de Excalidraw captura el doble clic -> Invoca a `openLinkToFile.ts` -> Éste utiliza `bridgeClient.ts` para invocar `/resolve` y `/open` en Rust.
- **C. Resolución de Inconsistencias:** Si un `LinkToFile` indica que la ruta física del documento local ha cambiado, la UI actualiza su `customData` y persiste nuevamente la modificación en el backend.
- **D. Atomicidad:** Esta fase es predominantemente de lectura y ejecución de SO local, no existen operaciones SQL complejas nuevas.
- **E. Tests a crear:** Pruebas de integración asegurando que al cargar un Canvas desde Postgres, los `Pointer`s conservan su propiedad `targetFolderId` y los `LinkToFile` su `volumeGuid`.

---

## DECISIONES QUE NECESITO AUTORIZAR

1. **Sincronización del Nombre (Renombrado desde el Lienzo)**
   *Contexto:* Actualmente renombrar el tablero desde el lienzo (UI de Excalidraw) no se persiste, porque el nombre oficial es el de su Folder padre, el cual solo se puede cambiar en el explorador de archivos.
   * *Opción A:* Bloquear el input de nombre en la cabecera del lienzo y forzar al usuario a renombrarlo desde la barra lateral.
   * *Opción B:* Modificar el `boardService.ts` para que, si el nombre en la cabecera cambia, envíe un `patch` atómico para actualizar la tabla `folders`.
   ¿Cuál acercamiento arquitectónico prefieres?

2. **Alcance Técnico de la Validación**
   Dado que los Custom Tools (LinkToFile) ya poseen código de hit test y eventos, ¿la Fase 7 debe centrarse exclusivamente en estabilizar y probar E2E estas herramientas contra PostgreSQL/Bridge, o implica construir algún comportamiento nuevo de la UI no implementado todavía?

Me encuentro **DETENIDO**. No he ejecutado migraciones, no he modificado código, y `public.boards` se mantiene intocable. Esperaré tu revisión de estos hallazgos y autorizaciones explícitas para proceder.
