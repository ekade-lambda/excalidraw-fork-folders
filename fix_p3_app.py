import os
path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import_addition = """
import { renameFolder } from "./boards/host/folderService";
"""
content = content.replace(
    'import { hitTestFolderAtPoint } from "./boards/host/hitTest";',
    'import { hitTestFolderAtPoint } from "./boards/host/hitTest";\nimport { renameFolder } from "./boards/host/folderService";'
)

state_addition = """
  // State for Problem 3 (Rename Folder)
  const [renameCtx, setRenameCtx] = useState<{
    folderId: string;
    initialName: string;
    x: number;
    y: number;
  } | null>(null);

  const handleHostContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!excalidrawAPI) return;
    const { clientX, clientY } = event;
    const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
      { clientX, clientY },
      excalidrawAPI.getAppState(),
    );
    const hit = hitTestFolderAtPoint(
      { x: sceneX, y: sceneY },
      excalidrawAPI.getSceneElementsIncludingDeleted(),
    );

    if (hit) {
      // It's a folder or pointer, intercept native context menu
      event.preventDefault();
      event.stopPropagation();
      setRenameCtx({
        folderId: hit.folderId || hit.targetFolderId,
        initialName: hit.name || "",
        x: clientX,
        y: clientY,
      });
    } else {
      setRenameCtx(null);
    }
  };

  const handleRenameConfirm = (newName: string) => {
    if (renameCtx && newName && newName.trim() && excalidrawAPI) {
      renameFolder({
        repo: boardRepo,
        excalidrawAPI,
        folderId: renameCtx.folderId,
        newName: newName.trim(),
      }).catch(e => console.error("Rename failed", e));
    }
    setRenameCtx(null);
  };
"""

# Insert state_addition inside ExcalidrawWrapper component body, e.g. after handleCanvasDoubleClick
content = content.replace(
    '  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {',
    state_addition + '\n  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {'
)

# Add onContextMenuCapture to the div
content = content.replace(
    '      <div\n        className={clsx("excalidraw-app", {\n          "is-collaborating": isCollaborating,\n        })}\n        onDoubleClick={handleCanvasDoubleClick}\n      >',
    '      <div\n        className={clsx("excalidraw-app", {\n          "is-collaborating": isCollaborating,\n        })}\n        onDoubleClick={handleCanvasDoubleClick}\n        onContextMenuCapture={handleHostContextMenu}\n      >'
)

# Add the UI overlay for renaming
ui_addition = """
        {renameCtx && (
          <div
            style={{
              position: "absolute",
              top: renameCtx.y,
              left: renameCtx.x,
              zIndex: 999999,
              background: "white",
              padding: "4px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div 
               style={{ padding: "4px 8px", cursor: "pointer", fontWeight: "bold" }}
               onClick={() => {
                 const newName = window.prompt("New folder name:", renameCtx.initialName);
                 if (newName !== null) {
                   handleRenameConfirm(newName);
                 } else {
                   setRenameCtx(null);
                 }
               }}
            >
              Rename
            </div>
            <div 
               style={{ padding: "4px 8px", cursor: "pointer" }}
               onClick={() => setRenameCtx(null)}
            >
              Cancel
            </div>
          </div>
        )}
"""

content = content.replace(
    '        {pointerPickerPos && excalidrawAPI && (',
    ui_addition + '\n        {pointerPickerPos && excalidrawAPI && ('
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated App.tsx")
