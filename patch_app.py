import os

path = "excalidraw-app/App.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

import_delete = "import { renameFolder, deleteFolder } from \"./boards/host/folderService\";"

if "deleteFolder" not in content:
    content = content.replace(
        "import { renameFolder } from \"./boards/host/folderService\";",
        import_delete
    )

delete_func = """
  const handleDeleteFolder = () => {
    if (renameCtx && excalidrawAPI) {
      deleteFolder({
        repo: boardRepo,
        excalidrawAPI,
        folderId: renameCtx.folderId,
      }).catch((e) => console.error("Delete failed", e));
    }
    setRenameCtx(null);
  };
"""

if "handleDeleteFolder" not in content:
    content = content.replace(
        "const handleRenameConfirm = (newName: string) => {",
        delete_func + "\n  const handleRenameConfirm = (newName: string) => {"
    )

delete_button = """
              <div
                onClick={handleDeleteFolder}
                style={{
                  padding: "4px 8px",
                  cursor: "pointer",
                  color: "red",
                  borderTop: "1px solid #ccc",
                }}
              >
                Delete
              </div>
"""

if ">Delete<" not in content and "handleDeleteFolder" in content:
    content = content.replace(
        "Rename\n              </div>\n            )}",
        "Rename\n              </div>\n" + delete_button + "            )}"
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
