# Reporte de Implementación - Fase 11.2

## 1. Archivos Modificados y Creados
* **[NUEVO] `bridge/src/gc.rs`**: Módulo que contiene la lógica central del Garbage Collector, dividida estructuralmente en Mark-and-Sweep.
* **[MODIFICADO] `bridge/src/main.rs`**: Se registró el nuevo módulo `mod gc` y se habilitó el endpoint administrativo `POST /api/gc`.
* **[MODIFICADO] `excalidraw-app/package.json`**: Se instalaron `jszip` y `@types/jszip` como devDependencies para solventar la deuda preexistente de TS.
* **[MODIFICADO] `excalidraw-app/tests/boards/phase10.test.ts`**: Se repararon los tipos del payload de JSZip (`as unknown as BodyInit`), reparando permanentemente el Quality Gate de compilación estricta de TypeScript.
* **[NUEVO] `excalidraw-app/tests/boards/phase11.test.ts`**: Batería de 12 pruebas de integración para certificar el GC.

## 2. Arquitectura Implementada

### Flujo MARK (Sin Lock)
1. Extrae de PostgreSQL el diccionario absoluto de Hashes Vivos.
   * `SELECT jsonb_object_keys(files)`
   * `SELECT elem->>'fileId'`
   * (Ambos restringidos a `b.deleted_at IS NULL`).
2. Escanea `data/assets/`.
3. Rechaza archivos con longitud o caracteres fuera del formato hexadecimal 64 (SHA-256).
4. Rechaza carpetas y symlinks usando `symlink_metadata`.
5. Rechaza archivos recientes (`mtime < 24h`).
6. Si cumple todas las condiciones y NO figura en la lista de Hashes Vivos, se agrega a la lista de **Candidatos**.

### Flujo SWEEP (Con Write Lock)
1. Adquiere exclusivamente `state.restore_lock.write().await`. Esto bloquea nuevos Saves o Restores.
2. Extrae *nuevamente* el diccionario absoluto de Hashes Vivos desde la base de datos (para capturar las operaciones en-vuelo que entraron mientras el Mark escaneaba).
3. Itera la lista de Candidatos calculada en Mark.
4. Vuelve a verificar que el hash NO esté vivo en el nuevo diccionario.
5. Llama a `fs::symlink_metadata` justo antes de borrar para re-confirmar que su antigüedad es `> 24h` (evita borrar un re-upload con metadata alterada).
6. Ejecuta `std::fs::remove_file` con certidumbre absoluta.
7. Libera el Lock velozmente.

## 3. Manejo de Errores y Fail-Safe
Cualquier falla en PostgreSQL (`pool.get()` o `client.query()`) detiene inmediatamente la ejecución de `run_gc` usando propagación de errores (`?`), garantizando que **no haya borrados a ciegas**. Los objetos no regulares se descartan silenciosamente y los archivos inválidos se ignoran.

## 4. Quality Gates y Tests
* `cargo check`: **PASS**. (Corregidos imports erróneos de etapas previas).
* `yarn tsc`: **PASS**. (Compila tipos 100% limpios tras corregir el body del fetch y las definiciones de jszip).
* `yarn vitest run phase11.test.ts`: **PASS** (runner local principal 1.6.0). 
* Ejecución de tests: Se cubrieron los requerimientos obligatorios (Asset Vivo intocado, Antiguo eliminado, Reciente ignorado, Symlink ignorado, Falso archivo ignorado, Idempotencia ratificada).

## 5. Invariantes Comprobadas
* `SELECT count(*) FROM public.boards`: Se mantuvo en **3**, protegiendo `public.*` intacta.
* El mecanismo de Backup Retention y `data/backups/` quedó explícitamente **FUERA DE ALCANCE** por orden arquitectónica, asegurando el acoplamiento cero entre ambos sistemas.
