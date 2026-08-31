import os

path = "auditoria_pre_fase_11.md"
content = """# AUDITORÍA PRE-IMPLEMENTACIÓN — HACIA LA FASE 11

## 1. Estado actual
El Board System cuenta con una base sólida de concurrencia y persistencia (10A-10C). Los tests y lints de este alcance pasan al 100%. Las carpetas pueden crearse, navegarse y renombrarse, persistiendo datos pesados en IndexedDB cuando el LocalStorage se satura. Eventos como la creación o renombrado en otras pestañas se reflejan sin destruir los trazos LWW locales del usuario.

## 2. Arquitectura actual
- **BoardsGraph:** Índice global y fuente de verdad estructural (memoria + LocalStorage).
- **BoardData:** Payload con trazos y configuración, gestionado bajo semántica Last Write Wins.
- **Repository / Persistencia:** Sistema asíncrono con punteros (LS) y datos pesados (IDB), blindado por Write-Ahead Register (WAR).
- **Multi-tab:** Eventos `storage` de solo estructura. Cola asíncrona de reconciliación visual que inyecta/orquesta elementos sin alterar trazos.
- **GC:** Motor de recolección de basura construido pero actualmente inactivo.
- **UI:** Menú contextual inyectado sobre canvas para "Rename" y navegación por doble clic (`hitTest`).

## 3. Funcionalidades completadas
- Creación de jerarquías infinitas.
- Navegación bidireccional (doble click in, breadcrumbs out).
- Renombrado de carpetas (UI inyectada).
- Transacciones protegidas y fallbacks transparentes de almacenamiento.
- Sincronización multi-ventana sin colisiones destructivas.

## 4. Funcionalidades pendientes (Gaps identificados)
1. **Eliminación estructural de carpetas (Delete Folder):** No existe UI ni mecanismos en la capa de aplicación para invocar `prepareDeleteFolderPatch` y borrar permanentemente una jerarquía de carpetas.
2. **Ciclo del Garbage Collector (GC):** El motor existe, pero no hay un cron o trigger de arranque.
3. **Clonación / Copiar y Pegar Asíncrono para IDB:** Duplicar carpetas muy pesadas que cayeron en IDB falla porque Excalidraw exige retornos síncronos.

## 5. Invariantes
- BoardsGraph es inmutable como fuente de verdad.
- BoardData jamás dicta estructura jerárquica.
- Ninguna operación estructural destruye silenciosamente los trazos LWW no guardados de una pestaña.

## 6. Fronteras protegidas
Queda fuera de nuestro alcance modificar sin permiso explícito:
- `packages/excalidraw/**`
- `duplicate.ts` y `paste.ts` (salvo que rediseñemos a un modelo Deferred).
- `BoardRepository.ts`
- Deuda técnica global heredada (tests fallidos, formateo).

## 7. Riesgos actuales
- **Acumulación Zombie (Leak de Storage):** Como el usuario no puede borrar carpetas del Graph, y si borra el *elemento visual* de la pantalla con la tecla "Supr" este queda "isDeleted: true" pero el Graph lo retiene, se acumulará basura irrecuperable eternamente, ya que el GC jamás borrará algo que esté en el Graph.
- **Invisibilidad de Datos:** Si un usuario aprieta "Supr", la carpeta desaparece de su vista. Como no hay un panel de "Papelera", ya no podrá interactuar con ella ni hacerle click derecho para eliminarla de verdad.

## 8. Deuda técnica propia
- Funciones de `domain/delete.ts` huérfanas de uso real en `folderService.ts`.
- Motor de GC en el repositorio sin llamadas desde `App.tsx` o `boardService.ts`.

## 9. Deuda técnica externa descartada
- Los 51 tests fallidos heredados de Excalidraw, `vite-app.js`, y el CRLF styling permanecerán ignorados por no pertenecer causalmente a esta capa.

## 10. Matriz de prioridades

| Candidato | Impacto Funcional | Integridad | Riesgo | Complejidad | Clasificación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **A. Ciclo de Vida: Delete Folder + Trigger GC** | Crítico (Cierra el ciclo de datos) | Muy Alto (Previene Leaks) | Moderado | Moderado | **A. Imprescindible** |
| **B. Duplicación Asíncrona (IDB Copy/Paste)** | Alto (Usabilidad pesada) | Medio | Alto | Muy Alta | B. Importante |
| **C. Sincronización Remota (Nube)** | Masivo (Colaboración real) | Bajo | Máximo | Extrema | E. Fuera de Alcance |

## 11. Candidatos a próximas fases
1. **Fase 11A: Completitud del Ciclo de Vida (Delete & GC).**
   - Habilita que el usuario borre estructural y visualmente las carpetas de manera explícita (Context Menu -> Delete).
   - Engancha el Garbage Collector al inicio de la aplicación o periódicamente.
2. **Fase 11B: Refactorización Asíncrona de Portapapeles (Deferred Cloning).**
   - Rompe el bloqueo de Copy/Paste para IDB, implementando "Ghost Cloning" donde se inserta el elemento pero se rellena el IDB en background.

## 12. Dependencias entre fases
- La activación del GC (11A) tiene mayor valor si previamente existen mecanismos que generen verdaderos huérfanos en el Graph (eliminación de carpetas). Por tanto, la eliminación estructural es pre-requisito funcional lógico.

## 13. Análisis de consecuencias de 2do y 3er orden (Si implementamos Delete)
- **El problema del Undo Canvas:** Si la eliminación estructural se vuelve explícita, presionar `Ctrl+Z` (Undo) en Excalidraw hará que el elemento visual reaparezca (ya que el Canvas viaja en el tiempo). Pero estructuralmente, el `BoardsGraph` no es versionable con Undo. Si el usuario hace doble click en la carpeta "revivida por Undo", `hitTest` intentará abrir una carpeta que ya no existe en el Graph. Se requiere una política para detectar este "Zombie Rendering".

## 14. Recomendación de la siguiente fase
Recomiendo declarar como **Fase 11** a la **"Completitud del Ciclo de Vida: Delete Explícito y Activación del GC"**. 
Es la única fase que garantiza la integridad térmica de la memoria (evita leaks) y sella los casos de uso básicos (CRUD) del Board System, maximizando el valor de las Fases 10A-10C previas con un riesgo técnico y esfuerzo controlables.

## 15. Alcance propuesto para la Fase 11
- Añadir botón `Delete` en la interfaz de Context Menu inyectada en `App.tsx` (junto al actual `Rename`).
- Orquestar `folderService.deleteFolder` (llamando a `prepareDeleteFolderPatch` y `repo.save`).
- Inyectar el trigger del Garbage Collector (ej. un `setTimeout` o `setInterval` en el mounting de `App.tsx`).
- Sincronizar el borrado a otras pestañas (cubierto parcialmente por 10C, pero sujeto a revisión de orfandad visual).

## 16. Fuera de alcance
- Refactor asíncrono de Copy/Paste para IDB.
- Sincronización a Firebase/Nube.

## 17. Quality Gates
- `yarn tsc`
- `yarn vitest run excalidraw-app/tests/boards` (con nuevos tests unitarios para `folderService.deleteFolder`).

## 18. Riesgos a auditar tras implementar
- Desalineación visual post-Undo (Zombie Rendering).
- Comportamiento de pestañas secundarias si se les borra la carpeta donde están paradas (el Zombie Navigation de 10C ya debería mitigarlo, pero debe probarse empíricamente).

## 19. Preguntas o decisiones arquitectónicas que requieren tu autorización
1. **Política de "Supr" (Tecla Delete):** Si el usuario borra la carpeta con la tecla Supr, desaparece del canvas pero queda viva en el Graph. ¿Aceptamos este comportamiento (exigiendo usar click derecho para borrado real), o interceptamos la eliminación de elementos en `saveCurrentBoard` para disparar el borrado del Graph automáticamente?
2. **Política de Undo:** ¿Aceptamos que si se deshace un borrado con Ctrl+Z, el elemento revivido actúe como un "Fantasma" que arrojará error si se le da doble click?
"""
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Generado")
