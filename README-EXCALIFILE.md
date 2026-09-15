# Excalifile

## 1. ¿Qué es Excalifile?

**Excalifile** es una modificación de Excalidraw orientada a convertir el lienzo tradicional en un sistema personal de organización espacial de información.

La idea principal es conservar la experiencia de dibujo y edición de Excalidraw, pero añadir encima un **Board System** que permita organizar múltiples espacios de trabajo mediante:

* Boards.
* Carpetas.
* Subcarpetas.
* Punteros entre carpetas.
* Navegación entre Boards.
* Breadcrumbs.
* Historial de navegación.
* Persistencia local.
* Imágenes almacenadas junto con los datos del Board.
* Exportación e importación completa del proyecto.

No debe confundirse con una implementación de Excalidraw completamente nueva. El proyecto sigue utilizando el núcleo de Excalidraw y añade una capa propia de organización y persistencia alrededor de él.

La intención de Excalifile es funcionar como una especie de **espacio de conocimiento visual y espacial**, donde un usuario pueda distribuir información en diferentes Boards y carpetas en lugar de mantener todo dentro de un único lienzo.

---

# 2. Relación con Excalidraw original

Excalifile parte de un fork de Excalidraw.

El proyecto conserva gran parte de la infraestructura original de Excalidraw y añade funcionalidades propias. Por esta razón:

* El código original de Excalidraw sigue siendo una dependencia arquitectónica importante.
* No se debe asumir que todos los archivos pertenecen al sistema Excalifile.
* Los cambios del Board System deben mantenerse lo más desacoplados posible del núcleo de Excalidraw.
* No se debe modificar innecesariamente el funcionamiento interno de Excalidraw para resolver problemas que puedan solucionarse desde la capa Board System.

La arquitectura debe tratar de mantener una separación clara entre:

**Excalidraw Core / Editor**

y

**Excalifile Board System / Host Layer**

---

# 3. ¿Qué se ha añadido funcionalmente?

Las siguientes son las principales aportaciones realizadas sobre la versión original.

## 3.1. Sistema de Boards

Excalifile introduce un sistema de múltiples Boards.

Cada Board representa un espacio independiente donde pueden existir elementos de Excalidraw.

Los Boards tienen identidad propia mediante `BoardId`.

El sistema permite:

* Crear Boards.
* Abrir Boards.
* Cambiar entre Boards.
* Persistir su información.
* Recuperar el Board correspondiente al iniciar la aplicación.
* Mantener una relación entre Boards y carpetas.
* Guardar el contenido de cada Board de forma independiente.

---

# 4. Sistema de carpetas

Se añadió una estructura jerárquica de carpetas.

Las carpetas permiten organizar los Boards espacialmente.

El modelo permite representar relaciones como:

```text
Root
├── Investigación
│   ├── Matemáticas
│   ├── Programación
│   └── IA
├── Proyectos
│   ├── Excalifile
│   └── Otros
└── Personal
```

Las carpetas pueden contener Boards y otras carpetas.

Existe una carpeta raíz que representa el punto inicial del sistema.

La carpeta raíz tiene un tratamiento especial y no debe ser eliminada ni manipulada como una carpeta normal.

---

# 5. Navegación

El Board System incluye navegación entre espacios.

Entre las funcionalidades desarrolladas están:

* Apertura de carpetas.
* Apertura de Boards.
* Breadcrumbs.
* Navegación hacia atrás.
* Navegación hacia adelante.
* Historial de navegación.
* Seguimiento del último Board abierto.

El sistema mantiene información como:

```text
currentBoardId
currentFolderId
lastOpenBoardId
```

Estos valores forman parte de la lógica de navegación y persistencia.

No deben modificarse arbitrariamente sin comprender primero sus relaciones.

---

# 6. BoardsGraph

El sistema utiliza un `BoardsGraph` como índice central de la estructura.

Conceptualmente:

```text
BoardsGraph
│
├── rootBoardId
├── lastOpenBoardId
├── boards
├── folders
└── pointers
```

