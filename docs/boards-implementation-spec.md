# Especificación de implementación — Sistema de Boards Anidados

**Repositorio:** `excalidraw-fork-folders` (monorepo Excalidraw, commit auditado `48d206cc`, rama `master`)
**Estado:** especificación aprobada como base de trabajo. NO implementar aún.
**Regla de oro:** EXCALIDRAW CORE = editor de escenas · BOARD SYSTEM = sistema de organización/navegación que vive **encima** del editor.

---

## 1. Arquitectura final aprobada

### 1.1 Principio rector

El **Board System** es una capa de **aplicación** alojada íntegramente en `excalidraw-app/`. NO convierte el core de Excalidraw en un filesystem. El core solo edita "la escena del board actual". Toda la jerarquía, identidad, navegación y persistencia multi-board vive fuera del core.

### 1.2 Capas y su pertenencia

| Capa | Dónde vive | Responsabilidad |
|---|---|---|
| **Dominio** | `excalidraw-app/boards/domain/` | Modelo puro: `Board`, `Folder`, `FolderPointer`, `BoardsGraph`, `BoardData`, `NavigationHistory`. Lógica de árbol (ancestors/descendants/path/cycle), identidad, delete transaccional, copy/remap. **Sin React, sin core, sin localStorage.** |
| **Infraestructura / Persistencia** | `excalidraw-app/boards/repository/` | `BoardRepository` (interfaz) + `LocalStorageBoardRepository`. Orquesta `localStorage` + IndexedDB existente. |
| **UI** | `excalidraw-app/boards/ui/` | Overlays React: breadcrumb, back/forward, picker de destino de pointer, menú de contexto de folder, botones de herramientas. |
| **Integración con Excalidraw** | `excalidraw-app/boards/host/` | Traducción dominio ↔ editor: materialización visual, hit-testing, doble-clic, `setActiveTool`, `updateScene`, guardar/abrir, clipboard. |
| **Navegación** | `excalidraw-app/boards/navigation/` (dominio + hook) | `NavigationHistory`, breadcrumb derivado del árbol, back/forward, `currentBoardId`/`currentFolderId`. |
| **Clipboard** | `excalidraw-app/boards/clipboard/` | Serialización distinta para elementos / folder / pointer; delegación al clipboard del core para elementos normales. |

### 1.3 Comunicación entre capas

```
UI ──► servicios (host) ──► dominio ──► repository ──► localStorage/IndexedDB
      │        │                    ▲
      │        └──► ExcalidrawImperativeAPI (updateScene, setActiveTool, onChange…)
      └─► estado reactivo (jotai en excalidraw-app)
```

- Los **servicios** (`boards/services/`) son el único punto por el que la UI toca el dominio y el editor. `ExcalidrawWrapper` (en `excalidraw-app/App.tsx`) actúa como **composition root**: construye los servicios con el `excalidrawAPI` y los inyecta vía contexto/jotai.
- El **dominio es síncrono y puro**; los servicios orquestan async (persistencia) y side-effects (editor).
- El **estado del editor** sigue siendo fuente de verdad de la escena; el Board System solo conoce *qué board está abierto* (`currentBoardId`) y *dónde guardarlo*.

### 1.4 Dependencias permitidas / prohibidas

**Permitidas:**
- `domain` → tipos propios + `@excalidraw/common` (solo utilidades puras: `randomId`, coords) — preferir no depender ni del core.
- `repository` → `domain` + `excalidraw-app/app_constants` + (opcional) `idb-keyval`.
- `host/integración` → `domain`, `repository`, `@excalidraw/excalidraw` (API), `@excalidraw/element` (utilidades de elemento: `newElement`, `newElementWith`, `convertToExcalidrawElements`, `viewportCoordsToSceneCoords`, `hitElementItself`/`isPointInElement`, `ElementsMap`), `@excalidraw/common`.
- `ui` → `domain`, `host/servicios`, jotai de `excalidraw-app`.

**Prohibidas:**
- `domain` → NO React, NO core (`@excalidraw/excalidraw`), NO `localStorage` directo, NO DOM.
- `ui` y `host` → NO escribir `localStorage` directamente (siempre vía `BoardRepository`).
- Ninguna capa → NO importar internos de `packages/excalidraw/components/App.tsx` (solo API pública e index exports).
- Ninguna capa → NO tocar los archivos protegidos de la §17.

### 1.5 Dónde NO va nada

- No se añade jerarquía a `AppState`.
- No se reemplaza clipboard/undo/redo/library/export del core.
- No se guarda desde componentes React hacia `localStorage`.
- No se usan nombre ni path como identidad.

---

## 2. Modelo de datos definitivo

### 2.1 Cuestiones abiertas resueltas (respuesta inequívoca)

**¿Folder = ubicación y Board = contenido, o relación 1:1?**

**DECISIÓN: Folder y Board tienen relación 1:1.** Cada Folder real tiene exactamente un Board asociado (`Folder.boardId`), y cada Board pertenece a exactamente una Folder.

**Justificación:**
- "Ubicación" y "contenido" son dos caras de la misma entidad real: una carpeta no existe sin su contenido y al abrirla se navega a ese contenido.
- Mantener DOS tipos separados (uno con `parentId`/nombre y otro con elementos) seguiría siendo 1:1 en la práctica, pero con doble bookkeeping y riesgo de desincronización.
- Conservamos **dos IDENTIFICADORES distintos** (`Folder.id` y `Board.id`) aunque la cardinalidad sea 1:1: la carpeta puede moverse/renombrarse sin tocar la identidad del content-store, y el copy exige un `Board.id` nuevo aunque copiemos una carpeta. El vínculo es explícito: `Folder.boardId`.

**Resumen:** `Folder` = nodo de ubicación + identidad (padre, nombre, icono). `Board` = contenedor del contenido (elements, files, viewport mínimo). 1:1 mediado por `Folder.boardId`.

### 2.2 Tipos exactos

```ts
// ===== IDs =====
export type FolderId = string;          // UUID global (nanoid) — identidad GLOBAL
export type FolderPointerId = string;   // UUID global — identidad GLOBAL (namespace propio)
export type BoardId = string;           // UUID global — identidad GLOBAL

// ===== Board (contenido) =====
export interface Board {
  id: BoardId;                     // identidad global, única
  name: string;                    // nombre legible del board (derivado)
  rootFolderId: FolderId;          // la Folder dueña de este board (1:1)
  createdAt: number;
  updatedAt: number;
  viewport?: BoardViewport | null; // SOLO mínimo restaurable, NO AppState completo
}
export interface BoardViewport {
  scrollX: number; scrollY: number; zoom: number;
}

// ===== Folder (nodo de ubicación real) =====
export interface Folder {
  id: FolderId;                    // identidad GLOBAL única
  name: string;                    // NUNCA es identidad
  icon?: { dataUrl: string } | null; // icono custom (imagen) o default
  parentId: FolderId | null;       // null => carpeta raíz (UNA ubicación oficial)
  boardId: BoardId;                // 1:1 — el contenido de esta carpeta
  createdAt: number;
  updatedAt: number;
}

// ===== FolderPointer (referencia independiente) =====
export interface FolderPointer {
  id: FolderPointerId;             // identidad del POINTER (única, distinta del target)
  targetFolderId: FolderId;        // → carpeta REAL
  name?: string;                   // etiqueta visual del pointer (p. ej. "↗ Humano")
  icon?: string | null;            // override visual opcional
  createdAt: number;
}

// ===== Grafo global =====
export interface BoardsGraph {
  schemaVersion: number;           // MIGRACIONES FUTURAS
  rootFolderId: FolderId;          // raíz (Folder con parentId:null)
  folders: Record<FolderId, Folder>;
  pointers: Record<FolderPointerId, FolderPointer>;
  boards: Record<BoardId, Board>;
  lastOpenBoardId: BoardId | null; // para restaurar en reload
}

// ===== Contenido de un board (payload persistido) =====
export interface BoardData {
  schemaVersion: number;
  boardId: BoardId;
  elements: ExcalidrawElement[];   // escena (incluye representaciones folder/pointer)
  files: BinaryFiles;              // imágenes del contenido
  viewport?: BoardViewport | null;
  name: string;
  updatedAt: number;
}

// ===== Navegación (SEPARADA de parentId) =====
export type NavEntry = { kind: "board" | "folder"; id: string; boardId: BoardId };
export interface NavigationHistory {
  back: NavEntry[];
  forward: NavEntry[];
}
```

