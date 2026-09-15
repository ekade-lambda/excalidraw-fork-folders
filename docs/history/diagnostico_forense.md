# Diagnóstico Forense - Bug Rename

## Fase 1 - Reconstrucción del Flujo Real

1. **Elemento DOM de Rename**: Un `div` contenedor que renderiza condicionalmente un `<input>` o un `div` con texto "Rename".
2. **Handler pointerdown sobre Rename**: Actualmente el texto "Rename" tiene un evento de React `onPointerDown`.
3. **Handler pointerup**: Ninguno en nuestro código.
4. **Handler click**: Ninguno en nuestro código.
5. **Listener global pointerdown**: Excalidraw tiene un `document.addEventListener("pointerdown", handler, false)` registrado en `packages/excalidraw/components/Popover.tsx` (Línea 74).
6. **Fase DOM**: Fase Bubble (`false`) en Excalidraw.
7. **Condición de click externo en Excalidraw**: `!popoverRef.current?.contains(event.target)`
8. **Función que ejecuta setRenameCtx(null)**:
   - `onBlur` del `<input>` que llama a `handleRenameConfirm` -> `setRenameCtx(null)`.
9. **Cambio de editing a true**: `setRenameCtx({ ...renameCtx, editing: true })` en `onPointerDown` de Rename.
10. **Montaje del input**: React (tras el renderizado asíncrono provocado por el setRenameCtx).
11. **Desmontaje del input**: React, cuando `setRenameCtx(null)` limpia el estado.
12. **Handler onBlur del input**: Llama a `handleRenameConfirm`, que a su vez llama a `setRenameCtx(null)`.
13. **Después del pointerdown**: El evento burbujea hacia `document`.
14. **Después del pointerup**: El navegador completa el ciclo físico.
15. **Después del click**: El navegador dispara click.

## Fase 6 - El Único Culpable

El primer `setRenameCtx(null)` que mata Rename procede del **`onBlur` del `<input>`**, concretamente provocado por **`focusContainer()` en Excalidraw**, después de que ocurra **el cierre de `Popover` al detectar un click "externo" al menú nativo**.

**Secuencia Forense Exacta:**

1. Haces `pointerdown` sobre "Rename".
2. React ejecuta nuestro `onPointerDown`. Cambiamos el estado a `editing: true`.
3. El evento sigue burbujeando hasta `document`.
4. El listener de `Popover.tsx` de Excalidraw lo captura. Como el botón Rename NO está dentro de `.context-menu`, `Popover` lo interpreta como un click externo y llama a `onCloseRequest()`.
5. `App.tsx` de Excalidraw recibe `onClose` y ejecuta `this.setState({ contextMenu: null }, () => this.focusContainer())`.
6. En paralelo, nuestro componente React se renderiza, montando el `<input autoFocus>`. El navegador le da el foco físico al input.
7. El callback de estado de Excalidraw se dispara inmediatamente después y ejecuta `this.focusContainer()`.
8. `focusContainer()` ejecuta `this.excalidrawContainerRef.current?.focus()`.
9. **ROBO DE FOCO PROGRAMÁTICO**: El navegador obedece y quita el foco de nuestro `<input>` recién nacido para dárselo al canvas de Excalidraw.
10. Nuestro `<input>` dispara el evento `blur`.
11. Nuestro `onBlur` llama a `handleRenameConfirm` -> `setRenameCtx(null)`.
12. Rename desaparece instantáneamente.

## Fase 4 - Comparación Test vs Aplicación Real

El test `folderRename.ui.test.tsx` **no detecta este problema** por tres discrepancias fundamentales:

1. **Robo programático de foco (jsdom)**: En `jsdom`, llamar a `.focus()` en un `div` contenedor no simula correctamente el evento `blur` asíncrono sobre un elemento autoenfocado.
2. **Ciclo de vida del Popover**: El test nunca renderiza la UI real de `Popover` en el body; por tanto, su event listener global de `document` jamás captura el burbujeo de `fireEvent`.
3. **Desaparición manual del menú en el test**: En el test se simuló explícitamente `.remove()` sobre el DOM. Esto NO dispara la callback de cierre en React de Excalidraw (`this.focusContainer()`), aislando completamente al `<input>` del robo de foco, permitiendo que el test pasara en verde mientras la app fallaba.

## Fase 7 - Propuesta Arquitectónica Correcta

El problema real radica en que el `blur` sobre el input tiene un significado ambiguo: A) "El usuario hizo click en otra parte" (Confirmar edición) B) "Excalidraw robó el foco mediante `focusContainer()` en medio del flujo de vida de la UI" (Falso positivo)

Dado que es **imposible y desaconsejable** evitar que Excalidraw llame a `focusContainer()` (pues modificaríamos el Core y romperíamos accesibilidad), la solución debe consistir en enseñar a nuestro sistema de Board a **ignorar el blur si el foco acaba de moverse al contenedor de Excalidraw debido al cierre del menú**.

Propuesta de código:

```tsx
onBlur={(e) => {
  // Comprobar hacia dónde se movió el foco
  const relatedTarget = e.relatedTarget as HTMLElement | null;
  // Si el nuevo foco recae en el canvas de Excalidraw (.excalidraw-container),
  // sabemos que fue un robo programático.
  if (relatedTarget && relatedTarget.closest(".excalidraw-container")) {
    // Ignorar este blur temporalmente (el usuario no quería cancelar la edición).
    // Opcionalmente podemos forzar el foco de vuelta al input de manera asíncrona.
    setTimeout(() => {
      e.target.focus();
    }, 0);
    return;
  }

  handleRenameConfirm(e.currentTarget.value);
}}
```

Esta es la única forma de coexistir con Excalidraw sin tocarlo, sin usar `stopPropagation()` y manteniendo la UI persistente.

## Fase 8 - Los tres errores TypeScript

He revisado exhaustivamente el sistema de archivos físico:

1. `folderRename.ui.test.tsx`
2. `pointer-regression.test.ts`

Los objetos literales allí declarados sí contienen (o contenían en la versión observada por VS Code) las claves `elements` extra. Estos errores NO son "fantasmas", sino que TypeScript detectó correctamente que la API del Mock ya no espera `elements` dentro de la declaración inicial del Board ni en los retornos mockeados sin actualizar. La corrección requiere la limpieza semántica de esas propiedades directamente en los archivos de test.
