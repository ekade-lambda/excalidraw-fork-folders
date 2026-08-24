import { cloneGraph, descendantIds } from "./graph";
import {
  generateUniqueId,
  newBoardId,
  newFolderId,
  newFolderPointerId,
} from "./ids";

import type {
  Board,
  BoardId,
  BoardsGraph,
  Folder,
  FolderId,
  FolderPointer,
  FolderPointerId,
} from "../types";

export interface CloneSelectionResult {
  ok: true;
  graph: BoardsGraph;
  folderIdMap: Map<FolderId, FolderId>;
  boardIdMap: Map<BoardId, BoardId>;
  pointerIdMap: Map<FolderPointerId, FolderPointerId>;
  clonedFolderIds: Set<FolderId>;
  clonedBoardIds: Set<BoardId>;
  clonedPointerIds: Set<FolderPointerId>;
}

export type CloneSelectionError = {
  ok: false;
  reason: "not-found" | "root-folder" | "parent-not-found" | "cycle";
};

export type CloneSelectionResultOrError =
  | CloneSelectionResult
  | CloneSelectionError;

export interface CloneSelectionOpts {
  folderIds: FolderId[];
  pointerIds: FolderPointerId[];
  newParentId: FolderId;
}

export function cloneSelection(
  graph: BoardsGraph,
  opts: CloneSelectionOpts,
): CloneSelectionResultOrError {
  if (!graph.folders[opts.newParentId]) {
    return { ok: false, reason: "parent-not-found" };
  }

  // 1. Validar y recolectar las raíces seleccionadas reales
  const uniqueSelectedFolders = new Set(opts.folderIds);
  const rootSelectionIds = new Set<FolderId>();

  for (const fId of uniqueSelectedFolders) {
    if (fId === graph.rootFolderId) {
      return { ok: false, reason: "root-folder" };
    }
    if (!graph.folders[fId]) {
      return { ok: false, reason: "not-found" };
    }

    // Es raíz de la selección si ningún ancestro está también seleccionado
    let isRootOfSelection = true;
    let curr = graph.folders[fId].parentId;
    while (curr !== null) {
      if (uniqueSelectedFolders.has(curr)) {
        isRootOfSelection = false;
        break;
      }
      curr = graph.folders[curr]?.parentId ?? null;
    }

    if (isRootOfSelection) {
      rootSelectionIds.add(fId);
    }
  }

  // 2. Expandir subárboles (evitando duplicados gracias al Set)
  const allFoldersToClone = new Set<FolderId>();
  for (const rootId of rootSelectionIds) {
    allFoldersToClone.add(rootId);
    for (const desc of descendantIds(graph, rootId)) {
      allFoldersToClone.add(desc);
    }
  }

  // Verificar ciclos (no podemos pegar una carpeta dentro de sí misma o sus descendientes)
  if (allFoldersToClone.has(opts.newParentId)) {
    return { ok: false, reason: "cycle" };
  }

  // Verificar pointers seleccionados
  const uniqueSelectedPointers = new Set(opts.pointerIds);
  for (const pId of uniqueSelectedPointers) {
    if (!graph.pointers[pId]) {
      return { ok: false, reason: "not-found" };
    }
  }

  // 3. Asignar nuevos IDs
  const folderIdMap = new Map<FolderId, FolderId>();
  const boardIdMap = new Map<BoardId, BoardId>();
  const pointerIdMap = new Map<FolderPointerId, FolderPointerId>();

  const clonedFolderIds = new Set<FolderId>();
  const clonedBoardIds = new Set<BoardId>();
  const clonedPointerIds = new Set<FolderPointerId>();

  const seenFolderIds = new Set(Object.keys(graph.folders));
  const seenBoardIds = new Set(Object.keys(graph.boards));
  const seenPointerIds = new Set(Object.keys(graph.pointers));

  for (const oldFId of allFoldersToClone) {
    const clonedFId = generateUniqueId(newFolderId, seenFolderIds);
    seenFolderIds.add(clonedFId);
    folderIdMap.set(oldFId, clonedFId);
    clonedFolderIds.add(clonedFId);

    const oldBoardId = graph.folders[oldFId].boardId;
    const clonedBId = generateUniqueId(newBoardId, seenBoardIds);
    seenBoardIds.add(clonedBId);
    boardIdMap.set(oldBoardId, clonedBId);
    clonedBoardIds.add(clonedBId);
  }

  for (const oldPId of uniqueSelectedPointers) {
    const clonedPId = generateUniqueId(newFolderPointerId, seenPointerIds);
    seenPointerIds.add(clonedPId);
    pointerIdMap.set(oldPId, clonedPId);
    clonedPointerIds.add(clonedPId);
  }

  // 4. Clonar el grafo inmutable
  const nextGraph = cloneGraph(graph);

  // 5. Instanciar Folders clonados
  for (const oldFId of allFoldersToClone) {
    const srcFolder = graph.folders[oldFId];
    const newFId = folderIdMap.get(oldFId)!;

    // Si era una de las raíces seleccionadas, su parent es el destino explícito.
    // Si es un descendiente, su parent es la versión clonada de su parent original.
    const mappedParentId = rootSelectionIds.has(oldFId)
      ? opts.newParentId
      : (folderIdMap.get(srcFolder.parentId!) as FolderId);

    const clonedFolder: Folder = {
      ...srcFolder,
      id: newFId,
      parentId: mappedParentId,
      boardId: boardIdMap.get(srcFolder.boardId)!,
    };
    nextGraph.folders[newFId] = clonedFolder;
  }

  // 6. Instanciar Boards clonados
  for (const oldFId of allFoldersToClone) {
    const srcFolder = graph.folders[oldFId];
    const srcBoard = graph.boards[srcFolder.boardId];
    if (srcBoard) {
      const newBId = boardIdMap.get(srcBoard.id)!;
      const clonedBoard: Board = {
        ...srcBoard,
        id: newBId,
        rootFolderId: folderIdMap.get(oldFId)!,
      };
      nextGraph.boards[newBId] = clonedBoard;
    }
  }

  // 7. Instanciar Pointers clonados con regla de remapeo estricta
  for (const oldPId of uniqueSelectedPointers) {
    const srcPointer = graph.pointers[oldPId];
    const newPId = pointerIdMap.get(oldPId)!;

    // Regla fundamental: si el targetFolderId fue clonado, apunta al nuevo.
    // Si no, conserva el original.
    const remappedTarget =
      folderIdMap.get(srcPointer.targetFolderId) ?? srcPointer.targetFolderId;

    const clonedPointer: FolderPointer = {
      ...srcPointer,
      id: newPId,
      targetFolderId: remappedTarget,
    };
    nextGraph.pointers[newPId] = clonedPointer;
  }

  return {
    ok: true,
    graph: nextGraph,
    folderIdMap,
    boardIdMap,
    pointerIdMap,
    clonedFolderIds,
    clonedBoardIds,
    clonedPointerIds,
  };
}