### 2.3 Respuesta a las preguntas de identidad

| Pregunta | Respuesta |
|---|---|
| ¿Cuál es la raíz? | La `Folder` con `parentId === null`, referenciada por `BoardsGraph.rootFolderId`. Es una Folder como cualquier otra, con su `boardId` (board raíz). **No puede eliminarse ni retirarse de `rootFolderId`.** |
| ¿Qué entidad posee `parentId`? | **Solo `Folder`**. `FolderPointer` NO tiene `parentId` y **no puede ser hijo** (es nodo del grafo de referencias, no del árbol). |
| ¿Qué entidad posee el nombre? | `Folder.name` (nombre oficial). `FolderPointer.name` es una **etiqueta visual opcional**. `Board.name` es duplicado legible (derivado, no fuente de verdad). |
| ¿Qué entidad posee el icono? | `Folder.icon` (icono real). `FolderPointer.icon` override visual del pointer. |
| ¿Qué entidad tiene identidad global? | `Folder.id`, `FolderPointer.id`, `Board.id` — todas en namespaces independientes, todas únicas. El pointer NUNCA reutiliza el id del target. |
| ¿Qué entidad contiene los elementos de Excalidraw? | `BoardData.elements` (vía `Board` → 1:1 → `Folder.boardId`). Elementos visuales identificados por `customData.folderBoard` (ver §5). |
| ¿Cómo se obtiene la ruta absoluta? | Derivando la cadena de `parentId` desde el nodo hasta la raíz: `ancestors(folderId)` → `reverse().map(f => f.name)`. **Nadie almacena la ruta como fuente de verdad.** |
| ¿Cómo se obtiene la ruta visual (breadcrumb)? | Misma derivación; se puede intercambiar el nombre de un nivel por la etiqueta de un pointer si la navegación entró por pointer. |
| ¿Cómo se evita que una misma carpeta real tenga dos padres? | Invariante de dominio: una `Folder` tiene **exactamente un `parentId`**; la ubicación solo cambia por `moveFolder` (valida ciclos), nunca creando dos entradas. |
| ¿Cómo se evita cualquier ciclo? | `moveFolder(newParent)` valida `newParent ∉ ancestors(folderId) ∪ {folderId}` ANTES de persistir; la validación vive en el dominio (no solo en UI). El árbol es acíclico por construcción + validación. |

### 2.4 Folder real vs FolderPointer — representación en datos

```
/investigaciones/biología/animales/humano   ← ubicación REAL de la carpeta "Humano"
/investigaciones/filosofía/…/humano         ← contiene un FolderPointer → a la MISMA carpeta
```

```ts
// Folder REAL (existe UNA sola vez)
folders["f_humano"] = {
  id: "f_humano", name: "Humano",
  parentId: "f_animales",          // UNA ubicación oficial
  boardId: "b_humano",             // su contenido
  createdAt: t0, updatedAt: t0,
};

// Pointer en Filosofía → apunta a la folder REAL
pointers["p_filo_humano"] = { id: "p_filo_humano", targetFolderId: "f_humano", name: "↗ Humano" };
// Pointer en Biología también
pointers["p_bio_humano"] = { id: "p_bio_humano", targetFolderId: "f_humano", … };
```

**Distinción técnica inequívoca Folder ≠ Pointer:**
- Un objeto **Folder** vive en `BoardsGraph.folders` y tiene `parentId`, `boardId`, `icon`: tiene **ubicación oficial** y **contenido**.
- Un objeto **FolderPointer** vive en `BoardsGraph.pointers` (namespace separado) y tiene `targetFolderId`, **sin** `parentId` ni `boardId`: no crea board ni carpeta ni cambia la ubicación de `f_humano`.
- IDs en namespaces distintos: `FolderId` y `FolderPointerId` son tipos distintos; el id del pointer nunca se usa como `parentId`, por lo que una carpeta real no puede tener dos padres a través de un pointer.

`/investigaciones/filosofía/humano` **no es** una ruta real: es una ruta *visual* que termina en un pointer. La ruta real de `f_humano` sigue siendo la de su `parentId`. La UI distingue "entré por un pointer" (nivel pointer) en el breadcrumb.

---

## 3. Modelo de persistencia definitivo

### 3.1 Re-inspección de `LocalData` (hecho verificado)

`excalidraw-app/data/LocalData.ts`:
- `saveDataStateToLocalStorage(elements, appState)` escribe **siempre en las mismas 2 claves**: `localStorage["excalidraw"]` (elements no-deleted) y `localStorage["excalidraw-state"]` (appState limpio con `clearAppStateForLocalStorage`). Debounce de 300 ms.
- `LocalData.save` está pensado para **UN solo board**. `LocalData.pauseSave/resumeSave` existe pero solo para locks tipo `"collaboration"`.
- Imágenes: `LocalFileManager` persiste en IndexedDB `files-db/files-store` por `FileId` (ids globales, con GC `lastRetrieved` > 1 día).

**Conclusión:** NO se puede convertir `LocalData` en multi-board sin modificarlo. La integración **mínima y segura** es **dejar `LocalData` intacto** (sigue siendo la capa de guardado del board actual del editor) y crear una **persistencia paralela del Board System** a cargo de `BoardRepository`. La prueba: `LocalData` no tiene noción de "board id"; forzarlo a bytes clave por board requeriría su reescritura (prohibido). En su lugar, el board activo se guarda con las claves propias del Board System y se deja que `LocalData` escriba también las claves legacy (inofensivo, ver 3.6).

### 3.2 Qué se guarda dónde

| Contenido | Destino | Clave/Store |
|---|---|---|
| Grafo del Board System (`schemaVersion`, `rootFolderId`, `folders`, `pointers`, `boards` índice, `lastOpenBoardId`) | localStorage | `excalidraw-boards-graph` |
| `lastOpenBoardId` (restore on reload) | localStorage | (incluido en la clave anterior) |
| Payload de cada board: `schemaVersion`, `boardId`, `elements`, `files`, `viewport`, `name` | localStorage | `excalidraw-board-<boardId>` |
| Iconos/imágenes grandes de folders | IndexedDB | store `excalidraw-boards-db/files` vía `idb-keyval` (solo si supera cuota de LS de la graph) |
| Imágenes de la escena (contenido) | IndexedDB (existente) | `files-db/files-store` (reutiliza `LocalData.fileStorage`, dedup por `FileId` global) |
| Datos del editor legacy (board actual del editor) | localStorage (existente, intacto) | `excalidraw`, `excalidraw-state` |

Nuevas claves se añaden a `excalidraw-app/app_constants.ts` (`STORAGE_KEYS.BOARDS_GRAPH`, `STORAGE_KEYS.BOARD_PREFIX`).

### 3.3 Cómo se identifica cada board

- Por `BoardId` (UUID). El payload vive en `excalidraw-board-<boardId>`. El índice `BoardsGraph.boards[boardId]` guarda metadatos ligeros (+ `viewport`) para no leer el payload completo de cada board al abrir la app.

### 3.4 Cómo se carga un board

`BoardRepository.loadBoard(boardId)` → `JSON.parse(localStorage["excalidraw-board-"+boardId])` → validar `schemaVersion` + shape → devolver `BoardData | null`. Los elementos se pasan por `restoreElements` antes de `updateScene`.

### 3.5 Cómo se guarda un board

