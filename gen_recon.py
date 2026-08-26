import os
path = "excalidraw-app/boards/host/reconciliation.ts"
content = """import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BoardsGraph, BoardId, FolderId } from "../types";
import type { FolderBoardVisualMeta } from "./materialize";
import type { BoardRepository } from "../repository/BoardRepository";
import { findFolderVisual } from "./materialize";
import { STORAGE_KEYS } from "../../app_constants";
import { ancestors } from "../domain/graph";
import { boardsStoreActions } from "./boardState";
import { initializeBoardSystem } from "./boardService";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export function isStructuralElement(element: ExcalidrawElement): boolean {
  if (!element.customData || !(element.customData as any).folderBoard) return false;
  const kind = ((element.customData as any).folderBoard as FolderBoardVisualMeta).kind;
  return kind === "folder" || kind === "pointer";
}

export function syncStructuralElements(
  graph: BoardsGraph,
  currentElements: readonly ExcalidrawElement[],
  currentBoardId: BoardId,
  remoteBoardElements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const nextElements = [...currentElements];
  
  const expectedItems = new Set<string>();
  
  for (const folder of Object.values(graph.folders)) {
    if (folder.boardId === currentBoardId) {
      expectedItems.add(`folder:${folder.id}`);
    }
  }
  
  if (graph.pointers) {
    for (const pointer of Object.values(graph.pointers)) {
      if (pointer.boardId === currentBoardId) {
        expectedItems.add(`pointer:${pointer.id}`);
      }
    }
  }

  const existingItems = new Set<string>();
  
  for (let i = 0; i < nextElements.length; i++) {
    const el = nextElements[i];
    const meta = (el.customData as any)?.folderBoard as FolderBoardVisualMeta | undefined;
    if (!meta) continue;

    let itemKey = "";
    if (meta.kind === "folder") {
      itemKey = `folder:${meta.folderId}`;
    } else if (meta.kind === "pointer") {
      itemKey = `pointer:${meta.pointerId}`;
    }

    if (itemKey) {
      if (!expectedItems.has(itemKey)) {
        if (!el.isDeleted) {
          nextElements[i] = { ...el, isDeleted: true };
        }
      } else {
        existingItems.add(itemKey);
      }
    }
  }

  for (const expectedKey of expectedItems) {
    if (!existingItems.has(expectedKey)) {
      for (const remoteEl of remoteBoardElements) {
        const meta = (remoteEl.customData as any)?.folderBoard as FolderBoardVisualMeta | undefined;
        if (!meta) continue;
        
        const remoteKey = meta.kind === "folder" ? `folder:${meta.folderId}` :
                          meta.kind === "pointer" ? `pointer:${meta.pointerId}` : "";
                          
        if (remoteKey === expectedKey && !remoteEl.isDeleted) {
          nextElements.push(remoteEl);
        }
      }
    }
  }

  return nextElements;
}

export function startMultiTabSync(repo: BoardRepository, excalidrawAPI: ExcalidrawImperativeAPI): () => void {
  const handler = async (e: StorageEvent) => {
    if (e.key !== STORAGE_KEYS.BOARDS_GRAPH) {
      return;
    }

    const currentFolderId = boardsStoreActions.getCurrentFolderId();
    const currentBoardId = boardsStoreActions.getCurrentBoardId();
    if (!currentFolderId || !currentBoardId) {
      return;
    }

    try {
      const graph = await repo.load();
      if (!graph) return;

      // Zombie navigation check
      let isZombie = false;
      if (!graph.folders[currentFolderId]) {
        isZombie = true;
      } else {
        try {
          ancestors(graph, currentFolderId);
        } catch {
          isZombie = true;
        }
      }

      if (isZombie) {
        await initializeBoardSystem(repo);
        return;
      }

      // Reconciliation
      const physicalData = await repo.loadBoard(currentBoardId);
      if (!physicalData) return;

      const currentElements = excalidrawAPI.getSceneElementsIncludingDeleted();
      const reconciled = syncStructuralElements(graph, currentElements as unknown as ExcalidrawElement[], currentBoardId, physicalData.elements);
      
      excalidrawAPI.updateScene({ elements: reconciled });
      
      // Force UI updates if needed via Jotai (e.g. for breadcrumb re-render)
      boardsStoreActions.setCurrentFolderId(null);
      boardsStoreActions.setCurrentFolderId(currentFolderId);
      
    } catch (err) {
      console.warn("MultiTabSync error:", err);
    }
  };

  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("storage", handler);
  };
}
"""
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Created reconciliation.ts")
