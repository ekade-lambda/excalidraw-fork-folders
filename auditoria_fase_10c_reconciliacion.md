# FASE 10C — AUDITORÍA DE RECONCILIACIÓN (Frontera Estructural/Visual)

Este documento responde a la necesidad de aislar conceptualmente la sincronización del Board System sin invadir ni destruir la edición de trazos de los usuarios.

---

## 1. SEPARACIÓN CONCEPTUAL OBLIGATORIA

- **A. `BoardsGraph` (Estructural):** Dicta la VERDAD ABSOLUTA sobre qué carpetas existen, cómo se llaman, quién es su padre y qué `boardId` les corresponde.
- **B. `BoardData` (Visual):** Contiene el trabajo bruto del usuario (trazos) Y ALBERGA una copia visual (iconos, posiciones) de los metadatos estructurales para que el usuario pueda interactuar con ellos en el lienzo.

**Frontera exacta:** La existencia y jerarquía pertenecen al Graph. La coordenada (X,Y) del icono en un momento dado pertenece al BoardData (LWW normal de Excalidraw).

## 2. IDENTIDAD DE LOS ELEMENTOS DE CARPETA

- La identidad **está robustamente establecida**. El archivo `materialize.ts` inyecta un campo determinista en las figuras que dibuja: `customData: { kind: "folder", folderId, boardId, reprId, role: "image"|"text" }`
- **Relación inequívoca:** `Folder Graph Node ↔ Elementos con customData.folderId`.
- No dependemos de heurísticas visuales ni posiciones para saber qué elemento representa a qué carpeta.

## 3. PRINCIPIO DE NO DESTRUCCIÓN (El Escenario)

- **Tab A** crea Folder X. Escribe el Grafo. Escribe el BoardData físico inyectando el elemento visual.
- **Tab B** está dibujando en ese mismo Board. B recibe el evento `storage` del Grafo.
- **No destrucción:** B _no_ debe recargar el BoardData completo porque perdería sus trazos no guardados.

## 4. EL PROBLEMA REAL DEL AUTOSAVE

- Si B simplemente ignora el evento y no actualiza su lienzo, el próximo `saveCurrentBoard()` de B tomará los elementos de la memoria de B (que no incluyen el folder X) y **sobrescribirá el BoardData físico**.
- **Resultado:** Pérdida de la representación física de la carpeta X. El Grafo dirá que X existe en ese padre, pero físicamente el usuario de la Pestaña B acaba de borrar el icono. Es una desincronización permanente (carpeta fantasma).

## 5. LA UNIDAD DE CONFLICTO

- No podemos tratar el `BoardData` entero como una unidad opaca de LWW si queremos evitar carpetas fantasma.
- **La unidad real de conflicto debe separarse en:**
  - Trazos/Lienzo = LWW puro.
  - Elementos con `customData.kind === "folder" | "pointer"` = **Proyección dependiente del Grafo**.

## 6. PROYECCIÓN GRAPH → CANVAS

La arquitectura correcta considera los elementos de carpeta en el canvas como una _proyección materializada_ del `BoardsGraph`. Si el Grafo dice que la Carpeta X existe en el Board Y, entonces el canvas del Board Y _debe_ contener el elemento visual de la Carpeta X. Si el Grafo dice que se borró, el canvas _debe_ purgarlo.

## 7. RECONCILIACIÓN MÍNIMA ESTRUCTURAL

Es completamente viable hacer un merge localizado y seguro sin CRDTs: Cuando Tab B recibe un evento de que el Grafo cambió:

1. B lee el nuevo Grafo oficial.
2. B mira qué carpetas deberían existir en su `currentFolderId`.
3. B inspecciona su canvas actual (`excalidrawAPI.getSceneElements()`).
4. **Inserción Remota:** Si el Grafo exige una carpeta que no está en el canvas, B lee silenciosamente el `BoardData` físico (guardado por A), extrae los 2 elementos (`image` y `text`) con ese `folderId`, y los inyecta en su canvas (`updateScene`). B NO toca sus propios trazos.
5. **Eliminación Remota:** Si el canvas tiene una carpeta que ya NO existe en el Grafo, B la marca como `isDeleted: true` en su canvas.
6. **Manejo LWW:** Los trazos no se tocan. ¡Conflicto resuelto de forma determinista!

## 8. POSICIÓN DE LAS CARPETAS

