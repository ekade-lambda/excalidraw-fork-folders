# MICROAUDITORÍA PARA CORRECCIONES DE FASE 10C

Este documento diseña las soluciones específicas para los 4 hallazgos de la auditoría post-implementación, cumpliendo estrictamente con las reglas arquitectónicas (Cero CRDT, prioridad LWW local, proyección estructural).

---

## 1. CRÍTICO — Pérdida de Trazos en Zombie Navigation

### Causa Exacta

Si el Folder X es eliminado remotamente, la Pestaña B detecta que su ruta es inválida (`isZombie = true`) y ejecuta `await initializeBoardSystem(repo)`. Esta función monta el Board raíz, lo que desmonta el canvas actual, perdiendo todos los trazos no guardados de B.

### Invariantes

- Los trazos en proceso no deben destruirse silenciosamente.
- B no debe quedarse en un Board inexistente en el Graph.

### Solución Propuesta

Antes de invocar `initializeBoardSystem`, la Pestaña B debe persistir explícitamente su canvas en disco.

```typescript
if (isZombie) {
  // 1. Persistir el canvas local actual en el board físico huérfano.
  await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
  // 2. Navegar a lugar seguro.
  await initializeBoardSystem(repo);
  return;
}
```

**Efecto:** Los trazos del usuario se guardan en el archivo físico del Folder X. Aunque Folder X ya no está en el Grafo (quedó huérfano), el trabajo local se preservó. Eventualmente (tras 1 hora), el GC de 10B limpiará el archivo huérfano si el usuario no hizo nada, pero no hubo "pérdida silenciosa de datos" de memoria.

---

## 2. ALTO — Carrera Autosave ↔ Reconciliación

### Secuencia Temporal de la Carrera

1. **T0:** Pestaña B recibe `storage`.
2. **T1:** B inicia `await repo.loadBoard(currentBoardId)`.
3. **T2 (Carrera):** El usuario dibuja, el timer dispara `saveCurrentBoard()`. Excalidraw lee la escena _sin la carpeta remota_ y la guarda en disco.
4. **T3:** La promesa de T1 resuelve. B inyecta la carpeta visual en el lienzo (`updateScene`).
5. **Resultado:** El usuario ve la carpeta, pero el disco físico la perdió temporalmente. Si cierra la pestaña sin dibujar más, se vuelve un "Phantom Folder".

### Solución Propuesta

Hacer que la función de reconciliación retorne si hubo cambios (`didChange`). Si los hubo, forzamos un guardado justo después de inyectarlos.

```typescript
const { elements: reconciled, didChange } = syncStructuralElements(...);
if (didChange) {
    excalidrawAPI.updateScene({ elements: reconciled });
    // Garantizar que la persistencia física integre la nueva carpeta + los trazos locales.
    await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
}
```

**Efecto:** La ventana de carrera se cierra porque la reconciliación misma se encarga de re-sellar la persistencia física garantizando que el disco refleje el canvas ya corregido. No genera loops porque `saveCurrentBoard` no actualiza el `BoardsGraph`, así que no emite eventos `storage`.

---

## 3. ALTO — Entrelazado (Out-of-order) de Eventos Storage

### Causa Exacta

Múltiples eventos rápidos disparan promesas asíncronas (`await repo.load()`) sin orquestación. Una lectura rápida de I/O de un evento antiguo puede resolver después de un evento nuevo.

### Solución Propuesta (Serialización FIFO)

Implementar una Cola de Promesas (Promise Queue) en el handler del listener.

```typescript
let syncQueue = Promise.resolve();

const handler = (e: StorageEvent) => {
  if (e.key !== STORAGE_KEYS.BOARDS_GRAPH) return;

  // Encolar estrictamente cada evento
  syncQueue = syncQueue
    .then(async () => {
      // ... proceso de reconciliación ...
    })
    .catch((err) => console.error(err));
};
```

**Efecto:** Ninguna reconciliación comienza hasta que la anterior haya terminado completamente (incluyendo su `updateScene` y su `saveCurrentBoard`). Esto asegura un orden cronológico perfecto. Además, como todas leerán el `repo.load()` más reciente, las ejecuciones encoladas serán idempotentes y rápidas (`didChange = false`).

---

## 4. MEDIO — Reconciliación Parcial (Image / Text)

### Causa Exacta

`syncStructuralElements` usaba como clave identificadora únicamente `folder:${meta.folderId}`. Excalidraw agrupa dos elementos (image, text). Si localmente el usuario borraba la imagen pero no el texto, el algoritmo encontraba la clave `folder:fId` (gracias al texto) y creía que la carpeta visual "ya existía completamente", omitiendo traer la imagen del remoto.

### Solución Propuesta

Aumentar la granularidad de la identidad utilizando el `role` ya presente en la metadata (`meta.role`). Las claves serán: `folder:${meta.folderId}:${meta.role}` (ej. `folder:f1:image`, `folder:f1:text`). **Efecto:**

- Si falta `image`, su clave específica no estará localmente, y se inyectará.
- Si falta `text`, se inyectará.
- Si están ambos, no se duplican.
- Si se elimina el folder del Graph, la validación falla para ambos y se marcan los dos como `isDeleted: true`.

---

## 5. ARCHIVOS AFECTADOS

### Archivos que MODIFICARÉ

- `excalidraw-app/boards/host/reconciliation.ts`:
  - Envolver el handler en una `syncQueue` (Solución 3).
  - Incluir el autoguardado `saveCurrentBoard` si `didChange` es true (Solución 2).
  - Modificar `syncStructuralElements` para devolver `{ elements, didChange }` y usar claves de rol (Solución 4).
  - En caso de `isZombie`, añadir `await saveCurrentBoard(...)` antes del reset (Solución 1).
- `excalidraw-app/tests/boards/reconciliation.test.ts`:
  - Adaptar tests al nuevo return de la función y añadir tests de integración del handler asíncrono simulando el event interleaving y zombie protection.

### Archivos que NO MODIFICARÉ

- `packages/excalidraw/*` (Core intacto).
- `duplicate.ts` (Lógica síncrona intacta).
- `saveCurrentBoard` en `boardService.ts` (Se usará tal como está).
- Infraestructuras de 10A (IDB) y 10B (GC/WAR).

---

## 6. PRUEBAS QUE SE AÑADIRÁN

1. `syncQueue` previene ejecución desordenada simulando latencias I/O invertidas.
2. Recuperación parcial: Folder con text local (image faltante) + remote completo -> Inyecta image correctamente.
3. Zombie Navigation invoca `saveCurrentBoard` para persistir trazos huérfanos antes del salto.
4. Inyección remota fuerza retorno `didChange = true` y llama a `saveCurrentBoard`.

---

## CONCLUSIÓN ARQUITECTÓNICA

Todas las soluciones presentadas utilizan herramientas nativas síncronas o de control de promesas simples. Ninguna convierte el sistema en un CRDT. Los trazos locales conservan el privilegio máximo (no se sobreescriben al inyectar figuras ni se pierden al navegar). La compatibilidad con 10A y 10B está totalmente asegurada.

Quedo a la espera de autorización para proceder con la escritura de código.