El Graph representa la estructura lógica del proyecto.

Los datos completos de cada Board se mantienen aparte en `BoardData`.

Por lo tanto:

```text
BoardsGraph
    ↓
estructura / relaciones / navegación

BoardData
    ↓
contenido de cada Board
```

No debe confundirse el Graph con el contenido visual completo de un Board.

---

# 7. BoardData

Cada Board posee su propio `BoardData`.

Conceptualmente contiene información como:

```text
BoardData
├── boardId
├── elements
├── files
└── demás datos asociados al Board
```

Los elementos de Excalidraw pertenecientes al Board se almacenan dentro de su `BoardData`.

Las imágenes utilizadas por el Board también forman parte de sus datos.

Esto es especialmente importante para el sistema de exportación.

---

# 8. Imágenes y archivos

Las imágenes utilizadas por los Boards pueden conservarse dentro de `BoardData.files`.

En particular, las imágenes pueden encontrarse almacenadas como información `dataURL`/Base64.

Esto permite que una exportación del proyecto pueda transportar también las imágenes asociadas al Board.

Por este motivo, una exportación de Excalifile no consiste únicamente en guardar las posiciones de los elementos.

Debe preservar también los archivos necesarios para reconstruir visualmente el proyecto.

---

# 9. Punteros entre carpetas

Excalifile incorpora un sistema de **Folder Pointers**.

Un puntero permite representar visualmente una referencia hacia otra carpeta.

El puntero mantiene una relación lógica mediante identificadores, por ejemplo:

```text
FolderPointerId
targetFolderId
```

Los punteros están separados conceptualmente de las carpetas.

Esto permite, entre otras cosas:

* Tener múltiples punteros hacia una misma carpeta.
* Crear referencias entre diferentes Boards.
* Mantener los punteros separados de la identidad física de las carpetas.
* Eliminar correctamente referencias cuando desaparece su destino.

Un puntero no debe tratarse como si fuera simplemente una carpeta duplicada.

---

# 10. Eliminación y consistencia

El sistema de eliminación fue diseñado alrededor de invariantes de consistencia.

Cuando se elimina una carpeta, no solamente debe desaparecer la representación visual.

También deben mantenerse coherentes:

* `BoardsGraph`.
* Boards afectados.
* Carpetas descendientes.
* Punteros.
* Persistencia.
* Navegación.
* Referencias internas.

La regla conceptual es:

> Después de una operación de eliminación, el estado lógico, persistido y visual deben representar la misma realidad.

Por ejemplo, no debería existir:

```text
puntero → carpeta inexistente
```

ni:

```text
carpeta inexistente
pero Board persistido todavía asociado
```

ni:

```text
Board visualmente abierto
pero inexistente en la estructura lógica
```

Estas invariantes son importantes para cualquier futura modificación del sistema.

---

# 11. Persistencia actual

**Excalifile actualmente NO utiliza una base de datos.**

No existe actualmente:

* PostgreSQL como almacenamiento principal.
* MySQL.
* SQL Server.
* API REST.
* Backend remoto.
* Sistema de usuarios.
* Cloud synchronization.
* Microservicios.
* Servidor de persistencia del proyecto.

La persistencia actual es **local**.

El sistema utiliza la infraestructura de almacenamiento del navegador mediante el `BoardRepository` y mecanismos locales asociados.

Dependiendo del tamaño de los datos, existen rutas de almacenamiento que pueden involucrar:

* LocalStorage.
* IndexedDB como mecanismo de respaldo para payloads grandes.

La arquitectura del Board System intenta mantener esta capa detrás de un repositorio para que una futura implementación pueda sustituir el almacenamiento sin tener que rediseñar todo el sistema.

---

# 12. No existe sincronización entre computadoras

Excalifile actualmente funciona como una aplicación local.

Si el usuario tiene:

```text
PC A
```

y:

```text
PC B
```

los datos de una computadora no aparecen automáticamente en la otra.

No existe actualmente sincronización remota.

