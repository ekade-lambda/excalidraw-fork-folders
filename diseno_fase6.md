# FASE 6.0 — Auditoría y Diseño de Arquitectura de Assets

Este documento contiene el diseño de la extracción de assets (imágenes, archivos) al filesystem, protegiendo el contrato con Excalidraw y asegurando operaciones atómicas, tal como se solicitó antes de escribir cualquier código.

## 1. Inspección del Código y Comportamiento Actual
- **Excalidraw UI:** El contrato `BoardData.files` es un mapa `Record<FileId, BinaryFileData>`. Cada `BinaryFileData` contiene metadatos y un `dataURL` (string en Base64 con el binario completo). Excalidraw asume que cuando carga un board, las imágenes ya vienen hidratadas en memoria.
- **Backend Actual (Fase 5):** El Bridge recibe este JSON y lo inserta tal cual en la columna `excalidraw.boards.files (JSONB)`. Las imágenes gigantes viven hoy en PostgreSQL.
- **Almacenamiento Local (Legacy):** Si Excalidraw falla o intenta guardar en background, `LocalData.ts` sigue guardando temporales en `localStorage`. IndexedDB se usa poco, principalmente para la librería de componentes (`LibraryIndexedDBAdapter`). Todo esto es caché local que no interfiere con nuestra fuente de verdad remota.

## 2. Objetivo Arquitectónico y Contradicciones Encontradas
El objetivo es extraer el Base64 de PostgreSQL al Filesystem.

**⚠️ CONTRADICCIÓN IDENTIFICADA:**
Para que la UI de Excalidraw funcione sin modificar su código fuente (manteniendo el contrato de `BoardData`), **necesita** recibir el `dataURL` (Base64) en el momento de cargar el board. 
Si el backend solo devolviera URLs (`http://.../file.png`), tendríamos que reescribir gran parte de Excalidraw para que haga `fetch` asíncrono.
**Solución adoptada (Bridge Translater):** PostgreSQL y el Filesystem serán eficientes, pero el Bridge actuará como traductor. Al hacer `GET /api/boards/:id`, el Bridge leerá los binarios del disco, generará los Base64 al vuelo y reconstruirá el JSON idéntico al que Excalidraw espera. La UI nunca sabrá que el filesystem existe.

## 3. Propuesta de Contrato

### PostgreSQL (`excalidraw.assets`)
La tabla ya existe desde la Fase 1 (`001_initial.sql`) y es perfecta. Contiene:
- `id (VARCHAR)`: El `FileId` de Excalidraw.
- `hash (VARCHAR 64)`: Hash SHA-256 del contenido binario.
- `mime_type (VARCHAR)`: Extraído del JSON.
- `size_bytes (BIGINT)`: Calculado en Rust.
- `relative_path (VARCHAR)`: Ruta física.
- `created_at (TIMESTAMPTZ)`

### Filesystem
- **Raíz:** Definida por una variable de entorno/configuración portable (ej. `ASSETS_DIR=./data/assets`). Ninguna ruta absoluta de Windows será hardcodeada.
- **Estructura:** Content-Addressable Storage (CAS). El nombre del archivo será estrictamente el `SHA-256` de su contenido (ej. `ASSETS_DIR/a1b2c3d4...8f.bin`).
- **Deduplicación:** Dos `FileId` distintos con la misma imagen generarán el mismo SHA-256. Apuntarán al mismo archivo físico en disco.
- **Archivos inexistentes:** Si la DB referencia un archivo que fue borrado del disco físicamente, el Bridge lo omitirá o devolverá un placeholder para evitar que toda la carga del board falle.
- **Huérfanos:** Archivos en disco no referenciados en DB. Inofensivos.

## 4. Seguridad del Filesystem (Path Traversal Prevention)
Dado que el nombre físico del archivo se genera **exclusivamente a partir del cálculo SHA-256** realizado por Rust sobre los bytes de la imagen, es matemáticamente imposible que un usuario inyecte un `../` o manipule la ruta. Todo intento de subvertir el `FileId` se queda en PostgreSQL, sin tocar la lógica de paths.

## 5. Estrategia de Atomicidad (El Protocolo)
El filesystem no tiene *rollback*. Para evitar inconsistencias ante caídas (crashes) o fallos SQL, el Bridge implementará este flujo exacto:

1. **Pre-proceso:** Extraer `dataURL` de `files`, decodificar Base64, calcular SHA-256.
2. **Escritura segura (Filesystem):**
   - Comprobar si `ASSETS_DIR/<hash>.bin` ya existe. Si es así, saltar al paso 3 (Deduplicación).
   - Si no existe, escribir a un archivo temporal `ASSETS_DIR/temp_<uuid>.bin`.
   - Renombrar atómicamente (`fs::rename`) a `ASSETS_DIR/<hash>.bin`.
3. **PostgreSQL (Transaccional):**
   - Iniciar `BEGIN`.
   - `UPSERT` en `excalidraw.assets` (metadatos).
   - Actualizar el JSON de `excalidraw.boards` (guardando el JSON de `files` **sin** el pesado string `dataURL`).
   - Hacer `COMMIT`.

**Manejo de Casos Extremos:**
- *DB falla tras escribir el archivo:* Queda un archivo huérfano inofensivo. (Se limpiará en el futuro).
- *Escritura de archivo falla:* Error temprano, la DB nunca es modificada.
- *Bridge crashea a mitad de escritura:* Queda el archivo temporal (`temp_uuid`), el cual es ignorado.

## 6. Estrategia de Migración Suave (Backward Compatibility)
Para los boards de la Fase 5 que ya tienen imágenes guardadas en Base64 en `excalidraw.boards`:
- `GET /api/boards/:id` será inteligente: Si el JSON almacenado *todavía* contiene la propiedad `dataURL`, lo servirá directamente. Si no la contiene, deducirá que debe buscarlo en disco usando `excalidraw.assets`.
- La próxima vez que un usuario abra ese board y lo guarde (`saveBoard`), el Bridge extraerá el Base64, lo guardará en disco y actualizará la base de datos a la versión "limpia". Migración transparente y bajo demanda, sin scripts peligrosos de migración masiva inicial.

## 7. Garbage Collection (Observabilidad por ahora)
Para esta fase no se borrarán archivos. Un script de observabilidad podrá:
- Extraer todos los `FileId` de los JSONB de boards.
- Cruzarlos con `excalidraw.assets`.
- Listar los `hash.bin` del disco.
Lo que no haga match es basura (Garbage), pero la destrucción queda aplazada.

## 8. Pruebas Planificadas (A desarrollar en implementación)
1. Subir un asset (Base64 -> DB Stripped + Archivo Físico).
2. Recuperar el asset (DB Stripped + Archivo Físico -> Base64).
3. Prueba de deduplicación (2 `FileId`, mismo contenido -> 1 solo archivo).
4. Fallo provocado en PostgreSQL: verificar que la transacción revierte.
5. Path configuration relative portabilidad.
