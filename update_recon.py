import os

path = "excalidraw-app/boards/host/reconciliation.ts"
content = """import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BoardsGraph, BoardId } from "../types";
import type { FolderBoardVisualMeta } from "./materialize";
import type { BoardRepository } from "../repository/BoardRepository";
import { STORAGE_KEYS } from "../../app_constants";
import { ancestors } from "../domain/graph";
import { boardsStoreActions } from "./boardState";
import { initializeBoardSystem, saveCurrentBoard } from "./boardService";
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
): { elements: ExcalidrawElement[]; didChange: boolean } {
  const nextElements = [...currentElements];
  let didChange = false;
  
  const validRemoteKeys = new Set<string>();
  
  for (const remoteEl of remoteBoardElements) {
    if (remoteEl.isDeleted) continue;
    const meta = (remoteEl.customData as any)?.folderBoard as FolderBoardVisualMeta | undefined;
    if (!meta) continue;
    
    if (meta.kind === "folder") {
      const folder = graph.folders[meta.folderId];
      if (folder && folder.parentId) {
        const parent = graph.folders[folder.parentId];
        if (parent && parent.boardId === currentBoardId) {
          validRemoteKeys.add(`folder:${meta.folderId}:${meta.role}`);
        }
      }
    } else if (meta.kind === "pointer") {
      if (graph.pointers && graph.pointers[meta.pointerId]) {
        validRemoteKeys.add(`pointer:${meta.pointerId}:${meta.role}`);
      }
    }
  }

  const localKeys = new Set<string>();
  
  for (let i = 0; i < nextElements.length; i++) {
    const el = nextElements[i];
    const meta = (el.customData as any)?.folderBoard as FolderBoardVisualMeta | undefined;
    if (!meta) continue;

    let isValid = false;
    let key = "";
    if (meta.kind === "folder") {
      key = `folder:${meta.folderId}:${meta.role}`;
      const folder = graph.folders[meta.folderId];
      if (folder && folder.parentId) {
        const parent = graph.folders[folder.parentId];
        if (parent && parent.boardId === currentBoardId) {
          isValid = true;
        }
      }
    } else if (meta.kind === "pointer") {
      key = `pointer:${meta.pointerId}:${meta.role}`;
      if (graph.pointers && graph.pointers[meta.pointerId]) {
        isValid = true;
      }
    }

    if (!isValid) {
      if (!el.isDeleted) {
        nextElements[i] = { ...el, isDeleted: true };
        didChange = true;
      }
    } else {
      localKeys.add(key);
    }
  }

  for (const remoteEl of remoteBoardElements) {
    if (remoteEl.isDeleted) continue;
    const meta = (remoteEl.customData as any)?.folderBoard as FolderBoardVisualMeta | undefined;
    if (!meta) continue;
    
    const key = meta.kind === "folder" ? `folder:${meta.folderId}:${meta.role}` :
                meta.kind === "pointer" ? `pointer:${meta.pointerId}:${meta.role}` : "";
                
    if (key && validRemoteKeys.has(key) && !localKeys.has(key)) {
      nextElements.push(remoteEl);
      didChange = true;
    }
  }

  return { elements: nextElements, didChange };
}

let syncQueue = Promise.resolve();

export function startMultiTabSync(repo: BoardRepository, excalidrawAPI: ExcalidrawImperativeAPI): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEYS.BOARDS_GRAPH) {
      return;
    }

    syncQueue = syncQueue.then(async () => {
      const currentFolderId = boardsStoreActions.getCurrentFolderId();
      const currentBoardId = boardsStoreActions.getCurrentBoardId();
      if (!currentFolderId || !currentBoardId) {
        return;
      }

      try {
        const graph = await repo.load();
        if (!graph) return;

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
          try {
            await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
          } catch (saveErr) {
            console.error("MultiTabSync: failed to rescue strokes before zombie navigation", saveErr);
          }
          await initializeBoardSystem(repo);
          return;
        }

        const physicalData = await repo.loadBoard(currentBoardId);
        if (!physicalData) return;

        const currentElements = excalidrawAPI.getSceneElementsIncludingDeleted();
        const { elements: reconciled, didChange } = syncStructuralElements(graph, currentElements as unknown as ExcalidrawElement[], currentBoardId, physicalData.elements);
        
        if (didChange) {
          excalidrawAPI.updateScene({ elements: reconciled });
          await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
        }
        
        boardsStoreActions.incrementGraphVersion();
        
      } catch (err) {
        console.warn("MultiTabSync error:", err);
      }
    }).catch(err => {
      console.warn("MultiTabSync queue error:", err);
    });
  };

  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("storage", handler);
  };
}
"""
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated reconciliation.ts")