Para trasladar un proyecto entre computadoras se utiliza el sistema de:

```text
Export → archivo JSON → Import
```

---

# 13. Exportación de proyectos

Excalifile tiene un sistema de exportación de proyectos.

El formato actual es:

```json
{
  "format": "ekade-project",
  "version": 1,
  "graph": {},
  "boardsData": {}
}
```

La exportación incluye:

* Graph.
* Boards.
* Datos de los Boards.
* Elementos.
* Archivos/imágenes almacenados dentro de los Boards.

El objetivo es que el proyecto pueda transportarse como una unidad.

---

# 14. Importación de proyectos

La importación permite restaurar un proyecto a partir de un archivo JSON previamente exportado.

El proceso conceptual es:

```text
JSON
 ↓
validación
 ↓
lectura del proyecto
 ↓
persistencia de Boards
 ↓
persistencia del Graph
 ↓
limpieza de Boards que ya no pertenecen al proyecto
 ↓
recarga de la aplicación
 ↓
Board System restaurado
```

## Importación = reemplazo completo

La importación **NO es un merge**.

La semántica actual es:

> El proyecto importado reemplaza el proyecto actual.

Por lo tanto, si el usuario importa un proyecto que utiliza los mismos `BoardId` que el proyecto actual, esto es válido.

Los IDs se conservan.

No se realiza remapeo automático de BoardIds.

Esto es intencional porque el sistema representa una operación de:

```text
backup / restore
```

y no:

```text
merge de dos proyectos
```

---

# 15. Exportación e importación manuales

Actualmente el usuario debe realizar manualmente el proceso.

Ejemplo:

```text
PC A

Export
 ↓
ekade-project.json
 ↓
copiar archivo
 ↓
PC B
 ↓
Import
```

No existe todavía:

* sincronización automática;
* backups automáticos;
* historial de versiones;
* almacenamiento cloud;
* recuperación remota;
* colaboración multiusuario.

---

# 16. Una consideración importante sobre la exportación

La persistencia del Board System puede ser más tardía que el estado que el usuario ve en pantalla.

Por ello, antes de exportar el proyecto, Excalifile sincroniza el Board actualmente abierto mediante:

```text
saveCurrentBoard(...)
```

y posteriormente construye la exportación desde el repositorio.

Esto es importante.

No debe modificarse la exportación para leer únicamente una copia persistida antigua del Board si el usuario todavía está editando el Board actual.

La regla conceptual es:

```text
Editor actual
      ↓
guardar Board actual
      ↓
BoardRepository
      ↓
buildProjectExport()
      ↓
JSON
```

---

# 17. Restauración del Board al iniciar

Excalifile tuvo un problema importante derivado de la separación entre:

* almacenamiento nativo de Excalidraw;
* Board System.

La solución implementada hace que, durante el arranque, el `BoardData` correspondiente al Board activo pueda cargarse nuevamente dentro del editor.

Esto es importante porque el estado persistido del Board System debe ser la fuente de verdad para el contenido de los Boards.

No debe asumirse que el contenido que Excalidraw encuentra en su LocalStorage nativo representa necesariamente el Board actualmente seleccionado por Excalifile.

---

# 18. Link to File

Excalifile también incorpora una funcionalidad denominada **Link to File**.

Esta funcionalidad permite crear/abrir referencias hacia archivos del sistema utilizando un **Bridge local escrito en Rust**.

El Bridge funciona localmente y expone el servicio necesario para resolver las operaciones relacionadas con Link to File.

El Bridge utiliza actualmente el puerto:

```text
127.0.0.1:3005
```

---

# 19. Limitaciones de Link to File

Link to File tiene limitaciones importantes.

## 19.1. El Bridge debe estar ejecutándose

Si el Bridge no está levantado, aparecerán errores como:

```text
ERR_CONNECTION_REFUSED
BridgeUnavailable
```

Esto no significa necesariamente que Excalifile esté roto.

Primero debe comprobarse que el Bridge local esté ejecutándose.

