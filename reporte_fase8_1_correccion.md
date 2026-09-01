# Reporte de Corrección - Fase 8.1

## Resumen de Problemas Abordados
Se solventaron categóricamente los hallazgos críticos detectados en la auditoría, con especial atención a la habilitación de cargas grandes y la migración irrestricta de datos *legacy* sin comprometer la garantía "Zero Data Loss".

## 1. Corrección: Límite de Payload de Axum (Blocker)
* **El Problema**: El extractor `Json<T>` de Axum limitaba las cargas útiles a 2 MB por defecto, devolviendo error HTTP 413 si se enviaban imágenes legadas grandes (en Base64). Esto rompía la migración en entornos reales.
* **Solución Aplicada**: Se implementó una capa explícita en el router principal (`bridge/src/main.rs`) utilizando `DefaultBodyLimit::max(100 * 1024 * 1024)`.
* **Racionalidad**: 100 MB es un límite robusto. Excalidraw no suele exceder ese tamaño en un solo Board incluso con múltiples imágenes insertadas gracias a la compresión interna, pero provee un techo suficiente para evitar ataques o caídas por Out Of Memory, estabilizando finalmente el Bridge para migraciones y guardados densos (Fases presentes y futuras).
* **Prueba de Verificación**: Se añadió un test en `phase8.test.ts` con un Base64 inflado artificialmente a ~3 MB para testear rigurosamente este comportamiento, confirmando que la red acepta y CAS extrae el archivo exitosamente.

## 2. Corrección: Retención Involuntaria de Datos Legacy (Warning Alta)
* **El Problema**: La rutina de `initializeBoardSystem` evaluaba el legado de IndexedDB y LocalStorage **únicamente** si el PostgreSQL estaba vacío (`!existing`). Un usuario con tableros preexistentes en Postgres se vería impedido de recuperar sus datos locales.
* **Solución Aplicada**: Se modificó `boardService.ts` para extraer siempre los datos legados si existen. Si la BD PostgreSQL está vacía, se inyectan en el root. **Si ya existen tableros en PostgreSQL**, los datos legacy ahora son automáticamente insertados como un **Nuevo Folder y Nuevo Tablero** llamado "Importación Legacy" dentro del Graph ya existente.
* **Cero Colisión**: La creación usa timestamps (`Date.now()`) para garantizar que los punteros y IDs no colisionen con los tableros actuales, integrando la historia local de manera respetuosa.

## 3. Corrección: Tests Falsos (Warning Alta)
* **El Problema**: El test anterior aplicaba Mocks a `repo.load()` y silenciaba IndexedDB si el entorno virtual no lo contenía.
* **Solución Aplicada**: Se incorporó la dependencia `fake-indexeddb` y se inyectó nativamente su soporte (`'fake-indexeddb/auto'`). Se eliminaron los Mocks de `repo.load`.
* **Prueba E2E Genuina**: El nuevo test inicializa un entorno real. Se crea un board en PostgreSQL, a la par que se inyectan datos legados con un asset de >2MB en IndexedDB. Se fuerza el Boot real de `initializeBoardSystem` para ver la migración operando concurrentemente al Graph, probando así CAS, IDB y PostgreSQL sin redes artificiales.

## 4. Garantías Re-validadas
* La limpieza de `localStorage` y `files-db` permanece atada indisolublemente al éxito (`try-catch` post `saveBoard`). Se agregó una prueba donde el request falla simulando HTTP 500, y se verifica positivamente que los datos legados persisten.
* La concurrencia y deduplicación de CAS permanecen intocables y demostraron operar de forma consistente.
* `public.boards` se verificó vía base de datos (sigue en conteo 3, completamente intacto).

**Todas las modificaciones cumplen las directivas de arquitectura y la corrección puede considerarse estructuralmente terminada.**
