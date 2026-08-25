# FASE 10 — Arquitectura Definitiva (Tercera Auditoría)

Este documento contiene el diseño final respondiendo a todas las exigencias de seguridad, atomicidad y concurrencia. No se ha modificado ningún código.

---

### 1. GC: GARANTÍA LÓGICA DE SEGURIDAD

El TTL probabilístico es insuficiente. Para garantizar lógicamente que el GC nunca borre un board en proceso de creación/escritura (incluso si la pestaña se suspende), usaremos un **Write-Ahead Register (WAR)**.

- **Mecanismo:** Antes de escribir un nuevo board, la pestaña añade el `boardId` a una lista `excalidraw-boards-active-writes` en localStorage.
- **Regla Formal del GC:** Un payload (LS o IDB) solo puede eliminarse físicamente si:
  1. Su `boardId` NO existe en el `BoardsGraph` consolidado.
  2. Y su `boardId` NO existe en `active-writes`.
- _Mitigación de Crashes:_ Solo si la pestaña crashea irremediablemente, el ID quedará en `active-writes`. Aquí, y solo como mecanismo de recuperación ante desastres (no para concurrencia), el GC aplicará un TTL de 1 hora a los registros colgados en `active-writes` para liberarlos.

### 2. ATOMICIDAD DEL FALLBACK LS → IDB

El protocolo atómico resuelve los casos de interrupción:

- **Caso A (IDB escribe, muere antes del puntero LS):** El payload queda en IDB. El Grafo no lo referencia. Es invisible. GC lo purgará. Seguro.
- **Caso B (IDB y Puntero ok, muere antes del Grafo):** Igual. Payload y Puntero quedan huérfanos. GC limpia ambos. Seguro.
- **Caso C (Puntero existe, IDB vacío):** Corrupción de L2. `loadBoard` sigue el puntero, recibe `null`, y reacciona devolviendo un board vacío (comportamiento actual tolerante a fallos). Seguro.
- **Caso D (Payload viejo LS, nuevo IDB, sin puntero actualizado):** Imposible lógicamente. El puntero es el _Commit L2_. Hasta que el puntero no sobreescribe la key en LS, el sistema considera válida la versión de LS.
- **Caso E (Falla escribir el puntero por Cuota):** Si los ~30 bytes del puntero no caben, el localStorage está 100% lleno. La operación se aborta de inmediato y el BoardRepository lanza `QuotaExceededError`. La UI lo captura y avisa al usuario, bloqueando la destrucción de datos.

### 3. PROTOCOLO DE COMMIT (Máquina de Estados)

La persistencia de un tablero sigue este flujo:

1. **INTENT:** Registrar `boardId` en `active-writes`.
2. **WRITE_PAYLOAD:** Escribir a LS (Si cuota llena: escribir a IDB y luego escribir puntero a LS).
3. **COMMIT_GRAPH:** Actualizar y escribir el `BoardsGraph` a LS. (Este es el punto de no retorno. A partir de aquí el board existe oficialmente).
4. **SIGNAL:** Actualizar `VERSION_BOARDS_GRAPH`.
5. **CLEANUP:** Remover `boardId` de `active-writes`.

### 4. COPY/PASTE: ESTRATEGIA DE DELEGACIÓN ASÍNCRONA

Excalidraw requiere que `handleOnDuplicate` sea síncrono.

- **Arquitectura Mínima:** La clonación de los _elementos visuales_ (la carpeta en el canvas) y la actualización del _BoardsGraph_ ocurren síncronamente. El usuario ve la nueva carpeta inmediatamente.
- La clonación del _BoardData_ (profundo) se despacha en _background_ (Promesa).
- **El Bloqueo (UX):** `boardService.openFolder()` (que es asíncrona) mantendrá un `Map` global en memoria de promesas de clonación activas. Si el usuario hace doble clic súper rápido, `openFolder` hará un `await` de esa promesa antes de cargar el board. Si es desde otra pestaña, `loadBoard` implementará un retry de 3 intentos cortos (espaciados 300ms) si no encuentra el board, cubriendo la pequeña ventana de background.

### 5. FALLBACK MATRIX (IndexDB como L2)

| localStorage | IndexedDB | Resultado y Justificación |
| --- | --- | --- |
| Ok | Ok | **Usa LS**. Es rápido, síncrono y previene carreras async innecesarias. |
| Lleno | Ok | **Usa IDB + Puntero en LS**. Resuelve el problema principal de Excalidraw. |
| Ok | Falla | **Usa LS**. Ignora el fallo de IDB (ej. Firefox Privado) manteniendo funcionalidad. |
| Lleno | Falla | **Fallo Crítico**. Lanza error. La UI mostrará toast de "Sin espacio". Es la única opción para no mentirle al usuario. |

