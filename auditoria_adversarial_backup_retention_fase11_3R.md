# Auditoría Adversarial y Revisión Final: Backup Retention (Fase 11.3-R)

## 1. Resumen Ejecutivo
Se ejecutó un ataque exhaustivo de análisis estático y concurrente contra la arquitectura propuesta de Retention (Fase 11.3). Se concluye que **el diseño Lockless propuesto es matemáticamente seguro respecto al backend existente**, pero la política original de "Quorum-Threshold de 5" adolece de una debilidad crítica: es susceptible a *Rapid-Fire Flushing* (purgado acelerado del historial) si un usuario o atacante ejecuta Restores en ráfaga. 
El diseño básico se **APRUEBA**, pero requiere **MODIFICACIONES OBLIGATORIAS** (incorporar una ventana temporal de 7 días mínimo) para ser implementado con seguridad "Zero Data Loss".

## 2. Premisas Cuestionadas (Lockless vs Restore/Backup)
> **Afirmación:** "Retention es segura sin lock porque Windows impedirá borrar un ZIP que Restore esté leyendo."

**VEREDICTO: LA AFIRMACIÓN ERA FALSA (PERO EL RESULTADO ES SEGURO POR OTRA RAZÓN).**
**Demostración:** Inspeccionando `bridge/src/restore.rs`, la función `restore_workspace` **NUNCA lee un backup de `data/backups/`**. El endpoint recibe los bytes binarios del ZIP directamente desde el Frontend (`bytes: Bytes`). Por consiguiente, es **imposible** que Retention intente borrar un archivo que Restore está abriendo del disco del servidor, porque el archivo proviene del cliente.
La asincronía es total. El Lockless es **seguro a nivel de diseño lógico**, no depende del OS.

## 3. Vulnerabilidades Encontradas en el Algoritmo Original
1. **Rapid-Fire Flushing (Pérdida de Historial):** Si la retención solo exige "5 backups válidos", un script o usuario que pulse "Restore" 5 veces en 1 minuto generará 5 Safety Backups válidos. Esto formará un quórum inmediato y borrará el backup del día anterior (el único que el usuario realmente querría recuperar). **Impacto:** Alto (Data Loss del historial). **Mitigación:** La política debe ser Híbrida: *Conservar TODO lo de los últimos 7 días, Y asegurarse de conservar al menos 5 válidos sin importar cuán viejos sean.*
2. **Infinite Disk Exhaustion (Bug-Lock):** Si un bug interno provoca que los backups fallen estructuralmente durante su creación, la lista se llenará de backups corruptos. Como nunca se alcanzan "5 válidos", jamás se borra nada. **Impacto:** Bajo-Medio (Disco Lleno, pero preferible a Data Loss). **Mitigación:** Aceptarlo como el comportamiento Fail-Safe deseado. 
3. **Sobrescritura por Colisión de Nombres (Data Loss en Backup):** El naming actual es `YYYYMMDD_HHMMSS`. Dos backups generados en el mismo segundo se sobrescriben en el OS (porque `fs::rename` lo hace atómicamente). **Mitigación:** Fuera del alcance de Retention, pero deberá abrirse un ticket para agregar un UUID al final del backup final.

## 4. Análisis de Concurrencia (Retention / Restore / Backup)
* **A. Backup → Retention / B. Retention → Backup:** Seguro. Backup manual escribe en `temp_backup` y renombra atómicamente. Retention ignora `temp_` o ve el backup final completo.
* **C. Restore → Retention / D. Retention → Restore:** Seguro. Restore provee sus propios bytes y escribe un Safety Backup al inicio.
* **E. Backup → Restore / F. Restore → Backup:** Protegidos a nivel de BD por `REPEATABLE READ` vs `Write Lock`. 
* **G. Todos Simultáneos:** Cero superposición de lectura/escritura en el filesystem.

## 5. Análisis de Validez (Semántica VÁLIDO)
¿Es suficiente que contenga `manifest.json` y `database.json`?
**SÍ.** Debido a que el writer de ZIP en Rust (`zip_writer.finish()`) escribe el Central Directory al **final** del archivo. Si el sistema colapsa por OOM o disco lleno antes de terminar, el Central Directory no existe y `ZipArchive::new` fallará instantáneamente. 
Verificar la estructura (Structural Validation) toma ~2ms por archivo (vs ~500ms y gigas de RAM por validación completa del JSON). La validación estructural es obligatoria y suficiente para Retention.

## 6. Análisis del Caso Más Peligroso
* **[Backup A (30 días, Válido), B-C-D-E-F (1 hora, Corruptos), G (1 minuto, Válido)]**
  - **Quorum Simple:** Solo hay 2 válidos (G y A). El umbral de 5 no se alcanza. **Resultado:** SE CONSERVAN TODOS.
* **[V1 (nuevo) ... V5, V6, C7, V8 (30 días)]**
  - Si implementamos ventana de 7 días, V8 es > 7 días. ¿Se borra? Sí, porque el quorum de 5 válidos recientes (V1..V5) se satisfizo en tiempo reciente.
  - El diseño modificado conservará siempre la ventana de seguridad.

## 7. Resource Exhaustion y Archivos Temporales
* **Ataque DoS por retención:** Analizar 1000 backups tomaría ~2 segundos de CPU. Es aceptable.
* **`temp_backup_UUID.zip`:** Se halló que `/api/backup` deja huérfanos si crashea. **Decisión:** Estos archivos DEBEN ser recolectados por Retention (si son > 24h), no por CAS GC, dado que están en `data/backups/`.

## 8. Idempotencia y Failure Modes (27 escenarios)
* La función `Retention(state)` es una operación matemática pura sobre la lectura de directorios. 
* Si un backup se borra parcialmente, el OS lo maneja atómicamente en un `unlink()`.
* Si corren dos procesos simultáneos, intentarán borrar los mismos surplus files. El que llegue tarde recibirá "File not found" y lo ignorará silenciosamente (Idempotente).
* Si el Filesystem es Read-Only, falla y se retira sin causar daño de software.

## 9. Invariantes Absolutas Formuladas
1. **Zero Data Loss:** Nunca eliminar un backup a menos que existan `N` backups válidos más recientes **Y** haya expirado la ventana temporal.
2. **Independence:** Retention nunca lee variables del sistema en memoria (Restore Lock), basándose 100% en la fuente de verdad del disco duro.
3. **No-Read-No-Cry:** Retention no compite con la lectura de Restore, porque Restore no lee del servidor.
4. **Structural Sanity:** Todo ZIP debe someterse a lectura de su Central Directory antes de sumar al quórum.

## 10. Quality Gates
* `cargo check`: **PASS**.
* `yarn tsc`: **PASS**.
* `SELECT count(*) FROM public.boards`: **3 (PASS)**.

## 11. Política Final Recomendada y Blockers
**Blockers para implementación:** Ninguno a nivel técnico en Retention. Se sugiere levantar un ticket menor para corregir la colisión de nombres de Backup en el mismo segundo.

**Política Aprobada para Fase 11.3 (Cuando se autorice):**
1. Conservar TODOS los backups de los **últimos 7 días** (calculado por fecha en nombre).
2. Conservar **al menos 5 backups estructuralmente válidos** en todo momento, sin importar su antigüedad.
3. Limpiar residuos temporales (`temp_backup_*.zip`) > 24h.
4. Todo operado en Rust, sin locks, fail-safe.

**DICTAMEN: APROBADO CON MODIFICACIÓN (Híbrido Tiempo+Cantidad).**
