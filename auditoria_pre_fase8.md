# Auditoría de Estado, Recuperación de Alcance y Diseño Previo - Fase 8.0

## 1. Alcance original recuperado
Según la documentación de arquitectura original (`arquitectura_persistencia_fase1.md`), el alcance de la Fase 8 es:
**"Migración Segura: Interfaz que extrae IndexedDB/LS y populará Postgres. Un entorno con datos antiguos se traslada 100% automático a Postgres y FS. IndexedDB queda obsoleto y depurado."**
Actualmente (Fase 7), `initializeBoardSystem` hace un intento muy primitivo de cargar elementos de LocalStorage si la base de datos está vacía, pero ignora completamente IndexedDB (donde viven las imágenes/archivos legados) lo que produce pérdida de assets heredados al iniciar por primera vez.

## 2. Estado actual post-Fase 7
* **Frontend:** React + TypeScript consume `PostgresBoardRepository`. Los Custom Tools (Pointer, Folder, LinkToFile) operan E2E y persisten su metadata. Existe una reconciliación rudimentaria en `boardService.ts` para capturar renombrados del Canvas y actualizar la estructura profunda (Opción B).
* **Backend:** Bridge en Rust con Axum, totalmente funcional. Los endpoints `/api/graph`, `/api/boards`, `/api/assets`, `/open` y `/resolve` están listos y responden al estándar tipográfico esperado.
* **Persistencia:** PostgreSQL maneja el grafo estructural. CAS maneja blobs asíncronos sin locks en memoria.

## 3. Invariantes Verificadas
Se comprobaron las siguientes invariantes tras el cierre de Fase 7:
- [PASS] PostgreSQL es la fuente de verdad.
- [PASS] `public.*` aislado (exactamente 3 registros en la tabla heredada).
- [PASS] Relación Board ↔ Folder se mantiene vía F-Keys (`excalidraw.boards` respeta `folder_id = NULL` usando conversión segura).
- [PASS] Soft Deletes operativos (`is_deleted`).
- [PASS] Pointers y CustomData intactos.
- [PASS] LinkToFile íntegro y sin Path Traversal.
- [PASS] Assets extraídos a CAS con Lazy Migration activa.

## 4. Deuda Técnica Acumulada
* **[WARNING] Reconciliación de Borrado**: `POST /api/graph` es un UPSERT ciego. No infiere borrados por ausencia. Se autorizó como invariante arquitectónica.
* **[WARNING] Orphaned Assets (GC)**: Elementos eliminados en Canvas no purgan el blob físico (CAS) ni la metadata en DB. Aplazado para operaciones de mantenimiento.
* **[WARNING] Ineficiencia de `GET /api/graph`**: Guardar un Board consulta la estructura de red para sincronizar nombre.
* **[WARNING] Carga Legacy sin Assets**: `readLegacyElements()` lee LS pero abandona `files-db` en IDB, perdiendo imágenes antiguas.

## 5. Problemas Encontrados y Severidad
Ninguno de los problemas encontrados viola las invariantes arquitectónicas. La deuda técnica descrita tiene nivel **WARNING (No Bloqueante)**, por lo que el terreno es 100% seguro para diseñar Fase 8.

## 6. Alcance Propuesto de Fase 8 (Migración Segura)
**Objetivo:** Desarrollar un mecanismo robusto que detecte una instalación local antigua (LocalStorage + IndexedDB `files-db`), extraiga sus elementos y blobs, y los persista ordenadamente en PostgreSQL + CAS como el "Board Inicial" del usuario, limpiando el almacenamiento web tras el éxito.

## 7. No-Alcance
* Sincronización colaborativa o Multi-usuario.
* Garbage Collection de la DB (se mantiene como deuda técnica para DevOps/CLI).
* UI compleja de importación de archivos `.excalidraw` arbitrarios (solo migraciones de estado *interno* local).

