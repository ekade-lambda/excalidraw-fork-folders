Excalidraw --- mapa de arquitectura, árbol y guía de modificación

Repositorio analizado: https://github.com/excalidraw/excalidraw\
Rama: master
Fecha de referencia: 2026-08-18

Este documento está pensado como mapa de navegación para modificar
Excalidraw, no como una copia del código. La idea es que puedas
empezar desde una función/feature concreta y saber qué archivos
investigar antes de abrir cientos de archivos.

Importante: Excalidraw es un monorepo grande y cambia
constantemente. El árbol y los nombres de archivos de este documento
corresponden a la estructura visible de master en la fecha indicada.
Para archivos internos de subdirectorios donde GitHub no expone aquí
un listado recursivo fiable, se describe la arquitectura y los puntos
de entrada conocidos en vez de inventar nombres. Si necesitas una
versión literalmente exhaustiva de cada archivo, conviene generar este
documento directamente desde el checkout local del commit que vayas a
modificar.

1. Qué es cada parte del repositorio

Excalidraw no es una aplicación monolítica. Hay dos niveles
especialmente importantes:

packages/excalidraw/ --- el editor reutilizable que se publica
como @excalidraw/excalidraw.

excalidraw-app/ --- la aplicación que alimenta el sitio/app de
Excalidraw.com y añade cosas que no pertenecen necesariamente al
editor embebible.

Además existen paquetes independientes para elementos, matemática,
utilidades, indexación fraccional, puntero láser, etc.

La separación conceptual es aproximadamente:

excalidraw-app
      │
      ▼
packages/excalidraw  ────────────────┐
      │                              │
      ├── scene / renderer           │
      ├── actions                    │
      ├── UI / React                 │
      ├── data / import-export       │
      ├── history                    │
      ├── viewport                   │
      └── input / tools              │
                                     │
      ├──────────────► packages/element
      │                       │
      │                       └── tipos y operaciones de elementos
      │
      ├──────────────► packages/math
      │
      ├──────────────► packages/common
      │
      ├──────────────► packages/utils
      │
      ├──────────────► packages/fractional-indexing
      │
      └──────────────► packages/laser-pointer

Si quieres cambiar cómo funciona el editor, empieza normalmente por
packages/excalidraw/.

Si quieres cambiar la aplicación de Excalidraw.com, empieza por
excalidraw-app/.

2. Árbol del repositorio

2.1 Raíz

excalidraw/
├── .codesandbox/
├── .github/
├── .husky/
├── dev-docs/
├── examples/
├── excalidraw-app/
├── firebase-project/
├── packages/
├── public/
├── scripts/
│
├── .dockerignore
├── .editorconfig
├── .env.development
├── .env.production
├── .env.test
├── .eslintignore
├── .eslintrc.json
├── .gitattributes
├── .gitignore
├── .lintstagedrc.js
├── .npmrc
├── .prettierignore
├── .watchmanconfig
├── CLAUDE.md
├── CONTRIBUTING.md
├── Dockerfile
├── LICENSE
├── README.md
├── crowdin.yml
├── docker-compose.yml
├── package.json
├── setupTests.ts
├── tsconfig.json
├── vercel.json
├── vitest.config.mts
└── yarn.lock

Qué hace cada zona

Ruta                                Función

.github/                          CI/CD, workflows, plantillas y
automatización de GitHub.

.husky/                           Git hooks para tareas automáticas
antes/después de commits.

dev-docs/                         Documentación destinada a
desarrolladores del repositorio.

examples/                         Ejemplos de integración del paquete
Excalidraw.

excalidraw-app/                   Aplicación completa que usa el
editor.

firebase-project/                 Infraestructura relacionada con
servicios Firebase usados por la
aplicación.

packages/                         Librerías internas que forman el
editor. Es la zona más importante
para modificar el núcleo.

public/                           Recursos públicos de la aplicación.

scripts/                          Scripts de mantenimiento, build,
generación y automatización.

package.json                      Scripts y dependencias del
monorepo.

tsconfig.json                     Configuración TypeScript global.

vitest.config.mts                 Configuración de tests.

yarn.lock                         Versiones concretas de
dependencias.

README.md                         Documentación general.

CONTRIBUTING.md                   Reglas para contribuir.

CLAUDE.md                         Instrucciones específicas para
agentes/Claude dentro del
repositorio.

LICENSE                           Licencia MIT.

3. packages/

