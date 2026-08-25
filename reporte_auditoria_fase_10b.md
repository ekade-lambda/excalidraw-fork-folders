# FASE 10B — Auditoría Final de Consistencia y Concurrencia

Este documento responde rigurosamente a cada punto de la auditoría solicitada. Ningún código ha sido modificado.

---

### 1. Mapa Real de Transacciones (El problema de saveBoard -> saveGraph)

He rastreado físicamente el código. Tu sospecha era **100% correcta**. No todas las rutas forman una transacción `saveBoard` → `saveGraph`.

- **`boardService.ts` (`saveCurrentBoard`):** Se ejecuta en cada autosave. Llama _únicamente_ a `repo.saveBoard(data)`. **Nunca** llama a `save(graph)`.
- **`boardService.ts` (`initializeBoardSystem`):** Llama a `createRoot` (que hace `save(graph)`) y **después** llama a `saveBoard`. El orden está invertido.
- **`folderService.ts` (`createFolder`):** Llama a `saveBoard(new)` → `saveBoard(parent)` → `save(graph)`. Es una transacción en el orden esperado.
- **`workspace.ts` (`importWorkspace`):** Llama a `saveBoard` (N veces) → `save(graph)`. Es una transacción.
- **`duplicate.ts` (`handleOnDuplicate`):** Llama a `clonePhysicalBoardsSync` → `saveSync(graph)`. Es una transacción, pero síncrona.

**Conclusión Crítica:** Si el Repositorio inyectara un WAR automáticamente dentro de `saveBoard`, todos los autosaves meterían los tableros al WAR, y como no hay `saveGraph` posterior, se quedarían colgados allí eternamente. **La regla de salida automática por `saveGraph` es errónea e inválida.**

### 2. Corrección de la Regla del WAR

Para resolver esto sin corromper el diseño y **sin modificar `duplicate.ts`**:

1. El repositorio expondrá una API transaccional explícita: `await repo.runWithActiveWrites(boardIds, async () => { ... })`
2. `createFolder` y `importWorkspace` usarán esta API. El servicio conoce exactamente qué IDs son nuevos.
3. **La excepción (`duplicate.ts`):** Como está prohibido modificarlo, el repositorio interceptará _exclusivamente_ `clonePhysicalBoardsSync` (que lógicamente siempre crea tableros nuevos) para añadir los IDs al WAR. Y el repositorio interceptará `saveSync(graph)` para limpiar **solamente los IDs síncronos** que haya inyectado `clonePhysicalBoardsSync`. Esto sella la brecha de `duplicate.ts` sin tocar su código.
4. `saveBoard` **no** tocará el WAR. Los tableros que se autosalvan ya existen en el Grafo, por lo que ya están protegidos contra el GC.

### 3. GC Safety vs Consistency (Last-Write-Wins)

- **Escenario A (GC Safety):** Tab A crea X, registra WAR(X). Escribe X físico. Tab B ejecuta GC. X sobrevive porque el GC ve WAR(X). **CORRECTO.**
- **Escenario B (Crash Safety):** Tab A crea X, guarda Grafo(X). Tab A crashea antes de limpiar WAR. Pasa 1 hora, GC limpia WAR(X). ¿Se borra X? **NO.** X sobrevive porque el GC evalúa la primera regla: ¿Está X en el Grafo? Sí. Entonces se salva. El TTL solo expira el WAR, no el payload. **CORRECTO.**
- **Escenario C (Last-Write-Wins):** Tab A crea X. Tab B borra la rama padre. Tab A guarda Grafo(X). Resultado: El Grafo de Tab A aplasta al de Tab B. El board sobrevive lógica y físicamente. (Esto es una limitación aceptada de consistencia LWW, no un fallo del GC).
- **Escenario D (GC Interleaving):** Tab A borra X del Grafo. Tab B está _editando y guardando_ X (autosave). GC borra el payload de X. Tab B termina su autosave físico. Resultado: El Grafo no tiene a X, pero el payload físico resucita como huérfano. En el siguiente ciclo, GC lo borrará permanentemente. Es eventualmente consistente.

### 4. Cobertura del WAR L1->L2

El WAR envuelve todo el bloque en el Servicio: `INTENT (runWithActiveWrites) -> IDB_WRITE -> LS_POINTER -> GRAPH_COMMIT -> WAR_RELEASE`

