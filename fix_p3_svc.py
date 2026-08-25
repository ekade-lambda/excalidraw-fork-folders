import os
path = 'excalidraw-app/boards/host/folderService.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

rename_function = """

export async function renameFolder(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  folderId: FolderId;
  newName: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { repo, excalidrawAPI, folderId, newName } = opts;

  // 1. Update domain graph
  const graph = await repo.load();
  if (!graph) return { ok: false, reason: "no-graph" };
  const folder = graph.folders[folderId];
  if (!folder) return { ok: false, reason: "folder-not-found" };
  
  folder.name = newName;
  folder.updatedAt = Date.now();
  
  const boardId = folder.boardId;
  const board = graph.boards[boardId];
  if (board) {
    board.name = newName;
    board.updatedAt = Date.now();
  }
  
  await repo.save(graph);

  // 2. Locate text element in currently active scene and update it visually
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const folderVisual = findFolderVisual(elements, folderId);
  
  if (folderVisual && folderVisual.text) {
    const textEl = folderVisual.text as ExcalidrawTextElement;
    // Classic mutation pattern in Excalidraw
    const mutated = {
      ...textEl,
      text: newName,
      originalText: newName,
      width: Math.max(120, newName.length * 10), // Aprox resizing
    };
    
    const nextElements = elements.map(e => e.id === textEl.id ? mutated : e);
    
    // Use CaptureUpdateAction.NEVER so it avoids diverging if user calls Undo
    excalidrawAPI.updateScene({
      elements: nextElements,
      // @ts-ignore
      captureUpdate: 0, // NEVER
    });
  }

  return { ok: true };
}
"""

content = content + rename_function
content = content.replace(
    'import { buildFolderVisual } from "./materialize";',
    'import { buildFolderVisual, findFolderVisual } from "./materialize";\nimport type { ExcalidrawTextElement } from "@excalidraw/element/types";'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Added renameFolder")