packages/
├── common/
├── element/
├── excalidraw/
├── fractional-indexing/
├── laser-pointer/
├── math/
├── utils/
├── eslintrc.base.json
└── tsconfig.base.json

3.1 packages/common/

Responsabilidad: infraestructura compartida y utilidades generales
que no deberían depender del editor completo.

Úsalo cuando estés buscando:

tipos/utilidades compartidas;

funciones auxiliares;

constantes comunes;

utilidades de rendimiento;

lógica que necesitan varios paquetes;

tipos utilitarios de TypeScript.

La intención arquitectónica es evitar que paquetes de bajo nivel
dependan del editor.

3.2 packages/element/

Responsabilidad: modelo y operaciones de los elementos dibujados.

Un elemento de Excalidraw puede ser, entre otras cosas:

rectángulo;

elipse;

diamante;

línea;

flecha;

texto;

imagen;

frame;

embeddable;

free-draw;

elementos enlazables/bindables.

Árbol visible de alto nivel:

packages/element/
├── src/
├── tests/
├── .eslintrc.json
├── README.md
├── global.d.ts
├── package.json
└── tsconfig.json

Cuándo entrar aquí

Si quieres cambiar:

cómo se representa un elemento;

propiedades de los elementos;

creación/clonado de elementos;

geometría específica de elementos;

transformaciones;

bindings;

tipos de elemento;

operaciones que deberían funcionar independientemente de React/UI.

Regla práctica: si tu modificación responde a "¿qué es un elemento?"
o "¿cómo se transforma/calcula un elemento?", probablemente pertenece
aquí.

3.3 packages/math/

Responsabilidad: operaciones matemáticas/geometría de bajo nivel.

Es especialmente relevante para:

puntos;

vectores;

transformaciones;

intersecciones;

cálculos geométricos;

coordenadas;

operaciones usadas por selección, bindings y rendering.

No es normalmente el primer sitio que debes tocar para cambiar la
interfaz.

3.4 packages/utils/

Responsabilidad: utilidades reutilizables.

Puede contener funciones usadas para:

exportación;

procesamiento;

manipulación de datos;

operaciones auxiliares;

integración con APIs del navegador.

Si encuentras una función que parece demasiado genérica para pertenecer
al editor, revisa este paquete.

3.5 packages/fractional-indexing/

Responsabilidad: indexación/ordenamiento mediante índices
fraccionales.

Es útil cuando el sistema necesita insertar/reordenar elementos sin
tener que renumerar todo el conjunto.

No suele ser un lugar donde necesites entrar para modificar UI.

3.6 packages/laser-pointer/

Responsabilidad: lógica reutilizable relacionada con el puntero
láser.

Si quieres modificar específicamente el comportamiento/renderizado del
puntero láser, este paquete es uno de los primeros lugares que revisar.

4. packages/excalidraw/ --- EL NÚCLEO DEL EDITOR

Esta es probablemente la carpeta que más te interesa.

packages/excalidraw/
├── actions/
├── charts/
├── components/
├── context/
├── css/
├── data/
├── eraser/
├── fonts/
├── hooks/
├── lasso/
├── locales/
├── renderer/
├── scene/
├── subset/
├── tests/
├── wysiwyg/
│
├── .gitignore
├── .size-limit.json
├── CHANGELOG.md
├── README.md
├── analytics.ts
├── animatedTrail.ts
├── appState.ts
├── charts.test.ts
├── clients.ts
├── clipboard.test.ts
├── clipboard.ts
├── css.d.ts
├── deburr.ts
├── drawShapeTrail.ts
├── editor-jotai.ts
├── env.cjs
├── errors.ts
├── gesture.ts
├── global.d.ts
├── history.ts
├── i18n.ts
├── index-node.ts
├── index.tsx
├── laserTrails.ts
├── mermaid.test.ts
├── mermaid.ts
├── package.json
├── polyfill.ts
├── pwacompat.d.ts
├── react-app-env.d.ts
├── reactUtils.ts
├── shortcut.ts
├── snapping.ts
├── textAutoResizeHandle.ts
├── tsconfig.json
├── types.ts
├── viewport.ts
├── vite-env.d.ts
└── workers.ts

5. Archivos raíz más importantes de packages/excalidraw

index.tsx --- punto de entrada público

Si quieres entender qué exporta el paquete o cómo se presenta el
editor como componente React, empieza aquí.

Es uno de los archivos más importantes para:

API pública;

exports;

