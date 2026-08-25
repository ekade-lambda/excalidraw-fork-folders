import os
path = 'excalidraw-app/boards/types.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '  lastOpenBoardId: BoardId | null;\n}',
    '  lastOpenBoardId: BoardId | null;\n  /** Contador monotónico para generación de nombres por defecto. */\n  folderCounter?: number;\n}'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated types.ts")
