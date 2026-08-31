import os

path = "excalidraw-app/tests/boards/deleteOrchestration.test.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'customData: { type: "board-folder", folderId: (r1 as any).folderId }',
    'customData: { folderBoard: { kind: "folder", folderId: (r1 as any).folderId } }'
)
content = content.replace(
    'customData: {\n          type: "board-folder-text",\n          folderId: (r1 as any).folderId,\n        }',
    'customData: {\n          folderBoard: { kind: "text", folderId: (r1 as any).folderId }\n        }'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
