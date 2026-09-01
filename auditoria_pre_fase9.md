# Auditoría de Estado, Recuperación de Alcance y Diseño Previo - Fase 9.0

## 1. Alcance Original Recuperado
Se inspeccionó toda la documentación original. Se detectó una divergencia nominal:
* En `docs/boards-implementation-spec.md` (roadmap desactualizado local), la Fase 9 figuraba como "Edición visual (rename, icon, coherencia)". Sin embargo, la función de **Rename** ya fue implementada integralmente durante nuestra Fase 7 (Sincronización Board ↔ Folder).
* En la documentación arquitectónica base aprobada en este proyecto (`arquitectura_persistencia_fase1.md`), la **Fase 9** está definida como: **"Export / Backup: Script para comprimir `.sql` y `assets/`. Criterios de Aceptación: El comando genera exitosamente un `.zip` integral en segundos."**

**Conclusión del alcance:** El objetivo estructural real y correspondiente para la Fase 9 es la creación de un mecanismo de **Export / Backup (Copia de Seguridad)**. Funcionalidades como Iconos customizados ("icon") ya no encajan en la secuencia crítica de persistencia y se catalogan como Fase UI futura.

## 2. Auditoría Completa del Estado Post-Fase 8.1
El ecosistema actual opera bajo un marco estable de persistencia híbrida (Relacional + CAS):
* **Frontend**: Utiliza `boardService.ts` y `PostgresBoardRepository`. Está completamente desacoplado del LocalStorage, usándolo exclusivamente para recuperar herencias (Legacy Migration).
* **Bridge Rust**: Maneja ruteo con Axum, aplicando `DefaultBodyLimit` de 100 MB. 
* **CAS**: Escribe en `assets/` asegurando idempotencia vía hash SHA-256 y atomicidad temporal en Windows (`rename` mitigado).
* **PostgreSQL**: `excalidraw.graph` mantiene el índice de carpetas/tableros. `excalidraw.boards` y `excalidraw.assets` mantienen los datos crudos deduplicados.
* **Invariante `public.boards`**: Aislado intacto (Exactamente 3 registros intocables).
* **Secuestro Legacy Extirpado**: Los datos legacy ahora se inyectan en el entorno aunque la BD Postgres ya contenga otros tableros.
* **Resiliencia Activa**: Timeout, error 500 o fallos físicos no purgan Web Storage. Solo un código HTTP 200 elimina el almacenamiento legado.

## 3. Auditoría Crítica de la Corrección 8.1
### A. Límite de Payload (100 MB)
Se evaluó el comportamiento de Tokio/Axum bajo un payload máximo de 100 MB:
* **Overhead en memoria:** Un payload JSON de 100 MB (mayoritariamente ocupado por `dataURL` Base64) requiere: 100 MB del Buffer de lectura Axum + ~150-250 MB al ser parseado en memoria por `serde_json` + buffer de decodificación Base64 en `spawn_blocking`. Un solo Request puede requerir ~300 MB de RAM picos.
* **Seguridad:** En un entorno local/Desktop (Single-Tenant), 100 MB previene de manera efectiva DoS por agotamiento de Swap o fallos OOM inducidos por payloads corruptos masivos, pero permitiendo tableros extremadamente pesados. Es **técnicamente razonable**.
* **Evolución:** La solución actual de incluir imágenes en Base64 embebidas en el JSON topa aquí su límite de diseño. Si en el futuro se planean tableros colaborativos > 200 MB, el diseño exigirá *Streaming y Multipart Uploads* por asset en vez de una gran transacción POST monolítica.

### B. Migración Legacy (Escenarios validados)
* **Caso 1 (BD vacía + Legacy):** Funciona atómicamente creando el root y aplicando los assets.
* **Caso 2 (BD poblada + Legacy):** Funciona creando un nuevo Folder y Tablero (`Importación Legacy`) sin interrumpir la BD.
* **Caso 3 (Error 500/Red/Rollback):** El Frontend detiene la rutina y el IndexedDB sigue existiendo. Resiliencia demostrada.
* **Concurrencia extrema (Múltiples tabs en primer arranque con BD vacía):** Existe una **condición de carrera (race condition)**. Si Tab A y Tab B inicializan la base vacía, ambas generarán IDs aleatorios para root, y ambas harán UPSERT al registro único `graph_config`. El último en grabar sobreescribirá el índice. **Consecuencia:** Un board quedará huérfano en `excalidraw.boards`. No hay pérdida de datos visual (ambos guardan lo mismo), pero ensucia la DB. *(Documentado como Warning Alta)*.