## 19.2. No es una funcionalidad completamente portable

Link to File depende del sistema de archivos local.

Una referencia hacia un archivo de una computadora no garantiza que ese mismo archivo exista en otra computadora.

Por ejemplo:

```text
PC A

C:\Documentos\Proyecto\archivo.pdf
```

no necesariamente existe en:

```text
PC B
```

Por esta razón, **los enlaces creados mediante Link to File no deben considerarse archivos incluidos dentro del backup JSON del proyecto**.

El JSON exportado conserva el proyecto de Excalifile, pero no convierte automáticamente los archivos externos referenciados mediante Link to File en archivos portables.

---

# 20. Limitación importante: cambio de disco

Link to File depende de rutas del sistema de archivos.

Por ello, una referencia puede dejar de funcionar si el archivo cambia de ubicación, especialmente cuando cambia la unidad/disco donde se encuentra.

Por ejemplo:

```text
D:\Proyecto\archivo.pdf
```

no equivale necesariamente a:

```text
E:\Proyecto\archivo.pdf
```

El sistema actual no proporciona un mecanismo completo de relocalización automática de archivos entre discos.

---

# 21. Bridge y `bridge/target`

El código del Bridge se encuentra dentro del directorio:

```text
bridge/
```

Los archivos generados por la compilación de Rust aparecen dentro de:

```text
bridge/target/
```

`bridge/target/` es contenido generado por Rust y **no debe incluirse manualmente en commits funcionales**.

Si después de ejecutar el Bridge Git muestra modificaciones o archivos generados dentro de `bridge/target/`, no se debe interpretar automáticamente como una modificación del código fuente del proyecto.

No utilizar:

```text
git clean
```

ni comandos destructivos para eliminar estos archivos sin comprobar primero su función y configuración de Git.

---

# 22. Arquitectura general

A nivel conceptual, Excalifile puede verse así:

```text
┌──────────────────────────────────────┐
│            Excalifile UI             │
│                                      │
│  NavBar / navegación / herramientas  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│         Board System / Host          │
│                                      │
│  Boards                              │
│  Folders                             │
│  Pointers                            │
│  Navigation                          │
│  Board state                         │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          BoardRepository             │
│                                      │
│  load()                              │
│  loadBoard()                         │
│  save()                              │
│  saveBoard()                         │
│  garbage collection                  │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       Local persistence              │
│                                      │
│  LocalStorage                        │
│  IndexedDB fallback                  │
└──────────────────────────────────────┘


              Excalifile
                   │
                   ▼
        ┌────────────────────┐
        │ Excalidraw Editor   │
        │                     │
        │ elements            │
        │ images              │
        │ canvas              │
        └────────────────────┘


              Link to File
                   │
                   ▼
        ┌────────────────────┐
        │ Rust Local Bridge  │
        │ 127.0.0.1:3005    │
        └────────────────────┘
```

---

# 23. Organización importante del repositorio

Los archivos principales de Excalifile se encuentran principalmente dentro de:

```text
excalidraw-app/
```

El Board System se organiza bajo:

```text
excalidraw-app/boards/
```

Dentro de este sistema existen diferentes responsabilidades, incluyendo conceptualmente:

```text
boards/
├── domain/
├── host/
├── import-export/
├── ui/
└── ...
```

Los nombres y subdirectorios exactos deben consultarse directamente en el árbol actual del repositorio antes de realizar modificaciones importantes.

No se debe asumir que una estructura futura es idéntica a una estructura histórica.

---

# 24. Importante para futuros desarrolladores

Antes de modificar el Board System:

1. Leer `CLAUDE.md`.
2. Leer `CODEBASE.MD`.
3. Leer este documento.
4. Inspeccionar el código actual.
5. Identificar qué capa es responsable de la funcionalidad.
6. Buscar usos reales de las funciones antes de modificarlas.
7. Ejecutar las pruebas relevantes.
8. Hacer cambios pequeños.
9. Validar TypeScript.
10. Validar formato.
11. Hacer pruebas funcionales manuales cuando el cambio afecte UI, persistencia o navegación.
12. Crear un commit pequeño y claramente identificado.

