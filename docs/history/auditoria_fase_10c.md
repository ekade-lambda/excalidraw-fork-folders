# FASE 10C — AUDITORÍA PRE-IMPLEMENTACIÓN (Física y Exhaustiva)

Esta auditoría se ha realizado estrictamente sobre el código actual (tras 10A/10B), sin escribir código y sin dar por cierto ningún supuesto previo.

---

### 1. FUENTE DE VERDAD REAL

- **Dónde vive:** No existe un estado centralizado (atom) del `BoardsGraph` en Jotai. `boardState.ts` únicamente guarda `currentBoardId`, `currentFolderId` y `boardData` activo.
- **Persistencia:** `LocalStorageBoardRepository` guarda el JSON bajo la llave `STORAGE_KEYS.BOARDS_GRAPH`.
- **Lectura:** Absolutamente todos los componentes (`NavBar`, `PickerFolderDialog`) y servicios (`createFolder`, `importWorkspace`) hacen `const graph = await repo.load();` bajo demanda.
- **Consecuencia actual sin F5:** Si la Pestaña A muta el Grafo, la Pestaña B no se entera a menos que el usuario realice una acción en B que fuerce un re-render y una consecuente re-lectura del repositorio.
- **Flujo Físico Real:** Tab A → mutación → `repo.save(graph)` → (Navegador emite evento `storage` a otras pestañas).

### 2. EVENTO `storage`

- **Claves actuales:** El guardado del grafo emite nativamente un evento `storage` con `key === 'excalidraw-boards-graph'`.
- **¿Clave de versión necesaria?:** No necesitamos crear una clave nueva. El propio evento de escritura de `excalidraw-boards-graph` trae la señal perfecta. `window.addEventListener("storage", (e) => { if (e.key === STORAGE_KEYS.BOARDS_GRAPH) { ... } })`.
- **Riesgo:** El navegador garantiza que la Pestaña que realiza la escritura (A) NO recibe el evento, mientras que la otra (B) SÍ lo recibe. Es el canal ideal. No se pierden señales, es nativo del SO/Navegador.
- **Invariante:** El evento solo avisa "el grafo cambió". La pestaña B _debe_ hacer un `repo.load()` para obtener la versión oficial y autoritativa.

### 3. CARRERAS ENTRE PESTAÑAS (Análisis A-J)

- **A (A crea carpeta, B está en el mismo padre):** A guarda Grafo. A modifica elementos de Excalidraw e inserta el dibujo de la carpeta. B recibe la señal del Grafo.
  - _Comportamiento Físico Crítico (TOCTOU visual):_ Si B recarga el Board físico para ver el dibujo, **sobrescribirá/perderá los trazos en curso de B**. Si B no recarga el Board físico, y B hace un autosave, **B borrará el dibujo de la carpeta de A** (porque B guarda sus elementos, que no incluyen la nueva carpeta). El Grafo quedará con la carpeta, pero físicamente la UI no tendrá el icono.
- **B (A elimina carpeta, B está dentro):** B recibe la señal del Grafo nuevo. B debe comprobar `ancestors(graph, currentFolderId)`. Si falla, B debe ejecutar un rescate (ej: `navigateBack` forzado o salto al root) para no quedarse en un estado zombie (pantalla blanca).
- **C/D/E (A y B escriben simultáneamente):** Last-Write-Wins. Si A guarda y 1ms después B guarda, el JSON de B aplasta al de A. El evento de A llegará a B, pero B lo ignorará porque su propia escritura subsecuente es la final.
- **F/I/J (Interrupciones / Suspensión):** `storage` events en pestañas inactivas se encolan o agrupan en navegadores modernos. Al despertar, la pestaña lee el Grafo L2/L1 actual y asume el estado oficial.

### 4. LAST-WRITE-WINS (Semántica)

- En este sistema, "última escritura" significa el último hilo que ejecuta atómicamente `localStorage.setItem("excalidraw-boards-graph")`.
- Es una **falsa apariencia de sincronización de datos profundos**, pero una **auténtica sincronización LWW de punteros estructurales**.
- **CONTRADICCIÓN CRÍTICA CON 10C:** El usuario indicó explícitamente "No sincronización de trazos/cursores" y "No CRDT". Pero si B _no_ actualiza sus trazos locales al recibir la señal de que A creó una carpeta, el autosave de B aplastará el icono que A creó. Esto significa que **10C requiere aceptar que la UI de las carpetas puede desincronizarse del Grafo si hay edición concurrente en el mismo board, o bien forzar recargas destructivas de trazos**.

### 5. TAB SUSPENDIDA / FOCUS

- El evento `storage` nativo funciona incluso en background, pero algunos navegadores congelan el JS.
- Al usar la fuente de verdad como _pull_ (`repo.load()`), no necesitamos `visibilitychange`. Si la pestaña despierta y se renderiza, los eventos encolados se dispararán, y la última lectura del Repositorio traerá la verdad definitiva. No se requiere polling.

