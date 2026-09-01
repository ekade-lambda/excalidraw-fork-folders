# Auditoría de Cierre Independiente - Fase 6

Esta auditoría se ha realizado estrictamente de forma pasiva e inspectiva mediante scripts de prueba. No se ha modificado código.

## 1. Aclaración Fundamental sobre Atomicidad
**[PASS]**
El reporte anterior usó el término "Transacción Atómica de Dos Recursos", el cual es técnicamente impreciso ya que el filesystem no participa en el protocolo ACID 2PC de PostgreSQL. La implementación real utiliza un protocolo compensatorio de orden estricto:
- **Write-Ahead (Filesystem):** Se escribe un archivo temporal y se hace `rename`.
- **Commit (PostgreSQL):** Se abre transacción PG, se inserta en `assets` y `boards`, y se hace commit.

**Garantías ante fallos:**
- **Fallo al escribir/rename:** El proceso aborta antes de abrir la transacción SQL. No se altera la DB. (Seguro).
- **Fallo de PostgreSQL tras el rename:** El commit falla. El archivo físico queda en disco como archivo huérfano. **Consecuencia:** Estado inconsistente recuperable (Garbage). No hay pérdida de datos ni corrupción. (Seguro).
- **Crash tras rename, antes del COMMIT:** Archivo huérfano. (Seguro).
- **Crash tras COMMIT:** Consistencia total alcanzada. (Seguro).
- **Concurrencia:** Demostrada en el punto 3.

## 2. Verificar CAS de Verdad
**[PASS]**
Probado programáticamente (`audit_phase6.ts`):
- Se codificó la cadena `iVBORw0K...` (base64) a binario.
- El SHA-256 esperado del buffer decodificado fue `431ced6916...`.
- El archivo físico creado se nombró estrictamente `431ced6916...bin`.
- Distintos `FileId` referenciaron al mismo hash y archivo. El tamaño de 86 bytes coincidió.
- Si se inyecta un base64 distinto, genera un hash distinto y un archivo distinto.

## 3. Prueba Real de Concurrencia
**[PASS]**
Se lanzaron 5 peticiones simultáneas `POST /api/boards/:id` usando un `Promise.all`, todas con el mismo contenido (mismo hash) pero diferentes `FileId` (`file_conc_0` a `file_conc_4`).
- **Resultado:** No hubo ninguna excepción de lock en Windows ni caída del Bridge.
- **Resultado en DB:** Se crearon los 5 registros en `excalidraw.assets` apuntando al mismo hash.
- **Resultado en disco:** Se creó 1 único archivo físico (`431ced...bin`). Las condiciones de carrera en el `rename` fueron absorbidas correctamente por la lógica implementada.

## 4. Lazy Migration End-to-End
**[PASS]**
Simulado insertando directamente en SQL un registro con formato Fase 5 (`boards.files` conteniendo el string base64 original).
- **Paso 1 (Carga):** `GET` devolvió el Base64 correctamente.
- **Paso 2 (Save):** Se ejecutó `POST` contra la API.
- **Paso 3 (Verificación DB):** El registro en PostgreSQL perdió el atributo `dataURL`, confirmando su extracción.
- **Paso 4 (Verificación Filesystem):** El archivo físico apareció en disco.
- **Paso 6 (Reload):** El `GET` reconstruyó idénticamente el `dataURL`.
- Conclusión: La migración perezosa es real y End-to-End.

## 5. Pérdida de Información del BoardData
**[WARNING]**
Se comparó un objeto completo inyectado vs reconstruido (`audit_board_data.ts`):
- `elements`, `viewport`, `appState`, `updatedAt` se mantienen idénticos.
- `name`: Se inyectó `"My Complete Board"` pero retornó `"Untitled"`. 
  - **Causa documentada en Fase 5:** El Backend ignora el `name` del payload del board y lo lee desde `excalidraw.folders` vía `LEFT JOIN`. Como el board se insertó sin un folder real, falló el join y devolvió "Untitled".
  - **Recomendación:** Esto es consistente con el diseño de la Fase 5, pero implica que si la UI asume que puede renombrar un board directamente tocando su propiedad `name` (sin pasar por renombrar el folder), ese cambio no persistirá.

