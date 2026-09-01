# Reporte de Implementación - Fase 8.1 (Migración Segura)

## 1. Objetivo y Alcance
El objetivo de la **Fase 8.1** fue implementar un mecanismo de migración lazy y seguro que extraiga los tableros locales heredados (junto con sus imágenes pesadas desde IndexedDB y LocalStorage), los convierta al modelo relacional de PostgreSQL, y guarde los archivos físicos mediante CAS (Content-Addressable Storage). Todo esto bajo estrictas reglas de "Zero Data Loss", Idempotencia, y consistencia transaccional, sin cargar simultáneamente la memoria ni bloquear a los usuarios con migraciones masivas.

## 2. Decisiones Tomadas
* **Lazy/Incremental Migration**: No hay barridos automáticos por fondo. La migración ocurre de a 1 Board cuando la inicialización (`initializeBoardSystem`) del sistema detecta `localStorage`.
* **Idempotencia y Verificación (Rust Bridge)**: La lógica de abstracción hacia el FileSystem se reescribió para comprobar si los hashes de los archivos coinciden *incluso después de escribirse* en disco (verificación Post-Escritura).
* **Bloqueo Transparente**: Se reusa el ciclo natural de carga (`loadBoard`) y guardado del frontend. Si el usuario cierra antes de que se manden al servidor, el local storage se preserva, gracias a que la limpieza sucede exclusivamente tras una respuesta HTTP 200 OK (`repo.saveBoard`).
* **Manejo de Errores**: Si `hydrate_assets` descubre un estado corrupto (ej., archivo faltante, o DB desincronizada), retorna error para evitar renderizar el Board corrompiendo la sesión; si un bloque de escritura física falla, se bloquea la persistencia general y se retiene el Base64 (Estado A) para asegurar cero pérdida de datos.

## 3. Archivos Modificados
* **`excalidraw-app/boards/host/boardService.ts`**:
  - Se incluyó `idb-keyval` para leer todo el almacén `files-db` de IndexedDB mediante `readLegacyFiles()`.
  - Se modificó `initializeBoardSystem` para incluir los `files` en el payload.
  - Se añadió la lógica de purga del Web Storage pero acorazada *después* del éxito rotundo del `saveBoard()`.
* **`bridge/src/assets.rs`**:
  - Refactor completo de `extract_and_save_assets`.
  - Se añadió la lectura asíncrona post-rename para validar el `Sha256` en disco del archivo subido antes de insertarlo en DB y borrar su Base64.
* **`excalidraw-app/tests/boards/phase8.test.ts`**:
  - Nuevo set de pruebas E2E inyectando localStorage/IDB falsos y comprobando la recarga correcta.

## 4. Flujo de Migración (E2E)
1. Usuario abre app local por primera vez tras el deploy (Estado: IndexedDB + LocalStorage).
2. `initializeBoardSystem` captura `readLegacyElements()` y `readLegacyFiles()`.
3. Inyecta todo al payload `BoardData` (Estado A).
4. El Frontend emite POST `/api/boards/:id`.
5. El Bridge intercepta. Itera cada archivo (Blobs -> Base64 Data URL).
6. Rust decodifica a bytes, hashea a SHA-256, crea el archivo en `temp_...bin`, mueve a `[hash].bin`.
7. Rust *re-lee* `[hash].bin` desde el disco, computa hash y verifica que sea idéntico al decodificado (Idempotencia y Seguridad de corrupción de disco).
8. Si ya existía, valida que su contenido actual sea correcto.
9. Se emite UPSERT a `excalidraw.assets`.
10. Bridge borra `dataURL` de la copia en memoria de JSON, dejándola "limpia".
11. Bridge emite UPSERT a `excalidraw.boards`. (Estado B).
12. Responde 200 OK. Frontend borra `idb-keyval` y `localStorage` de forma segura.

## 5. Pruebas y Evidencia
- **`yarn tsc`**: 0 Errores.
- **`yarn vitest run boards`**: Todo pasó. Las regresiones (Fase 1-7) se sostuvieron.
- **Idempotencia Comprobada**: El Bridge procesa exitosamente los re-intentos de Assets caídos gracias al `fs::exists()` y a las restricciones de validación SHA-256.
- **Aislamiento `public.boards`**:
```sql
SELECT count(*) FROM public.boards;
-- Result: 3
```

## 6. Warnings y Limitaciones (Deuda Técnica)
* **[WARNING] Garbage Collection Inactivo:** Seguimos postergando la eliminación física de blobs huérfanos del CAS en caso de que un board o elemento sea eliminado de forma rígida en SQL.
* **[WARNING] Granularidad OOM (Out of memory)**: Como solicitaste que no creara lógica de workers todavía, si el Legacy Board tuviese (hipotéticamente) 500 MB en imágenes, la subida HTTP del POST `/api/boards/:id` fallaría por carga útil masiva en memoria del cliente. Se asume que esto es marginal (<1% usuarios). Queda sujeto a revisión si surgen logs de saturación en el balanceador o browser OOM.

## 7. Criterios de Aceptación
- [x] El formato Web Legacy se transforma integralmente a PostgreSQL + CAS.
- [x] Fallos de disco/SQL se traducen en conservación del Base64 original, evitando corrupción.
- [x] Nunca se borra el Web Storage hasta tener el 100% de la confirmación asíncrona.
- [x] El CAS aplica `Sha256` tras escritura, protegiéndose contra fallas de sistema de archivos temporales.
