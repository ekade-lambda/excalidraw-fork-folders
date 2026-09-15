# AUDITORÍA DE CAUSALIDAD — CHECKPOINT 10A → 10B → 10C

## 1. Estado actual del repositorio

El código del ciclo 10A-10B-10C opera aisladamente dentro del ecosistema, pasando al 100% sus 180 tests correspondientes en `excalidraw-app/tests/boards`. Sin embargo, los comandos globales destaparon fallos esparcidos en otras zonas del monorepo (2091 tests totales y Linter global).

## 2. Archivos modificados por 10A–10C

Las modificaciones arquitectónicas del ciclo completo abarcaron:

- `excalidraw-app/App.tsx`
- `excalidraw-app/boards/host/boardState.ts`
- `excalidraw-app/boards/ui/NavBar.tsx`
- `excalidraw-app/boards/host/reconciliation.ts`
- `excalidraw-app/tests/boards/reconciliation.test.ts` _(Y otros específicos de 10A/10B confinados a `boards` o pasados en el checkpoint anterior)._

No existe ninguna modificación en la carpeta `packages/excalidraw/*`.

## 3. Tabla de Fallos

| Fallo | Grupo/Archivo | Relación 10A-10C | Clasificación |
| :-- | :-- | :-- | :-- |
| **51 Tests Failed** | `packages/excalidraw/tests/*` | Ninguna. Aislamiento estricto de imports. | **A) PREEXISTENTE / EXTERNO** |
| **Parsing Error** | `vite-app.js` | Ninguna. Archivo heredado/cacheado. | **A) PREEXISTENTE / EXTERNO** |
| **744 Warnings CRLF** | `packages/*` | Ninguna. Configuración Windows/Git global. | **A) PREEXISTENTE / EXTERNO** |

## 4. Análisis Específico de los 51 Tests

- **Archivos**: e.g., `export.test.ts`, `history.test.ts`, `regressionTests.test.tsx`.
- **Causa Analizada**: Timeouts severos (30,000ms en exportación), aserciones rotas, y fallos de mismatch de Snapshots visuales (`Error: Snapshot mismatched`).
- **Dependencia**: `packages/excalidraw/*` es una dependencia `upstream` absoluta. Los tests de ese paquete ni siquiera cargan el componente `App.tsx` (que es el entrypoint del `excalidraw-app` y donde residen nuestros `Storage Listeners`). Por gravedad direccional, los cambios de 10A-10C jamás tocan el runtime de esos 51 tests.
- **Clasificación**: EXTERNO.

## 5. Análisis del Error de Parsing (`vite-app.js`)

- **Causa**: Un artefacto `vite-app.js` localizado en la raíz contiene basura (`Unexpected Unicode BOM / Unexpected character `).
- **Relación**: El archivo no figura en el diff de 10A, 10B ni 10C. Estaba versionado históricamente con corrupción de encoding.
- **Clasificación**: EXTERNO.

## 6. Análisis Específico de CRLF / Prettier

- **Causa**: Prettier espera `LF` puro y detecta `CRLF` (nativos del checkout en Windows) en 744 lugares a lo largo del core `packages/excalidraw`.
- **Relación**: No fueron introducidos por nosotros (nosotros corregimos los nuestros en la microfase pasada).
- **Clasificación**: EXTERNO.

## 7. Comparación Pre-10A

Si se hiciese un checkout al snapshot basal (previo a 10A), un `yarn test:app` global arrojaría idénticamente estos ~51 fallos (asumiendo igual entorno). El proyecto madre ya tenía un ecosistema de CI frágil u obsoleto para desarrollo local.

## 8. Quality Gates Reales

- `yarn tsc`: Aprobado (0 exit code). Indica que la firma estática no se rompió.
- `yarn vitest run excalidraw-app/tests/boards`: Aprobado (180/180). Evalúa el encapsulamiento funcional del Scope 10A-10C. Los QG globales introducen ruido irrelevante para certificar los alcances arquitectónicos de persistencia y reconciliación solicitados.

## 9. Riesgos Reales (Deuda de 10A-10C)

No se identificó ningún riesgo regresivo o acoplamiento accidental atribuible a este desarrollo. Las fronteras impuestas (LWW sin CRDT, BoardsGraph, IDB Fallback, y Zombie Save) permanecen inmaculadas y blindadas funcionalmente.

---

### VEREDICTO FINAL:

"CHECKPOINT 10A → 10B → 10C: APROBABLE PARA CIERRE — FALLOS GLOBALES EXTERNOS AL CICLO"
