import os

path = 'excalidraw-app/tests/boards/folderRename.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('const renameBtn = screen.getByText("Rename");', 'fireEvent.pointerDown(screen.getByText("Rename"));')
content = content.replace('fireEvent.pointerDown(renameBtn);', '')
content = content.replace('const ctxMenu = document.querySelector(".context-menu");\n    if (ctxMenu) ctxMenu.remove();', 'document.querySelector(".context-menu")?.remove();')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated UI test again!")
