import os

path = 'excalidraw-app/tests/boards/folderRename.ui.test.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Modify fireEvent.click to fireEvent.pointerDown
content = content.replace(
    'fireEvent.click(screen.getByText("Rename"));',
    '''
    // Simulamos pointerDown sobre Rename
    const renameBtn = screen.getByText("Rename");
    fireEvent.pointerDown(renameBtn);

    // Simulamos que Excalidraw cierra su context-menu en pointerdown (como lo hace en la realidad)
    const ctxMenu = document.querySelector(".context-menu");
    if (ctxMenu) ctxMenu.remove();
    '''
)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print("Updated UI test!")
