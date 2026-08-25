report = """# Auditoría y Plan Técnico — FASE 10 (Hardening)

### 1. Auditoría del Estado Actual
- **Funcionalidad estable:** Rename, creación de carpetas, navegación, punteros e integración con el editor de Excalidraw operan correctamente. La corrección de Data URLs en memoria (Fase 9) es robusta.
- **Persistencia Actual (`LocalStorageBoardRepository`):**
  - Implementa lecturas/escrituras en `window.localStorage` encapsuladas en `safeSet()`.
  - **Déficit de Cuota:** `safeSet()` captura errores (como `QuotaExceededError` muy común por los DataURLs de imágenes) y los ignora silenciosamente. Si se llena la cuota (5MB), los cambios en los tableros se pierden sin que el usuario lo sepa.
  - **Déficit Multi-Tab:** No existe coordinación real entre pestañas (no se usa `tabSync.ts` para el grafo). Si dos pestañas guardan, es un *last-write-wins* a ciegas que puede sobrescribir ramas del grafo.
  - **Déficit de GC:** Los boards eliminados o las representaciones huérfanas no se purgan activamente de forma confiable, consumiendo cuota inútilmente.
- **Frontera:** El core (`packages/excalidraw/*`) se mantiene limpio, y `idb-keyval` ya está disponible en `package.json` para usarse como fallback asíncrono seguro.

### 2. Invariantes a Preservar (Obligatorios)
Ninguna implementación de la Fase 10 podrá romper lo siguiente:
1. Funcionalidad de Rename (input, blur, UI contextual).
2. Renderizado de iconos y su correcta normalización Base64.
3. Compatibilidad hacia atrás de los tableros persistidos.
4. Tipado estricto (0 errores en TypeScript).
5. Código del Core (`packages/excalidraw/*`) intocable.
6. Tests actuales de dominio, integración y normalización (Vitest 100% green).

### 3. Alcance Estricto (Qué SÍ es Fase 10)
1. **Manejo de Cuota (Fallback a IndexedDB):** Si `localStorage.setItem` falla, interceptar el error y escribir el payload pesado del board en IndexedDB de forma transparente.
2. **Garbage Collection (GC) Físico:** Implementar una rutina que compare el índice global de tableros (`BoardsGraph`) contra el almacenamiento real, limpiando los payloads huérfanos.
3. **Señalización Multi-Tab Básica:** Usar el patrón de Excalidraw (versiones en `localStorage` o eventos `storage`) para notificar al store del Board System cuando el `BoardsGraph` cambie en otra pestaña.

### 4. Estrategia de Implementación

**Arquitectura y Archivos Afectados:**
- **`excalidraw-app/boards/repository/LocalStorageBoardRepository.ts`**:
  - Modificar `saveBoard` para intentar `localStorage.setItem`; si arroja error de cuota, ejecutar `idb.set(key, value)`.
  - Modificar `loadBoard` para que si no halla el dato en localStorage, lo busque en IndexedDB.
  - Añadir rutina `garbageCollect(graph)` para purgar datos muertos.
- **`excalidraw-app/app_constants.ts` / `tabSync.ts`**:
  - Registrar una clave `STORAGE_KEYS.VERSION_BOARDS_GRAPH`.
- **`excalidraw-app/boards/host/boardService.ts`**:
  - Registrar el listener de `window.addEventListener("storage", ...)` para detectar colisiones y disparar recargas seguras.

**Riesgos Técnicos:**
- Hacer que `loadBoard` deba consultar IndexedDB (asíncrono) podría requerir adaptar código si alguna ruta asumía disponibilidad 100% síncrona de un tablero, aunque la API del repositorio ya devuelve `Promise<BoardData | null>`.
- El recolector de basura (GC) podría borrar un tablero accidentalmente si se ejecuta antes de que otra pestaña termine de registrarlo.

**Estrategia de Tests (`tests/boards/repository.hardening.test.ts`):**
- Mockear `localStorage.setItem` para que lance `QuotaExceededError`.
- Verificar que el repositorio escribe en IDB (mockeado) y puede recuperar el dato.
- Verificar que la función de GC elimina del almacenamiento las keys que no pertenezcan al grafo vigente.

**Criterios de Aceptación Objetivos:**
1. Crear un board gigante que rebase la cuota no rompe la app ni pierde datos.
2. Los tableros borrados lógicamente desaparecen físicamente del disco.
3. Abrir la app en 2 pestañas y crear una carpeta en la Tab A, actualiza el índice en la Tab B (o al menos no corrompe la estructura al cerrar).
"""

with open("plan_fase_10.md", "w", encoding="utf-8") as f:
    f.write(report)
