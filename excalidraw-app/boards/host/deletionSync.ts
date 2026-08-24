import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  prepareDeleteFolderPatch,
  prepareDeletePointerPatch,
} from "../domain/delete";

import { reconcileSurvivingBoards } from "./reconciler";
import { boardsStoreActions } from "./boardState";

import { loadBoardIntoEditor } from "./boardService";

import { reconcileElements } from "./reconciler";

import type { BoardRepository } from "../repository/BoardRepository";
import type { BoardsGraph, BoardId } from "../types";

// Navigation fallback after deletion
export async function navigateToSafeFallback(
  currentGraph: BoardsGraph,
  nextGraph: BoardsGraph,
  deletedBoardId: BoardId,
  repo: BoardRepository,
  excalidrawAPI: ExcalidrawImperativeAPI,
) {
  const currentBoard = currentGraph.boards[deletedBoardId];
  if (!currentBoard) {
    return;
  }
  const currentFolderId = currentBoard.rootFolderId;

  let fallbackFolderId = currentGraph.folders[currentFolderId].parentId;

  while (fallbackFolderId !== null && !nextGraph.folders[fallbackFolderId]) {
    fallbackFolderId = currentGraph.folders[fallbackFolderId].parentId;
  }

  if (fallbackFolderId === null) {
    fallbackFolderId = nextGraph.rootFolderId;
  }

  const fallbackBoardId = nextGraph.folders[fallbackFolderId].boardId;
  const boardData = await repo.loadBoard(fallbackBoardId);
  if (!boardData) {
    // If it's missing, we should probably fall back to root?
    // Let's assume it exists.
    console.error("Fallback board payload missing!");
    return;
  }

  boardsStoreActions.setCurrentBoardId(fallbackBoardId);
  boardsStoreActions.setCurrentFolderId(fallbackFolderId);
  boardsStoreActions.setBoardData(boardData);

  nextGraph.lastOpenBoardId = fallbackBoardId;
  await repo.save(nextGraph);

  loadBoardIntoEditor(excalidrawAPI, boardData);
}

let isSyncing = false;

export async function syncDeletionsFromEditor(
  elements: readonly ExcalidrawElement[],
  repo: BoardRepository,
  excalidrawAPI: ExcalidrawImperativeAPI,
) {
  if (isSyncing) {
    return;
  }

  const currentGraph = await repo.load();
  if (!currentGraph) {
    return;
  }

  const deletedFoldersInCanvas = new Set<string>();
  const deletedPointersInCanvas = new Set<string>();

  for (const el of elements) {
    if (el.isDeleted) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (el as any).customData?.folderBoard;
      if (meta) {
        if (meta.kind === "folder" && currentGraph.folders[meta.folderId]) {
          deletedFoldersInCanvas.add(meta.folderId);
        } else if (
          meta.kind === "pointer" &&
          currentGraph.pointers[meta.pointerId]
        ) {
          deletedPointersInCanvas.add(meta.pointerId);
        }
      }
    }
  }

  // Anti-loop: if nothing needs to be logically deleted, abort
  if (deletedFoldersInCanvas.size === 0 && deletedPointersInCanvas.size === 0) {
    return;
  }

  isSyncing = true;
  try {
    let patch = {
      deletedFolderIds: [] as string[],
      deletedBoardIds: [] as string[],
      deletedPointerIds: [] as string[],
    };

    let attemptedToDeleteRoot = false;

    // Calculate folder patches
    for (const folderId of deletedFoldersInCanvas) {
      if (folderId === currentGraph.rootFolderId) {
        attemptedToDeleteRoot = true;
        continue;
      }
      const p = prepareDeleteFolderPatch(currentGraph, folderId);
      if (p.ok) {
        patch.deletedFolderIds.push(...p.patch.deletedFolderIds);
        patch.deletedBoardIds.push(...p.patch.deletedBoardIds);
        patch.deletedPointerIds.push(...p.patch.deletedPointerIds);
      }
    }

    // Calculate pointer patches
    for (const pointerId of deletedPointersInCanvas) {
      // If it was already swept up by a folder patch, skip
      if (!patch.deletedPointerIds.includes(pointerId)) {
        const p = prepareDeletePointerPatch(currentGraph, pointerId);
        if (p.ok) {
          patch.deletedPointerIds.push(...p.patch.deletedPointerIds);
        }
      }
    }

    // Deduplicate
    patch = {
      deletedFolderIds: Array.from(new Set(patch.deletedFolderIds)),
      deletedBoardIds: Array.from(new Set(patch.deletedBoardIds)),
      deletedPointerIds: Array.from(new Set(patch.deletedPointerIds)),
    };

    if (
      patch.deletedFolderIds.length === 0 &&
      patch.deletedPointerIds.length === 0
    ) {
      if (attemptedToDeleteRoot) {
        // If they tried to delete the root, we must restore it visually
        // by flipping isDeleted back to false for the root folder visual elements.
        const currentSceneElements =
          excalidrawAPI.getSceneElementsIncludingDeleted() as unknown as ExcalidrawElement[];
        let restored = false;
        const nextElements = currentSceneElements.map((el) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const meta = (el as any).customData?.folderBoard;
          if (
            meta &&
            meta.kind === "folder" &&
            meta.folderId === currentGraph.rootFolderId &&
            el.isDeleted
          ) {
            restored = true;
            return { ...el, isDeleted: false };
          }
          return el;
        });
        if (restored) {
          excalidrawAPI.updateScene({
            elements: nextElements as any,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }
      return;
    }

    // We must apply the transaction!
    const nextGraph = await repo.applyTransaction(currentGraph, patch);

    const currentBoardId = boardsStoreActions.getCurrentBoardId();

    // Reconcile surviving offline boards
    await reconcileSurvivingBoards(nextGraph, patch, repo);

    // If the current board was deleted, we must navigate
    if (currentBoardId && patch.deletedBoardIds.includes(currentBoardId)) {
      await navigateToSafeFallback(
        currentGraph,
        nextGraph,
        currentBoardId,
        repo,
        excalidrawAPI,
      );
    } else {
      // If we didn't navigate, we just need to reconcile the visual scene elements here.
      const currentSceneElements =
        excalidrawAPI.getSceneElementsIncludingDeleted() as unknown as ExcalidrawElement[];
      const { elements: nextElements, changed } = reconcileElements(
        currentSceneElements,
        patch,
      );
      if (changed) {
        excalidrawAPI.updateScene({
          elements: nextElements as any,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    }
  } finally {
    isSyncing = false;
  }
}
