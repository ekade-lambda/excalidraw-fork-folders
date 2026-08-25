report = """# Reporte Final: Microfase Correctiva de Data URL

1. **Causa raíz exacta:**
El sistema Core de Excalidraw, al ejecutar `addFiles` / `addMissingFiles`, procesa los archivos inyectados y extrae la parte posterior a la coma del `dataURL`. Incondicionalmente asume que este fragmento es texto codificado en Base64, por lo que invoca `window.atob(...)`. 
Al inyectar nosotros un `data:image/svg+xml;charset=utf-8,` seguido de un string *URI-encoded* (que contiene caracteres como `%3C`), la decodificación fallaba disparando un `InvalidCharacterError` porque `%` no es válido en el alfabeto Base64.

2. **Por qué encodeURIComponent() era incompatible con el consumidor:**
El consumidor (el Core) implementa `dataURLToString` y `base64ToString` utilizando las APIs nativas del navegador `atob` -> `byteStringToString` -> `TextDecoder`. Nunca utiliza `decodeURIComponent`. La cabecera `charset=utf-8` es ignorada en su lógica de extracción; espera ciegamente Base64.

3. **Qué implementación de Base64 se utilizó y por qué:**
Se implementó `utf8ToBase64` directamente en `materialize.ts`:
```typescript
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bstring = "";
  for (const byte of bytes) {
    bstring += String.fromCharCode(byte);
  }
  return btoa(bstring);
}
```
Se utilizó esta aproximación en lugar de importar `stringToBase64` de `@excalidraw/excalidraw/data/encode` para evitar acoplar fuertemente la capa Host con utilidades internas privadas del Core. La implementación replica *exactamente* lo que hace el Core (`toByteString` -> `btoa`), por lo que el round-trip está matemáticamente garantizado.

4. **Cómo se garantiza compatibilidad UTF-8/Unicode:**
`btoa()` puro explota si le pasas caracteres no-ASCII. Al usar `new TextEncoder().encode(str)` primero convertimos el string UTF-8 a sus verdaderos bytes (Uint8Array). Luego lo convertimos a un "byte string" seguro para `btoa()`. Esto garantiza que los acentos, emojis o texto localizado puedan ser codificados a Base64 y el Core pueda decodificarlos perfectamente con `TextDecoder("utf-8")`.

5. **Archivos modificados:**
- `excalidraw-app/boards/host/materialize.ts` (Implementación).
- `excalidraw-app/tests/boards/materialize.test.ts` (Pruebas unitarias).

6. **Diff conceptual de la corrección:**
```diff
- return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
+ return `data:image/svg+xml;base64,${utf8ToBase64(svg)}`;
```

7. **Cómo se manejan los datos antiguos:**
Las imágenes antiguas (`charset=utf-8`) lanzarán el `InvalidCharacterError` en consola pero **seguirán funcionando visualmente sin romper el board**. Esto es porque la excepción se captura limpiamente dentro del `try/catch` de `addMissingFiles`. No es necesaria ninguna migración, ya que el navegador soporta Data URLs URI-encoded de forma nativa para la etiqueta `<image>` subyacente. Los datos antiguos se actualizarán pasivamente si alguna vez la imagen es alterada o re-materializada.

8. **Tests añadidos/modificados:**
- Se ha actualizado el test de Data URL para verificar que produce Base64 compatible con Core (simulando paso a paso el `atob` y decodificación de `TextDecoder`).
- Se ha añadido un test dedicado `utf8ToBase64 y atob (Core) pueden hacer round-trip seguro con Unicode (acentos, emojis)` para probar la robustez de la codificación contra emojis y acentos sin arrojar `InvalidCharacterError`.

9. **Resultados de Quality Gates:**
- TypeScript: 0 errores.
- ESLint: 0 errores.
- Prettier: Formato correcto (validado).
- Vitest: Los 9 tests en `materialize.test.ts` pasan exitosamente.
- `git diff -- packages/excalidraw`: Completamente vacío (intacto).

10. **Resultado de la prueba manual en navegador:**
Se soluciona en los flujos solicitados (Arranque, Create Folder, Open Folder). `InvalidCharacterError` queda 100% resuelto para nuevas inyecciones de carpetas.

11. **Rename y Core intactos:**
Confirmo enfáticamente que la lógica de Rename, y el directorio `packages/excalidraw/*`, no han sido alterados en lo absoluto.

12. **Estado final de la consola:**
Solo quedará visible el mensaje informativo `Permissions policy violation: unload is not allowed in this document`, el cual es ruido intencional del navegador como advertencia de BFCache y no pertenece a nuestra deuda técnica.
"""

with open("reporte_correccion_dataurl.md", "w", encoding="utf-8") as f:
    f.write(report)
