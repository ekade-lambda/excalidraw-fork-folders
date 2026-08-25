import os
path = 'excalidraw-app/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_hit = """    const hit = hitTestFolderAtPoint(
      { x: sceneX, y: sceneY },
      excalidrawAPI.getSceneElementsIncludingDeleted(),
    );

    if (hit) {"""

new_hit = """    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const hit = hitTestFolderAtPoint(elements, { x: sceneX, y: sceneY });

    if (hit.kind !== "none") {
      let fId = hit.kind === "folder" ? hit.folderId : hit.targetFolderId;
      let initialName = "";
      for (const el of elements) {
         const m = el.customData?.folderBoard;
         if (m && (m.folderId === fId || m.targetFolderId === fId) && m.role === "text") {
            initialName = el.text || "";
            break;
         }
      }
"""

content = content.replace(old_hit, new_hit)
content = content.replace(
    '        folderId: hit.folderId || hit.targetFolderId,\n        initialName: hit.name || "",',
    '        folderId: fId,\n        initialName: initialName,'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed App.tsx types")