- **Crash antes del payload:** WAR colgado. A la 1h, GC borra WAR. Nada en físico. Limpio.
- **Crash durante IDB:** Payload IDB a medias. WAR colgado. A la 1h, GC borra WAR y el payload corrupto/incompleto de IDB. Limpio.
- **Crash antes del puntero LS:** IDB íntegro, sin LS. WAR colgado. A la 1h, GC purga IDB. Limpio.
- **Crash antes del Grafo:** IDB y LS(Puntero) listos. WAR colgado. A la 1h, GC purga ambos. Limpio.
- **Crash antes del WAR Release:** Todo exitoso. WAR colgado. A la 1h, GC expira WAR, pero **perdona el payload** porque ya está en el Grafo. Perfecto.

### 5. Concurrencia del WAR Compartido en LocalStorage

Tienes razón. `LocalStorage` no es atómico para operaciones R-M-W. Un solo objeto `active-writes` sufriría de _lost updates_. **Solución Diseñada:** Usaremos **entradas individuales** con prefijo: `excalidraw-war-<boardId>`.

- Tab A escribe `localStorage.setItem("excalidraw-war-X", timestamp)`.
- Tab B escribe `localStorage.setItem("excalidraw-war-Y", timestamp)`. Es 100% atómico y libre de colisiones a nivel de sistema de archivos (LS). El GC iterará sobre las llaves buscando el prefijo `excalidraw-war-`.

### 6. Política Explícita del GC (Matriz de Inconsistencias)

| Grafo | Puntero LS | Payload IDB | Payload LS Normal | Acción del GC (GC asume WAR evaluado) |
| --- | --- | --- | --- | --- |
| SÍ | SÍ | SÍ | - | **CONSERVA**. Estado óptimo L2. |
| SÍ | SÍ | Falla/Vacío | - | **CONSERVA Puntero**. (La UI reportará corrupción y reconstruirá). GC NO destruye. |
| SÍ | - | SÍ | - | **CONSERVA IDB** (Inconsistencia rara, pero GC perdona datos referenciados). |
| SÍ | - | - | SÍ | **CONSERVA LS**. Estado óptimo L1. |
| NO | SÍ | SÍ | - | **ELIMINA AMBOS** (Huérfano completo L2). |
| NO | SÍ | Falla/Vacío | - | **ELIMINA Puntero LS**. |
| NO | - | SÍ | - | **ELIMINA Payload IDB** (Huérfano puro L2). |
| NO | - | - | SÍ | **ELIMINA Payload LS** (Huérfano puro L1). |

_Regla de Oro:_ El GC **nunca** elimina un componente físico (ni puntero ni payload) si el `boardId` existe en el Grafo o en el WAR. Una inconsistencia interna (Puntero sin IDB) no autoriza al GC a borrar el puntero si está referenciado.

### 7. Estrategia de Tests

Se creará `tests/boards/repository.gc.test.ts`.

1. **Atómica Compartida:** Simular escritura paralela de WAR (comprobando keys independientes).
2. **Protección Prematura:** Board huérfano con `excalidraw-war-X` reciente -> GC no lo toca.
3. **TTL Recovery:** Board huérfano con `excalidraw-war-X` caducado (>1h) -> GC borra el WAR y luego el payload.
4. **Protección Definitiva:** Board en Grafo con WAR caducado -> GC borra el WAR, pero **CONSERVA** el payload.
5. **Huérfano IDB:** Payload en IDB sin puntero y sin Grafo -> GC purga IDB.
6. **Inconsistencia Protegida:** Grafo referencia a X, pero solo existe en IDB sin puntero -> GC perdona el payload.
7. **Idempotencia:** Ejecutar GC 3 veces seguidas no rompe tableros.

### 8. Archivos a Modificar en 10B

- `app_constants.ts` (Prefijo `BOARDS_WAR_PREFIX`)
- `LocalStorageBoardRepository.ts` (API `runWithActiveWrites`, hooks síncronos de `clonePhysicalBoardsSync`, lógica completa del GC).
- `folderService.ts` (Envolver `createFolder` con `runWithActiveWrites`).
- `workspace.ts` (Envolver `importWorkspace` con `runWithActiveWrites`).

**Limitaciones Mantenidas:** `duplicate.ts` queda intacto, y la limitación de Copy/Paste hacia IDB sigue vigente para ser resuelta después.
