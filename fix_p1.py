import os
path = 'excalidraw-app/boards/host/folderService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

import_addition = """import { boardsStoreActions } from "./boardState";
import { saveCurrentBoard } from "./boardService";
"""
content = content.replace('import { buildFolderVisual } from "./materialize";', import_addition + 'import { buildFolderVisual } from "./materialize";')

sync_addition = """
  // Problema 1: Sincronizar la memoria activa del editor con el repositorio ANTES de leer
  // parentData, para garantizar que los elementos recién borrados tengan isDeleted: true.
  const currentBoardId = boardsStoreActions.getCurrentBoardId();
  if (parentBoardId === currentBoardId) {
    await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
  }
"""
content = content.replace(
    'const parentBoardId = addResult.graph.folders[parentFolderId].boardId;',
    'const parentBoardId = addResult.graph.folders[parentFolderId].boardId;' + sync_addition
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated folderService.ts")