configuración del componente;

integración externa;

conexión entre módulos internos y consumidores de
@excalidraw/excalidraw.

Si quieres modificar:

API pública;

exports;

comportamiento configurable desde <Excalidraw />;

integración como librería;

→ revisa index.tsx.

types.ts --- contrato central de tipos

Este archivo es extremadamente importante.

Contiene tipos relacionados con:

AppState;

props de Excalidraw;

estado del editor;

herramientas;

colaboradores;

archivos;

biblioteca;

exportación;

eventos;

API imperativa;

configuración;

estado de escena.

Por ejemplo, ToolType define herramientas como:

selection
lasso
rectangle
diamond
ellipse
arrow
line
freedraw
text
image
eraser
hand
frame
magicframe
embeddable
laser
autoshape

Si quieres añadir/modificar:

una opción global;

una prop;

una herramienta;

un evento;

una parte del estado;

una interfaz pública;

→ revisa primero types.ts.

appState.ts --- estado inicial del editor

Aquí debes mirar cuando quieras entender:

valores iniciales del editor;

estado de UI;

preferencias;

zoom;

herramienta activa;

selección;

dialogs;

sidebar;

estado relacionado con interacción.

Diferencia conceptual:

types.ts
    ↓
"¿qué forma tiene el estado?"

appState.ts
    ↓
"¿cuáles son los valores iniciales/por defecto?"

history.ts --- undo/redo

Si quieres modificar:

deshacer;

rehacer;

historial;

snapshots;

captura de cambios;

→ empieza aquí.

No confundas esto con guardar archivos: history.ts es principalmente
el historial de edición.

viewport.ts --- cámara del canvas

Muy importante si quieres cambiar:

zoom;

desplazamiento/pan;

coordenadas de pantalla ↔ coordenadas del canvas;

viewport;

centrado;

límites/offsets;

navegación por el lienzo.

Si tu modificación es:

"quiero que el canvas se comporte diferente al hacer zoom/moverme"

este archivo es candidato inmediato.

snapping.ts --- snapping

Aquí debes investigar cuando quieras cambiar:

ajuste automático;

alineación;

snapping de objetos;

líneas auxiliares;

comportamiento geométrico de colocación.

gesture.ts --- gestos

Relacionado con interacción mediante:

touch;

pinch;

rotación;

gestos multitáctiles;

pointer events relacionados con gestos.

shortcut.ts --- teclado

Si quieres cambiar:

atajos;

combinación de teclas;

shortcuts;

comportamiento dependiente de teclado;

empieza aquí y luego busca el action que ejecuta ese shortcut.

clipboard.ts --- copiar/pegar

Para:

copiar;

pegar;

datos del portapapeles;

serialización/deserialización asociada a clipboard;

pegado de elementos;

imágenes desde clipboard.

También tiene tests específicos:

clipboard.test.ts

i18n.ts --- internacionalización

Responsable de la infraestructura de idiomas.

Los textos traducidos están en:

packages/excalidraw/locales/

Si quieres cambiar una frase visible:

busca la key en i18n.ts/uso de t();