`BoardRepository.saveBoard(boardId, data)` lee del editor: `excalidrawAPI.getSceneElementsIncludingDeleted()`, `excalidrawAPI.getFiles()`, `getAppState()` (solo para derivar `viewport`), y `getName()`. Escribe el payload + el `viewport` del índice (`BoardsGraph.boards[id].viewport`) + `updatedAt`. Escritura debounceada (300 ms) como `LocalData`.

### 3.6 Cómo se cambia de board / aislamiento A vs B

1. `saveCurrentBoard()`: escribir `excalidraw-board-<A>` desde el editor + `LocalData.flushSave()`.
2. `openBoard(B)`: leer `excalidraw-board-<B>`, `updateScene({elements, files, …})`, `addFiles`, restaurar viewport.
3. A partir de ahí `LocalData` vuelve a escribir `excalidraw`/`excalidraw-state` con los elementos de **B** (comportamiento legacy inofensivo: esas claves representan "el último state del editor"; el Board System jamás las lee como fuente de verdad).

**Aislamiento garantizado porque** cada board tiene su propia clave `excalidraw-board-<id>`; jamás se escriben los elementos de A en la clave de B. El único dato compartido es `excalidraw-boards-graph` (índice) y las imágenes por `FileId` (dedup intencional). Esto hace imposible que A sobrescriba a B salvo que un bug escriba en la clave equivocada, que es exactamente el caso cubierto por los tests de §13.

### 3.7 Ciclo cerrar/abrir navegador

Al arrancar, el Board System lee `excalidraw-boards-graph.lastOpenBoardId`. Si existe → carga ese board. Si no → **migración**: si existe `localStorage["excalidraw"]` (legacy de la app) SEMILLA la raíz: crea `rootFolderId`, un board raíz y copia los elements legacy a `excalidraw-board-<root>`; marca migrado. A partir de ahí los boards son la fuente de verdad.

### 3.8 Múltiples pestañas

- Los payloads por board ya están aislados por clave (una pestaña no mezcla A/B).
- El **índice** (`excalidraw-boards-graph`) usa **last-write-wins inicialmente** (aceptado; se documenta y se mitiga en Fase 10 con el patrón `tabSync`/versión ya existente en `excalidraw-app/data/tabSync.ts`). La política v1: la pestaña que escribe por último gana el índice; los boards abiertos en cada pestaña se guardan en su pestaña al cerrarse.

### 3.9 Corrupción de localStorage

- Todo `JSON.parse` se envuelve en try/catch.
- Validación: `schemaVersion` estrictamente `===` al actual (o rango migrable); si el grafo está corrupto → se reconstruye una raíz nueva desde cero (con warning + copia de respaldo `excalidraw-boards-graph-broken`).
- Si un **board referenciado falta** (`excalidraw-board-<id>` ausente o corrupto) → se recrea un board vacío para esa Folder (no se rompe el grafo) o se marca la carpeta "contenido perdido". Decisión: recrear vacío (operativa) + log.

### 3.10 `schemaVersion` y migraciones

- La **graph** y cada **board payload** llevan `schemaVersion` desde v1.
- `LocalStorageBoardRepository` consults `CURRENT_SCHEMA_VERSION`. Si el persistido es menor: ejecuta `migrations[schemaVersion]()` encadenadas y re-escribe. El v1 no requiere migración; se diseña el mecanismo (`const MIGRATIONS: Record<number, (g) => g>`).

---

## 4. Ciclo de vida de un Board

### 4.1 Definiciones comunes

- `currentBoardId` y `currentFolderId` (la Folder cuyo board está abierto) viven en el estado jotai del Board System, no en `AppState`.
- `editorSnapshot()` = `{ elements: getSceneElementsIncludingDeleted(), files: getFiles(), name: getName(), viewport: derivado }`.

### 4.2 CREATE (crear folder → crea su board)

| Campo | Detalle |
|---|---|
| Estado inicial | Board padre abierto (`currentBoardId = A`, `currentFolderId = f_A`). |
| Operación | `folderService.createFolder({ parentId: f_A, name, sceneX, sceneY })`. |
| Datos modificados | Nuevo `Folder` (`id` nuevo, `parentId=f_A`, `boardId` nuevo), nuevo `Board` vacío; el primero sin padre se asigna como raíz. |
| Persistencia | `BoardRepository.applyTransaction(tx)` (graph) + guardar board vacío. |
| Estado final | La folder y su board existen en el grafo; su representación visual está en el canvas de A. |
| Posibles errores | Nombre vacío → default "Carpeta". Fallo de escritura → toast, sin mutación parcial (transacción). |

### 4.3 SAVE

En `onChange` del editor (debounce) y de forma explícita antes de cada SWITCH: `boardService.saveCurrentBoard()` → `BoardRepository.saveBoard(currentBoardId, editorSnapshot())` + `LocalData.flushSave()`. Errores: cuota llena → toast vía patrón `localStorageQuotaExceededAtom`.

### 4.4 OPEN

`boardService.openBoard(boardId)`:
1. `saveCurrentBoard()` (persiste A).
2. `NavigationHistory.push(current)` (ver §7).
3. `data = BoardRepository.loadBoard(boardId)`; si null → crear vacío.
4. `updateScene({ elements: restoreElements(data.elements), appState: {isLoading:false}, captureUpdate: NEVER })` + `addFiles(data.files)` + restaurar viewport.
5. `setCurrent(boardId, folderId)`; `lastOpenBoardId = boardId`.

### 4.5 EDIT

Cualquier cambio de elementos/flujo del editor discurre por `onChange` normal → `SAVE`. Las operaciones de Board System (rename, move, delete, copy) van por el servicio → transacción del grafo → re-materialización si afecta visual.

### 4.6 CLOSE / SWITCH

`closeCurrentBoard()` = `saveCurrentBoard()`; `switchTo(entry)` = `openBoard(entry.boardId)` manteniendo pila de navegación.

### 4.7 DELETE

Ver §9. `deleteFolder(folderId)` también elimina su board y los boards de descendientes.

### 4.8 RESTORE AFTER RELOAD

Boot → leer `lastOpenBoardId` → cargar board (o migrar legacy) → `openBoard`. Sin selección persistida entre sesiones (solo se restaura el board).

### 4.9 Escenario completo A→B→A con independencia probada

```
Current: A (board raíz, currentFolderId=rootA)
1. crear Folder B (hijo): folder B + board B. persistir.
2. abrir B: saveCurrentBoard()→excalidraw-board-A; openBoard(B)→updateScene(elements B). current=B.
3. modificar B: dibujar → onChange → excalidraw-board-B (NUNCA toca excalidraw-board-A).
4. volver a A: saveCurrentBoard()→excalidraw-board-B; openBoard(A)→excalidraw-board-A. current=A.
5. cerrar navegador.
6. abrir navegador: lastOpenBoardId=A → openBoard(A). Los elements de A incluyen la representación de la Folder B.
7. abrir B: dblclick → saveCurrentBoard()→A; openBoard(B) → se muestran las modificaciones de B.
```

**Independencia A/B:** los elements de A viven solo en `excalidraw-board-A`; los de B solo en `excalidraw-board-B`. La representación de la Folder B es un elemento DENTRO del board A (por eso A la muestra); el contenido de B vive en el board B. Ninguna operación escribe el payload de un board en la clave de otro.

---

## 5. Representación visual

### 5.1 Composición elegida (sin nuevo `ExcalidrawElement`)

Una Folder se materializa en el board padre como **2 elementos nativos**:
1. **Imagen** (ExcalidrawImageElement) con la imagen por defecto de carpeta (SVG/dataURL) o el `icon` custom → **elemento primario** (define posición/tamaño).
2. **Texto** (ExcalidrawTextElement) con `name` → **etiqueta**, debajo de la imagen.

Ambos se agrupan con un **`groupIds` compartido** (grupo de Excalidraw) para que selección/movimiento funcionen de forma nativa y conjunta.

### 5.2 `customData` (identidad, no visual)

