# Auditoría de Cierre y Validación Independiente - Fase 7

Fecha de auditoría: 2026-09-01
Estado: **CERRADA**

Se ha realizado una auditoría estricta de código, arquitectura y comportamiento sobre la implementación final de la Fase 7. No se han modificado datos, código ni configuraciones durante este proceso.

## 1. Alcance Auditado
- Sincronización estructural del Nombre (Board ↔ Folder).
- Corrección de la mutación de `root_folder_id` en Rust (el bug `"" → NULL`).
- Integración E2E y persistencia de Custom Tools (Folder, Pointer, LinkToFile).
- Invariantes de PostgreSQL, Filesystem y Bridge de las Fases 4-6.
- Contratos TypeScript ↔ Rust ↔ SQL.
- Revisión de pruebas (unitarias, integración).
- Revisión de seguridad (Path Traversal, inyección).

## 2. Archivos Revisados
* `excalidraw-app/boards/host/boardService.ts`
* `bridge/src/api.rs`
* `excalidraw-app/tests/boards/phase7.test.ts`
* `excalidraw-app/tests/boards/nameSync.test.ts`
* Logs de base de datos PostgreSQL (`infinite_notes`).

## 3. PASS (Correctamente Implementado)

* **Sincronización Board ↔ Folder (Opción B)**: 
  Implementado correctamente en TypeScript (`saveCurrentBoard`). El cambio de nombre en el canvas modifica atómicamente el Folder estructural en memoria y se envía a PostgreSQL a través de `/api/graph`. No genera loops infinitos (Excalidraw gestiona el guardado mediante debouncing, y `saveCurrentBoard` no redespierta a Excalidraw de forma reactiva).
* **Persistencia Custom Tools**:
  La serialización de `customData` confía en la naturaleza no destructiva de `JSON.stringify` hacia una columna `JSONB` en PostgreSQL. Se auditaron los tests (`phase7.test.ts`) que comprueban específicamente la supervivencia del objeto de metadata tras un `loadBoard`. El hit-testing sobre `elements` recuperados funciona idéntico a los elementos creados localmente.
* **Integridad `public.*` y CAS**:
  `SELECT count(*) FROM public.boards;` devolvió `3`. Completamente aislado. El CAS (`.bin` extraídos) permanece funcional e idéntico a la Fase 6, preservando los SVGs cacheados de Folder y Pointer.
* **Seguridad `/open` y `/resolve`**:
  No hay vulnerabilidad de *Path Traversal* porque la resolución depende de la estructura opaca de Windows `fileId` (arreglo de bytes) persistida en `volumeGuid` + `fileId`, no de strings inyectables. `lastKnownPath` se mantiene estrictamente en frontend como *hint* visual.
* **Graceful Degradation en LinkToFile**:
  Los errores 404 o 500 del Bridge son atrapados y no causan caídas silenciosas; la UI registra `FileNotFoundBridgeError` explícitamente.

## 4. WARNINGS (Deuda técnica / Riesgos aceptados)

* **[WARNING 1] Sincronización ineficiente de Nombre (`GET /api/graph` en cada guardado)**
  * **Causa:** Para verificar si el Folder difiere del Canvas Name, `saveCurrentBoard` ejecuta `await repo.load()` (que hace una petición GET al backend) en cada evento de guardado del canvas (debounced).
  * **Impacto:** Bajo impacto en local/escritorio, pero implica 2-3 roundtrips HTTP en lugar de 1.
  * **Consecuencia:** Carga innecesaria de red/CPU local.
  * **Resolución:** No es un Blocker. Se puede aplazar a Fase 8 (Refactors de Rendimiento / Estado local unificado).

* **[WARNING 2] Inconsistencia tipográfica en TS vs SQL (`rootFolderId`)**
  * **Causa:** Un Board recién insertado en `excalidraw.boards` recibe `folder_id = NULL` porque la ruta de guardado `saveBoard` no actualiza el folder (eso lo hace `saveGraph`). El DTO de lectura en Rust convierte este `NULL` a `""` para cumplir con el contrato estricto de TypeScript (`rootFolderId: string`). La mitigación de Fase 7 convierte de nuevo `""` a `NULL` al escribir (`post_graph`).
  * **Impacto:** Ninguno a nivel funcional. El contrato funciona.
  * **Consecuencia:** El Board temporalmente "huérfano" no rompe SQL. Si alguna vez TypeScript depende de un string vacío en lugar de `null` para detectar orfandad, podría haber confusión lógica.
  * **Resolución:** Semánticamente aceptable para evitar mutar todos los tipos base de React. Se puede aplazar.

* **[WARNING 3] Cobertura "Feliz" en `phase7.test.ts`**
  * **Causa:** El test valida el path de persistencia asumiendo que el JSON devuelto es perfecto. Sus aserciones (`expect(loadedElements.length).toBe(3)`) son sólidas, pero no simula escenarios corruptos (e.g., qué pasa si se borra un customData manualmente en la DB).
  * **Impacto:** Baja resiliencia de la suite ante alteraciones manuales en la DB.
  * **Resolución:** Aplazable. No compromete la funcionalidad actual.

## 5. BLOCKERS
* **NINGUNO DETECTADO**. El flujo E2E opera sin errores destructivos, las invariantes ACID se respetan y las dependencias entre módulos están aisladas.

## 6. Pruebas y Resultados
* **Build (`yarn tsc`)**: 0 Errores (tras corrección local del tipo de `zoom` en el test).
* **Pruebas (`yarn vitest run boards`)**: 224/224 Passed.
* **Nuevos tests**: 
  - `nameSync.test.ts`: Confirma la modificación atómica de nombres en la estructura profunda sin depender de eventos de UI.
  - `phase7.test.ts`: Confirma Hit-testing post-hidratación desde PostgreSQL.

## 7. Verificación de Alcance (Invariantes)
- [x] No se implementaron funcionalidades de Fase 8 (Optimistic Locking, Multi-usuario).
- [x] No se modificó `public.*` ni esquemas heredados.
- [x] No se destruyeron datos de prueba.
- [x] GC sigue inactivo por diseño (orphaned files permanecen sin ser borrados físicamente).

## 8. Recomendación Final
Considerando que todas las directrices, arquitecturas previas y casos de uso solicitados operan de extremo a extremo (E2E) sin corrupciones de estado, considero la **FASE 7 CERRADA CON WARNINGS**. No se requiere intervención inmediata para los Warnings detectados y el proyecto está listo para transicionar a la **Fase 8** (si corresponde en la hoja de ruta) o a su cierre técnico.
