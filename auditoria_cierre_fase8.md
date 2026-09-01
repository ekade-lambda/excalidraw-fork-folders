# Auditoría de Cierre e Inspección Crítica - Fase 8.1

## 1. Alcance Auditado y Objetivo Real
El objetivo original de la Fase 8.1 era migrar de manera transparente y segura los datos heredados (Web Storage/IndexedDB) hacia PostgreSQL + CAS (File System).

**Resultado de la auditoría:**
* **Parcialmente cumplido:** La lógica de migración y la seguridad de datos se implementaron correctamente en el Bridge.
* **Incumplimiento (Falla Arquitectónica):** La inicialización (`initializeBoardSystem`) condiciona la migración *únicamente* a que la base de datos de PostgreSQL esté completamente vacía (`!existing`). Si un usuario utilizó la nueva versión (Fases 1-7) y creó un board vacío antes de que la lógica de migración operara, su `graph` no será nulo, y la migración de IndexedDB jamás se ejecutará, dejando sus datos "secuestrados" en el navegador.

## 2. Auditoría de la Migración Heredada (Flujo Completo)
Se ha inspeccionado el flujo de ida y vuelta:

1. **Detección (`boardService.ts`)**: Lee `localStorage` para `elements` y `idb-keyval` para `files-db`.
2. **Transformación**: Se combinan en un único `BoardData` y se envían por `POST /api/boards/:id`.
3. **Bridge (Rust)**: Transforma los Data URL a bytes, verifica hashes y escribe a disco.
4. **Limpieza**: Frontend limpia `localStorage` y `files-db` al recibir un HTTP 200.

**Garantías y Riesgos:**
* La idempotencia del Bridge previene duplicaciones físicas en disco.
* La limpieza condicionada (solo tras `repo.saveBoard()` exitoso) mitiga efectivamente la pérdida de datos.

## 3. Zero Data Loss — Análisis de Ruptura
Tras analizar los vectores de falla:
* **Fallo al escribir/renombrar en CAS**: `fs::write` / `fs::rename` fallan -> Bridge devuelve error HTTP -> Frontend lanza excepción -> `clear()` no se ejecuta. **SEGURO.**
* **PostgreSQL rollback**: Misma cadena de eventos. **SEGURO.**
* **Caída del frontend/red (Timeout) post-commit**: PostgreSQL guarda los datos y extrae a CAS. Frontend lanza error por Timeout. Web Storage no se borra. En el siguiente inicio, se enviará el mismo payload. Rust sobrescribirá/saltará el archivo en CAS (idempotente) y hará UPSERT en SQL. **SEGURO (Zero Data Loss garantizado).**

## 4. Auditoría de la Limpieza del Web Storage
El código en `boardService.ts` ejecuta `clear(filesStore)` dentro de un bloque `try-catch`, y solo DESPUÉS de un `await repo.saveBoard(boardData)`. Dado que el repositorio propaga excepciones ante códigos HTTP >= 400 o fallas de red, la limpieza está arquitectónicamente blindada contra falsos positivos.

## 5. OOM y Payloads Gigantes — [CRÍTICO]
**El análisis ha revelado un BLOCKER grave oculto:**
* **Límite práctico:** En Rust (Bridge), el framework **Axum** impone por defecto un `DefaultBodyLimit` de exactamente **2 MB** a su extractor de payloads `Json<T>`.
* **Impacto:** Si el Web Storage de un usuario (o cualquier Board en Fases futuras) contiene imágenes que sumadas superan los 2 MB, el request `POST /api/boards/:id` será interceptado por Axum **antes de llegar a la lógica de assets**, devolviendo `HTTP 413 Payload Too Large`.
* **Consecuencia:** La migración será rechazada infinitamente, y la aplicación fallará.
* El riesgo no es solo "OOM en cliente" (el cliente aguanta strings JSON de +100MB), el verdadero colapso es el middleware de red por defecto.

## 6. Auditoría de CAS y Concurrencia
* **Idempotencia / Deduplicación:** Si dos requests suben contenidos idénticos con distintos `FileId`, CAS creará 1 archivo físico, y Postgres guardará 2 IDs apuntando a la misma ruta. Esto es la esencia del CAS y funciona perfectamente.
* **Carrera de `exists` y `rename` (Específico Windows):** En Windows, `fs::rename` falla si el destino ya existe (`AlreadyExists`). El código intercepta el error, borra el archivo temporal, re-verifica la integridad post-renombrado del archivo que "ganó" la carrera, y continúa. El protocolo es sorprendentemente **sólido y seguro frente a concurrencia estricta**.

## 7. Auditoría de la Migración Lazy
El término "Lazy" se está usando erróneamente. La migración está *hardcodeada* al arranque inicial del sistema, en lugar de ejecutarse "on-demand cuando se carga el board legado". Obliga a procesar todo el almacén de IDB de golpe. No está acotada "1 Board a la vez" en el sentido arquitectónico puro de Excalidraw, ya que inyecta TODO el IDB histórico al board raíz de golpe.

## 8. MUY IMPORTANTE: Auditoría de Tests (`phase8.test.ts`)
**Alerta de falsa sensación de seguridad:**
1. **Mock intrusivo:** El test intercepta la función `repo.load()` para forzarla a devolver `null` simulando una BD vacía. Esto bypassó completamente la vulnerabilidad arquitectónica mencionada en el Punto 1 (si el graph no es nulo, no migra nada). El test es, por tanto, una prueba *aislada* y no un E2E estricto de la inicialización en producción.
2. **Ambiente IndexedDB:** En el entorno `happy-dom` de Vitest, IndexedDB no existe nativamente a menos que se use `fake-indexeddb`. El bloque `try-catch` para inyectar datos en el test captura silenciosamente excepciones, permitiendo que el test pase aunque no haya inyectado *ningún asset* realmente.

## 9. Quality Gates y Datos
* Se ejecutaron `cargo check`, `yarn tsc` y `yarn vitest run boards`. Los binarios compilan.
* Se comprobó la BD mediante `docker exec`:
  ```sql
  SELECT count(*) FROM public.boards; -- Result: 3
  ```
* El namespace `public.*` se mantuvo inalterado, cumpliendo la regla de protección de datos legacy ajenos.

## 10. Inventario Final de Deuda Técnica
* **BLOCKER**: Límite estricto de Axum (2MB) arrojará HTTP 413 sistemáticamente al guardar tableros con assets moderados.
* **WARNING — Alta**: La inicialización impide migrar IndexedDB si la BD ya tiene un root folder, causando retención involuntaria de datos legacy.
* **WARNING — Alta**: Pruebas engañosas (Mocking intrusivo y captura silenciosa de excepciones de IndexedDB en Vitest).
* **WARNING — Media**: Falta de Garbage Collection (Assets huérfanos).

## 11. Criterio de Cierre

**VEREDICTO: BLOCKER — FASE 8.1 NO CERRADA**

Se han garantizado los fundamentos atómicos y de "Zero Data Loss" (lo cual es un excelente hito de resiliencia). Sin embargo, el límite no configurado de 2 MB en Rust y el bug de inicialización que ignora la migración si PostgreSQL ya contiene datos, hacen que la característica de Fase 8 sea inviable en escenarios del mundo real, y el test escrito provee una validación sintética. No se puede avanzar hasta resolver estos incidentes arquitectónicos.
