import { cloneFromClipboard } from "../domain/cloneFromClipboard";

import type { ClipboardData } from "../../../packages/excalidraw/clipboard";
import type { BoardRepository } from "../repository/BoardRepository";
import type { FolderId } from "../types";
import type { LogicalClipboardData } from "../clipboard";

export async function handleOnPaste(
  data: ClipboardData,
  clipboardData: LogicalClipboardData | null,
  boardRepo: BoardRepository,
  currentFolderId: FolderId | null,
): Promise<boolean> {
  if (!data.elements || data.elements.length === 0) {
    return true; // Let excalidraw proceed
  }

  // 1. Identificar entidades Board System
  const boardElementsIds = new Set<string>();

  for (const el of data.elements) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (el as any).customData?.folderBoard;
    if (meta) {
      boardElementsIds.add(el.id);
    }
  }

  // 2. Si no hay elementos Board System, procedemos nativamente
  if (boardElementsIds.size === 0) {
    return true;
  }

  // Fallback function to abort board clone but keep normal clones
  const abortBoardSystemClone = () => {
    data.elements = data.elements!.filter(
      (el: any) => !boardElementsIds.has(el.id),
    );
    return true;
  };

  // 3. Validaciones de Clipboard
  if (!clipboardData) {
    console.warn("No logical clipboard data found. Stripping board elements.");
    return abortBoardSystemClone();
  }

  const targetFolderId = currentFolderId;
  if (!targetFolderId) {
    console.warn("No currentFolderId found. Board paste cancelled.");
    return abortBoardSystemClone();
  }

  try {
    // 4. Cargar Graph
    const graph = await boardRepo.load();
    if (!graph) {
      throw new Error("Could not load BoardsGraph");
    }

    // 5. Construir grafo en memoria con la primitiva pura
    const res = cloneFromClipboard(clipboardData, graph, targetFolderId);
    if (!res.ok) {
      throw new Error(`cloneFromClipboard failed: ${res.reason}`);
    }

    // 6. Persistir f�sicamente los Boards (Asincrono)
    await boardRepo.clonePhysicalBoards(res.boardIdMap);

    // 7. Persistir Graph l�gico (Asincrono)
    await boardRepo.save(res.graph);

    // 8. Remapear visual elements y agregar flag handledByPaste, manteniendo orden visual
    data.elements = data.elements.map((el: any) => {
      if (!boardElementsIds.has(el.id)) {
        return el;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (el as any).customData?.folderBoard;
      const newMeta = { ...meta, handledByPaste: true };

      if (meta.kind === "folder" && typeof meta.folderId === "string") {
        const mappedFolderId = res.folderIdMap.get(meta.folderId);
        if (mappedFolderId) {
          newMeta.folderId = mappedFolderId;
        }
      } else if (
        meta.kind === "pointer" &&
        typeof meta.pointerId === "string"
      ) {
        const mappedPointerId = res.pointerIdMap.get(meta.pointerId);
        if (mappedPointerId) {
          newMeta.pointerId = mappedPointerId;
        }
      }

      return {
        ...el,
        customData: { ...el.customData, folderBoard: newMeta },
      };
    });

    // 9. Retornar true para permitir que el Paste contin�e con la mutaci�n
    return true;
  } catch (err) {
    // 10. Manejo de fallos de atomicidad
    console.error("Board System Paste failed:", err);
    return abortBoardSystemClone();
  }
}
