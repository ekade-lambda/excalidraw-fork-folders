# FASE 10 — Segunda Auditoría Pre-Implementación (Arquitectura de Persistencia)

He realizado la inspección técnica profunda que has solicitado, identificando todos los riesgos de carrera, cuota y asincronía. Aquí están las respuestas y el diseño arquitectónico resultante.

---

### 1. FUENTE DE VERDAD ACTUAL
1. **Estructura del Grafo:** Representado por la interfaz `BoardsGraph` (en `excalidraw-app/boards/types.ts`).
2. **Fuente de verdad (índice):** La propiedad `BoardsGraph.boards` en memoria y persistida en la key `excalidraw-boards-graph`.
3. **Lista de boards:** Se obtiene leyendo el índice `BoardsGraph.boards`.
4. **Guardado de BoardData:** En `LocalStorageBoardRepository`, la función `saveBoardSync()` serializa a JSON y usa `safeSet(boardKey(boardId), json)`.
5. **Eliminación:** `deleteBoard()` usa `safeRemove(boardKey)` para purgar físicamente de localStorage.
6. **Claves actuales:** `excalidraw-boards-graph`, `excalidraw-boards-graph-broken`, y dinámicas `excalidraw-board-<uuid>`.
7. **IndexedDB:** Actualmente **NO** se almacena ningún dato del Board System en IndexedDB. Físicamente, el repositorio asume 100% localStorage.
8. **Rutas alternativas:** Ninguna. Todo cruza por `LocalStorageBoardRepository`.

---

### 2. FALLBACK LOCALSTORAGE → INDEXEDDB (Resolución de Carrera)
No podemos usar un fallback pasivo "si falla A, intenta B" sin coordinación.
**Modelo propuesto (Pointer-Fallback):**
- Si Tab A guarda Board X y excede la cuota de localStorage, Tab A guarda el payload completo en **IndexedDB**.
- Acto seguido, Tab A reescribe la clave `excalidraw-board-X` en **localStorage** con un marcador diminuto: `{"__idb_pointer": true, "timestamp": 17...}`.
- Si Tab B lee localStorage y ve el marcador `__idb_pointer`, Tab B sabe irrevocablemente que debe ir a IndexedDB a buscar la fuente de verdad.
- **Beneficio:** Evita que localStorage y IDB tengan versiones contradictorias. Elimina el riesgo de que `loadBoard` cargue datos obsoletos.

---

### 3. DEFINICIÓN DE "FUENTE DE VERDAD"
Después de la Fase 10, **el `BoardRepository` será la única abstracción de fuente de verdad**. 
El resto del Board System (`boardService.ts`, etc.) solo consumirá promesas de `BoardData` y no sabrá si el archivo se guardó físicamente en localStorage o en IndexedDB. El repositorio manejará transparentemente el enrutamiento (si cabe en LS, va a LS por velocidad; si es enorme, va a IDB y deja un puntero en LS).

---

### 4. GARBAGE COLLECTION Y SEGURIDAD CONCURRENTE
**El riesgo (Condición de carrera):** Tab A crea un board, guarda el payload, pero todavía no ha guardado el Grafo actualizado. Tab B ejecuta GC, carga el Grafo (donde el board nuevo aún no aparece) y borra el payload físico creyéndolo huérfano.
**Estrategia de Prevención Concreta (Grace Period):**
1. Un board huérfano es una clave `excalidraw-board-*` que no existe en el `BoardsGraph`.
2. **ALGORITMO SEGURO:** El recolector de basura iterará las claves físicas. Si una clave no está en el grafo, leerá su contenido. Si su campo `updatedAt` o `createdAt` (que es el timestamp de escritura) **es menor a 5 minutos de antigüedad**, el GC **lo ignorará y no lo borrará**.
3. **Justificación:** Esto anula totalmente el riesgo. Ninguna operación de creación/guardado demora 5 minutos en sincronizarse entre pestañas.

---

### 5. MULTI-TAB (Sincronización Real vs Ficción)
No implementaremos CRDTs ni merge complejo de JSONs en esta fase. Se empleará **Last-Write-Wins** estricto a nivel de llave física, que es estándar en Excalidraw:
- **Señalización:** Tab A modifica el grafo, lo guarda y escribe la clave `STORAGE_KEYS.VERSION_BOARDS_GRAPH = Date.now()`.
- **Recepción:** Tab B recibe el evento nativo `window.onstorage`. Como solo se emite a las *otras* pestañas, no hay loops de feedback.
- **Caso A (Crear):** Tab B recibe el evento, recarga el Grafo en su store de Jotai. La UI re-renderiza y la nueva carpeta aparece.
- **Caso B (Eliminar estando adentro):** Tab B recarga el Grafo. Nota que su `currentFolderId` ya no existe. El selector derivado o un efecto hace fallback forzoso a la raíz (`rootFolderId`) para evitar un crash de pantalla en blanco.
- **Caso C (Modificar ramas distintas):** El *último* en guardar el Grafo aplasta al anterior. Una carpeta podría "desaparecer" si dos personas reestructuran simultáneamente en pestañas separadas. Aceptado como límite técnico sin backend de colaboración.
- **Caso E (Tab A escribe, Tab B corre GC):** Bloqueado matemáticamente por el "Grace Period" de 5 minutos.

