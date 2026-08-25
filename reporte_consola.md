# Microfase de Clasificación de Consola (Pre-Fase 10)

He realizado un análisis forense de los mensajes de consola sin modificar absolutamente ningún archivo del repositorio ni alterar la funcionalidad.

---

### FASE 1 — INSPECCIÓN SIN MODIFICACIONES

**1. Permissions Policy (`unload`):**

- **App.tsx:903 y Collab.tsx:217**: Se ejecutan durante el montaje de la aplicación (`useEffect` / `componentDidMount`). Son simples llamadas a `window.addEventListener("unload", ...)`.
- Su objetivo es salvar el estado a LocalStorage o Firebase cuando el usuario cierra la pestaña.

**2. InvalidCharacterError (`atob`):**

- El error ocurre durante `excalidrawAPI.addFiles(loadedFiles)`.
- **El flujo exacto**: `App.tsx` recibe la lista de archivos -> invoca `addMissingFiles` -> detecta que el `mimeType` es `image/svg+xml` -> intenta "normalizar" el SVG extrayendo la cadena de texto con `dataURLToString(fileData.dataURL)`.
- `dataURLToString` en `blob.ts:311` hace exactamente esto: `base64ToString(dataURL.slice(dataURL.indexOf(",") + 1))`.
- Es decir, **Excalidraw Core asume incondicionalmente que el dataURL está codificado en Base64**, por lo que intenta decodificarlo llamando a `window.atob(...)`.
- **El valor concreto que recibe `atob`**: Recibe `%3Csvg%20xmlns%3D...` (una cadena URL-encoded, no base64).
- Al encontrar el símbolo `%` (que no existe en el alfabeto de base64), `atob` lanza la excepción real.
- **¿Cuándo ocurre?**: Ocurre siempre que el Board System inyecta un elemento visual de tipo Folder (al arrancar, al abrir otra board o al crear una carpeta), ya que la carpeta inyecta su icono como un archivo falso al editor.

---

### FASE 2 — DETERMINAR SI EL ERROR DE atob() ES NUESTRO

**"FUE INTRODUCIDO POR NUESTRAS MODIFICACIONES"**

El error proviene directamente de nuestro código del Board System implementado en una fase anterior. En `excalidraw-app/boards/host/materialize.ts` (línea 63, función `buildFolderImageDataUrl()`), nosotros programamos: `return \`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}\`;`

Al inyectar ese Data URL URL-encoded en el ecosistema del Core (a través de `folderService.ts:123: excalidrawAPI.addFiles([imageFile])`), rompemos el contrato implícito del Core, que espera que todo `dataURL` sea estrictamente base64.

---

### FASE 3 — DETERMINAR SI ES REPRODUCIBLE

**Sí, es reproducible sistemáticamente.**

- **Condición mínima**: Simplemente inicializar el editor y cargar una carpeta, o hacer clic derecho > "Create folder".
- Inmediatamente, `hostToCoreSync` inyecta el `imageFile` de la carpeta, provocando que `addMissingFiles` intente normalizar el Data URL y detone la excepción.

---

### FASE 4 — PERMISSIONS POLICY / unload

**Diagnóstico:**

1. **¿Qué código lo registra?**: `App.tsx` y `Collab.tsx` del Core registran `window.addEventListener("unload", ...)`.
2. **¿Por qué se bloquea?**: Chrome 117+ y navegadores modernos están deprecando el evento `unload` para mejorar el BFCache (Back-Forward Cache).
3. **¿Es esperado?**: Sí, es puro ruido de advertencia de los navegadores modernos informando que esa política de permisos prohibirá pronto este listener.
4. **¿Afecta a nuestro Board System?**: No. Ni lo introdujimos, ni nos afecta directamente. El Core de Excalidraw ya usa `beforeunload` y `visibilitychange` como fallbacks modernos.

---

### FASE 5 — CORE

`git diff -- packages/excalidraw` confirma que el Core sigue **intacto** y no ha sido modificado. Toda la excepción ocurre porque el Core se topa con un dato con un formato inesperado proporcionado por la capa Host.

---

### FASE 6 — CLASIFICACIÓN FINAL

| Mensaje | ¿Error real? | ¿Preexistente? | ¿Introducido por Board System? | ¿Afecta funcionalidad? | Severidad | Acción |
| --- | --- | --- | --- | --- | --- | --- |
| Permissions Policy unload | No (Ruido del navegador) | Sí | No | No | Informativa | Ignorar |
| InvalidCharacterError atob | Sí (Excepción JS) | No | Sí | Marginalmente\* | Baja | Microfase Correctiva |

_\*Marginalmente: El error lanza una excepción, pero ocurre dentro de un bloque `try/catch` nativo de Excalidraw (`App.tsx:5173`). Esto significa que Excalidraw captura el error, lo imprime en consola y simplemente omite la normalización del SVG. La imagen se renderiza visualmente bien porque el navegador soporta Data URLs URL-encoded, pero el archivo "fantasma" de la carpeta queda en un estado no normalizado internamente._

---

### FASE 7 — DECISIÓN SOBRE FASE 10

**RECOMIENDO UNA MICROFASE CORRECTIVA ANTES DE FASE 10.**

**Por qué:** Aunque la aplicación funciona visualmente y el error está mitigado por un `try/catch`, estamos violando el contrato de datos interno de Excalidraw enviando un archivo no estandarizado. En el futuro, cuando la Fase 10 intente gestionar el Garbage Collection o manipular múltiples tabs con archivos SVG sin normalizar, este desajuste de Base64 vs URI-encoded podría causar bugs de persistencia muy difíciles de rastrear (ej. Excalidraw pensando que el archivo está corrupto y purgándolo).

**Qué debería corregirse (SIN EJECUTARLO TODAVÍA):** Solo hay que modificar `buildFolderImageDataUrl()` y (si aplica) `buildPointerVisual()` en `excalidraw-app/boards/host/materialize.ts` para que utilicen `btoa` en lugar de `encodeURIComponent`, retornando un verdadero Base64 Data URL, alineando nuestro Host 100% con las expectativas del Core.
