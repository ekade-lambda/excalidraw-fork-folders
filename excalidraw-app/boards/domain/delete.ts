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

export interface DeleteFolderPatch {
  deletedFolderIds: FolderId[];
  deletedBoardIds: BoardId[];
  deletedPointerIds: FolderPointerId[];
}

export interface DeletePointerPatch {
  deletedPointerIds: FolderPointerId[];
}

export type DeleteFolderResult =
  | { ok: true; patch: DeleteFolderPatch }
  | { ok: false; reason: "root-folder" | "not-found" };

export type DeletePointerResult =
  | { ok: true; patch: DeletePointerPatch }
  | { ok: false; reason: "not-found" };

/**
 * Fase 7.1 — Domain: Calcula de manera determinista qué entidades lógicas
 * deben ser eliminadas al borrar un Folder. NO modifica el grafo todavía.
 */
export function prepareDeleteFolderPatch(
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

  const deletedBoardIds: BoardId[] = [];
  for (const id of deletedFolderIds) {
    const boardId = graph.folders[id]?.boardId;
    if (boardId) {
      deletedBoardIds.push(boardId);
    }
  }

  // Solo se incluyen Pointers cuyo targetFolderId pertenece al subárbol.
  // Los Pointers físicos dentro de los boards eliminados se agregarán
  // a este array posteriormente en el servicio.
  const deletedPointerIds: FolderPointerId[] = Object.values(graph.pointers)
    .filter((p) => deletedFolderSet.has(p.targetFolderId))
    .map((p) => p.id);

  return {
    ok: true,
    patch: {
      deletedFolderIds,
      deletedBoardIds,
      deletedPointerIds,
    },
  };
}

/**
 * Fase 7.1 — Domain: Calcula qué entidades deben ser eliminadas
 * al borrar un Pointer.
 */
export function prepareDeletePointerPatch(
  graph: BoardsGraph,
  pointerId: FolderPointerId,
): DeletePointerResult {
  if (!graph.pointers[pointerId]) {
    return { ok: false, reason: "not-found" };
  }

  return {
    ok: true,
    patch: {
      deletedPointerIds: [pointerId],
    },
  };
}

/**
 * Fase 7.1 — Domain: Aplica un parche de eliminación al grafo devolviendo
 * un grafo clonado y mutado, resolviendo orfandad de navegación.
 */
export function applyDeletePatch(
  graph: BoardsGraph,
  patch: DeleteFolderPatch | DeletePointerPatch,
): BoardsGraph {
  const next = cloneGraph(graph);

  const deletedFolders =
    "deletedFolderIds" in patch ? patch.deletedFolderIds : [];
  const deletedBoards = "deletedBoardIds" in patch ? patch.deletedBoardIds : [];
  const deletedPointers = patch.deletedPointerIds;

  for (const id of deletedFolders) {
    delete next.folders[id];
  }
  for (const id of deletedBoards) {
    delete next.boards[id];
  }
  for (const id of deletedPointers) {
    delete next.pointers[id];
  }

  // Ajustar navegación si el último board abierto fue borrado
  const deletedBoardSet = new Set<BoardId>(deletedBoards);
  if (next.lastOpenBoardId && deletedBoardSet.has(next.lastOpenBoardId)) {
    const rootBoardId = graph.folders[graph.rootFolderId]?.boardId ?? null;
    next.lastOpenBoardId = rootBoardId;
  }

  return next;
}
