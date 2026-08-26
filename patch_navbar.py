import os
path = "excalidraw-app/boards/ui/NavBar.tsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("const { currentFolderId, navigationHistory } = useBoardsState();", "const { currentFolderId, navigationHistory, graphVersion } = useBoardsState();")
content = content.replace("}, [repo, currentFolderId]);", "}, [repo, currentFolderId, graphVersion]);")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Patched NavBar.tsx")
