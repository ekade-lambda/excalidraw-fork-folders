/**
 * Board (contenido) — funciones puras de dominio.
 *
 * Board y Folder tienen relación 1:1 (Folder.boardId ↔ Board.rootFolderId).
 * Este módulo NO toca localStorage ni el editor; solo modela la entidad Board
 * y su resolución dentro del BoardsGraph.
 */

import { newBoardId } from "./ids";

import type {
  Board,
  BoardId,
  BoardViewport,
  BoardsGraph,
  Folder,
  FolderId,
} from "../types";

const now = () => Date.now();

/** Crea un Board (sin insertarlo en el grafo). rootFolderId = carpeta dueña. */
export function createBoardForFolder(
  folder: Folder,
  opts?: { name?: string; viewport?: BoardViewport | null },
): Board {
  const t = now();
  return {
    id: newBoardId(),
    name: opts?.name ?? folder.name,
    rootFolderId: folder.id,
    createdAt: t,
    updatedAt: t,
    viewport: opts?.viewport ?? null,
  };
}

/** Obtiene un Board por id. */
export function getBoard(
  graph: BoardsGraph,
  boardId: BoardId,
): Board | undefined {
  return graph.boards[boardId];
}

/** Obtiene el Board de una Folder (resolución Folder → Board). */
export function getFolderBoard(
  graph: BoardsGraph,
  folderId: FolderId,
): Board | undefined {
  const folder = graph.folders[folderId];
  return folder ? graph.boards[folder.boardId] : undefined;
}

/** Obtiene la Folder dueña de un Board (resolución Board → Folder). */
export function getBoardFolder(
  graph: BoardsGraph,
  boardId: BoardId,
): Folder | undefined {
  const board = graph.boards[boardId];
  return board ? graph.folders[board.rootFolderId] : undefined;
}

/** Resuelve el id de board de una folder (por existencia de la folder). */
export function getBoardIdForFolder(
  graph: BoardsGraph,
  folderId: FolderId,
): BoardId | undefined {
  return graph.folders[folderId]?.boardId;
}

/** Boards de un conjunto de folders (para delete/limpieza). */
export function boardsOfFolders(
  graph: BoardsGraph,
  folderIds: readonly FolderId[],
): Board[] {
  const result: Board[] = [];
  for (const folderId of folderIds) {
    const folder = graph.folders[folderId];
    const board = folder ? graph.boards[folder.boardId] : undefined;
    if (board) {
      result.push(board);
    }
  }
  return result;
}
