/**
 * Grafos/sistema de archivos (dominio puro — Fase 0).
 *
 * Solo el ARBOL de folders vive aquí (Folder.parentId). Los pointers viven en
 * graph.pointers (grafo de referencias, namespace aparte). Ninguna operación
 * muta el grafo de entrada: todas devuelven un grafo nuevo (inmutabilidad).
 */

import { generateUniqueId, newBoardId, newFolderId } from "./ids";

import type {
  Board,
  BoardId,
  BoardsGraph,
  Folder,
  FolderId,
  FolderPointerId,
} from "../types";

const now = () => Date.now();

/** Clona un grafo (copia profunda de los registros anidados). */
export function cloneGraph(graph: BoardsGraph): BoardsGraph {
  const folders: BoardsGraph["folders"] = {};
  for (const [id, folder] of Object.entries(graph.folders)) {
    folders[id as FolderId] = { ...folder };
  }
  const pointers: BoardsGraph["pointers"] = {};
  for (const [id, pointer] of Object.entries(graph.pointers)) {
    pointers[id as FolderPointerId] = { ...pointer };
  }
  const boards: BoardsGraph["boards"] = {};
  for (const [id, board] of Object.entries(graph.boards)) {
    boards[id as BoardId] = { ...board };
  }
  return {
    schemaVersion: graph.schemaVersion,
    rootFolderId: graph.rootFolderId,
    folders,
    pointers,
    boards,
    lastOpenBoardId: graph.lastOpenBoardId ?? null,
  };
}

/** Crea el grafo con la carpeta RAÍZ (parentId null) y su board (1:1). */
export function createRootGraph(opts?: { name?: string }): BoardsGraph {
  const name = opts?.name ?? "root";
  const t = now();
  const rootFolderId = newFolderId();
  const rootBoardId = newBoardId();
  const rootFolder: Folder = {
    id: rootFolderId,
    name,
    icon: null,
    parentId: null,
    boardId: rootBoardId,
    createdAt: t,
    updatedAt: t,
  };
  const rootBoard: Board = {
    id: rootBoardId,
    name,
    rootFolderId,
    createdAt: t,
    updatedAt: t,
    viewport: null,
  };
  return {
    schemaVersion: 1,
    rootFolderId,
    folders: { [rootFolderId]: rootFolder },
    pointers: {},
    boards: { [rootBoardId]: rootBoard },
    lastOpenBoardId: rootBoardId,
  };
}

export function getFolder(
  graph: BoardsGraph,
  folderId: FolderId,
): Folder | undefined {
  return graph.folders[folderId];
}

export function getBoard(
  graph: BoardsGraph,
  boardId: BoardId,
): Board | undefined {
  return graph.boards[boardId];
}

export function isRoot(graph: BoardsGraph, folderId: FolderId): boolean {
  return folderId === graph.rootFolderId;
}

export type AddFolderResult =
  | { ok: true; graph: BoardsGraph; folderId: FolderId; boardId: BoardId }
  | { ok: false; reason: "parent-not-found" };

/** Añade una folder hija (crea folder + su board 1:1). La raíz se crea con `createRootGraph`. */
export function addFolder(
  graph: BoardsGraph,
  opts: { name: string; parentId: FolderId; icon?: { dataUrl: string } | null },
): AddFolderResult {
  const parent = graph.folders[opts.parentId];
  if (!parent) {
    return { ok: false, reason: "parent-not-found" };
  }
  const t = now();
  const existingFolderIds = new Set(Object.keys(graph.folders));
  const existingBoardIds = new Set(Object.keys(graph.boards));
  const folderId = generateUniqueId(newFolderId, existingFolderIds);
  const boardId = generateUniqueId(newBoardId, existingBoardIds);

  const folder: Folder = {
    id: folderId,
    name: opts.name,
    icon: opts.icon ?? null,
    parentId: opts.parentId,
    boardId,
    createdAt: t,
    updatedAt: t,
  };
  const board: Board = {
    id: boardId,
    name: opts.name,
    rootFolderId: folderId,
    createdAt: t,
    updatedAt: t,
    viewport: null,
  };
  const next = cloneGraph(graph);
  next.folders[folderId] = folder;
  next.boards[boardId] = board;
  return { ok: true, graph: next, folderId, boardId };
}

