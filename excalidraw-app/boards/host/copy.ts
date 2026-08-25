import type { ExcalidrawElement } from "@excalidraw/element/types";

import { extractClipboardSnapshot } from "../domain/cloneFromClipboard";

import type { BoardsGraph, FolderId, FolderPointerId } from "../types";
import type { LogicalClipboardData } from "../clipboard";

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

  return extractClipboardSnapshot(
    graph,
    Array.from(selectedFolderIds),
    Array.from(selectedPointerIds),
  );
}
