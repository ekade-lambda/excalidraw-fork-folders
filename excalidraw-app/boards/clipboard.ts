import { atom } from "../app-jotai";

import type { BoardsGraph, FolderId, FolderPointerId } from "./types";

export interface LogicalClipboardData {
  graph: BoardsGraph;
  rootFolderIds: FolderId[]; // The top-level folders that were copied
  pointerIds: FolderPointerId[]; // The pointers that were copied
}

export const sessionClipboardAtom = atom<LogicalClipboardData | null>(null);
