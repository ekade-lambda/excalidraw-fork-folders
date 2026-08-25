import os

# 1. Clean folderService.ts
path = 'excalidraw-app/boards/host/folderService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('  // [INSTRUMENTACION TEMPORAL]')
end_idx = content.find('  // [/INSTRUMENTACION TEMPORAL]\n') + len('  // [/INSTRUMENTACION TEMPORAL]\n')
if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + content[end_idx:]
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print(f"Cleaned {path}")

# 2. Add Normalization in boardService.ts
path = 'excalidraw-app/boards/host/boardService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure utf8ToBase64 is imported
if 'utf8ToBase64' not in content:
    content = content.replace(
        'import {',
        'import { utf8ToBase64 } from "./materialize";\nimport {',
        1
    )

start_idx = content.find('      // [INSTRUMENTACION TEMPORAL]')
end_idx = content.find('      // [/INSTRUMENTACION TEMPORAL]\n') + len('      // [/INSTRUMENTACION TEMPORAL]\n')

normalization_code = """
      // Normalización en tiempo de ejecución para archivos antiguos URI-encoded
      const normalizedFiles = files.map((f) => {
        if (
          f.mimeType === "image/svg+xml" &&
          f.dataURL.startsWith("data:image/svg+xml;charset=utf-8,")
        ) {
          const payload = f.dataURL.slice(f.dataURL.indexOf(",") + 1);
          if (/%/.test(payload)) {
            try {
              const decodedSvg = decodeURIComponent(payload);
              const base64DataUrl = `data:image/svg+xml;base64,${utf8ToBase64(decodedSvg)}`;
              // Clonamos para no mutar el objeto original en memoria
              return { ...f, dataURL: base64DataUrl as any };
            } catch (e) {
              // Si falla la decodificación, se pasa intacto
              return f;
            }
          }
        }
        return f;
      });

"""

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + normalization_code + content[end_idx:]
    content = content.replace('excalidrawAPI.addFiles(files);', 'excalidrawAPI.addFiles(normalizedFiles);')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print(f"Updated {path}")
else:
    print(f"Could not find instrumentation block in {path}")
