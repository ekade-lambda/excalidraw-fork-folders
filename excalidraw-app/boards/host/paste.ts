import { cloneFromClipboard } from "../domain/cloneFromClipboard";

import {
  BOARD_CLIPBOARD_STORAGE_KEY,
  BOARD_CLIPBOARD_SCHEMA_VERSION,
} from "../clipboard";

import type {
  LogicalClipboardData,
  SerializedLogicalClipboardData,
} from "../clipboard";

import type { ClipboardData } from "../../../packages/excalidraw/clipboard";
import type { BoardRepository } from "../repository/BoardRepository";
import type { FolderId } from "../types";

function getCrossTabClipboardData(): LogicalClipboardData | null {
  try {
    const raw = window.localStorage.getItem(BOARD_CLIPBOARD_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SerializedLogicalClipboardData>;

    // Validar version
    if (parsed.schemaVersion !== BOARD_CLIPBOARD_SCHEMA_VERSION) {
      console.warn(
        `Cross-tab clipboard schema mismatch. Expected ${BOARD_CLIPBOARD_SCHEMA_VERSION}, got ${parsed.schemaVersion}`,
      );
      return null;
    }

    // Validar estructura minima
    if (
      !parsed.graph ||
      !parsed.graph.folders ||
      !parsed.graph.boards ||
      !parsed.graph.pointers
    ) {
      console.warn(
        "Cross-tab clipboard payload missing valid graph structure.",
      );
      return null;
    }
    if (
      !Array.isArray(parsed.rootFolderIds) ||
      !Array.isArray(parsed.pointerIds)
    ) {
      console.warn("Cross-tab clipboard payload missing ids arrays.");
      return null;
    }

    return parsed as LogicalClipboardData;
  } catch (err) {
    console.warn("Failed to parse cross-tab clipboard data:", err);
    return null;
  }
}

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (el: any) => !boardElementsIds.has(el.id),
    );
    return true;
  };

  // 3. Validaciones de Clipboard
  const activeClipboard = clipboardData ?? getCrossTabClipboardData();

  if (!activeClipboard) {
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
    const res = cloneFromClipboard(activeClipboard, graph, targetFolderId);
    if (!res.ok) {
      throw new Error(`cloneFromClipboard failed: ${res.reason}`);
    }

    // 6. Persistir fisicamente los Boards (Asincrono)
    await boardRepo.clonePhysicalBoards(res.boardIdMap);

    // 7. Persistir Graph logico (Asincrono)
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

    // 9. Retornar true para permitir que el Paste continue con la mutacion
    return true;
  } catch (err) {
    // 10. Manejo de fallos de atomicidad
    console.error("Board System Paste failed:", err);
    return abortBoardSystemClone();
  }
}
