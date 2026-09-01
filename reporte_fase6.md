# FASE 6 — Implementación de Assets en Filesystem (Finalizada)

Esta auditoría de cierre certifica que la extracción de assets físicos al filesystem se ha implementado con éxito, manteniendo un soporte estricto del contrato original del frontend.

## 1. Quality Gates y Resultados Reales

### ✅ `yarn tsc`
- **Comprobación:** Compilado del proyecto frontend completo.
- **Resultado:** Código `0`. No hubo ningún error de TypeScript, demostrando que no se alteró el contrato de los tipos (`BoardData`).

### ✅ Tests de Repositorio y Frontend (`vitest`)
- **Comprobación:** `yarn vitest run PostgresBoardRepository`
- **Resultado:** Los tests pasaron exitosamente. La hidratación del Base64 (`dataURL`) en el flujo inverso (GET) funcionó perfectamente, demostrando que `PostgresBoardRepository` ni siquiera se "entera" de que los assets ahora viven en el filesystem.

### ✅ Verificación Física del Filesystem (Deduplicación y Seguridad)
- **Comprobación:** Se enviaron distintos `FileId`s con la misma imagen. Además, se inyectó un `FileId` malicioso: `../../../windows/system32/cmd.exe`.
- **Resultado en disco (`data/assets`):** Solamente se generó un (1) único archivo físico.
- **Resultado de Nomenclatura (Path Traversal):** El archivo se guardó bajo su hash criptográfico SHA-256 (`4c4b6a...bin`). La inyección `../` fue ignorada sin crear vulnerabilidades, validando la arquitectura CAS.

### ✅ Integridad y Missing Assets
- **Comprobación 1 (Corrupción):** Se truncó físicamente el archivo `.bin` en disco y se intentó cargar su respectivo board.
- **Evidencia Rust:** `Integrity Error: File hash mismatch for "./data/assets\\...bin". Expected 4c4..., got df3...`
- **Comprobación 2 (Borrado):** Se eliminó físicamente el archivo y se intentó cargar.
- **Evidencia Rust:** `Missing Physical File: Asset exists in DB but file missing at...`
- **Resultado:** En ambos casos el backend arrojó un error HTTP 500 explícito en lugar de servir un archivo corrupto u ocultar el error, bloqueando el silent-failure.

### ✅ Estado de PostgreSQL (`excalidraw.assets`)
- **Comprobación:** `SELECT id, hash, relative_path FROM excalidraw.assets;`
- **Resultado:** La base de datos persistió correctamente las relaciones:
  ```text
  fileA                             | 4c4b... | 4c4b...bin 
  fileB                             | 4c4b... | 4c4b...bin 
  ../../../windows/system32/cmd.exe | 4c4b... | 4c4b...bin 
  ```

### ✅ Reinicio del Bridge
- **Comprobación:** Se reinició el proceso de Rust (`bridge.exe`).
- **Resultado:** Los assets siguieron sirviéndose sin estado residual en memoria, ya que dependen puramente del disco duro.

### ✅ Legacy Data Intacta
- **Comprobación:** `SELECT count(*) FROM public.boards;`
- **Resultado:** `3`. Se respetó de forma estricta la directiva de no tocar el SaaS original.

## 2. Detalle Arquitectónico Implementado

- **Transacción Atómica de Dos Recursos:** En `api.rs` -> `post_board`, se genera un UUID/Timestamp seguro para un archivo temporal, se escribe el binario decodificado, se hace un rename atómico, y **solo entonces** se inicia la transacción SQL para guardar tanto el metadato en `assets` como la versión del BoardData reducida (sin `dataURL`).
- **Lazy Migration:** Si un board antiguo se carga y la DB todavía retorna un JSONB con `dataURL`, el Bridge lo pasa de largo y lo sirve directamente (backward-compatible). Cuando el usuario modifique y guarde ese board, se le extraerá el asset al disco de forma definitiva.

## Próximos pasos
El sistema de persistencia ha quedado separado entre una base de datos ágil (PostgreSQL) y un almacenamiento pesado eficiente (CAS Filesystem). Me he detenido como solicitaste. Quedo a la espera de instrucciones para iniciar la **Fase 7**.