No asumir que una función está aislada simplemente porque su nombre parece específico.

---

# 25. Reglas para agentes de IA

Si una IA está trabajando sobre este repositorio, debe seguir estas reglas.

## Regla 1 — No avanzar automáticamente de fase

Si existe un plan dividido en fases o microfases, completar únicamente la fase solicitada.

No comenzar la siguiente fase automáticamente.

---

## Regla 2 — No refactorizar por iniciativa propia

Si una tarea solicita corregir una funcionalidad concreta, no aprovecharla para:

* reestructurar todo el módulo;
* renombrar APIs;
* mover archivos;
* cambiar arquitectura;
* actualizar dependencias;
* reemplazar mecanismos existentes.

Una refactorización puede ser técnicamente atractiva y aun así ser incorrecta para el objetivo de la tarea.

---

## Regla 3 — Preservar las fronteras arquitectónicas

El Board System debe mantenerse lo más desacoplado posible del núcleo de Excalidraw.

Antes de modificar `App.tsx`, `packages/`, o código central de Excalidraw, comprobar si el problema puede solucionarse desde:

```text
boards/
```

o desde la capa Host.

---

## Regla 4 — No introducir una base de datos sin autorización explícita

El proyecto actualmente **no utiliza PostgreSQL ni otra base de datos como backend del producto**.

No implementar:

```text
PostgreSQL
REST API
backend
ORM
microservicios
cloud sync
```

como supuesta mejora automática.

La arquitectura actual es deliberadamente local y portable mediante JSON.

---

## Regla 5 — No cambiar el formato de exportación sin necesidad

El formato actual es:

```json
{
  "format": "ekade-project",
  "version": 1,
  "graph": {},
  "boardsData": {}
}
```

Si se modifica el formato, debe considerarse compatibilidad y versionado.

No cambiar `version` simplemente para introducir pequeños cambios internos.

---

## Regla 6 — No romper la semántica de Import

Importar un proyecto significa:

```text
REEMPLAZAR EL PROYECTO ACTUAL
```

No significa hacer merge.

No introducir remapeo de `BoardId` sin una decisión arquitectónica explícita.

---

## Regla 7 — No modificar Link to File innecesariamente

Link to File depende del Bridge Rust.

Si una tarea no está relacionada con Link to File, no modificar:

```text
bridge/
```

ni su integración.

---

## Regla 8 — No tocar `bridge/target/`

Los archivos generados por Rust no deben mezclarse con cambios funcionales del proyecto.

---

## Regla 9 — Proteger los datos existentes

Antes de realizar operaciones relacionadas con persistencia, eliminación o importación:

* comprender qué datos se escriben;
* comprender qué datos se reemplazan;
* comprobar si existe fallback;
* comprobar qué hace el garbage collector;
* evitar operaciones destructivas innecesarias.

---

# 26. Pruebas y validación

Una modificación importante no debe considerarse terminada únicamente porque TypeScript compile.

Dependiendo del cambio, validar:

```text
TypeScript
↓
Prettier
↓
tests relevantes
↓
git diff --check
↓
prueba manual
```

Para cambios relacionados con Board System, comprobar especialmente:

* abrir aplicación;
* abrir Boards;
* cambiar de carpeta;
* crear elementos;
* editar texto;
* agregar imágenes;
* navegar;
* recargar;
* persistencia;
* exportar;
* importar;
* Link to File si el cambio puede afectarlo.

---

# 27. Estado funcional actual

El sistema actualmente cuenta con:

* Editor basado en Excalidraw.
* Board System.
* Boards.
* Carpetas.
* Subcarpetas.
* Navegación.
* Breadcrumbs.
* Historial de navegación.
* Folder Pointers.
* Persistencia local.
* Imágenes asociadas a Boards.
* Exportación de proyectos.
* Importación/reemplazo de proyectos.
* Restauración del Board activo al iniciar.
* Link to File mediante Bridge Rust.
* Estructura de documentación reorganizada.