Cada elemento visual lleva en `customData.folderBoard`:
```ts
// Folder
{ kind: "folder", folderId, boardId, reprId, role: "image" | "text" }
// Pointer
{ kind: "pointer", pointerId, targetFolderId, boardId, reprId, role: "image" | "text" }
```
- `reprId`: id único de la *instancia visual* (par imagen+texto) → cohesionar el par aunque se copie/duplique.
- `folderId`/`pointerId`: enlace con el dominio.
- `boardId`: board en cuyo canvas vive la representación.
- La posición NO es identidad: se deriva solo del elemento primario al abrir/posicionar.

Esta identidad **sobrevive a `restoreElements`** (el core conserva `customData`; verificado en `packages/excalidraw/data/restore.ts`).

### 5.3 Identificación de todos los elementos de una Folder visual

`findFolderVisual(boardData, folderId)` → filtra `elements` cuyo `customData.folderBoard.folderId === folderId` (retorna `{primary, label}`). No se mantiene índice aparte: **se deriva de los elementos**.

### 5.4 Qué ocurre en cada caso

| Acción | Comportamiento |
|---|---|
| **Mover representación** | Se mueve el grupo (image+text) normalmente (operación normal de Excalidraw). La identidad no cambia; la posición se relee del primary. |
| **Duplicar** | El core duplicaría el grupo con el MISMO `customData` → segunda representación del MISMO folder (incoherencia). Por eso **se intercepta duplicate/copy** de folder (ver §10): genera un folder/board NUEVO con ids nuevos y `reprId` nuevo. En v1 el atajo de duplicar un folder se redirige a "duplicar folder/board". |
| **Borrar (Delete)** | Interceptación vía `onChange` + reconcilador de huérfanos: si el `primary` de una folder deja de existir (isDeleted) → se dispara `deleteFolder` de dominio (§9). Ver nota en §6. |
| **Seleccionar solo el texto** | El texto arrastra su `customData` y forma parte del grupo; el rename (Fase 9) lo edita usando `customData.folderBoard.folderId`. |
| **Seleccionar solo la imagen** | Igual; el dblclick sobre la imagen abre la folder (hit-test primary). |

**Nota de coherencia:** si el usuario desagrupa (Ctrl+Shift+G), el par pierde `groupIds`; el reconcilador lo **re-agrupa** (restaura `groupIds`) la próxima vez que toque esa representación o en rename. En v1 aceptamos desagrupar y solo re-agrupamos en rename.

---

## 6. Creación y apertura

### 6.1 Flujo exacto de creación (Folder tool)

```
1. user activa Folder tool: botón host → excalidrawAPI.setActiveTool({ type:"custom", customType:"folder", locked:true })
2. user hace click en canvas → core despacha props.onPointerDown y luego onPointerUp / emitters.
3. host recibe onPointerUp → coordenadas de escena:
     const { x, y } = viewportCoordsToSceneCoords({ clientX, clientY }, excalidrawAPI.getAppState());
   (el estado activo del pointer se lee del pointerDownState / coords del evento)
4. folderService.createFolder({ parentId: currentFolderId, name: prompt o "Carpeta", sceneX: x, sceneY: y })
     - genera FolderId nuevo + BoardId nuevo; board vacío; parentId actual.
5. persistir: BoardRepository.applyTransaction(graphTx) + saveBoard(nuevo, vacío).
6. materializar visual: convertToExcalidrawElements([img, texto]) con customData.folderBoard y groupIds compartido.
7. excalidrawAPI.updateScene({ elements: [...actuales, img, texto], captureUpdate: IMMEDIATELY })
8. volver a selection tool (customType no locked se revierte; o setActiveTool({type:"selection"})).
9. selección inicial: seleccionar el grupo recién creado (updateScene appState.selectedElementIds) para permitir rename inmediato.
```

### 6.2 Investigación del doble-clic en ESTE fork (hecho verificado)

- En el core, el canvas interactivo (`packages/excalidraw/components/canvases/InteractiveCanvas.tsx`) vincula `onDoubleClick={props.onDoubleClick}` y en `packages/excalidraw/components/App.tsx:2657` se conecta a `handleCanvasDoubleClick` del core (abre/edición de texto, crop de imagen…). **No existe ninguna prop pública `onDoubleClick`/`onElementClick` en `ExcalidrawProps`** (revisado en `index.tsx` y `types.ts`).
- Por tanto **sí podemos resolver el doble-clic SIN modificar ningún archivo del core**, con un **listener nativo en el host**:
  - El host envuelve `<Excalidraw>` en su propio `<div>` (ya lo hace `ExcalidrawWrapper`). El canvas es descendiente → los eventos `dblclick` del canvas **burbujean** al div del host.
  - En ese listener: `e.clientX/clientY` → `viewportCoordsToSceneCoords(..., excalidrawAPI.getAppState())`.
  - Hit-test: recorrer `excalidrawAPI.getSceneElementsIncludingDeleted()` en orden de z descendente y usar `hitElementItself({ point, element, threshold, elementsMap })` (exportado por `@excalidraw/element`). Si el elemento top tiene `customData.folderBoard.kind === "folder"` → abrir (`openFolder(folderId)`). Si es `kind:"pointer"` → resolver `targetFolderId` y abrir.
  - **No hay conflicto** con el dblclick del core (texto/imágenes) porque esos elementos no llevan `customData.folderBoard`.
- **Conclusión:** la regla de la §17 (no tocar `packages/excalidraw/components/App.tsx`) se cumple; NO se necesita ninguna modificación del core para creación ni apertura.

### 6.3 Flujo exacto de apertura

```
1. user doble-clic sobre representación de folder → hit-test detecta folderId en customData.
2. boardService.openFolder(folderId):
     a. boardId = folder.boardId;
     b. saveCurrentBoard() (persiste el board actual A);
     c. NavigationHistory.push({kind:"folder", id: folderId, boardId: currentBoardId});
     d. data = BoardRepository.loadBoard(boardId) ?? boardVacío;
     e. updateScene({ elements: restoreElements(data.elements, null, {repairBindings:true}),
                      appState: { ...data.appStateLite, isLoading:false }, captureUpdate: NEVER });
     f. excalidrawAPI.addFiles(data.files);
     g. restaurar viewport (setViewport(data.viewport));
     h. setCurrent(boardId, folderId); lastOpenBoardId = boardId.
```

**Guardado del board actual:** siempre antes de cargar el destino (§4.9/§3.6), garantizando que A y B quedan independientes.

---

## 7. Navegación

- **`currentBoardId`** y **`currentFolderId`**: jotai. `currentFolderId` es la Folder cuyo board está abierto (la raíz al inicio).
- **`NavigationHistory`**: pila `back` + `forward` de `NavEntry`, SEPARADA de `parentId` (navegación temporal del usuario, no estructura permanente).
- **breadcrumb**: derivado de `ancestors(currentFolderId)` sobre el árbol (`parentId`). Nunca se almacena `path` como fuente de verdad. Cada crumb navega con `openFolder`/`openBoard`.
- **back / forward**: pop/push de la pila; `openBoard(entry.boardId)` y `setCurrent`.
- **Navegación mediantepointer**: abrir target = `openFolder(pointer.targetFolderId)`; el breadcrumb marca ese nivel como pointer (etiqueta del pointer).
- **forward tras navegar a otro sitio**: navegar a una ubicación distinta **limpia `forward`** (semántica estándar de pila).
- **Reconstrucción de ruta**: siempre por `ancestors()` sobre el árbol; un board no guarda su "path".

---

## 8. FolderPointer

### 8.1 Flujo exacto

```
1. user activa Folder Pointer tool → setActiveTool({type:"custom", customType:"folderPointer", locked:true})
2. click en canvas → coords de escena.
3. host abre PickerFolderDialog (árbol filtrable por nombre).
4. user elige carpeta destino → folderId.
5. pointerService.createPointer({ targetFolderId: folderId, sceneX, sceneY, name:`↗ ${folder.name}` }):
     - genera FolderPointerId NUEVO (nunca reutiliza folderId).
     - NO crea folder ni board; NO toca parentId de la carpeta real.
6. persistir graph (tx).
7. materializar visual pointer (imagen + texto) con customData.folderBoard.kind="pointer", pointerId, targetFolderId.
8. updateScene; volver a selection.
```

