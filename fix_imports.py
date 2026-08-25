import os
path = 'excalidraw-app/boards/host/workspace.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'import type { BinaryFileData, FileId } from "@excalidraw/element/types";',
    'import type { FileId } from "@excalidraw/element/types";\nimport type { BinaryFileData } from "@excalidraw/excalidraw/types";'
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated")
