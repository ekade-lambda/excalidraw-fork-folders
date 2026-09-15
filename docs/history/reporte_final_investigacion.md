# FASE 10: Informe de Diagnóstico Forense del Modelo de Datos

He congelado todas las modificaciones y he inspeccionado el estado físico de los archivos y tipos.

### 1. Definición real de `BoardData`

El tipo está definido en `excalidraw-app/boards/types.ts` (línea 83).

```typescript
export interface BoardData {
  schemaVersion: number;
  boardId: BoardId;
  elements: ExcalidrawElement[];
  files: BinaryFiles;
  viewport?: BoardViewport | null;
  name: string;
  updatedAt: number;
}
```

**No tiene identificador `id`. La propiedad que identifica al board es `boardId`.**

### 2. Firma real de `loadBoardIntoEditor`

Definida en `excalidraw-app/boards/host/boardService.ts` (línea 182).

```typescript
export function loadBoardIntoEditor(
  excalidrawAPI: ExcalidrawImperativeAPI,
  boardData: BoardData,
): void;
```

Recibe la API imperativa del editor y el objeto completo del tablero (`BoardData`) cargado del almacenamiento.

### 3. Estructura real de `f`

El objeto `f` es extraído de `Object.values(boardData.files)`. Su tipo es `BinaryFileData` (definido en Core: `packages/excalidraw/types.ts`). Tiene exactamente estas propiedades:

- `id`: FileId
- `mimeType`: string (en nuestro caso `image/svg+xml`)
- `dataURL`: string
- `created`: number
- `lastRetrieved?`: number
- `version?`: number

### 4. Propiedad exacta que contiene el Data URL

`f.dataURL`

### 5. Flujo completo del Data URL hasta `atob()`

1. JSON guardado en localStorage -> `BoardRepository.load()`
2. Deserializado como objeto `BoardData`.
3. `loadBoardIntoEditor(excalidrawAPI, boardData)` extrae sus archivos mediante `Object.values(boardData.files)`.
4. Llama a `excalidrawAPI.addFiles(files)`.
5. El Core (`reactUtils.ts`) intercepta y llama a `App.addMissingFiles(files)`.
6. Itera los archivos; para cada uno con mimeType `svg` llama a `dataURLToString(fileData.dataURL)`.
7. `blob.ts` hace: `base64ToString(dataURL.slice(dataURL.indexOf(",") + 1))`.
8. `encode.ts` hace: `window.atob(base64)`.

### 6. Formato que realmente espera el Core

El Core (`dataURLToString`) **ignora el prefijo**. Solamente ubica la coma (`,`) y corta todo lo que haya después.

- Si le pasamos `data:image/svg+xml;base64,PHN2...`, extrae `PHN2...`. `atob()` funciona.
- Si le pasamos `data:image/svg+xml;charset=utf-8,%3Csvg...`, extrae `%3Csvg...`. `atob()` falla inmediatamente con `InvalidCharacterError` porque `%` es inválido en Base64.

### 7. Implementación actual de `buildFolderImageDataUrl()`

Físicamente, en `materialize.ts`, la función es:

```typescript
export function buildFolderImageDataUrl(): string {
  const svg = `<svg ...</svg>`;
  return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
}
```

Genera `base64`. NO contiene `encodeURIComponent`. Es 100% compatible con `atob()`.

### 8. Rutas que generan Data URLs de carpetas

Búsqueda global confirma que **SOLO** `buildFolderImageDataUrl()` en `materialize.ts` genera este Data URL. Es invocado por `buildFolderVisual` y `buildPointerVisual`.

### 9. Determinación del problema

- **Para carpetas antiguas**: El problema es **Datos Antiguos**. Los `BinaryFileData` guardados en `localStorage` antes de nuestra corrección contienen el string `%3Csvg...`. Al abrir esos boards, se inyectan en el Core y detonan el error.
- **Para carpetas nuevas (durante createFolder)**: Si el error aparece al crear, el problema es el **Bundle/Caché**. Significa que el navegador sigue ejecutando la versión vieja de `materialize.ts` (con `encodeURIComponent`), ignorando el código real en disco.

### 10. Por qué el `InvalidCharacterError` sigue apareciendo

Porque en la carga inicial y apertura de carpetas, se leen y re-inyectan los objetos `files` antiguos de LocalStorage intactos. Su `dataURL` sigue teniendo formato URI-encoded.

### 11. Por qué la instrumentación actual produce un error TypeScript

Porque intenté loggear el ID del board asumiendo que `boardData` tenía la propiedad común `.id`. El tipo estricto indica que se llama `.boardId`.

### 12. Cambio mínimo de instrumentación

En `boardService.ts`: cambiar `boardData.id` por `boardData.boardId`.

### 13. Cambio mínimo de producción necesario

**Ninguno para datos nuevos**, asumiendo que un "Hard Refresh" del navegador sincronice el bundle. **Para normalizar datos antiguos**: Dentro de `loadBoardIntoEditor`, justo antes de `excalidrawAPI.addFiles(files)`: iterar los archivos `f` y, si `f.dataURL` empieza por `data:image/svg+xml;charset=utf-8`, transformarlo al vuelo convirtiendo el URI-encoded string a Base64 y actualizar la propiedad `f.dataURL` antes de entregarlo al Core.
