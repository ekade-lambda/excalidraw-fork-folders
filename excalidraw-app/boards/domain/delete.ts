/**
 * Delete transaccional (dominio puro — Fase 0).
 *
 * Eliminar una folder borra: la folder, sus descendientes, sus Boards y todos
 * los pointers cuyo targetFolderId pertenezca al conjunto eliminado. La raíz
 * no puede eliminarse. El grafo original NO se muta: se devuelve un grafo
 * nuevo (la operación es atómica desde la perspectiva del dominio).
 *
 * Nota: la eliminación de REPRESENTACIONES VISUALES (elementos de Excalidraw)
 * pertenece a fases posteriores (integración); aquí solo se modela el grafo.
 */

import { cloneGraph, descendantIds } from "./graph";

import type { BoardId, BoardsGraph, FolderId, FolderPointerId } from "../types";

export type DeleteFolderResult =
  | {
      ok: true;
      graph: BoardsGraph;
      deletedFolderIds: FolderId[];
      deletedBoardIds: BoardId[];
      deletedPointerIds: FolderPointerId[];
    }
  | { ok: false; reason: "root-folder" | "not-found" };

export function deleteFolder(
  graph: BoardsGraph,
  folderId: FolderId,
): DeleteFolderResult {
  if (folderId === graph.rootFolderId) {
    return { ok: false, reason: "root-folder" };
  }
  if (!graph.folders[folderId]) {
    return { ok: false, reason: "not-found" };
  }

  const deletedFolderIds = [folderId, ...descendantIds(graph, folderId)];
  const deletedFolderSet = new Set<FolderId>(deletedFolderIds);

  // Boards de las folders eliminadas.
  const deletedBoardIds: BoardId[] = [];
  for (const id of deletedFolderIds) {
    const boardId = graph.folders[id]?.boardId;
    if (boardId) {
      deletedBoardIds.push(boardId);
    }
  }
  const deletedBoardSet = new Set<BoardId>(deletedBoardIds);

  // Pointers que apuntan a alguna folder eliminada.
  const deletedPointerIds: FolderPointerId[] = Object.values(graph.pointers)
    .filter((p) => deletedFolderSet.has(p.targetFolderId))
    .map((p) => p.id);

  const next = cloneGraph(graph);
  for (const id of deletedFolderIds) {
    delete next.folders[id];
  }
  for (const id of deletedBoardIds) {
    delete next.boards[id];
  }
  for (const id of deletedPointerIds) {
    delete next.pointers[id];
  }

  // Si el board que estaba abierto fue eliminado, apuntamos a la raíz.
  if (next.lastOpenBoardId && deletedBoardSet.has(next.lastOpenBoardId)) {
    const rootBoardId = graph.folders[graph.rootFolderId]?.boardId ?? null;
    next.lastOpenBoardId = rootBoardId;
  }

  return {
    ok: true,
    graph: next,
    deletedFolderIds,
    deletedBoardIds,
    deletedPointerIds,
  };
}
