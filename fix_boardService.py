import os
import re

path = 'excalidraw-app/boards/host/boardService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

if 'utf8ToBase64' not in content:
    content = content.replace(
        'import {',
        'import { utf8ToBase64 } from "./materialize";\nimport {',
        1
    )

normalization_code = """
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
            return { ...f, dataURL: base64DataUrl as any };
          } catch (e) {
            return f;
          }
        }
      }
      return f;
    });

    excalidrawAPI.addFiles(normalizedFiles);"""

content = re.sub(r'    // \[INSTRUMENTACION TEMPORAL\].*?excalidrawAPI\.addFiles\(files\);', normalization_code, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated boardService.ts")
