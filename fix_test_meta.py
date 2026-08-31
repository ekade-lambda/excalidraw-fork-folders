import os

path = "excalidraw-app/tests/boards/deleteOrchestration.test.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    'folderBoard: { kind: "folder", folderId: (r1 as any).folderId }',
    'folderBoard: { kind: "folder", role: "image", folderId: (r1 as any).folderId }'
)
content = content.replace(
    'folderBoard: { kind: "text", folderId: (r1 as any).folderId }',
    'folderBoard: { kind: "folder", role: "text", folderId: (r1 as any).folderId }'
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