encuentra la key correspondiente en locales/*.json;

modifica las traducciones pertinentes.

analytics.ts

Infraestructura relacionada con eventos/analytics.

Si estás modificando una función visual, normalmente no es el primer
archivo que necesitas.

mermaid.ts

Conversión/integración relacionada con Mermaid → Excalidraw.

Tiene un test correspondiente:

mermaid.test.ts

workers.ts

Código relacionado con Web Workers.

Si una operación ocurre fuera del hilo principal, este archivo es un
candidato para investigar.

polyfill.ts

Compatibilidad/polyfills necesarios para determinados entornos.

reactUtils.ts

Utilidades relacionadas con React.

errors.ts

Errores específicos del editor.

clients.ts

Infraestructura relacionada con información/identificación del cliente o
entorno de ejecución.

deburr.ts

Normalización de texto/caracteres.

textAutoResizeHandle.ts

Lógica relacionada con el redimensionamiento automático de texto.

Si estás modificando cómo crecen las cajas de texto al escribir, revisa
este archivo junto con el sistema de texto.

6. packages/excalidraw/actions/

Esta carpeta es una de las más importantes arquitectónicamente.

La idea fundamental es:

evento del usuario
      ↓
acción
      ↓
cambio de elementos/estado
      ↓
renderizado

Las acciones representan operaciones del editor como:

borrar;

duplicar;

copiar;

pegar;

cambiar propiedades;

cambiar herramienta;

agrupar/desagrupar;

exportar;

seleccionar;

cambiar vista;

etc.

Cuándo buscar aquí

Si dices:

"Cuando el usuario pulsa X quiero que Excalidraw haga Y"

busca primero la action correspondiente.

Luego sigue las funciones que la action llama.

Patrón mental

Toolbar / shortcut / menu
            ↓
         Action
            ↓
   lógica del editor
            ↓
       scene/state
            ↓
        renderer

Esta separación es crucial para entender Excalidraw.

7. packages/excalidraw/components/

Esta carpeta contiene gran parte de la interfaz React.

Aquí encontrarás componentes relacionados con:

toolbar;

sidebar;

dialogs;

menús;

propiedades;

biblioteca;

command palette;

exportación;

ayuda;

configuración;

contexto;

controles del canvas;

UI específica de elementos.

Si quieres modificar la interfaz

Empieza aquí.

Ejemplos:

"Quiero cambiar el toolbar"

packages/excalidraw/components/

Busca componentes de toolbar.

"Quiero cambiar el menú contextual"

Busca:

components/ContextMenu/

"Quiero cambiar el panel lateral"

Busca componentes de:

components/Sidebar/

"Quiero cambiar el diálogo de exportación"

Busca componentes de exportación.

"Quiero cambiar el command palette"

Busca:

components/CommandPalette/

"Quiero cambiar botones"

Busca primero el componente que renderiza el botón, después rastrea la
action asociada.

8. packages/excalidraw/scene/

Esta carpeta representa una parte fundamental del modelo visual.

Conceptualmente:

Element[]
   ↓
Scene
   ↓
orden / selección / búsqueda / relaciones
   ↓
Renderer
   ↓
Canvas

Aquí debes investigar cuando quieras entender:

qué elementos están actualmente en la escena;

cómo se consultan;

cómo se ordenan;

cómo se calcula información de la escena;

relaciones entre elementos y escena;

scrollbars/viewport relacionados con escena.

Regla práctica

Si el problema es:

"El objeto existe pero Excalidraw no lo encuentra/renderiza/selecciona
correctamente."

investiga scene/.

Si el problema es:

"El objeto se dibuja incorrectamente."

investiga renderer/.

9. packages/excalidraw/renderer/

Responsabilidad:

convertir elementos del modelo en píxeles/representación visual.

Es una zona crítica si quieres cambiar:

cómo se dibuja un rectángulo;

cómo se dibuja una flecha;

colores;

strokes;

sombras;

roughness;

rendering;

exportación visual relacionada;

rendimiento del dibujo.

Distinción fundamental

element/
    qué es el objeto

scene/
    qué objetos existen

renderer/
    cómo se dibujan

Esto te evita buscar a ciegas.

10. packages/excalidraw/data/

Responsabilidad:

entrada/salida y transformación de datos del dibujo.

Es una de las carpetas más importantes para:

abrir archivos;

guardar archivos;

importar;

exportar;

restaurar escenas;

serializar;

deserializar;

convertir datos externos;

reconciliación;

bibliotecas;

archivos binarios/imágenes.

Entre los archivos que aparecen como puntos de entrada/importantes en el
código actual están:

data/
├── blob
├── library
├── reconcile
├── restore
├── types
└── ...

Los nombres exactos y subestructuras pueden cambiar con nuevas
versiones.

11. data/restore

Muy importante.

Si un .excalidraw se carga, los datos externos no deberían convertirse
ciegamente en estado interno.

El sistema de restore se encarga de transformar/validar/restaurar datos.

Busca aquí si estás modificando:

compatibilidad de archivos;

migraciones;

carga de escenas;

validación de datos;

restauración de elementos;

restauración del appState.

En el código de excalidraw-app/App.tsx se importan explícitamente
funciones como:

bumpElementVersions
restoreAppState
restoreElements

por lo que data/restore es una zona especialmente relevante para el
flujo de carga.

12. data/library

Responsabilidad:

biblioteca personal;

importación de bibliotecas;

instalación de elementos de biblioteca;

persistencia relacionada con library;

parsing de datos de library.

Si quieres modificar la funcionalidad de Library, empieza aquí y
después ve a los componentes de UI correspondientes.

13. data/reconcile

Responsabilidad:

reconciliar conjuntos de elementos/estado, especialmente importante
en contextos donde varias fuentes pueden producir cambios.

Es particularmente relevante para colaboración y sincronización.

14. packages/excalidraw/eraser/

Lógica específica del borrador/eraser.

Si quieres modificar:

qué ocurre cuando el usuario usa la goma;

detección de elementos afectados;

interacción del eraser;

empieza aquí.

15. packages/excalidraw/lasso/

Lógica específica de selección mediante lazo.

Si quieres modificar:

lasso;

selección irregular;

detección de elementos dentro de una región;

revisa esta carpeta.

16. packages/excalidraw/hooks/

Hooks de React reutilizables.

Úsalos cuando estés investigando:

lifecycle;

estado reactivo;

listeners;

interacción con componentes;

comportamiento que se comparte entre componentes.

No significa que toda lógica de UI esté aquí: muchos componentes
contienen lógica propia.

17. packages/excalidraw/context/

React Context y dependencias contextuales.

Útil cuando una característica obtiene información desde
providers/contextos en lugar de recibirla directamente por props.

18. packages/excalidraw/charts/

Funcionalidad relacionada con gráficos/charts.

Si modificas la creación o edición de gráficos dentro de Excalidraw,
empieza aquí.

19. packages/excalidraw/wysiwyg/

"WYSIWYG" significa esencialmente:

What You See Is What You Get.

Esta zona está relacionada con edición visual directa, especialmente
texto/edición en pantalla.

Si estás modificando:

edición de texto;

input overlay;

comportamiento del editor de texto;

sincronización entre DOM y canvas;

revisa esta carpeta.

20. packages/excalidraw/locales/

Archivos JSON de traducción.

Ejemplo:

locales/
├── en.json
├── es.json
├── ...

La lista de idiomas puede crecer.

Para cambiar un texto

No busques primero en todo el código.

Haz:

texto visible
   ↓
buscar la frase/key en locales
   ↓
identificar la key
   ↓
buscar dónde se usa la key
   ↓
modificar componente/lógica si también cambia comportamiento

21. packages/excalidraw/tests/

Tests del editor.

Son especialmente útiles para entender comportamiento existente.

Cuando no sepas qué debería hacer una función, buscar sus tests puede
ser más rápido que leer todo el módulo.

22. packages/excalidraw/css/

Estilos del editor.

Si el problema es puramente:

color;

tamaño;

posición;

margen;

padding;

display;

responsive;

apariencia;

revisa CSS antes de tocar TypeScript.

Pero: no asumas que todo el estilo está aquí. Hay componentes con
estilos/SCSS asociados y clases distribuidas por la aplicación.

23. packages/excalidraw/fonts/

Recursos relacionados con fuentes.

Excalidraw también tiene lógica de carga/self-hosting de fuentes. La
documentación del paquete indica que las fuentes pueden estar en el
build y que el consumidor puede self-hostearlas.

24. packages/excalidraw/subset/

Funcionalidad relacionada con subsetting/optimización de fuentes o
recursos de fuentes.

No suele ser necesario tocarlo para modificaciones normales del editor.

25. excalidraw-app/ --- la aplicación completa

Árbol visible actual:

excalidraw-app/
├── app-language/
├── collab/
├── components/
├── data/
├── share/
├── tests/
│
├── App.tsx
├── CustomStats.tsx
├── ExcalidrawPlusIframeExport.tsx
├── app-jotai.ts
├── app_constants.ts
├── bug-issue-template.js
├── debugCollaborators.ts
├── global.d.ts
├── index.html
├── index.scss
├── index.tsx
├── package.json
├── sentry.ts
├── useHandleAppTheme.ts
├── vite-env.d.ts
└── vite.config.mts

26. excalidraw-app/App.tsx --- aplicación principal

Este archivo es muy importante, pero hay que entender qué significa.

No es simplemente "el Excalidraw entero".

Es el componente principal de la aplicación que integra:

@excalidraw/excalidraw
        +
persistencia
        +
colaboración
        +
shareable links
        +
servicios de Excalidraw
        +
UI propia de excalidraw.com

El App.tsx actual importa directamente cosas como:

Excalidraw
LiveCollaborationTrigger
TTDDialogTrigger
ExcalidrawAPIProvider
useExcalidrawAPI
restoreAppState
restoreElements
loadFromBlob
library
reconcile

Esto lo convierte en un excelente punto de entrada para entender cómo
la aplicación completa utiliza el paquete editor.

27. Diferencia entre packages/excalidraw y excalidraw-app

Esta distinción te va a ahorrar muchísimo tiempo.

Si quieres cambiar:

El editor reutilizable

packages/excalidraw/

La colaboración de excalidraw.com

excalidraw-app/collab/

Persistencia específica de la app

excalidraw-app/data/

Compartir enlaces

excalidraw-app/share/

UI exclusiva del sitio

excalidraw-app/components/

Arranque de la aplicación

excalidraw-app/index.tsx
excalidraw-app/App.tsx

28. Flujo mental completo de Excalidraw

Para no perderte, piensa en una acción como:

"El usuario dibuja un rectángulo."

El flujo conceptual es parecido a:

Mouse / Pointer Event
        │
        ▼
Input / interacción del editor
        │
        ▼
Tool / estado de herramienta
        │
        ▼
Creación o modificación de Element
        │
        ▼
Scene
        │
        ▼
History / captura de cambio
        │
        ▼
Renderer
        │
        ▼
Canvas

Para seleccionar:

Pointer
   ↓
detección geométrica
   ↓
selection state
   ↓
AppState.selectedElementIds
   ↓
UI/renderer

Para guardar:

Scene + AppState + BinaryFiles
             ↓
         export/data
             ↓
       .excalidraw JSON

Para cargar:

archivo
  ↓
blob/file
  ↓
parse
  ↓
restore
  ↓
validación/migración
  ↓
elements + appState
  ↓
scene

Para colaboración:

cambio local
     ↓
capture/update
     ↓
reconcile / collaboration layer
     ↓
red
     ↓
cambio remoto
     ↓
reconcile
     ↓
scene

29. Tabla "quiero modificar X → ¿dónde voy?"

Quiero modificar...              Empieza aquí

Toolbar                          packages/excalidraw/components/
Botón concreto                   componente que lo renderiza + actions/
Menú contextual                  components/ContextMenu/
Command palette                  components/CommandPalette/
Sidebar                          components/Sidebar/
Dialog                           components/ + dialog específico
Texto de la interfaz             locales/
Traducciones                     locales/ + i18n.ts
Rectángulo                       packages/element/ + renderer
Elipse                           packages/element/ + renderer
Flecha                           packages/element/ + binding/renderer
Línea                            packages/element/ + editor de elementos lineales
Free-draw                        packages/element/ + interacción/renderer
Texto                            wysiwyg/, textAutoResizeHandle.ts, element/renderer
Imagen                           data/, element, renderer y componentes relacionados
Frames                           element + components + scene
Selección                        scene/, lasso/, interacción/actions
Lasso                            lasso/
Eraser                           eraser/
Zoom                             viewport.ts + UI/actions
Pan                              viewport.ts + gesture/input
Snap                             snapping.ts
Undo                             history.ts
Redo                             history.ts
Atajos                           shortcut.ts + actions/
Copiar/pegar                     clipboard.ts
Guardar                          data/
Cargar                           data/restore
.excalidraw JSON               data/
Exportar PNG/SVG                 export/data/utils/renderer
Library                          data/library + UI Library
Mermaid                          mermaid.ts + mermaid.test.ts
Charts                           charts/
Canvas rendering                 renderer/
Element model                    packages/element/
Geometría                        packages/math/
Puntero láser                    packages/laser-pointer/ / laserTrails.ts
Colaboración                     excalidraw-app/collab/ + reconcile
Compartir                        excalidraw-app/share/
Persistencia de excalidraw.com   excalidraw-app/data/
App completa                     excalidraw-app/App.tsx
API pública                      packages/excalidraw/index.tsx + types.ts

30. Las piezas que deberías estudiar primero

Si tu objetivo es construir/modificar tu propio editor basado en
Excalidraw, no intentes leer el repositorio de arriba abajo.

El orden recomendado es:

1. packages/excalidraw/index.tsx
2. packages/excalidraw/types.ts
3. packages/excalidraw/appState.ts
4. packages/excalidraw/components/
5. packages/excalidraw/actions/
6. packages/excalidraw/scene/
7. packages/excalidraw/renderer/
8. packages/excalidraw/data/
9. packages/excalidraw/history.ts
10. packages/excalidraw/viewport.ts
11. packages/element/
12. packages/math/
13. excalidraw-app/App.tsx
14. excalidraw-app/collab/
15. excalidraw-app/data/

No necesitas comprender cada archivo antes de empezar.

31. Una estrategia mucho mejor que leer el repositorio entero

Para una modificación concreta, usa trazado de flujo.

Ejemplo:

"Quiero cambiar el zoom máximo de 200% a 500%."

No hagas:

leer 500 archivos

Haz:

zoom
 ↓
buscar "zoom"
 ↓
viewport.ts
 ↓
tipos/configuración relacionados
 ↓
action de zoom
 ↓
UI del zoom
 ↓
tests

Otro ejemplo:

"Quiero quitar el botón de una herramienta."

Haz:

botón
 ↓
toolbar component
 ↓
ToolType / UIOptions
 ↓
action/tool activation

Otro:

"Quiero cambiar cómo se dibujan los rectángulos."

Haz:

rectangle
 ↓
element package
 ↓
renderer
 ↓
rough rendering / shape generation
 ↓
tests

32. Qué archivos NO deberías tocar inicialmente

Si sólo quieres personalizar el editor, evita modificar de entrada:

yarn.lock
Dockerfile
docker-compose.yml
vercel.json
firebase-project/
.github/
scripts/

No porque sean irrelevantes, sino porque normalmente no contienen la
lógica que buscas.

También evita modificar dist/ si existe en un build generado.

La fuente que importa es packages/....

33. Fuente vs build

Un error común al estudiar proyectos grandes es modificar el archivo
equivocado.

La regla es:

SOURCE
packages/
excalidraw-app/
    ↓
BUILD
dist/
    ↓
USUARIO FINAL

Si estás desarrollando Excalidraw desde el repositorio, trabaja sobre el
source, no sobre artefactos generados.

34. Cómo buscar una funcionalidad sin conocer su archivo

Usa esta estrategia:

Paso 1 --- identifica el concepto

Ejemplo:

"goma"
"zoom"
"library"
"frame"
"arrow"
"selectedElementIds"
"undo"

Paso 2 --- busca el nombre

En VS Code:

Ctrl + Shift + F

Busca:

zoom

o una key concreta.

Paso 3 --- encuentra el punto donde se modifica

No te quedes sólo con el lugar donde aparece el nombre.

Busca:

definition

y después:

calls

Paso 4 --- sigue la cadena

UI
 ↓
handler
 ↓
action
 ↓
core logic
 ↓
state/scene
 ↓
renderer

35. Arquitectura simplificada

Una representación útil del sistema es:

                     ┌─────────────────────┐
                     │   excalidraw-app    │
                     │  App / Collab / UI  │
                     └──────────┬──────────┘
                                │
                                ▼
                    ┌──────────────────────┐
                    │ @excalidraw/excalidraw│
                    │      editor core      │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
        Components          Actions           Input
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                         AppState / Scene
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
                Element                History
                    │
                    ▼
                  Math
                    │
                    ▼
                Renderer
                    │
                    ▼
                  Canvas

36. Modelo conceptual de los datos

Un dibujo de Excalidraw puede entenderse aproximadamente como:

Scene
├── elements[]
│   ├── rectangle
│   ├── text
│   ├── arrow
│   ├── image
│   └── ...
│
├── appState
│   ├── zoom
│   ├── scrollX
│   ├── scrollY
│   ├── activeTool
│   ├── selectedElementIds
│   └── ...
│
└── files
    └── binary image data

Esta separación es importantísima.

Cuando estés depurando:

"El objeto no existe"

→ elements / scene / data.

"El objeto existe pero está seleccionado incorrectamente"

→ selection / AppState.

"El objeto existe pero se ve mal"

→ renderer / element / math.

"El objeto está bien pero al guardar se pierde"

→ data / serialization / restore.

"El objeto se pierde al deshacer"

→ history / action capture.

37. AppState vs Elements

No confundas estos dos conceptos.

Elements

Representan cosas dibujadas:

rectangle
arrow
text
image
...

AppState

Representa cómo está funcionando el editor:

zoom
scroll
activeTool
selectedElementIds
UI
dialogs
preferences
...

Por eso, si quieres guardar una nota/dibujo:

elements

son una parte fundamental.

Pero si quieres saber:

"¿Qué herramienta está seleccionada?"

eso está en:

appState.activeTool

38. types.ts es una especie de mapa del dominio

Cuando no entiendas qué significa algo, leer los tipos puede ser más
útil que leer la implementación.

Por ejemplo:

ExcalidrawElement
AppState
ToolType
ExcalidrawProps
BinaryFiles
LibraryItem
SceneData
ExportOpts

te dicen qué entidades existen y cómo se relacionan.

Para un proyecto propio basado en Excalidraw, estudiar primero los
tipos puede ahorrar muchísimo tiempo.

39. Qué partes probablemente te interesarán para un editor propio

Si tu objetivo es hacer una aplicación tipo:

"Excalidraw + organización de conocimiento/notas"

las zonas de mayor interés probablemente serán:

packages/excalidraw/
├── components/      ← interfaz
├── actions/         ← comandos
├── scene/           ← escena
├── renderer/        ← dibujo
├── data/            ← persistencia/import/export
├── history.ts       ← undo/redo
├── viewport.ts      ← zoom/pan
├── types.ts         ← contratos
└── appState.ts      ← estado

Y después:

packages/element/
packages/math/

No necesitas comprender primero colaboración, Firebase, Sentry, CI,
Docker, etc.

40. Mapa rápido para agentes de IA

Si vas a usar un agente de código, una instrucción útil sería:

Antes de modificar código:

1. Identifica la feature afectada.
2. Busca su punto de entrada en packages/excalidraw.
3. Determina si pertenece a:
   - components
   - actions
   - scene
   - renderer
   - data
   - element
   - math
4. Sigue las llamadas hasta la fuente real del comportamiento.
5. Busca tests existentes.
6. Modifica el mínimo número de módulos.
7. Ejecuta los tests relacionados.
8. No modifiques archivos generados.

Esto es mucho mejor que pedir:

"haz que Excalidraw haga X"

sin especificar dónde investigar.

41. Regla de navegación definitiva

Cuando quieras tocar Excalidraw, piensa primero en qué tipo de
problema tienes:

¿Es visual?
    ↓
components / css / renderer

¿Es una operación?
    ↓
actions

¿Es un objeto dibujado?
    ↓
element

¿Es geometría?
    ↓
math

¿Es la escena?
    ↓
scene

¿Es guardar/cargar?
    ↓
data

¿Es undo/redo?
    ↓
history

¿Es zoom/pan?
    ↓
viewport

¿Es teclado?
    ↓
shortcut + actions

¿Es idioma?
    ↓
locales + i18n

¿Es colaboración?
    ↓
excalidraw-app/collab + reconcile

¿Es la aplicación completa?
    ↓
excalidraw-app/App.tsx

42. Fuentes utilizadas

Repositorio oficial:

https://github.com/excalidraw/excalidraw

Directorio del editor:

https://github.com/excalidraw/excalidraw/tree/master/packages/excalidraw

Directorio de elementos:

https://github.com/excalidraw/excalidraw/tree/master/packages/element

Directorio de paquetes:

https://github.com/excalidraw/excalidraw/tree/master/packages

Aplicación:

https://github.com/excalidraw/excalidraw/tree/master/excalidraw-app

Documentación de desarrollo:

https://github.com/excalidraw/excalidraw/tree/master/dev-docs

43. Nota de precisión

Este documento debe tratarse como un mapa de arquitectura y
navegación, no como una garantía de que cada nombre de archivo
permanecerá idéntico para siempre.

El repositorio de Excalidraw está activo y master cambia
continuamente. El repositorio visible actualmente tiene miles de commits
y sigue recibiendo cambios.

La estructura más importante para trabajar es estable conceptualmente:

packages/
    common
    element
    excalidraw
    fractional-indexing
    laser-pointer
    math
    utils

excalidraw-app/
    App.tsx
    collab/
    components/
    data/
    share/

Cuando una modificación concreta sea importante, la práctica correcta es
confirmar el archivo exacto en el commit que tienes localmente antes de
editarlo.

44. Resumen final

Si sólo recuerdas una cosa:

packages/excalidraw/

es el cerebro del editor.

Dentro:

types.ts       → qué existe
appState.ts    → estado
actions/       → operaciones
components/    → interfaz
scene/         → escena
element/       → objetos
renderer/      → dibujo
data/          → guardar/cargar
history.ts     → undo/redo
viewport.ts    → zoom/pan
shortcut.ts    → teclado
i18n/locales   → idiomas

Y fuera de él:

packages/element → modelo de elementos
packages/math    → geometría
packages/common  → infraestructura compartida
excalidraw-app   → aplicación completa / servicios / colaboración

Con este mapa, la estrategia correcta no es "leer Excalidraw
entero", sino "entrar por la arquitectura de la característica que
quiero cambiar y seguir su flujo".