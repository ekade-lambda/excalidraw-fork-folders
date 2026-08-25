import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    'onPointerDown={() => setRenameCtx({ ...renameCtx, editing: true })}',
    'onPointerDown={(e) => { e.preventDefault(); setRenameCtx({ ...renameCtx, editing: true }); }}'
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Added preventDefault")