El sistema ha sido probado funcionalmente en el flujo de:

```text
objetos
texto
imágenes
carpetas
navegación
exportación
importación
```

---

# 28. Lo que Excalifile todavía NO es

Excalifile actualmente no debe describirse como:

* una aplicación SaaS;
* una plataforma colaborativa;
* una base de datos distribuida;
* un sistema cloud;
* un sistema multiusuario;
* un sistema de sincronización;
* un gestor completo de archivos;
* un reemplazo de un sistema operativo de archivos;
* un backup automático;
* un sistema de versionado de proyectos;
* un gestor de documentos con almacenamiento remoto.

Su estado actual es principalmente:

> **Un entorno local de organización visual basado en Excalidraw, con un sistema propio de Boards, carpetas, referencias y persistencia local, capaz de exportar e importar proyectos completos mediante JSON.**

---

# 29. Posibles extensiones futuras

Estas funcionalidades podrían implementarse en el futuro, pero **no forman parte del sistema actual**:

* Base de datos persistente.
* PostgreSQL.
* Backend.
* Sincronización cloud.
* Autenticación.
* Multiusuario.
* Compartición de Boards.
* Historial de versiones.
* Backups automáticos.
* Importación/exportación de formatos adicionales.
* Mejor gestión de archivos externos.
* Relocalización automática de Link to File.
* Gestión avanzada de recursos multimedia.
* Búsqueda semántica.
* Integración con sistemas externos.
* IA sobre el contenido de los Boards.

Cualquier implementación de estas características debe considerarse una nueva evolución arquitectónica y no una simple modificación menor.

---

# 30. Filosofía del proyecto

La prioridad de Excalifile es:

```text
Estabilidad
    ↓
Integridad de datos
    ↓
Arquitectura comprensible
    ↓
Portabilidad
    ↓
Funcionalidad
    ↓
Nuevas características
```

Una característica nueva no justifica romper una funcionalidad existente.

La complejidad debe introducirse únicamente cuando resuelve un problema real.

------------------------------------------------------------------------------------------------------

# 31. Notas personales de ekade

Esta sección contiene información personal de mantenimiento que no necesariamente pertenece a la arquitectura formal del proyecto.

## CONTROLAR EL ZOOM

Las constantes relacionadas con el zoom se encuentran en:

```text
packages/common/src/constants
```

Si se necesita modificar el comportamiento/valores relacionados con el zoom, revisar primero las constantes existentes allí.

---

## SI LINK TO FILE NO FUNCIONA, LEVANTA EL BRIDGE

Si Link to File muestra errores como:

```text
ERR_CONNECTION_REFUSED
BridgeUnavailable
```

comprobar primero que el Bridge local esté ejecutándose.

Desde la raíz del proyecto:

```bash
cd bridge
cargo run --bin bridge
```

El Bridge debe permanecer ejecutándose mientras se utilice Link to File.

Actualmente utiliza:

```text
127.0.0.1:3005
```

Si Link to File funciona correctamente después de levantar el Bridge, no modificar el código de Excalifile por este error.

--------------------------------------------------------------------------------------------------------

# 32. Nota final para futuros colaboradores

Si este proyecto se descarga desde cero y se desea continuar su desarrollo:

**No asumir que el objetivo es reconstruir Excalifile desde cero.**

El sistema descrito en este documento ya representa una base funcional.

Antes de implementar cualquier nueva característica:

```text
Leer documentación
        ↓
Entender arquitectura actual
        ↓
Auditar código relacionado
        ↓
Definir cambio mínimo
        ↓
Implementar
        ↓
Probar
        ↓
Validar manualmente
        ↓
Commit
```

La prioridad debe ser preservar las funcionalidades existentes mientras se amplía el sistema de forma incremental.

**Excalifile debe evolucionar sobre la arquitectura existente, no ser reemplazado innecesariamente por una arquitectura completamente nueva.**
