import os

path = 'excalidraw-app/boards/host/materialize.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('function utf8ToBase64', 'export function utf8ToBase64')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Exported utf8ToBase64")
