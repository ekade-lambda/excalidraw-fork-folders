import { isInitializedImageElement } from "@excalidraw/element/typeChecks";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import { LocalData } from "../../data/LocalData";

import type { BoardsGraph, BoardData, BoardId } from "../types";

import type { BoardRepository } from "../repository/BoardRepository";

export interface WorkspaceBundle {
  schemaVersion: 1;
  graph: BoardsGraph;
  boards: Record<BoardId, BoardData>;
  files: Record<FileId, BinaryFileData>;
}

export const exportWorkspace = async (
  repo: BoardRepository,
): Promise<string> => {
  const graph = await repo.load();
  if (!graph) {
    throw new Error("Cannot export empty workspace");
  }

  const boards: Record<BoardId, BoardData> = {};
  const fileIds = new Set<FileId>();

  for (const boardId of Object.keys(graph.boards) as BoardId[]) {
    const board = await repo.loadBoard(boardId);
    if (!board) {
      throw new Error(`Missing physical board data for boardId: ${boardId}`);
    }
    boards[boardId] = board;

    for (const element of board.elements) {
      if (isInitializedImageElement(element)) {
        fileIds.add(element.fileId);
      }
    }
  }

  const { loadedFiles } = await LocalData.fileStorage.getFiles(
    Array.from(fileIds),
  );

  const files: Record<FileId, BinaryFileData> = {};
  for (const file of loadedFiles) {
    files[file.id] = file;
  }

  const bundle: WorkspaceBundle = {
    schemaVersion: 1,
    graph,
    boards,
    files,
  };

  return JSON.stringify(bundle);
};

export const parseWorkspaceBundle = (raw: string): WorkspaceBundle | null => {
  try {
    const parsed = JSON.parse(raw);
    return parsed as WorkspaceBundle;
  } catch (e) {
    return null;
  }
};

export const validateWorkspaceBundle = (
  bundle: any,
): bundle is WorkspaceBundle => {
  if (!bundle || typeof bundle !== "object") {
    return false;
  }
  if (bundle.schemaVersion !== 1) {
    return false;
  }

  if (!bundle.graph || typeof bundle.graph !== "object") {
    return false;
  }
  if (
    !bundle.graph.boards ||
    !bundle.graph.folders ||
    !bundle.graph.rootFolderId
  ) {
    return false;
  }

  if (!bundle.boards || typeof bundle.boards !== "object") {
    return false;
  }
  if (!bundle.files || typeof bundle.files !== "object") {
    return false;
  }

  for (const boardId of Object.keys(bundle.graph.boards)) {
    const board = bundle.boards[boardId as BoardId];
    if (!board) {
      return false;
    }
    for (const element of board.elements) {
      if (element.type === "image" && (element as any).fileId) {
        if (!bundle.files[(element as any).fileId as FileId]) {
          return false;
        }
      }
    }
  }

  return true;
};

export const importWorkspace = async (
  rawBundle: string,
  repo: BoardRepository,
): Promise<void> => {
  const bundle = parseWorkspaceBundle(rawBundle);
  if (!bundle || !validateWorkspaceBundle(bundle)) {
    throw new Error("Invalid workspace bundle");
  }

  // Staging: Write files to IndexedDB
  const addedFiles = new Map<FileId, BinaryFileData>();
  for (const file of Object.values(bundle.files)) {
    addedFiles.set(file.id, file);
  }

  // Actually FileManager.ts expects an object with addedFiles
  // But wait! LocalData.fileStorage.saveFiles signature takes { elements, files } natively.
  // We can just construct a dummy array of elements to force it to save all our files.
  // Or we can use internal _saveFiles ? No, _saveFiles is private.
  // The public API LocalData.fileStorage.saveFiles({ elements, files }) expects:
  // elements: ExcalidrawElement[]
  // files: BinaryFiles
  // It iterates elements, checks if they are image elements, and if their fileId is in files, it saves them.
  // So we MUST construct a dummy elements array covering all fileIds.
  const dummyElements = Object.values(bundle.files).map(
    (f) =>
      ({
        type: "image",
        status: "saved",
        fileId: f.id,
      } as any),
  );

  await LocalData.fileStorage.saveFiles({
    elements: dummyElements,
    files: bundle.files,
  });

  const oldGraph = await repo.load();

  // Commit Phase 1: Write all new boards
  for (const board of Object.values(bundle.boards)) {
    await repo.saveBoard(board);
  }

  // Commit Phase 2: Write new graph (atomic switch of active workspace)
  await repo.save(bundle.graph);

  // Commit Phase 3: Cleanup old orphan boards (Best effort)
  if (oldGraph) {
    for (const oldBoardId of Object.keys(oldGraph.boards) as BoardId[]) {
      if (!bundle.graph.boards[oldBoardId as BoardId]) {
        await repo.deleteBoard(oldBoardId);
      }
    }
  }
};
