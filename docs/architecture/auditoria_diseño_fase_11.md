# DISEÑO DETALLADO — FASE 11 (CICLO DE VIDA)

## 1. Objetivo General

Completar el ciclo de vida del Board System habilitando la eliminación estructural permanente (Delete) y activando la recolección de basura (GC) que liberará el almacenamiento persistido en IDB y LS.

## 2. Alcance

- Inyección de botón "Delete" en el Menú Contextual (junto a "Rename").
- Implementación de `folderService.deleteFolder` que orqueste la mutación del dominio y la persistencia física.
- Remoción sincrónica de la representación visual del elemento del canvas activo.
- Activación automatizada, no intrusiva, del motor `GarbageCollector.ts`.

## 3. Fuera de Alcance

- Soporte asíncrono o refactor para Copy/Paste en IndexedDB (Diferido a futura fase).
- Undo/Redo a nivel estructural (Graph).
- Modificación del algoritmo interno del GC o del Repositorio (Ya son robustos).
- Integración Cloud/CRDT.

## 4. Arquitectura Propuesta y Secuencia de Operaciones

**Orquestación de Delete (folderService.deleteFolder):**

1. Carga el Graph actual: `repo.load()`.
2. Calcula dependencias lógicas: `prepareDeleteFolderPatch()`.
3. Aplica parche (elimina folder y todos sus descendientes del Graph): `applyDeletePatch()`.
4. Persiste el nuevo Graph: `repo.save()` (Esto dispara la señalización multi-tab 10C hacia otras ventanas).
5. Captura los elementos visuales locales involucrados, filtra sus IDs y llama a `excalidrawAPI.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })` para que desaparezcan en la pestaña local y dejen un registro en el Undo Stack de Excalidraw.

## 5. Política Delete

La tecla "Supr" (Delete key nativo) realiza una eliminación **puramente visual** en el canvas local (secreta para el Graph). Esta separación arquitectónica es intencional y permanecerá:

- La eliminación estructural _sólo_ es posible explícitamente vía Menú Contextual del Board System -> "Delete".
- Evita acoplar fuertemente la reactividad local del canvas con llamadas costosas de I/O sobre la fuente de verdad.

## 6. Política Undo/Redo (Zombie Rendering)

No se forzará la integración del Graph con el historial visual (Redux/Context) de Excalidraw.

- Al deshacer (`Ctrl+Z`) después de un Delete Estructural, el folder _resucitará visualmente_.
- **Política Determinista "Fantasmas Inofensivos":** Si el usuario interactúa con el folder revivido (doble click para navegar o click derecho para renombrar/borrar), los servicios de orquestación (`openFolderInternal`, `renameFolder`) validarán la existencia del ID en `BoardsGraph`. Como la eliminación estructural no se deshizo, rechazarán la operación con `folder-not-found` silenciosa o limpiamente.
- El elemento fantasma será purgado del canvas en la próxima recarga o en cuanto llegue un nuevo evento de `storage` (por reconciliación 10C).

## 7. Estrategia de Activación del GC

El `runGarbageCollector` contenido en `GarbageCollector.ts` se activará como un _Deferred Job_ (Fire-and-Forget) poco intrusivo.

- **Trigger:** Dentro de `App.tsx`, una vez completada la inicialización inicial del Board System (`initializeBoardSystem`).
- **Retraso:** Se usará un `setTimeout` de 10,000ms a 15,000ms post-mount, para garantizar que la aplicación esté ociosa y no bloquee el TTI (Time to Interactive).
- Se ejecutará _solo una vez por sesión de pestaña_, limpiando los payloads huérfanos que hayan superado el WAR (1 hora de TTL).

## 8. Interacción Multi-tab (Casos de uso garantizados por 10C)

Las garantías establecidas en 10C resolverán nativamente las colisiones del Delete de la Fase 11:

- **A) Pestaña A elimina mientras B dibuja adentro:** El evento `storage` llega a B. La jerarquía se evalúa ausente del nuevo Graph. Se invoca "Zombie Navigation", que fuerza el salvado de los trazos (creando un huérfano legítimo blindado por WAR temporalmente) y devuelve a B a Root.
- **B) B tiene un autosave pendiente:** La `syncQueue` (FIFO) asegura la serialización. Si B autosalva su BoardData antes, sus trazos quedarán atrapados en el payload (que GC borrará en 1h).
- **C) Reconciliación cruzada:** El método `syncStructuralElements` de 10C inyecta/borra elements del canvas si descubre diferencias entre su lienzo y el Graph ajeno; funciona bidireccionalmente e iterativamente.

## 9. Análisis de Carreras e Interacción con WAR/IDB

- La secuencia propuesta muta el `BoardsGraph` de forma atómica y **abandona** los payloads físicos referenciados (BoardData en LS/IDB).
- No hay carrera con el WAR: el WAR ampara escrituras. Como Delete abandona el payload y no lo escribe, el payload empieza su decaimiento hacia la recolección automática.
- No existe el riesgo de eliminar payloads erróneamente: El GC está matemáticamente diseñado para recolectar el conjunto complemento del Graph.

## 10. Consecuencias de Segundo y Tercer Orden

- **Delete + Undo:** Genera elementos zombis manejados silenciosamente por la denegación de servicios.
- **Delete de una jerarquía masiva:** La limpieza de la UI afectará docenas de elementos; `CaptureUpdateAction.IMMEDIATELY` absorberá la mutación como una transacción única sin cuellos de botella de React.
- **Eliminación prematura / Fugas:** Totalmente invalidado por el modelo asíncrono y los punteros de 10A/10B. El GC es idempotente y libre de fallos fatales si IDB falla.

## 11. Archivos Afectados Probables

- `excalidraw-app/boards/host/folderService.ts` (Implementación de orquestación `deleteFolder`).
- `excalidraw-app/App.tsx` (Inyección de Botón UI Delete y montaje de trigger GC diferido).
- `excalidraw-app/tests/boards/delete.test.ts` (Nuevos tests end-to-end simulando la UI / orchestrator).

## 12. Fronteras Protegidas Explícitas

- `packages/excalidraw/**` (Core)
- `duplicate.ts`, `paste.ts` (Copy/Paste heredado de Fase 10, intacto).
- `boardService.ts` (Salvo hook de GC si se prefiere invocar ahí).
- `BoardRepository.ts`, `GarbageCollector.ts` (Algoritmos internos).

## 13. Test Plan Específico (Fase 11)

- Delete unitario: Eliminar carpeta raíz con múltiples elementos hijos. Verificar limpieza visual (canvas `elements`) e inmutabilidad estricta de `BoardsGraph`.
- Simulador de Undo (Zombie Render Test): Resucitar carpeta con `isDeleted=false`, forzar `openFolderInternal` sobre su ID, afirmar retorno silencioso `{ ok: false, reason: "folder-not-found" }`.
- Test de GC Trigger (mockeado): Afirmar que transcurridos 10s desde el mount se disparó `runGarbageCollector` en la instancia persistida.

## 14. Quality Gates

- `yarn tsc`
- `yarn vitest run excalidraw-app/tests/boards` (Cubriendo >185 tests tras añadir las suites 11).

## 15. Criterios de Aceptación Exactos

1. Las carpetas cuentan con la opción visual "Delete" accesible exclusivamente al interaccionar con el componente Custom.
2. Hacer click allí borra sus derivaciones del Graph, propaga un storage event y purga la visual local.
3. El motor GarbageCollector registra ejecuciones por primera vez en toda la aplicación.
4. Previene errores de navegación al intentar ingresar a carpetas que resucitaron vía Undo, conservando la integridad total.
