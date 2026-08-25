import os

path = 'excalidraw-app/boards/host/boardService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace board.id with boardData.id
content = content.replace('board.id', 'boardData.id')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Fixed boardService.ts instrumentation scope")
