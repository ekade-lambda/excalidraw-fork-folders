/**
 * Copy / cloneSubtree (dominio puro — Fase 0).
 *
 * Clona la estructura del grafo (folders + boards + pointers) y remapea ids,
 * parentIds y referencias. La copia del CONTENIDO (elementos Excalidraw /
 * archivos) pertenece a la persistencia e integración (Fases 1 y 8):
 *   - copiar una Folder ⇒ ids NUEVOS (folder, boards); nunca se reutiliza el id.
 *   - copiar un FolderPointer ⇒ id NUEVO de pointer, conservando targetFolderId.
 */

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

export interface CloneSubtreeResult {
  ok: true;
  graph: BoardsGraph;
  newRootFolderId: FolderId;
  newRootBoardId: BoardId;
  folderIdMap: Map<FolderId, FolderId>;
  boardIdMap: Map<BoardId, BoardId>;
  pointerIdMap: Map<FolderPointerId, FolderPointerId>;
  newPointerIds: FolderPointerId[];
}

export type CloneSubtreeError = {
  ok: false;
  reason: "not-found" | "root-folder" | "parent-not-found" | "cycle";
};

export type CloneSubtreeResultOrError = CloneSubtreeResult | CloneSubtreeError;

export function cloneSubtree(
  graph: BoardsGraph,
  folderId: FolderId,
  opts: { newParentId: FolderId; cloneInternalPointers?: boolean },
): CloneSubtreeResultOrError {
  const cloneInternalPointers = opts.cloneInternalPointers ?? true;
  const sourceRoot = graph.folders[folderId];
  if (!sourceRoot) {
    return { ok: false as const, reason: "not-found" };
  }
  if (folderId === graph.rootFolderId) {
    return { ok: false as const, reason: "root-folder" };
  }
  if (!graph.folders[opts.newParentId]) {
    return { ok: false as const, reason: "parent-not-found" };
  }

  const subset = [folderId, ...descendantIds(graph, folderId)];
  const subsetIds = new Set<FolderId>(subset);
  if (subsetIds.has(opts.newParentId)) {
    return { ok: false as const, reason: "cycle" };
  }

  const folderIdMap = new Map<FolderId, FolderId>();
  const boardIdMap = new Map<BoardId, BoardId>();
  const seenFolderIds = new Set(Object.keys(graph.folders));
  const seenBoardIds = new Set(Object.keys(graph.boards));

  // 1) Asignar ids nuevos a todas las folders y boards del subconjunto.
  for (const oldFolder of subset) {
    const folder = graph.folders[oldFolder];
    const clonedFolderId = generateUniqueId(newFolderId, seenFolderIds);
    seenFolderIds.add(clonedFolderId);
    const clonedBoardId = generateUniqueId(newBoardId, seenBoardIds);
    seenBoardIds.add(clonedBoardId);
    folderIdMap.set(folder.id, clonedFolderId);
    boardIdMap.set(folder.boardId, clonedBoardId);
  }

  const next = cloneGraph(graph);

  // 2) Clonar folders con parentIds remapeados; la raíz del clon → newParentId.
  for (const [oldFolderId, newFId] of folderIdMap) {
    const src = graph.folders[oldFolderId];
    const mappedParent =
      src.parentId !== null && subsetIds.has(src.parentId)
        ? (folderIdMap.get(src.parentId) as FolderId)
        : opts.newParentId;
    const clonedFolder: Folder = {
      id: newFId,
      name: src.name,
      icon: src.icon ?? null,
      parentId: mappedParent,
      boardId: boardIdMap.get(src.boardId) as BoardId,
      createdAt: src.createdAt,
      updatedAt: src.updatedAt,
    };
    next.folders[newFId] = clonedFolder;
  }

  // 3) Clonar los boards 1:1.
  for (const [oldFolderId, newFId] of folderIdMap) {
    const srcFolder = graph.folders[oldFolderId];
    const srcBoard = graph.boards[srcFolder.boardId];
    if (!srcBoard) {
      continue;
    }
    const clonedBoardId = boardIdMap.get(srcBoard.id) as BoardId;
    const clonedBoard: Board = {
      id: clonedBoardId,
      name: srcBoard.name,
      rootFolderId: newFId,
      createdAt: srcBoard.createdAt,
      updatedAt: srcBoard.updatedAt,
      viewport: srcBoard.viewport ?? null,
    };
    next.boards[clonedBoardId] = clonedBoard;
  }

  const pointerIdMap = new Map<FolderPointerId, FolderPointerId>();
  const newPointerIds: FolderPointerId[] = [];
  const seenPointerIds = new Set(Object.keys(graph.pointers));

  // 4) Pointers internos: los que apuntan a una folder del subconjunto se
  //    clonan con id NUEVO y target remapeado al clon.
  if (cloneInternalPointers) {
    for (const pointer of Object.values(graph.pointers)) {
      if (!subsetIds.has(pointer.targetFolderId)) {
        continue;
      }
      const newPointerId = generateUniqueId(newFolderPointerId, seenPointerIds);
      seenPointerIds.add(newPointerId);
      const clonedPointer: FolderPointer = {
        id: newPointerId,
        targetFolderId: folderIdMap.get(pointer.targetFolderId) as FolderId,
        name: pointer.name ?? null,
        icon: pointer.icon ?? null,
        createdAt: pointer.createdAt,
      };
      next.pointers[newPointerId] = clonedPointer;
      pointerIdMap.set(pointer.id, newPointerId);
      newPointerIds.push(newPointerId);
    }
  }

  const newRootFolderId = folderIdMap.get(folderId) as FolderId;
  const newRootBoardId = boardIdMap.get(sourceRoot.boardId) as BoardId;

  return {
    ok: true as const,
    graph: next,
    newRootFolderId,
    newRootBoardId,
    folderIdMap,
    boardIdMap,
    pointerIdMap,
    newPointerIds,
  };
}
export type CopyPointerResult =
  | { ok: true; graph: BoardsGraph; pointer: FolderPointer }
  | { ok: false; reason: "not-found" };

/** Copia un pointer solo: id NUEVO, conserva targetFolderId (referencia externa). */
export function copyPointer(
  graph: BoardsGraph,
  pointerId: FolderPointerId,
): CopyPointerResult {
  const source = graph.pointers[pointerId];
  if (!source) {
    return { ok: false as const, reason: "not-found" };
  }
  const seenPointerIds = new Set(Object.keys(graph.pointers));
  const id = generateUniqueId(newFolderPointerId, seenPointerIds);
  const pointer: FolderPointer = {
    id,
    targetFolderId: source.targetFolderId,
    name: source.name ?? null,
    icon: source.icon ?? null,
    createdAt: source.createdAt,
  };
  const next = cloneGraph(graph);
  next.pointers[id] = pointer;
  return { ok: true, graph: next, pointer };
}

/** Remapea targetFolderId de un pointer si está en `folderIdMap` (referencia interna). */
export function remapPointerTarget(
  pointer: FolderPointer,
  folderIdMap: ReadonlyMap<FolderId, FolderId>,
): FolderPointer {
  const mapped = folderIdMap.get(pointer.targetFolderId);
  return mapped ? { ...pointer, targetFolderId: mapped } : pointer;
}