/** Ancestros (padre → raíz), excluyendo la propia folder. */
export function ancestors(graph: BoardsGraph, folderId: FolderId): Folder[] {
  const result: Folder[] = [];
  const seen = new Set<FolderId>();
  let cursor = graph.folders[folderId];
  while (cursor && cursor.parentId !== null && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const parent = graph.folders[cursor.parentId];
    if (!parent) {
      break;
    }
    result.push(parent);
    cursor = parent;
  }
  return result;
}

export function ancestorIds(
  graph: BoardsGraph,
  folderId: FolderId,
): FolderId[] {
  return ancestors(graph, folderId).map((f) => f.id);
}

/** Descendientes (todas las folders bajo la dada, excluyendo la propia). */
export function descendants(graph: BoardsGraph, folderId: FolderId): Folder[] {
  const result: Folder[] = [];
  const seen = new Set<FolderId>([folderId]);
  const queue: FolderId[] = [folderId];
  while (queue.length) {
    const currentId = queue.shift() as FolderId;
    for (const candidate of Object.values(graph.folders)) {
      if (candidate.parentId === currentId && !seen.has(candidate.id)) {
        seen.add(candidate.id);
        result.push(candidate);
        queue.push(candidate.id);
      }
    }
  }
  return result;
}

export function descendantIds(
  graph: BoardsGraph,
  folderId: FolderId,
): FolderId[] {
  return descendants(graph, folderId).map((f) => f.id);
}

/** Ruta absoluta derivada (nombres desde la raíz hasta la folder, inclusiva). */
export function path(graph: BoardsGraph, folderId: FolderId): string[] {
  const starts = graph.folders[folderId];
  if (!starts) {
    return [];
  }
  const reversed = [starts.name];
  let cursor = starts;
  const seen = new Set<FolderId>([starts.id]);
  while (cursor.parentId !== null && !seen.has(cursor.parentId)) {
    seen.add(cursor.parentId);
    const parent = graph.folders[cursor.parentId];
    if (!parent) {
      break;
    }
    reversed.push(parent.name);
    cursor = parent;
  }
  return reversed.reverse();
}

/** ¿mover `folderId` bajo `newParentId` crearía un ciclo? (newParent o descendiente). */
export function wouldCreateCycle(
  graph: BoardsGraph,
  folderId: FolderId,
  newParentId: FolderId,
): boolean {
  if (newParentId === folderId) {
    return true;
  }
  return descendantIds(graph, folderId).includes(newParentId);
}

export type MoveFolderResult =
  | { ok: true; graph: BoardsGraph }
  | {
      ok: false;
      reason:
        | "not-found"
        | "parent-not-found"
        | "root-folder"
        | "self-move"
        | "cycle";
    };

/** Mueve la carpeta bajo otro padre, validando que no se crea ciclo. */
export function moveFolder(
  graph: BoardsGraph,
  folderId: FolderId,
  newParentId: FolderId,
): MoveFolderResult {
  const folder = graph.folders[folderId];
  if (!folder) {
    return { ok: false, reason: "not-found" };
  }
  if (folderId === graph.rootFolderId) {
    return { ok: false, reason: "root-folder" };
  }
  if (newParentId === folderId) {
    return { ok: false, reason: "self-move" };
  }
  if (!graph.folders[newParentId]) {
    return { ok: false, reason: "parent-not-found" };
  }
  if (wouldCreateCycle(graph, folderId, newParentId)) {
    return { ok: false, reason: "cycle" };
  }
  if (folder.parentId === newParentId) {
    return { ok: true, graph };
  }
  const next = cloneGraph(graph);
  next.folders[folderId] = {
    ...folder,
    parentId: newParentId,
    updatedAt: now(),
  };
  return { ok: true, graph: next };
}