---

### 6. STORAGE EVENT
El evento nativo `storage` cumple todo:
- Solo lo reciben las pestañas inactivas/espectadoras.
- Payload mínimo: Contiene `key` (el nombre de la variable), `newValue` (el timestamp).
- Se identifica validando `if (event.key === STORAGE_KEYS.VERSION_BOARDS_GRAPH)`.

---

### 7. ASINCRONÍA (El mayor problema detectado)
Revisión de rutas: `saveBoard`, `loadBoard`, `createFolder` y `openFolder` ya son o pueden ser totalmente asíncronas (`Promise`).
**Excepción Crítica:** `clonePhysicalBoardsSync` (en `excalidraw-app/boards/host/duplicate.ts`). Excalidraw dispara la duplicación en `handleOnDuplicate` de forma 100% síncrona.
- Si un board reside en IndexedDB (L2), `loadBoardSync` devolverá `null` o el puntero.
- **Solución Obligatoria:** Convertir la clonación física de boards a asíncrona ("fire-and-forget"). El Grafo se actualiza síncronamente (para que la UI reaccione y dibuje el ícono copiado al instante), pero el clonado del payload en IDB/LS ocurre asíncronamente en segundo plano. Si el usuario intenta entrar a la carpeta copiada antes de que termine, mostraremos un estado de carga genérico del editor.

---

### 8. COMPATIBILIDAD
Todo board legacy que resida en localStorage y no tenga marcador `__idb_pointer` se leerá nativamente (y se le aplicará la normalización Base64 de la Fase 9 en memoria). No existe migración forzosa.

---

### 9. FAILURE MODES (Tabla de Riesgos y Mitigación)

| Situación | Comportamiento | Riesgo | Mitigación |
| --- | --- | --- | --- |
| **QuotaExceededError (LS)** | Falla al guardar localmente. | Alto | Interceptar error; escribir payload en IDB; escribir marcador en LS. |
| **IndexedDB bloqueado** | Modo incógnito de Firefox/Tor deshabilita IDB. | Crítico (Crash) | Envolver llamadas a IDB en try/catch; lanzar Toast en UI alertando que no hay espacio. |
| **LS Corrupto (Grafo)** | `JSON.parse` falla. | Alto | Renombrar llave a `*_broken` y arrancar en blanco (ya implementado). |
| **GC Concurrente** | Borrado de boards en vuelo. | Crítico | Time-To-Live (Grace period de 5m) para payloads sin indexar. |
| **Pestaña suspendida** | Estado obsoleto tras horas de reposo. | Medio | Listener `visibilitychange` o `focus` para cruzar versión de memoria vs versión física LS y recargar. |

---

### 10. CAMBIOS MÍNIMOS (Frontera Estricta)
1. `app_constants.ts`: Añadir `VERSION_BOARDS_GRAPH`.
2. `LocalStorageBoardRepository.ts`: Añadir fallback a `idb-keyval` en `saveBoard` (creando marcador en LS) y lectura en `loadBoard`. Añadir función `runGarbageCollector(graph)`.
3. `duplicate.ts`: Modificar `clonePhysicalBoardsSync` para que sea una operación asíncrona tolerante (Promise no bloqueante) respecto a los payloads.
4. `boardService.ts`: Suscripción a eventos `storage` para coordinar el Zustand/Jotai store de los boards.

### 11. PLAN DE TESTS (Nuevos)
- `repository.hardening.test.ts`:
  - Mockear `localStorage.setItem` para arrojar error -> verificar que el BoardRepository escribe en el mock de IndexedDB.
  - Verificar que `loadBoard` lee el marcador y resuelve asíncronamente el payload de IDB.
  - Verificar que GC ignora archivos con `updatedAt` reciente y elimina los viejos no indexados.

### 12. CRITERIOS DE ACEPTACIÓN
1. Guardar un board de 10 MB (mock) sobrevive y migra a IDB sin crashear la UI.
2. Una pestaña abierta re-renderiza la jerarquía cuando otra pestaña crea/borra una carpeta, sin requerir `F5`.
3. Duplicar una carpeta (Ctrl+C / Ctrl+V) funciona a nivel de Grafo de forma síncrona, clonando el payload de forma asíncrona sin fallos.
4. Ninguna funcionalidad de las fases 1-9 sufre regresión visual o técnica.