### 8.2 Abrir target

Doble-clic sobre pointer → hit-test detecta `kind:"pointer"` → `openFolder(pointer.targetFolderId)` (carga el board de la carpeta REAL). El breadcrumb marca el nivel como pointer.

### 8.3 Borrar target / pointers entrantes

**POLÍTICA DEFINITIVA CONFIRMADA: BORRAR AUTOMÁTICAMENTE los pointers que apuntan a una folder eliminada** (directa o mediante la eliminación de un ancestro que la contiene).

Razón técnica: la invariante del sistema es **"no dejar referencias colgantes"** (requisito del prompt de borrado). Mantener pointers inválidos obligaría a un estado "roto" que hay que renderizar, validar en cada apertura y migrar; es más complejo y frágil que borrarlos en la misma transacción de delete. No se encontró razón técnica fuerte en contra; la única desventaja (el usuario pierde el atajo) se mitiga con un toast "N punteros eliminados".

- En `deleteFolder` (dominio): al calcular el conjunto `deletedFolderIds` (folder + descendientes), se quitan todos los `FolderPointer` con `targetFolderId ∈ deletedFolderIds`.

---

## 9. Delete

### 9.1 Operación transaccional

`folderService.deleteFolder(folderId)` — **atómica desde la perspectiva del usuario**:

```
A (raíz, protegida)
└── B   ← eliminada
    └── C
        └── D

1. validar folderId !== rootFolderId (la raíz NO puede eliminarse).
2. deletedFolderIds = descendants(folderId) ∪ {folderId}   // B, C, D
3. deletedBoardIds  = boards de cada folder del conjunto.   // boards de B, C, D
4. pointerASeBorrarn = pointers con targetFolderId ∈ deletedFolderIds.
5. visualRepresentations:
     por cada boardCompartido (board de cada folder ANTERIOR afectada que contiene una
     representación de B/C/D en su canvas): eliminar (isDeleted) los elementos con
     customData.folderBoard.folderId ∈ deletedFolderIds, de todos los boards del grafo
     (la representación de un folder vive en el board de su PADRE; un pointer vive donde
     esté). Esto requiere barrer los boards que referencian representaciones.
6. assets: liberar iconos huérfanos (opcional, GC en Fase 10).
7. BoardRepository.applyTransaction(tx)  // graph (folders, boards index, pointers) + boards eliminados
```

### 9.2 Cómo se localizan las representaciones

`findVisualRepresentations(graph, deletedFolderIds)`:
- Para cada board del grafo, leer `excalidraw-board-<id>` (o el índice en memoria) y filtrar elementos con `customData.folderBoard` cuyo target (folderId o pointerId/targetFolderId) esté en `deletedFolderIds`. Esto cubre representaciones de folders (en board del padre) y de pointers (en cualquier board).

### 9.3 Eliminar boards

Los payloads `excalidraw-board-<deletedBoardId>` se eliminan de localStorage. Se protege: nunca eliminar el board de la raíz (bloqueado en el paso 1).

### 9.4 Persistencia

Todo se aplica en UNA transacción del repositorio: si algo falla a mitad, se revierte a la instantánea previa y se notifica toast de error (nada parcial).

---

## 10. Copy/Paste

### 10.1 Semántica según selección en Ctrl+C

| Selección | Vía | Qué se serializa |
|---|---|---|
| Solo elementos de Excalidraw (sin folder/pointer) | **Clipboard del core** (sin cambios) | `EXPORT_DATA_TYPES.excalidrawClipboard` |
| **Folder** (primary o texto de una representación, o el grupo completo) | **Board clipboard** (host) | Payload `application/x-excalidraw-board` |
| **FolderPointer** | **Board clipboard** (host) | Payload pointer |
| **Selección mixta** (elementos + folder/pointer) | **Board clipboard** (host) que embebe: elementos + folders + pointers | Payload mixto |

Detección: host lee `appState.selectedElementIds`, intersecta con elementos que tengan `customData.folderBoard`. Si hay folder/pointer → interceptar el copy y usar Board clipboard. Intercepción vía listener de teclado/`copy` del host (sin tocar el clipboard del core).

### 10.2 Ctrl+V

- Tipo de clipboard del core → flujo normal (elementos). Sin cambios.
- Board clipboard → `boardClipboardService.paste(payload, sceneX, sceneY)`.

### 10.3 Reglas de IDs y remapeo (importante)

| Ítem | Regla |
|---|---|
| **IDs nuevos** | `FolderId`, `BoardId`, `FolderPointerId` de las piezas copiadas → **todos nuevos** al pegar. Un folder copiado y pegado N veces genera N folders/boards distintos, sin colisión. |
| **IDs conservados** | `targetFolderId` de un **FolderPointer** se conserva tal cual (el pointer sigue apuntando a la folder original). |
| Remapeo `parentId` | Los folders **internamente** copiados se re-padrean dentro del clon según su jerarquía original; la **raíz del clon** se re-padrea a `currentFolderId` (donde se pega) — o se mantiene la referencia externa si el clon no incluye a su padre (ver referencias externas). |
| Referencias internas | `FolderPointer` que apunta a una folder **dentro** del clon → re-apunta al clon (`targetFolderId → nuevo id`). `customData.folderBoard` de elementos → re-mapeado a los nuevos ids. |
| Referencias externas | `FolderPointer` que apunta a una folder **fuera** del clon → se conserva el `targetFolderId` original (sigue apuntando a lo real). |
| Boards duplicados | Cada folder del clon con su board nuevo; el contenido (`BoardData`) se copia (`deepCopyElement` de los elements) y los elements con `customData.folderBoard` se re-mapean. |
| Elementos Excalidraw de los boards duplicados | Se copian con `deepCopyElement`; `id/elementId` nuevos (o se conservan porque viven en su propio board aislado — decisión: **nuevos**, para no colisionar a nivel scene si se pega). |
| Archivos/imágenes | Los `FileId` referenciados se conservan (dedup global en `files-db`) y `files` se añaden con `addFiles`; sin duplicar bytes. |
| Pointers | Copiar un **FolderPointer** conserva `targetFolderId`; copiar un Folder **no** conserva su `FolderId` (debe quedar claro: no se duplica la carpeta real). |

### 10.4 Garantías

- **Copiar una Folder NO crea dos entidades con el mismo ID**: el pegado asigna ids nuevos (función `cloneSubtree` en dominio, con `old→new` map para remapear referencias).
- **Copiar un Pointer NO lo convierte en Folder**: el cloned payload es `FolderPointer` con `targetFolderId` conservado; jamás se inserta en `folders`.
- **Elementos normales siguen copiándose/pegándose igual** (se delega al core).
- La **duplicación (Ctrl+D / Alt-drag)** de folder también pasa por el mismo `cloneSubtree` (para no crear una segunda representación con el mismo `customData`, ver §5.4).

### 10.5 Implementación sin tocar el core

- El Board clipboard usa un MIME propio y se gestiona desde el host mediante listeners de `copy`/`paste` y `props.onPaste` (gancho existente) para distinguir. El clipboard del core queda intacto.

---

## 11. Undo/Redo

**DECISIÓN EXPLÍCITA**:

| Capa | Pertenece a | Política v1 |
|---|---|---|
| Dibujo/movimiento/edición de elementos dentro de un board | history de Excalidraw | **Sin cambios** (undo/redo normal funciona). |
| Representación visual de folders/pointers (imagen/texto) creadas/eliminadas por el Board System | del Board System | Se inyectan con `captureUpdate: NEVER` / mediante `updateScene` que **no** entra en el history del core para la creación; el movimiento posterior del grupo es editable normal pero las notas abajo. |
| Operaciones del árbol (create/move/rename/delete/copy de folders/pointers/boards) | **Board history** (propio) | **v1: NO se implementa undo/redo del árbol** si añade demasiada complejidad. |

