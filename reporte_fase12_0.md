# Reporte de Diseño y Planificación Estratégica (Fase 12.0)

## 1. Estado Actual (Quality Gates)
* **Código Base:** Cero intervenciones en esta fase. Aislamiento estricto de las Fases 11.2 y 11.3 mantenido.
* **`cargo check`:** PASS (Persisten 7 warnings menores documentados como deuda).
* **`yarn tsc`:** PASS (10.15s).
* **Aislamiento DB:** La tabla `public.boards` del sistema host (Infinite Notes) retiene 3 filas invariables. Las tablas exclusivas de Excalidraw (`excalidraw.*`) manejan dinámicamente todo el estado operativo, garantizando una encapsulación perfecta del workspace.

## 2. Hoja de Ruta Propuesta (Roadmap Post-11)
La auditoría (ver `auditoria_fase12_0.md`) revela que el motor de persistencia es seguro y robusto en cuanto a integridad relacional. Sin embargo, carece de autonomía y contiene una vulnerabilidad técnica aislada de alta severidad. El foco debe pivotar del "Manejo de Disco" a la "Autonomía y Concurrencia".

Se propone la siguiente secuenciación estricta para la evolución del sistema:

### Fase 12.1 — Reforzamiento y Autonomía (Inmediato)
* **Objetivo:** Convertir el backend en un demonio verdaderamente autónomo (self-healing) y corregir la pérdida de backups colindantes.
* **Problema que resuelve:** Subsanar el *overwrite* de Windows en `/api/backup`, automatizar limpiezas, eliminar ruido CI/CD.
* **Componentes Afectados:** `backup.rs`, `backup_retention.rs`, `main.rs`, `phase11_3.test.ts`.
* **Criterios de Entrada:** Ninguno.
* **Criterios de Salida:**
  * Nuevo algoritmo de Naming con UUID/Milisegundos.
  * Parser retrocompatible en Retention.
  * Thread asíncrono (`tokio::spawn`) ejecutando GC y Retention c/hora de forma transparente y sin bloqueos HTTP.
  * Resolución de la aserción rota en los tests v3.0.6.
  * Limpieza final de Warnings de Rust.
* **Fuera de Alcance:** Optimizaciones de compresión, edición del frontend, cambios en Restore.

### Fase 12.2 — Cimientos de Sincronización Multi-Usuario (Intermedio)
* **Objetivo:** Resolver el problema crítico de negocio: la falta de sincronización real-time que expone a los usuarios a aplastar su trabajo (Last-Write-Wins en `/api/transaction/apply`).
* **Problema que resuelve:** Dos pestañas editando el mismo board simultáneamente destruyen la información de la contraria.
* **Componentes Afectados:** `/api/transaction/apply`, Redux/Frontend, `api.rs`.
* **Enfoque Sugerido:** Implementación de revisiones optimistas (Version Vectors o ETags simples) para rechazar transacciones desfasadas con un HTTP 409 Conflict.
* **Fuera de Alcance:** CRDT completos o WebSockets (se busca bloqueo preventivo, no convergencia).

### Fase 12.3 — Sincronización Real-Time (Avanzado)
* **Objetivo:** Habilitar co-edición en tiempo real.
* **Componentes Afectados:** Integración de Yjs o capa de WebSockets en el bridge.
* **Dependencias:** Finalizar Fase 12.2.

## 3. Conclusión Estratégica
La prioridad máxima es la **Fase 12.1 (Reforzamiento y Autonomía)**. Costará extremadamente poco esfuerzo (modificar la convención de strings, ajustar regex, añadir un bucle `tokio`) pero sellará un vector de Data Loss y cerrará la deuda técnica remanente de todas las fases anteriores de retención (Fase 11.*).

Acometer mejoras de interfaz, frontend o sincronización multiusuario (Fase 12.2) sin automatizar el mantenimiento local degradaría la escalabilidad operativa a largo plazo. 

**Recomendación:** Esperar autorización explícita para iniciar la codificación e implementación exclusiva de la **Fase 12.1**.
