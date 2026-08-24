import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { DeleteFolderPatch, DeletePointerPatch } from "../domain/delete";
import type { BoardsGraph } from "../types";
import type { BoardRepository } from "../repository/BoardRepository";

/**
 * Reconcilia un array de elementos Excalidraw con un parche de borrado.
 * Pura, sin efectos laterales.
 * Marca como isDeleted: true aquellos elementos visuales afectados.
 */
export function reconcileElements(
  elements: readonly ExcalidrawElement[],
  patch: DeleteFolderPatch | DeletePointerPatch,
): { elements: ExcalidrawElement[]; changed: boolean } {
  const deletedFolders = new Set(
    "deletedFolderIds" in patch ? patch.deletedFolderIds : [],
  );
  const deletedPointers = new Set(patch.deletedPointerIds);

  let changed = false;
  const nextElements = elements.map((el) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (el as any).customData?.folderBoard;
    if (!meta) {
      return el;
    }

    let shouldDelete = false;

    if (meta.kind === "folder") {
      if (deletedFolders.has(meta.folderId)) {
        shouldDelete = true;
      }
    } else if (meta.kind === "pointer") {
      if (deletedPointers.has(meta.pointerId)) {
        shouldDelete = true;
      }
      // Regla Crítica: si el folder destino muere, el pointer visual muere.
      if (meta.targetFolderId && deletedFolders.has(meta.targetFolderId)) {
        shouldDelete = true;
      }
    }

    if (shouldDelete && !el.isDeleted) {
      changed = true;
      return { ...el, isDeleted: true };
    }

    return el;
  });

  return { elements: nextElements, changed };
}

/**
 * Inspecciona los boards supervivientes en la gráfica y actualiza sus payloads
 * en el repositorio si contienen elementos que deben ser marcados isDeleted.
 */
export async function reconcileSurvivingBoards(
  graph: BoardsGraph,
  patch: DeleteFolderPatch | DeletePointerPatch,
  repo: BoardRepository,
): Promise<void> {
  const survivingBoardIds = Object.keys(graph.boards);

  for (const boardId of survivingBoardIds) {
    const payload = await repo.loadBoard(boardId);
    if (!payload) {
      continue;
    }

    const { elements, changed } = reconcileElements(payload.elements, patch);

    if (changed) {
      await repo.saveBoard({ ...payload, elements });
    }
  }
}
