import { atom } from "../app-jotai";

import type { BoardsGraph, FolderId, FolderPointerId } from "./types";

export const BOARD_CLIPBOARD_STORAGE_KEY = "excalidraw-board-clipboard";
export const BOARD_CLIPBOARD_SCHEMA_VERSION = 1;

export interface LogicalClipboardData {
  graph: BoardsGraph;
  rootFolderIds: FolderId[]; // The top-level folders that were copied
  pointerIds: FolderPointerId[]; // The pointers that were copied
}

export interface SerializedLogicalClipboardData extends LogicalClipboardData {
  schemaVersion: number;
}

export const sessionClipboardAtom = atom<LogicalClipboardData | null>(null);