- La **autoridad inicial** la tiene la pestaña creadora, que define la coordenada al inyectar el icono.
- Una vez insertado, la **autoridad de la posición es el BoardData local (LWW)**.
- Si Tab B ya tiene el icono de la Carpeta X, y Tab A lo mueve... el evento no dispara `storage` del Grafo. B y A simplemente compiten LWW por la posición del icono (comportamiento esperado y aceptable en herramientas no colaborativas). La sincronización 10C _sólo_ reconcilia existencias y eliminaciones, no teletransporta carpetas que ya existen.

## 9. ELIMINACIÓN REMOTA

- **Tab A** elimina Folder X.
- **Tab B** está _dentro_ de Folder X. B recibe la señal del Grafo.
- B lee el nuevo Grafo y se da cuenta de que su `currentFolderId` ya no tiene ancestros hasta el root.
- **Acción:** B advierte (opcionalmente) y fuerza un salto al `rootFolderId`. Los cambios en progreso de B se autoguardan en el `BoardData` de X _justo antes del salto_, dejándolo como un board "huérfano con puntero".
- **Impacto GC:** El GC borrará los datos de X en la próxima pasada porque X desapareció del Grafo, lo cual es la definición exacta de "eliminar la carpeta remotamente". Es un comportamiento seguro y predecible.

## 10, 11 y 12. ESTADO DIRTY Y VERSIONES (Descartado)

- **Conclusión:** No necesitamos versión de `BoardData` ni estado _dirty_ manual.
- Al usar el modelo de "Proyección de Elementos Estructurales", la propia presencia/ausencia del `customData` actúa como estado. La reconciliación ocurre reactivamente a los eventos del Grafo y corrige el canvas activo de inmediato, previniendo que un autosave posterior guarde información estructural obsoleta. `saveCurrentBoard` no necesita ser modificado en absoluto; simplemente guardará lo que el lienzo reconciliado tenga en ese momento.

## 13. REGLA DE SEGURIDAD

La jerarquía propuesta encaja perfectamente con el diseño:

1. No perder trazos (la reconciliación inyecta/borra elementos específicos, no sobreescribe la escena).
2. No carpetas fantasma (se inyectan leyendo el LWW ajeno).
3. Grafo coherente.
4. LWW puro para todo lo demás.

## 14 y 15. INTERACCIÓN CON 10A Y 10B

- 100% compatible. Leer el `BoardData` físico ajeno durante una reconciliación respeta `loadBoard` (IDB pointer/fallback). El WAR (10B) no se rompe porque este proceso solo responde a lectura de eventos, no intercepta las aserciones de consistencia.

## 16. MULTI-TAB SIN COLABORACIÓN

Significa: "Si yo dibujo una línea, no quiero que aparezca mágica e instantáneamente en tu pantalla, porque el coste arquitectónico (CRDT) es altísimo. Pero si borro o creo un archivo/carpeta, SÍ quiero que tu sistema de navegación se actualice, porque las carpetas son el sistema de archivos de la aplicación."

## 17. ARQUITECTURA SELECCIONADA

- **Opción E: Merge limitado exclusivamente a elementos estructurales.** Es la única solución que cumple con "no perder trazos" y "no crear carpetas fantasma" manteniendo la simplicidad síncrona.

## 18. NO COMPLEJIDAD INNECESARIA

El "merge" es simplemente un filtro de arrays basado en `customData.folderId`. Es O(N) puro sobre elementos en memoria. Cero servidores, cero librerías, puro React/TypeScript.

## 19. FRONTERA DE ARCHIVOS

- `[MODIFY] excalidraw-app/boards/host/boardState.ts`: Para implementar el listener pasivo de `storage`.
- `[MODIFY] excalidraw-app/boards/host/reconciliation.ts` (NUEVO): Un archivo de funciones puras `syncStructuralElements(graph, currentElements, physicalData)` para aislar esta lógica crítica de merge.
- `[MODIFY] excalidraw-app/boards/ui/NavBar.tsx`: Suscripción opcional.
- **[NO TOCAR]**: `duplicate.ts`, `saveCurrentBoard`, dependencias, `packages/*`.

## 20. TESTS (Esenciales)

- Unitarios: `syncStructuralElements` inyecta folders ausentes y marca `isDeleted` los eliminados.
- Unitarios: `syncStructuralElements` no toca trazos del usuario.
- Integración: Eliminación remota mientras B está dentro del folder dispara redirección.

---

## DECISIÓN FINAL

**A) FASE 10C APROBABLE PARA IMPLEMENTACIÓN**

El diseño es sólido, los casos límite LWW están acorazados mediante reconciliación estructural selectiva, y la separación entre Grafo (Verdad) y Board (Proyección/Lienzo) elimina el riesgo de pérdida de datos del usuario. Quedo a la espera de autorización para iniciar la Fase 10C según estas directrices.
