import os
path = 'excalidraw-app/boards/host/workspace.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'throw new Error("Missing physical board data for boardId: ");',
    'throw new Error(`Missing physical board data for boardId: ${boardId}`);'
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated")