### C. Tests
El uso de `fake-indexeddb` garantizó la validez de `phase8.test.ts`. El test ahora prueba el flujo simulando RAM/IDB real y validando el descarte tras el retorno del backend. Ya no existen mocks ocultando lógica E2E vital.

## 4. Inventario de Deuda Técnica
1. **[WARNING - Alta] Condición de carrera en inicialización concurrente.** (Descrita arriba). *Causa:* UPSERT de `graph_config` reemplaza el índice completo. *Impacto:* Tableros huérfanos. *Acción:* Aplazable, el usuario rara vez abre dos pestañas vacías simultáneamente en primer arranque local.
2. **[WARNING - Media] Ausencia de Garbage Collection (GC).** Los tableros o elementos borrados no eliminan archivos físicos en `assets/` ni filas en `excalidraw.assets`. *Impacto:* Aumento progresivo de espacio en disco. *Acción:* Se resolverá previsiblemente con un comando de limpieza asíncrono o script de mantenimiento en el futuro.
3. **[INFO] Arquitectura Base64 sobre JSON.** Limitación arquitectónica del payload monolítico. No requiere corrección hasta que se habilite colaboración en red pesada.

## 5. Verificación de Límites de Responsabilidad
* **Adecuado:** Frontend (UI y manipulación del DOM), Repository (Serialización), Bridge (Extracción binaria a disco y conexión SQL), PostgreSQL (Árboles lógicos).
* **Duplicación/Riesgo:** El Frontend (`boardService.ts`) actualmente genera el ID de la raíz y hace commits enteros del Graph. En un escenario Multi-Workspace, el control del Graph deberá desplazarse al Backend (Bridge) para proveer validaciones de concurrencia y merge de AST, o implementar Locks.

## 6. Compatibilidad Futura (Riesgos)
* **Backups / Export:** El uso de CAS físico + Postgres lo hace 100% amigable a Backups, puesto que solo basta dumpear la DB y empaquetar la carpeta de binarios. (Se alinea perfecto con la Fase 9 planificada).
* **Multi-usuario:** Imposible actualmente. `system_config` tiene la clave `graph_config` quemada en código.
* **Cambio OS / Rutas Absolutas:** El sistema de CAS en Fase 6 usó rutas relativas (`relative_path`) en la BD, blindando el proyecto para exportar a otros dispositivos sin romper links.

## 7. Quality Gates (Validaciones No Destructivas)
* `yarn tsc` — **PASS**
* `cargo check` — **PASS**
* `yarn vitest run boards -t "Fase 8"` — **PASS**
* Integridad de `public.boards` — **PASS** (Count: 3).

## 8. Diseño Propuesto y Planificación (Fase 9 - Export/Backup)

**Objetivo (Aprobación Pendiente):** Implementar un mecanismo/herramienta para generar un archivo comprimido (`.zip`) o paquete portable que contenga el volcado SQL del workspace actual y la totalidad del directorio de `assets/` (CAS) sin interrumpir la operación.

**Subfases sugeridas:**
* **Fase 9.1:** Endpoints o scripts de volcado de la BD PostgreSQL (`pg_dump` o extracción JSON programática del `excalidraw.graph` y `excalidraw.boards`).
* **Fase 9.2:** Empaquetamiento del directorio `/assets` físico.
* **Fase 9.3:** Consolidación de Export (Zip) en Rust Bridge. (Retorno de `application/zip` o escritura a disco local).

**Qué NO pertenece a Fase 9:**
* Mecanismo inverso de importación (Fase 10).
* Refactors de Garbage Collection (Fase 11 o aplazable).
* Iconos de Folder UI.

---
**ESTADO:** DETENIDO COMPLETAMENTE. A la espera de autorización para iniciar la Fase 9 o instrucciones al respecto.
