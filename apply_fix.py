import os

path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update syncPosition
old_sync = 'const isEditing = !!renameElement.querySelector("input");'
new_sync = 'const isEditing = !!renameElement.querySelector("input") || renameElement.getAttribute("data-editing") === "true";'
content = content.replace(old_sync, new_sync)

# Update onClick -> onPointerDown
old_click = 'onClick={() => setRenameCtx({ ...renameCtx, editing: true })}'
new_click = '''onPointerDown={(e) => {
                  e.currentTarget.closest(".board-rename-ui")?.setAttribute("data-editing", "true");
                  setRenameCtx({ ...renameCtx, editing: true });
                }}'''
content = content.replace(old_click, new_click)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated App.tsx")