### 6. ESTADO DE NAVEGACIÓN

- **Regla Precisa para Zombie Navigation:** Cuando el listener recibe la señal de nuevo Grafo, debe hacer:
  1. `const graph = await repo.load();`
  2. `const active = boardsStoreActions.getCurrentFolderId();`
  3. `const path = ancestors(graph, active);`
  4. Si lanza error (ancestro o el propio folder desapareció), ejecutar `initializeBoardSystem(repo)` o enrutar imperativamente al `rootFolderId`.
  5. Así se garantiza que nadie edite en el limbo.

### 7. INTERACCIÓN CON 10A y 10B

- **10A:** B recibe el evento de un nuevo Grafo. B navega a la carpeta y hace `loadBoard(bId)`. Si el creador (A) usó IndexedDB por cuota, B leerá el puntero LS e irá a IDB. 100% compatible.
- **10B:** Si A crea carpeta, A usa `runWithActiveWrites`. El Grafo se actualiza y el WAR se libera. La señal `storage` se emite cuando el Grafo se escribe (dentro de la transacción). 100% compatible. La jerarquía `Grafo > WAR > GC` jamás se ve amenazada porque el evento no borra nada, solo refresca vistas.

### 8. COPY/PASTE (Deuda Técnica)

- Tab A duplica carpeta (IDB). El Grafo muta. Señal `storage`.
- Tab B recibe señal y la UI (NavBar) actualiza el breadcrumb u otros componentes. Si el usuario en B intenta entrar, `loadBoard` fallará si la cuota IDB no pudo procesar síncronamente (deuda técnica conocida). La señal estructural 10C no agrava el problema de Copy/Paste, simplemente lo expone visualmente más rápido.

### 9. FRECUENCIA DE SEÑALES

- `boardService.ts` ejecuta `saveCurrentBoard` frecuentemente (trazos). Este método **sólo** llama a `saveBoard(data)`, NO a `save(graph)`.
- Por tanto, editar trazos **no emite evento `storage` del Grafo**. Las señales 10C solo volarán en operaciones genuinamente estructurales (crear, borrar, renombrar, duplicar, importar). Es matemáticamente perfecto y eficiente.

### 10. ROBUSTEZ DEL LISTENER (Diseño)

- **Dónde:** En `App.tsx` (montaje del Board System) o `boardState.ts` como efecto global.
- **Evitar loops:** Escuchar `storage` previene loops automáticamente porque el navegador no dispara `storage` en el tab que origina la mutación.
- **Grafo corrupto:** Si el evento gatilla un `repo.load()` y este falla/resuelve backup, la UI reaccionará como si fuera un boot inicial.

### 11. FRONTERA DE ARCHIVOS (Scope 10C)

- `[MODIFY] excalidraw-app/boards/host/boardState.ts`: Añadir efecto global/listener para invalidar estados zombies.
- `[MODIFY] excalidraw-app/boards/ui/NavBar.tsx`: Escuchar el estado reactivo o engancharse al efecto para re-renderizar el pan rallado (breadcrumb).
- **NO TOCAR:** `boardService.ts` (ya emite correctamente a través del repo), `folderService.ts`, `duplicate.ts`, `packages/excalidraw/*`.

---

## CLASIFICACIÓN FINAL Y CONCLUSIÓN

**B) "FASE 10C REQUIERE AJUSTES DE ARQUITECTURA" (ESPECÍFICAMENTE DECISIÓN SOBRE LWW VISUAL)**

He encontrado un conflicto fundamental entre los requisitos de 10C y la arquitectura actual:

1. **El Problema:** La "estructura" (las carpetas) y el "contenido" (los trazos) viven en el mismo objeto físico (`BoardData.elements`).
2. **Impacto (CRÍTICO para UX):** Si Pestaña A crea una carpeta en la raíz (actualizando el Grafo + inyectando el icono en el Board de la raíz), y Pestaña B está editando la raíz, B recibirá el evento del Grafo (10C). Pero si B _no_ recarga el Board físico (para no perder sus trazos), el siguiente autosave de B borrará el icono de la carpeta de A. La estructura y la visión divergen.
3. **Probabilidad:** Muy alta si dos pestañas operan en la misma carpeta padre.
4. **Decisión Arquitectónica Pendiente:**
   - _Opción 1:_ Aceptar el desgarro. LWW significa que el icono de la carpeta muere, pero el Grafo la recuerda. El usuario luego notará una "carpeta fantasma".
   - _Opción 2:_ Si el listener 10C detecta que el Grafo cambió, forzamos recargar el board actual, **destruyendo los trazos en curso de B**. (Mala UX).
   - _Opción 3:_ Implementar un merge rudimentario _solo_ para los iconos de carpetas (complejo).

Me detengo completamente. La infraestructura pasiva (señalización) es 100% segura y factible, pero necesito que dictamines la política de reconciliación visual LWW antes de implementar el listener, ya que definirá si 10C debe o no forzar a la Pestaña receptora a destruir su estado en curso.