**Consecuencias documentadas (aceptadas para v1):**
1. Ctrl+Z inmediatamente tras "crear folder" **no deshace la creación** (la entidad + su board persisten); solo desharía la edición de elementos posterior si se hubiera capturado.
2. "Borrar folder" es inmediato y **no** deshacible con Ctrl+Z (hay diálogo de confirmación).
3. El flujo de elementos (dibujo) SÍ sigue el undo/redo normal, y no se rompe.
4. Para evitar parches: las representaciones de folder se crean con `captureUpdate: NEVER` para que su inyección no ensucie el history del editor; el usuario las mueve/edita con undo normal sobre esos micro-cambios.

No se toca `history.ts` ni `actionHistory.tsx` (prohibido).

---

## 12. Seguridad contra regresiones

| Funcionalidad | Qué parte del nuevo sistema podría afectarla | Cómo evitamos la regresión |
|---|---|---|
| **drawing** | Custom tools / `onPointerDown` interceptados | El folder tool actúa solo con `customType === "folder"/"folderPointer"`; resto del flujo intacto. |
| **selection** | `updateScene` con `selectedElementIds`; grupos de folder | Selección nativa de grupos intacta; el reconcilador solo toca `customData.folderBoard`. |
| **text** | Retroceso por dblclick | El listener nativo no consume eventos que no tengan `customData.folderBoard`; dblclick sobre texto normal sigue al core. |
| **shapes / arrows** | Nada directo | No se toca el renderer ni las acciones de elementos. |
| **images** | Representación de folder como imagen | Se usa el mecanismo normal de imagen; no se altera el manejo de imágenes del editor. |
| **zoom (¡fork!)** | `packages/excalidraw/components/App.tsx` modificado por el fork | **Prohibido tocar ese archivo** (§17); los cambios del Board System viven en `excalidraw-app`. |
| **pan / viewport** | `setViewport` al abrir board | Se restaura el viewport guardado del board de destino; pan normal intacto. |
| **history / undo / redo** | Inyección de representaciones | `captureUpdate: NEVER` para creación; no se toca `history.ts`. |
| **clipboard** | Intercepción de copy/paste | Solo se intercepta cuando hay `customData.folderBoard`; caso contrario se delega al core (sin cambios). |
| **import** | `loadFromBlob`/`initializeScene` | El boot migra legacy sin romper el import de `.excalidraw`; no se toca `data/`. |
| **export** | Nada | No se toca `scene/export.ts` ni dialogs. |
| **shortcuts** | `setActiveTool`/toolbar | Solo se añaden custom tools; no se reasignan shortcuts existentes. |
| **collaboration** | `Collab`, `firebase`, `tabSync` | No se tocan; el Board System guarda localmente independientemente. En colaboración los custom tools siguen `interaction.enabled.tools` ya existente. |
| **persistence (app)** | `LocalData` | Se deja intacto; se añade persistencia paralela con claves propias. |
| **custom tools** | Nuevas tools | Se apoyan en el mecanismo ya existente de `activeTool.type==="custom"`. |

Guardas: cada fase corre las suites de regresión de `packages/excalidraw/tests` (selection, drawShape, clipboard, history, tool, interactivity, regressionTests, image, export) + `yarn test:typecheck` + `yarn test:code`.

---

## 13. Estructura final de archivos

`excalidraw-app/boards/` — modular pero mínima. `App.tsx` sigue siendo composition root (orquesta, no contiene lógica).

```
excalidraw-app/boards/
├── types.ts                      # Tipos del dominio (§2)
├── domain/
│   ├── ids.ts                    # generación y unicidad (randomId)
│   ├── graph.ts                  # root, ancestors, descendants, path, cycle, move/createFolder, resolve
│   ├── pointers.ts               # create/resolve/delete de pointers
│   ├── board.ts                  # create Board 1:1, boardData utils, viewport
│   ├── delete.ts                 # delete transaccional (subárbol+boards+pointers+visual)
│   └── copySubtree.ts            # clone + remap de ids/referencias (§10)
├── repository/
│   ├── BoardRepository.ts        # INTERFAZ (load/save/loadBoard/saveBoard/applyTransaction/schemaVersion)
│   └── LocalStorageBoardRepository.ts  # impl localStorage + IndexedDB (iconos)
├── host/
│   ├── boardService.ts           # openFolder/openBoard/saveCurrentBoard/close (API editor + repo + navigation)
│   ├── folderService.ts          # createFolder/rename/move/delete
│   ├── pointerService.ts         # createPointer/openTarget
│   ├── materialize.ts            # elementos visuales (imagen+texto+customData+groupIds)
│   ├── hitTest.ts                # dblclick host → coords → hitElementItself → folder/pointer
│   ├── reconcile.ts              # reconcilador huérfanos (delete, re-group) via onChange
│   └── boardState.ts             # jotai: currentBoardId/currentFolderId/navigation/lastOpen
├── navigation/
│   └── navigation.ts             # NavigationHistory + breadcrumb desde árbol
├── clipboard/
│   └── boardClipboard.ts         # payload board-clipboard; copy/paste; remap
└── ui/
    ├── NavBar.tsx                # breadcrumb + back/forward
    ├── ToolButtons.tsx           # botones Folder / FolderPointer
    ├── PickerFolderDialog.tsx    # selector de carpeta destino (pointer)
    └── FolderContextMenu.tsx     # rename / delete / copy / open
```

**Dependencias por archivo (resumen):**
- `domain/*` y `types.ts`: solo tipos + `@excalidraw/common` (ids). **Prohibido**: React, `@excalidraw/excalidraw`, `localStorage`, DOM.
- `repository/*`: `types` + `app_constants` + `idb-keyval`. **Prohibido**: core, React.
- `host/*`, `clipboard/*`, `navigation/*`: `domain` + `repository` + `@excalidraw/excalidraw` (API/export) + `@excalidraw/element` + jotai. **Prohibido**: `localStorage` directo.
- `ui/*`: `domain`, `host` (servicios), jotai, React. **Prohibido**: `localStorage` directo, imports internos del core.

**Regla App.tsx:** `excalidraw-app/App.tsx` importa solo `boards/host/boardService`, monta `NavBar`/`ToolButtons`, registra listeners/dblclick y pasa el `excalidrawAPI`. No contiene lógica de árbol/persistencia/clipboard.

**Nota:** los tests de dominio (puros) viven en `excalidraw-app/boards/__tests__/` (o `excalidraw-app/tests/boards/`), tal como `excalidraw-app/tests/` ya alberga tests de la app.

---

## 14. Plan definitivo de implementación (12 FASES)

> Invariantes de TODA fase: no romper funcionalidades existentes; no tocar archivos prohibidos de la §17; cerrar con tests + typecheck + lint verdes.

### FASE 0 — Dominio + tests unitarios
- **Objetivo:** modelo puro completo y testeado.
- **Archivos permitidos:** `excalidraw-app/boards/types.ts`, `domain/ids.ts`, `domain/graph.ts`, `domain/pointers.ts`, `domain/board.ts`, `domain/delete.ts`, `domain/copySubtree.ts` y sus tests (`__tests__/`).
- **Archivos prohibidos:** todo el core, `App.tsx`, `repository/*` (aún no crear), `host/*`, `ui/*`.
- **Dep. de fases anteriores:** ninguna.
- **Cambios esperados:** tipos + funciones puras (ids, root, ancestors/descendants/path/cycle, createFolder/moveFolder, createPointer/resolve/delete, delete transaccional, clone/remap).
- **Tests:** identidad (unicidad), árbol (create/parent/descendants/ancestors/path/cycle), pointers (create/resolve/delete/invalid), copy (ids nuevos, remap interno/externo, folder≠pointer), delete (subárbol+pointers).
- **Criterio finalización:** `yarn test:app` (test boards) verde + `yarn test:typecheck`.
- **Riesgos:** cambios de tipos en fases posteriores → congelar tipos aquí.
- **Rollback:** borrar `boards/domain` (sin tocar nada del repo existente).