## 8. Diseño Arquitectónico
Se implementará un *Migration Manager* asíncrono en `initializeBoardSystem`:
1. **Detección:** Si `hasLegacyState()` devuelve true.
2. **Extracción:**
   - Lee `excalidraw` y `excalidraw-state` de LS.
   - Lee todo el `files-db` (idb-keyval) reconstruyendo el mapa de `BinaryFileData`.
3. **Conversión:** Envuelve todo en la estructura `BoardData`.
4. **Persistencia:** Llama a `PostgresBoardRepository.saveBoard(data)` e inicializa el grafo creando una carpeta por defecto (ej. "Migración Local").
5. **Limpieza:** Una vez que la API responde 200 OK, ejecuta `localStorage.removeItem` y `clear("files-db")`.

## 9. Flujo de Datos
`IndexedDB + LS` -> `MigrationManager` -> (Memoria: `BoardData`) -> `HTTP POST /api/boards` -> `Rust Axum` -> `Postgres + CAS (FS)`.

## 10. Contratos y Tipos
Se aprovechará la infraestructura existente de Lazy Migration en la API:
* El MigrationManager inyectará los archivos en formato base64/dataURL dentro del objeto `files` en memoria.
* El endpoint `saveBoard` tratará estos archivos como nuevos (gracias al parche implementado en Fase 6) y los subirá automáticamente a `/assets/upload`, transformándolos en hashes CAS transparentemente.

## 11. Archivos Afectados Potencialmente
- `excalidraw-app/boards/host/boardService.ts` (Refactor de `readLegacyElements`).
- `excalidraw-app/data/LocalData.ts` o módulo de migración (para exponer el IDB extractor).
- Interfaz gráfica (Spinner o indicador de carga durante boot).

## 12. Migraciones PostgreSQL
Ninguna. La arquitectura subyacente ya soporta boards y blobs arbitrarios.

## 13. Riesgos
- **Out of Memory (OOM)**: Si el usuario tenía docenas de imágenes pesadas en IDB (ej. 200MB+), cargarlas simultáneamente como DataURL podría colapsar la pestaña. (Es raro, un Board individual legado suele pesar < 50MB, pero factible).

## 14. Consecuencias de Segundo Orden
- **Limpieza de estado**: Eliminar IDB/LS romperá cualquier otra instancia no migrada en otros puertos/ventanas (se asume que la nueva app es la única válida).
- **Simplifica**: Elimina la dualidad conceptual del estado de arranque (adiós al fallback legacy híbrido).

## 15. Estrategia de Testing
- **Unit/Integration Tests**: Crear un test que simule data en IndexedDB mockeado, corra el boot manager, y aserte que el backend recibe el POST con los archivos intactos y que LS es limpiado.
- **E2E Visual**: Cargar el branch previo, arrastrar 3 imágenes a la UI, guardar, cambiar al branch actual, iniciar y ver cómo las 3 imágenes migran al servidor SQL sin pérdida visual.

## 16. Quality Gates Obligatorios
1. El compilador TypeScript no emite errores (`yarn tsc`).
2. Las pruebas preexistentes pasan, especialmente el entorno CAS (224/224).
3. Prueba unitaria del `MigrationManager` con 100% de éxito.
4. Repositorio `public.*` sin tocar.

## 17. Criterios de Aceptación
1. Un navegador con arte y fotos previas arranca y migra todo su contenido en menos de 5 segundos.
2. Tras la migración, la consola de Chrome no muestra `excalidraw` en LS ni assets en IDB.
3. El tablero aparece en el "File Explorer" con todo el contenido disponible offline (vía localhost).

## 18. Decisiones que requieren tu autorización
1. **OOM vs Batching:** ¿Confiaremos en que el board heredado cabe en RAM durante la migración (DataURLs), o exiges una subida iterativa (archivo por archivo) antes de guardar el Board?
2. **Nombre de Carpeta por Defecto:** ¿El board legado migrado se ubicará en la raíz del Grafo, o creamos una carpeta llamada "Datos Migrados"?
3. **UX Blocking:** ¿Autorizas mostrar un `<div>Migrando tus datos de versión antigua...</div>` bloqueante mientras ocurre este proceso, para evitar que el usuario dibuje antes de que termine?
