/**
 * FolderPointer — referencias independientes (dominio puro — Fase 0).
 *
 * Un pointer NO tiene parentId ni boardId, no crea folder ni board, y su id es
 * independiente del de la carpeta objetivo. Solo manipula graph.pointers.
 */

import { generateUniqueId, newFolderPointerId } from "./ids";
import { cloneGraph } from "./graph";

import type {
  BoardsGraph,
  Folder,
  FolderId,
  FolderPointer,
  FolderPointerId,
} from "../types";

const now = () => Date.now();

export type CreatePointerResult =
  | { ok: true; graph: BoardsGraph; pointer: FolderPointer }
  | { ok: false; reason: "target-not-found" };

/** Crea un pointer a una carpeta real existente. El id del pointer es NUEVO (nunca el target). */
export function createPointer(
  graph: BoardsGraph,
  opts: {
    targetFolderId: FolderId;
    name?: string | null;
    icon?: string | null;
  },
): CreatePointerResult {
  if (!graph.folders[opts.targetFolderId]) {
    return { ok: false, reason: "target-not-found" };
  }
  const existing = new Set(Object.keys(graph.pointers));
  const id = generateUniqueId(newFolderPointerId, existing);
  const pointer: FolderPointer = {
    id,
    targetFolderId: opts.targetFolderId,
    name: opts.name ?? null,
    icon: opts.icon ?? null,
    createdAt: now(),
  };
  const next = cloneGraph(graph);
  next.pointers[id] = pointer;
  return { ok: true, graph: next, pointer };
}

/** Resuelve el target de un pointer (la carpeta REAL). undefined si el pointer o el target no existen. */
export function resolvePointer(
  graph: BoardsGraph,
  pointerId: FolderPointerId,
): Folder | undefined {
  const pointer = graph.pointers[pointerId];
  return pointer ? graph.folders[pointer.targetFolderId] : undefined;
}

export function isPointerValid(
  graph: BoardsGraph,
  pointer: FolderPointer,
): boolean {
  return !!graph.folders[pointer.targetFolderId];
}

/** Pointers cuyo target ya no existe (referencias inválidas). */
export function findInvalidPointers(graph: BoardsGraph): FolderPointer[] {
  return Object.values(graph.pointers).filter((p) => !isPointerValid(graph, p));
}

/** Elimina un pointer (si no existe, no-op devolviendo el mismo grafo). */
export function deletePointer(
  graph: BoardsGraph,
  pointerId: FolderPointerId,
): BoardsGraph {
  if (!graph.pointers[pointerId]) {
    return graph;
  }
  const next = cloneGraph(graph);
  delete next.pointers[pointerId];
  return next;
}

/** Elimina varios pointers a la vez (para delete de una folder). */
export function deletePointers(
  graph: BoardsGraph,
  pointerIds: readonly FolderPointerId[],
): BoardsGraph {
  if (!pointerIds.length) {
    return graph;
  }
  const next = cloneGraph(graph);
  for (const id of pointerIds) {
    delete next.pointers[id];
  }
  return next;
}

/** ¿El id de este pointer coincide con el de su target? (nunca debe pasar). */
export function pointerReusesTargetId(pointer: FolderPointer): boolean {
  return pointer.id === pointer.targetFolderId;
}
