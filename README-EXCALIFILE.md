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

Excalifile parte de un fork de Excalidraw. El proyecto conserva gran parte de la infraestructura original de Excalidraw y añade funcionalidades propias.

* El código original de Excalidraw sigue siendo una dependencia arquitectónica importante.
* La arquitectura mantiene una separación clara entre Excalidraw Core / Editor y Excalifile Board System / Host Layer.

---

# 3. ¿Qué se ha añadido funcionalmente?

Excalifile introduce un sistema de múltiples Boards y carpetas jerárquicas. Cada Board representa un espacio independiente donde pueden existir elementos de Excalidraw y archivos/imágenes, persistidos localmente de forma independiente.

---

# 4. Instalación Limpia y Portabilidad

## 4.1. Requisitos previos

Para poder ejecutar Excalifile necesitas:
* **Node.js**: Versión >= 18.0.0
* **Yarn**: Versión clásica (1.22.x)
* **Rust y Cargo**: Necesarios para compilar y ejecutar el Bridge local.

## 4.2. Cómo clonar el proyecto

\\ash
git clone https://github.com/ekade-lambda/excalidraw-fork-folders.git
cd excalidraw-fork-folders
\
## 4.3. Cómo instalar dependencias

\\ash
yarn install
\
*(Si encuentras problemas de caché o dependencias, usa \yarn clean-install\)*.

## 4.4. Cómo levantar el Bridge

El Bridge es necesario para utilizar la funcionalidad **Link to File**. Se debe ejecutar en una terminal separada y mantener corriendo en segundo plano:

\\ash
cd bridge
cargo run --bin bridge
\*(El Bridge escuchará en W.0.0.1:3005\)*.

## 4.5. Cómo ejecutar Excalifile

En la raíz del proyecto, ejecuta:

\\ash
yarn start
\
Esto iniciará el servidor de desarrollo de Vite (usualmente en el puerto 3000) y podrás abrir la aplicación en tu navegador.

---

# 5. Exportación e Importación

## 5.1. Cómo utilizar Export

Para guardar tu proyecto y llevarlo a otra computadora:
1. Abre el menú principal en la esquina superior izquierda.
2. Selecciona **Export Workspace**.
3. El navegador descargará un archivo \ekade-project.json\.

## 5.2. Cómo mover un proyecto mediante JSON a otra computadora

1. Copia el archivo \ekade-project.json\ (mediante un pendrive, email, nube, etc.) a la nueva computadora.
2. Asegúrate de tener una instalación limpia de Excalifile corriendo en la nueva computadora.

## 5.3. Cómo utilizar Import

Para cargar tu proyecto en la nueva computadora:
1. Abre el menú principal de Excalifile.
2. Selecciona **Import Workspace**.
3. Selecciona el archivo \ekade-project.json\.
4. Confirma el mensaje de advertencia.
5. **ATENCIÓN**: La importación **REEMPLAZARÁ** todo el proyecto actual en esa computadora. Tus Boards, carpetas, textos, elementos e imágenes serán restaurados tal como estaban al exportar.

---

# 6. Solución de Problemas

## 6.1. Qué hacer si Link to File muestra BridgeUnavailable

1. Asegúrate de que no cerraste la terminal donde se ejecuta el Bridge.
2. Ejecuta nuevamente \cd bridge && cargo run --bin bridge\.
3. Revisa que el puerto À5\ no esté ocupado por otra aplicación.

## 6.2. Qué cosas NO deben modificarse/eliminarse

* **\ZZZZZZZ.MD\**: Archivo personal del creador.
* **\CLAUDE.md\** y **\CODEBASE.MD\**: Contexto para agentes de IA.
* **Carpeta Raíz (\Root\)**: En el sistema de carpetas de Excalifile, no intentes borrar ni renombrar la raíz.
* **Formato del JSON de exportación**: Mantener "format": "ekade-project"\ y "version": 1\.

---

# 7. Reglas para colaboradores y agentes de IA

1. Lee esta guía de inicio rápido.
2. Revisa la carpeta \docs/architecture/\ para entender el diseño actual.
3. Comprende que **Excalifile NO es una plataforma colaborativa cloud**, sino una herramienta local.
4. No intentes introducir bases de datos (PostgreSQL, MySQL) ni backends remotos. Todo debe mantenerse estático, local y persistido en el navegador o a través del JSON.
5. No refactorizar por iniciativa propia si no está expresamente autorizado.
6. Preservar las fronteras arquitectónicas (Board System vs Excalidraw Core).
7. No tocar \ridge/target/\ (Archivos generados por Rust).
