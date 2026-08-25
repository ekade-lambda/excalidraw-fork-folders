import type { ExcalidrawElement } from "@excalidraw/element/types";

import { extractClipboardSnapshot } from "../domain/cloneFromClipboard";

import {
  BOARD_CLIPBOARD_STORAGE_KEY,
  BOARD_CLIPBOARD_SCHEMA_VERSION,
} from "../clipboard";

import type {
  LogicalClipboardData,
  SerializedLogicalClipboardData,
} from "../clipboard";

import type { BoardsGraph, FolderId, FolderPointerId } from "../types";

export function handleOnCopy(
  elements: readonly ExcalidrawElement[],
  graph: BoardsGraph,
): LogicalClipboardData | null {
  const selectedFolderIds = new Set<FolderId>();
  const selectedPointerIds = new Set<FolderPointerId>();

  for (const el of elements) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (el as any).customData?.folderBoard;
    if (meta) {
      if (meta.kind === "folder" && typeof meta.folderId === "string") {
        selectedFolderIds.add(meta.folderId as FolderId);
      } else if (
        meta.kind === "pointer" &&
        typeof meta.pointerId === "string"
      ) {
        selectedPointerIds.add(meta.pointerId as FolderPointerId);
      }
    }
  }

  const snapshot = extractClipboardSnapshot(
    graph,
    Array.from(selectedFolderIds),
    Array.from(selectedPointerIds),
  );

  if (snapshot) {
    try {
      const payload: SerializedLogicalClipboardData = {
        ...snapshot,
        schemaVersion: BOARD_CLIPBOARD_SCHEMA_VERSION,
      };
      window.localStorage.setItem(
        BOARD_CLIPBOARD_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch (err) {
      console.warn(
        "Failed to serialize cross-tab clipboard to localStorage:",
        err,
      );
    }
  } else {
    window.localStorage.removeItem(BOARD_CLIPBOARD_STORAGE_KEY);
  }

  return snapshot;
}
