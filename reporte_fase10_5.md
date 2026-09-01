# Reporte de Corrección Final - Fase 10.5

## 1. Correcciones de Seguridad Ejecutadas

### 1.1. Mitigación Real de Zip Bomb en Metadatos (OOM Protection)
El mecanismo inseguro `read_to_string()` utilizado para parsear los archivos `.json` provenientes del archivo `.zip` fue reemplazado por un extractor customizado seguro (`read_zip_file_with_limit`).
* **Límites Implementados:**
  * `manifest.json`: Máximo 1 MB.
  * `database.json`: Máximo 100 MB.
* **Control Global de Extracción (`MAX_TOTAL_UNCOMPRESSED_SIZE`):** Se introdujo un contador global `global_extracted_size` que aborta el `Restore` si la suma de bytes de todos los JSONs y de todos los Assets descomprimidos excede los **2 GB**. Esto previene exhaustar el disco y el CPU acumulando miles de archivos "legales".
* **Validación Previa:** La petición falla explícitamente devolviendo HTTP 400 antes de involucrar al parser `serde_json`, protegiendo de raíz la memoria RAM (OOM) contra *buffers* infinitos o rellenos de espacios en blanco altamente comprimibles.

### 1.2. Intervención contra Bricking (Schema Downgrade)
La validación blanda que permitía instalar en la DB configuraciones estructurales más antiguas fue endurecida a una política de igualdad estricta.
* **Política `schema_backup == schema_actual`:** Ahora el motor verifica obligatoriamente que la versión extraída de `schema_migrations` del backup coincida con la que posee el backend (extraída de PostgreSQL).
* **Protección del DDL Tracker:** Adicionalmente, se excluyó intencionalmente a la tabla `schema_migrations` del proceso de reconstrucción (los pasos de `DELETE` e `INSERT INTO`). En el caso de que el backup coincida y el Restore prosiga, se manipulan estrictamente los datos de usuario (assets, folders, boards, etc.) y se deja intacto el historial de migraciones de PostgreSQL. Esto evita discrepancias lógicas para reinicios del servicio.

## 2. Testing de Comprobación
Se incorporaron y ejecutaron exitosamente tests e2e adversariales (`yarn vitest run phase10.test.ts`):
* `5. Fase 10.5: Limita descompresion (Zip Bomb de binario)`
* `6. Fase 10.5: Limita descompresion (Zip Bomb de database.json)` (Usando payloads espurios de 105MB).
* `4. Fase 10.5: Rechaza schema_migrations incompatible (pasado/downgrade)`
* `3. Fase 10.5: Rechaza schema_migrations incompatible (futuro)`

Todos los ataques fallaron en penetrar el sistema arrojando limpios `HTTP 400`. El Workspace, PostgreSQL y CAS sobrevivieron intactos, y `public.boards` conservó su conteo en 3.
Todas las compilaciones (`cargo check` y `yarn tsc`) operaron sin warnings ajenos.