### FASE 1 — Persistencia local + schemaVersion
- **Objetivo:** `BoardRepository` + `LocalStorageBoardRepository`; roundtrip grafo/boards; migración v1.
- **Archivos permitidos:** `repository/BoardRepository.ts`, `repository/LocalStorageBoardRepository.ts`, `app_constants.ts` (claves), tests.
- **Archivos prohibidos:** core, `App.tsx`, `host/*`, `ui/*`.
- **Dep.:** Fase 0.
- **Cambios esperados:** interfaz repo + impl (graph, board payload, `excalidraw-board-<id>`, schemaVersion, migrations, corrupción→recrear raíz), sin UI.
- **Tests:** roundtrip, schemaVersion, migración v1, corrupción (JSON roto → raíz nueva), presencia/ausencia de board.
- **Criterio:** tests de repo verdes; typecheck.
- **Riesgos:** cuota LS → prever fallback IndexedDB para iconos.
- **Rollback:** eliminar `repository/*` y las claves nuevas.

### FASE 2 — Integración mínima (composition root + boot)
- **Objetivo:** arranque con raíz; `currentBoardId`; migración del `excalidraw` legacy a board raíz; estado jotai.
- **Archivos permitidos:** `App.tsx` (solo glue), `host/boardState.ts`, `host/boardService.ts` (bootstrap/open/save stubs), `app-jotai.ts`.
- **Archivos prohibidos:** core; `domain` (leer, no cambiar); `ui` aún.
- **Dep.:** Fases 0–1.
- **Cambios esperados:** en boot, `BoardRepository.load()` → si null, migrar legacy o crear raíz; cargar `lastOpenBoardId`; exponer `useBoardsState()`. NO hay tools/UI aún.
- **Tests:** boot (raíz creada; legacy migrado); typecheck.
- **Criterio:** la app arranca pintando el board raíz sin errores (test de render de App existente pasa).
- **Riesgos:** ejecución del `initializeScene` existente vs bootstrap → orden; no tocar el stack de localStorage de la app.
- **Rollback:** revertir glue en `App.tsx`.

### FASE 3 — Creación de Folder (custom tool)
- **Objetivo:** botón + click → create folder + representación visual.
- **Archivos permitidos:** `host/materialize.ts`, `host/folderService.ts` (create), `ui/ToolButtons.tsx`, `App.tsx` (registrar `onPointerDown/Up`), tests de integración.
- **Archivos prohibidos:** core; `navigation`; clipboard.
- **Dep.:** Fase 2.
- **Cambios esperados:** custom tool `customType:"folder"`, `createFolder` → persistir + materializar (imagen+texto+group+`customData`), seleccionar.
- **Tests:** crear → elemento con `customData.folderBoard` en escena; regresión `tool.test.tsx`, `drawShape.test.tsx`, `selection.test.tsx`.
- **Criterio:** test "crear folder" verde; regresiones verdes.
- **Riesgos:** interacción con `activeTool` del fork (lock) → verificar `locked:true`.
- **Rollback:** desactivar botón (sin borrar service).

### FASE 4 — Apertura (dblclick + save/open board)
- **Objetivo:** abrir folder guardando el board previo.
- **Archivos permitidos:** `host/hitTest.ts`, `host/boardService.ts` (open/save), `App.tsx` (listener dblclick), tests de integración.
- **Archivos prohibidos:** core (NECESARIO NO TOCAR — resuelto en §6.2).
- **Dep.:** Fases 2–3.
- **Cambios esperados:** listener nativo `dblclick` + hit-test; `openFolder` (save current → load target); verificación A/B independientes (§4.9).
- **Tests:** abrir folder → elementos del board destino; volver → elementos originales; persistencia A y B separada.
- **Criterio:** escenario A→B→A verde.
- **Riesgos:** conflictos dblclick con texto/imagen (mitigado: solo reacciona a `customData.folderBoard`).
- **Rollback:** retirar listener.

### FASE 5 — Navegación (breadcrumb + back/forward)
- **Objetivo:** `NavigationHistory`, back/forward, breadcrumb derivado de árbol.
- **Archivos permitidos:** `navigation/navigation.ts`, `host/boardState.ts` (ampliar), `ui/NavBar.tsx`, `App.tsx` (montar NavBar), tests.
- **Archivos prohibidos:** core; clipboard; delete.
- **Dep.:** Fase 4.
- **Cambios esperados:** pila back/forward (limpia forward al navegar nuevo), breadcrumb por `ancestors`, botones.
- **Tests:** back/forward, breadcrumb, forward-cleared; regresión interactivity.
- **Criterio:** navegación a mano verde.
- **Riesgos:** sincronizar back/forward con openFolder.
- **Rollback:** ocultar NavBar.

### FASE 6 — FolderPointer
- **Objetivo:** crear pointer + resolver target.
- **Archivos permitidos:** `host/pointerService.ts`, `ui/PickerFolderDialog.tsx`, `host/materialize.ts` (pointer), `App.tsx`, tests.
- **Archivos prohibidos:** core; delete aún.
- **Dep.:** Fase 3/5 (picker usa árbol).
- **Cambios esperados:** custom tool `folderPointer`, picker, `createPointer` (id nuevo, `targetFolderId`), representación pointer, apertura target.
- **Tests:** create/resolve; pointer NO crea folder/board; breadcrumb pointer.
- **Criterio:** pointer abre el board real.
- **Riesgos:** navegación por pointer vs pila.
- **Rollback:** desactivar tool.

### FASE 7 — Delete (transaccional)
- **Objetivo:** eliminar subárbol + boards + pointers + representaciones; raíz protegida.
- **Archivos permitidos:** `host/folderService.ts` (delete), `host/reconcile.ts` (huérfanos via onChange), `repository` (applyTransaction), `ui/FolderContextMenu.tsx`, tests.
- **Archivos prohibidos:** core; clipboard aún.
- **Dep.:** Fases 3–6 (necesita materialización y pointers).
- **Cambios esperados:** `deleteFolder` de dominio (§9) orquestado por service; reconcilador detecta borrado de primary → delete; confirmación para la raíz (bloqueada).
- **Tests:** delete subárbol, boards, pointers entrantes, representaciones; raíz no eliminable.
- **Criterio:** sin referencias colgantes tras borrar; toast.
- **Riesgos:** el delete debe ignorar el board abierto cuando se borra a sí mismo (manejo de "current board eliminado" → subir un nivel).
- **Rollback:** ocultar menú delete.

### FASE 8 — Copy/Paste (Board clipboard)
- **Objetivo:** board clipboard; copiar/pegar Folder y Pointer; remapeo; selección mixta.
- **Archivos permitidos:** `clipboard/boardClipboard.ts`, `host/folderService.ts` (paste), `App.tsx` (listeners copy/paste + `onPaste`), tests.
- **Archivos prohibidos:** core (clipboard del core intacto — §10.5).
- **Dep.:** Fases 0 (copySubtree), 3, 6.
- **Cambios esperados:** detectar folder/pointer en selección → Board clipboard; paste → `cloneSubtree` remapeado en `currentFolderId`; pointer conserva `targetFolderId`; elementos normales delegados al core; duplicación reenrutada a clone.
- **Tests:** copiar folder → pegar 2 veces → 2 folders/boards con ids distintos; remap interno/externo; pointer conserva target; mixto; elementos normales intactos.
- **Criterio:** suite copy/paste verde + regresión clipboard.test.tsx.
- **Riesgos:** colisión con clipboard nativo (solo interceptar con `customData`); duplicado (Ctrl+D).
- **Rollback:** desactivar interceptor (vuelve clipboard nativo).

