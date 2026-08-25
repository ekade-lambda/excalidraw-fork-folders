import { cloneGraph, descendantIds } from "./graph";
import {
  generateUniqueId,
  newBoardId,
  newFolderId,
  newFolderPointerId,
} from "./ids";

import type { BoardId, BoardsGraph, FolderId, FolderPointerId } from "../types";
import type { LogicalClipboardData } from "../clipboard";

export function extractClipboardSnapshot(
  graph: BoardsGraph,
  selectedFolderIds: FolderId[],
  selectedPointerIds: FolderPointerId[],
): LogicalClipboardData | null {
  if (selectedFolderIds.length === 0 && selectedPointerIds.length === 0) {
    return null;
  }

  const uniqueSelectedFolders = new Set(selectedFolderIds);
  const rootSelectionIds = new Set<FolderId>();

  for (const fId of uniqueSelectedFolders) {
    if (fId === graph.rootFolderId) {
      continue; // Never copy root
    }
    if (!graph.folders[fId]) {
      continue;
    }

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

  const allFoldersToClone = new Set<FolderId>();
  for (const rootId of rootSelectionIds) {
    allFoldersToClone.add(rootId);
    for (const desc of descendantIds(graph, rootId)) {
      allFoldersToClone.add(desc);
    }
  }

  const uniqueSelectedPointers = new Set<FolderPointerId>();
  for (const pId of selectedPointerIds) {
    if (graph.pointers[pId]) {
      uniqueSelectedPointers.add(pId);
    }
  }

  if (allFoldersToClone.size === 0 && uniqueSelectedPointers.size === 0) {
    return null;
  }

  const clipboardGraph: BoardsGraph = {
    schemaVersion: graph.schemaVersion,
    rootFolderId: graph.rootFolderId,
    lastOpenBoardId: graph.lastOpenBoardId,
    folders: {},
    boards: {},
    pointers: {},
  };

  for (const fId of allFoldersToClone) {
    const srcFolder = graph.folders[fId];
    clipboardGraph.folders[fId] = { ...srcFolder };
    const srcBoard = graph.boards[srcFolder.boardId];
    if (srcBoard) {
      clipboardGraph.boards[srcBoard.id] = { ...srcBoard };
    }
  }

  for (const pId of uniqueSelectedPointers) {
    const srcPointer = graph.pointers[pId];
    clipboardGraph.pointers[pId] = { ...srcPointer };
  }

  return {
    graph: clipboardGraph,
    rootFolderIds: Array.from(rootSelectionIds),
    pointerIds: Array.from(uniqueSelectedPointers),
  };
}

export interface CloneFromClipboardResult {
  ok: true;
  graph: BoardsGraph;
  folderIdMap: Map<FolderId, FolderId>;
  boardIdMap: Map<BoardId, BoardId>;
  pointerIdMap: Map<FolderPointerId, FolderPointerId>;
  clonedFolderIds: Set<FolderId>;
  clonedBoardIds: Set<BoardId>;
  clonedPointerIds: Set<FolderPointerId>;
}

export type CloneFromClipboardError = {
  ok: false;
  reason: "parent-not-found" | "cycle";
};

export function cloneFromClipboard(
  clipboardData: LogicalClipboardData,
  currentGraph: BoardsGraph,
  targetFolderId: FolderId,
): CloneFromClipboardResult | CloneFromClipboardError {
  if (
    !currentGraph.folders[targetFolderId] &&
    targetFolderId !== currentGraph.rootFolderId
  ) {
    return { ok: false, reason: "parent-not-found" };
  }

  const folderIdMap = new Map<FolderId, FolderId>();
  const boardIdMap = new Map<BoardId, BoardId>();
  const pointerIdMap = new Map<FolderPointerId, FolderPointerId>();

  const clonedFolderIds = new Set<FolderId>();
  const clonedBoardIds = new Set<BoardId>();
  const clonedPointerIds = new Set<FolderPointerId>();

  const seenFolderIds = new Set(Object.keys(currentGraph.folders));
  const seenBoardIds = new Set(Object.keys(currentGraph.boards));
  const seenPointerIds = new Set(Object.keys(currentGraph.pointers));

  // Asignar IDs
  const allFolderIds = Object.keys(clipboardData.graph.folders) as FolderId[];
  for (const oldFId of allFolderIds) {
    const clonedFId = generateUniqueId(newFolderId, seenFolderIds);
    seenFolderIds.add(clonedFId);
    folderIdMap.set(oldFId, clonedFId);
    clonedFolderIds.add(clonedFId);

    const oldBoardId = clipboardData.graph.folders[oldFId].boardId;
    const clonedBId = generateUniqueId(newBoardId, seenBoardIds);
    seenBoardIds.add(clonedBId);
    boardIdMap.set(oldBoardId, clonedBId);
    clonedBoardIds.add(clonedBId);
  }

  const allPointerIds = Object.keys(
    clipboardData.graph.pointers,
  ) as FolderPointerId[];
  for (const oldPId of allPointerIds) {
    const clonedPId = generateUniqueId(newFolderPointerId, seenPointerIds);
    seenPointerIds.add(clonedPId);
    pointerIdMap.set(oldPId, clonedPId);
    clonedPointerIds.add(clonedPId);
  }

  // Prevenir ciclos en caso extremo (improbable porque pasteamos nuevos IDs,
  // pero just in case el target es uno de los que estamos intentando crear, aunque targetFolderId ya existe en currentGraph)
  // Como generamos IDs nuevos �nicos que no existen en currentGraph, un ciclo es imposible en pegados repetidos.

  const nextGraph = cloneGraph(currentGraph);

  // Instanciar Folders
  for (const oldFId of allFolderIds) {
    const srcFolder = clipboardData.graph.folders[oldFId];
    const newFId = folderIdMap.get(oldFId)!;

    // Si es ra�z de selecci�n, apunta al targetFolderId. Si no, a la copia de su padre
    const isRoot = clipboardData.rootFolderIds.includes(oldFId);
    const mappedParentId = isRoot
      ? targetFolderId
      : (folderIdMap.get(srcFolder.parentId!) as FolderId);

    nextGraph.folders[newFId] = {
      ...srcFolder,
      id: newFId,
      parentId: mappedParentId,
      boardId: boardIdMap.get(srcFolder.boardId)!,
    };
  }

  // Instanciar Boards
  for (const oldFId of allFolderIds) {
    const srcFolder = clipboardData.graph.folders[oldFId];
    const srcBoard = clipboardData.graph.boards[srcFolder.boardId];
    if (srcBoard) {
      const newBId = boardIdMap.get(srcBoard.id)!;
      nextGraph.boards[newBId] = {
        ...srcBoard,
        id: newBId,
        rootFolderId: folderIdMap.get(oldFId)!,
      };
    }
  }

  // Instanciar Pointers
  for (const oldPId of allPointerIds) {
    const srcPointer = clipboardData.graph.pointers[oldPId];
    const newPId = pointerIdMap.get(oldPId)!;

    // Si el clipboard tambi�n inclu�a el folder objetivo, apuntar al nuevo.
    // Si no, conserva el objetivo original.
    const remappedTarget =
      folderIdMap.get(srcPointer.targetFolderId) ?? srcPointer.targetFolderId;

    nextGraph.pointers[newPId] = {
      ...srcPointer,
      id: newPId,
      targetFolderId: remappedTarget,
    };
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