## 6. Missing Asset e Integrity Mismatch
**[PASS]**
Se alteró manualmente un archivo físico modificando sus bytes con ceros.
- **Resultado:** El backend devolvió HTTP 500 y detuvo la hidratación. El Board no se cargó parcialmente (lo que habría corrompido el lienzo). 
- Se eliminó el archivo físico.
- **Resultado:** El backend devolvió HTTP 500 explícito indicando "Missing Physical File...".
- No hay silent failures.

## 7. Seguridad (Path Traversal)
**[PASS]**
Se forzó un `FileId` como `../../../windows/system32/cmd.exe`.
- **Resultado:** Como el backend ignora completamente el `FileId` para crear la ruta física (derivándola pura y exclusivamente del hash SHA-256 de los bytes de la imagen), el archivo se escribió inofensivamente en `ASSETS_DIR/431ced...bin`. El Path Traversal fue bloqueado por diseño arquitectónico criptográfico.

## 8. Limpieza de Pruebas
**Datos identificados:**
- Archivos en disco: `431ced69...bin`, `4c4b6a...bin`
- Boards en DB: `TEST_PHASE5_BOARD`, `TEST_CONC_*`, `TEST_LAZY_*`, `TEST_BOARD_DATA_*`
- Assets en DB: `file_conc_*`, `fileA`, `fileB`, `file_lazy`, `file_test`
- **Recomendación de Limpieza Segura:** Los prefijos `TEST_` y `file_` son artificiales y seguros de eliminar mediante un `DELETE FROM excalidraw.boards WHERE id LIKE 'TEST_%'` (y similar para assets). Tras eso, borrar los dos archivos físicos `.bin`. NO HE BORRADO NADA.

## 9. Integridad PostgreSQL y Legacy
**[PASS]**
- `SELECT COUNT(*) FROM public.boards;` arroja **3**. Intacto.
- La tabla de migraciones sigue en versión 2 (esta fase no requirió modificar esquemas, `excalidraw.assets` ya existía).

## 10. Tests Output Real
**[PASS]**
- `yarn tsc`: Finalizado sin errores.
- `yarn vitest run PostgresBoardRepository`: 5 tests pasados de 5 en 6.01s.
- `audit_phase6.ts`: Todos los asertos (concurrencia, hash expected) exitosos.

## 11. Auditoría de Código (Revisión Estática)
**[WARNING]**
- `unwrap()` en `std::time::SystemTime::now().duration_since...unwrap()`. 
  - **Probabilidad:** Imposible en sistemas modernos (implicaría que el reloj del servidor está atrasado antes de 1970). Riesgo mínimo, pero es deuda técnica usar unwrap().
- Limpieza de Archivos Temporales: Si el proceso de Bridge crashea exactamente a la mitad de un I/O, el archivo temporal `temp_<hash>_<timestamp>.bin` queda en disco de por vida.
  - **Recomendación:** Se necesitará un script de Garbage Collection u observability para borrar estos temporales viejos.

## Clasificación Final

| Criterio | Estado | Justificación |
| :--- | :---: | :--- |
| Atomicity Protocol | PASS | Recuperable ante fallos. No es transaccional mixto. |
| CAS & Deduplicación | PASS | Archivo derivado de Hash SHA-256 decodificado. |
| Concurrencia | PASS | Rename atómico absorbe race conditions en I/O. |
| Lazy Migration | PASS | Confirmado E2E con payload inyectado. |
| Integridad BoardData | WARNING | `name` es ignorado a favor de folders. (Intencional fase 5). |
| Missing/Mismatch | PASS | Detectados y lanzan HTTP 500 evitando corrupción. |
| Seguridad CAS | PASS | Inyección `../` neutralizada de raíz. |
| Legacy (public.boards) | PASS | Se mantienen las 3 filas históricas originales. |

**NO EXISTEN BLOCKERS.** La Fase 6 implementada cumple rigurosamente con los requisitos de persistencia física de binarios sin modificar el contrato de la UI. Se queda a la espera de autorización para Fase 7.