### 6. MULTI-TAB Y SEÑALIZACIÓN (Detección de Estado)

Tab B detecta obsolescencia estrictamente por evento:

1. Tab B recibe el evento nativo `storage`.
2. Confirma `event.key === STORAGE_KEYS.VERSION_BOARDS_GRAPH`.
3. Tab B recarga `BoardsGraph`.
4. El store Zustand/Jotai actualiza sus referencias. Tab B evita el loop porque no guarda el grafo en respuesta al evento, solo lo lee.

### 7. VERSIONADO

**No se requiere un revision ID granular por board.** El `BoardsGraph` usa _Last-Write-Wins_ estricto y actúa como fuente de verdad jerárquica. Las escrituras de tableros individuales son atómicas y apuntan a un solo destino (el `boardId` UUID). La colisión de dos pestañas editando _el mismo board_ se resuelve con Last-Write-Wins físico. Un reloj divergente no corrompe la persistencia porque las claves de versión simplemente notifican cambio, no imponen un orden causal distribuido (no somos un CRDT).

### 8. REGLA FINAL DEL GARBAGE COLLECTOR

El GC ejecuta:

1. Extrae todos los keys `excalidraw-board-*` de LS y IDB.
2. Filtra (MANTIENE) los que existen en `BoardsGraph.boards`.
3. Filtra (MANTIENE) los que existen en `active-writes`.
4. Filtra (MANTIENE) los que tienen un timestamp físico menor a 1 hora (seguro de vida contra crash de la pestaña durante `active-writes`).
5. **Borra físicamente** el resto.

### 9. ELIMINACIÓN DE TABLEROS (Tombstones vs Purga Lógica)

Cuando un usuario elimina una carpeta:

1. Se elimina la referencia del `BoardsGraph` (Commit lógico). Esto hace que la carpeta desaparezca para todos.
2. Se lanza el SIGNAL a otras pestañas. Si Tab B estaba DENTRO de esa carpeta, al recibir el nuevo Grafo notará que `currentFolderId` desapareció, y hará "fallback" a la raíz del proyecto para no quedar en una vista huérfana.
3. Se ejecuta el borrado físico del payload (fire-and-forget). No usamos tombstones, porque el Grafo es la única lista de autoridad.

### 10. LÍMITES DE FASE 10 (Lo que NO es)

Fase 10 **NO** fusionará grafos divergentes (si dos pestañas crean carpetas a la vez en ramas distintas, el último en guardar el grafo aplastará la carpeta del primero). Fase 10 **NO** transmitirá cursores ni modificaciones de trazos en vivo. Su único rol es coordinar las mutaciones estructurales del Board System para evitar estados zombies.

---

### 13. PLAN DE IMPLEMENTACIÓN FRACCIONADO

Implementaremos la Fase 10 en 3 partes incrementales y verificables:

**FASE 10A: Persistencia y Fallback (Atomicidad)**

- _Archivos:_ `LocalStorageBoardRepository.ts`
- _Cambio:_ Añadir la lógica `idb-keyval`, el puntero `{__idb_pointer:true}` y los bloques `try/catch` de `QuotaExceededError`.
- _Prueba:_ Llenar LS intencionalmente y comprobar que el board guarda en IDB.

**FASE 10B: GC y Ciclo de Vida**

- _Archivos:_ `LocalStorageBoardRepository.ts`
- _Cambio:_ Implementar `active-writes` (WAR) y la rutina `runGarbageCollector(graph)`. Actualizar la lógica de `clonePhysicalBoards` para ser async safe.
- _Prueba:_ Creación rápida vs GC simulado.

**FASE 10C: Multi-Tab Signaling**

- _Archivos:_ `app_constants.ts`, `boardService.ts`
- _Cambio:_ Definir la key de versión. Añadir `window.addEventListener("storage")` para recargar el `BoardsGraph` en Jotai y hacer fallback a raíz si el currentFolder se borra.
- _Prueba:_ Abrir dos ventanas y eliminar una carpeta en A; B debe cerrarla.

### 14. CRITERIOS DE ACEPTACIÓN

1. Llenar localStorage al máximo -> Crear y guardar un board funciona (IDB fallback) y puede abrirse desde otra pestaña.
2. Copiar y pegar una carpeta clona los elementos al instante, y el usuario puede abrirla 2 segundos después sin fallos (Promesa completada).
3. Eliminar una carpeta en Tab A cierra inmediatamente la vista en Tab B y navega al root.
4. Ejecutar el GC manual o automático purga de LS e IDB los boards borrados (liberando megabytes reales de cuota).
5. Las operaciones asíncronas no rompen los tests síncronos preexistentes.