### FASE 9 — Edición visual (rename, icon, coherencia)
- **Objetivo:** renombrar, cambiar icono, re-agrupar representaciones.
- **Archivos permitidos:** `host/folderService.ts` (rename/setIcon), `host/materialize.ts` (re-materializar), `host/reconcile.ts` (re-group), `ui/FolderContextMenu.tsx`, `ui/RenameDialog.tsx`, tests.
- **Archivos prohibidos:** core; clipboard; delete (ya establecidos).
- **Dep.:** Fases 3–7.
- **Cambios esperados:** editar `name`/`icon` de Folder → actualizar texto/imagen de la representación (en boards que la contengan) sin cambiar ids; re-agrupar pares desagrupados.
- **Tests:** rename actualiza `Folder.name` y el texto visual; icon custom.
- **Criterio:** rename/icon verdes.
- **Riesgos:** consistencia entre entidad y su representación en varios boards.
- **Rollback:** solo UI.

### FASE 10 — Hardening (multi-tab, corrupción, GC, robustez)
- **Objetivo:** resiliencia ante anomalías de almacenamiento y múltiples pestañas.
- **Archivos permitidos:** `repository/LocalStorageBoardRepository.ts` (versión/tabSync, GC de iconos), `host/reconcile.ts`, tests.
- **Archivos prohibidos:** core; `LocalData.ts` intacto.
- **Dep.:** todas las anteriores.
- **Cambios esperados:** coordinación del índice multi-tab (reutiliza patrón `tabSync`), GC de iconos/assets huérfanos, límites de cuota (fallback IndexedDB), reintentos.
- **Tests:** corrupción parcial, board faltante, multi-tab last-write-wins, cuota.
- **Criterio:** suite hardening verde.
- **Riesgos:** complejidad alta → acotar a lo esencial.
- **Rollback:** revertir solo mejoras de hardening (aisladas).

### FASE 11 — Regresión integral + cierre
- **Objetivo:** validación total y final del sistema completo.
- **Archivos permitidos:** solo tests; corrección OPCIONAL y acotada de bugs en `boards/`.
- **Archivos prohibidos:** todo el core y `LocalData.ts`.
- **Dep.:** Fases 0–10.
- **Cambios esperados:** correr TODA la suite (`yarn test:all`), typecheck, lint; escenario integración A→B→A→reload→B; revisar `git diff` para confirmar 0 archivos del core modificados.
- **Tests:** todas + regresión completa.
- **Criterio:** `yarn test:all` verde; ninguna funcionalidad existente rota; `git status` sin archivos del core tocados.
- **Riesgos:** cualquier fuga → arreglar en `boards/` o revertir.
- **Rollback:** n/a (es validación).

---

## 15. Orden exacto de implementación

**Orden DEFINITIVO (coincide con el priorizado por el usuario):**

```
dominio → tests → persistencia → integración mínima → creación Folder →
apertura → navegación → pointers → delete → clipboard → edición visual → hardening/regresión
```

Equivalencias con las 12 fases:

| Orden priorizado | Fase |
|---|---|
| dominio + tests | 0 |
| persistencia | 1 |
| integración mínima | 2 |
| creación de Folder | 3 |
| apertura | 4 |
| navegación | 5 |
| pointers | 6 |
| delete | 7 |
| clipboard | 8 |
| edición visual | 9 |
| hardening | 10 |
| regresión integral | 11 |

**Justificación:** (a) el dominio debe ser la primera piedra porque la persistencia, la creación y el copy dependen de sus invariantes; (b) tests acompañan al dominio (no después) para congelar el modelo antes de construir encima; (c) la persistencia va antes de la integración porque la integración/boot necesita el repo; (d) creación antes que apertura (no se puede abrir algo que no se crea); (e) navegación antes que pointers (el picker reusa el árbol); (f) delete después de pointers (delete debe limpiarlos); (g) clipboard después de delete (reusa clone/remap y el estado final del subárbol); (h) edición visual y hardening al final por ser refinamiento/robustez, no núcleo. No agrego funcionalidades nuevas solo para llenar 12: los 12 hitos salen de dividir el alcance declarado.

---

## 16. Protocolo para "Implementa Fase N"

Al recibir **"Implementa Fase N"** se ejecuta, en orden estricto:

1. Inspeccionar nuevamente el estado actual del repositorio (`git status`, `git log`, estructura `boards/` si existe).
2. Verificar que las fases anteriores estén realmente implementadas (existencia de archivos esperados + tests verdes).
3. Detectar modificaciones inesperadas (especialmente en el core y en `LocalData.ts`).
4. Enumerar archivos que se modificarán/crearán (según la fase de la §14).
5. Enumerar archivos que NO se tocarán (toda la lista de §17 + el resto del core).
6. Implementar SOLO esa fase.
7. Ejecutar los tests relevantes de la fase.
8. Ejecutar `yarn test:typecheck`.
9. Ejecutar lint/checks relevantes (`yarn test:code`).
10. Revisar el `git diff`.
11. Comprobar que NO se modificara accidentalmente ningún archivo del core.
12. Informar exactamente qué cambió (archivos, funciones, claves de storage).
13. Informar tests ejecutados y resultado.
14. Informar cualquier deuda técnica.
15. DETENERSE. No avanzar a la siguiente fase.

NO se adelanta a la siguiente fase. NO se hacen refactors no relacionados. NO se cambia la arquitectura aprobada sin explicarlo antes.

---

## 17. Regla especial para el core de Excalidraw

**PROHIBIDO modificar por defecto:**
```
packages/excalidraw/components/App.tsx
packages/excalidraw/clipboard.ts
packages/excalidraw/actions/actionClipboard.tsx
packages/element/src/types.ts
packages/element/src/newElement.ts
packages/excalidraw/data/restore.ts
packages/excalidraw/data/transform.ts
```
También quedan protegidos (por seguridad adicional): `packages/element/src/collision.ts`, `packages/excalidraw/history.ts`, `packages/excalidraw/actions/actionHistory.tsx`, `excalidraw-app/data/LocalData.ts`, `excalidraw-app/data/firebase.ts` y `excalidraw-app/collab/**`.

Solo se podrán modificar si se demuestra que **no existe solución razonable desde `excalidraw-app`**. En ese caso: **DETENERSE**, explicar por qué, mostrar qué API existente no es suficiente, proponer el cambio mínimo, y **no implementarlo hasta aprobación del usuario**.

**Nota verificada:** para creación y apertura (doble-clic) NO se requiere modificar el core (resuelto en §6.2 con listeners nativos del host). Este es el camino preferido y evita colisionar con las modificaciones de zoom que el fork ya hace en `packages/excalidraw/components/App.tsx`.

---

## 18. Criterio arquitectónico principal

Durante toda la implementación se usa esta prioridad:

```
compatibilidad con Excalidraw
>
integridad de datos
>
separación de responsabilidades
>
testabilidad
>
simplicidad
>
facilidad futura de migración a PostgreSQL
>
nuevas funcionalidades
```

No se sacrifica estabilidad por implementar una feature más rápido. La interfaz `BoardRepository` garantiza que la migración a PostgreSQL (futuro `PostgresBoardRepository`) no toque dominio ni UI.

---

## 19. Resultado esperado de ESTA tarea (entregado)

1. `docs/boards-implementation-spec.md` creado (este documento).
2. Inconsistencias del diagnóstico anterior corregidas:
   - Se resolvió la relación Folder↔Board (1:1) de forma inequívoca.
   - Se fijó el namespace de identidad separado para `FolderPointerId`.
   - Se decidió política de delete de pointers (auto-borrar).
   - Se confirmó que el doble-clic NO requiere tocar el core (verificado en el fork).
   - Se reorganizó el plan en EXACTAMENTE 12 fases sin features nuevas.
3. Las 12 fases definidas con objetivo/archivos/permitidos-prohibidos/deps/expectativas/tests/criterio/riesgos/rollback.
4. Determinado que NO se empezará la Fase 0 hasta nueva indicación.