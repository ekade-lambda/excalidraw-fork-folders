import type { ExcalidrawElement } from "@excalidraw/element/types";

import { cloneSelection } from "../domain/cloneSelection";

import type { BoardRepository } from "../repository/BoardRepository";
import type { FolderId } from "../types";

export function handleOnDuplicate(
  nextElements: readonly ExcalidrawElement[],
  prevElements: readonly ExcalidrawElement[],
  boardRepo: BoardRepository,
  currentFolderId: FolderId | null,
): ExcalidrawElement[] | void {
  // 1. Determinar exactamente los elementos duplicados nativos
  const prevIds = new Set(prevElements.map((el) => el.id));
  const duplicatedElements = nextElements.filter((el) => !prevIds.has(el.id));

  if (duplicatedElements.length === 0) {
    return undefined; // normal Excalidraw behavior
  }

  // 2. Extraer entidades Folder/Pointer (elementos nuevos con metadata)
  const folderIdsToClone = new Set<string>();
  const pointerIdsToClone = new Set<string>();
  const boardSystemClones: ExcalidrawElement[] = [];

  for (const el of duplicatedElements) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (el as any).customData?.folderBoard;
    if (meta) {
      boardSystemClones.push(el);
      if (meta.kind === "folder" && typeof meta.folderId === "string") {
        folderIdsToClone.add(meta.folderId);
      } else if (
        meta.kind === "pointer" &&
        typeof meta.pointerId === "string"
      ) {
        pointerIdsToClone.add(meta.pointerId);
      }
    }
  }

  // 3. Ignorar elementos normales sin metadata
  if (boardSystemClones.length === 0) {
    return undefined; // normal behavior
  }

  // Fallback function to abort board clone but keep normal clones
  const abortBoardSystemClone = () => {
    const cloneIds = new Set(boardSystemClones.map((el) => el.id));
    return nextElements.filter((el) => !cloneIds.has(el.id));
  };

  // 4. Fallback de capability
  if (
    !boardRepo.loadSync ||
    !boardRepo.clonePhysicalBoardsSync ||
    !boardRepo.saveSync
  ) {
    console.warn(
      "BoardRepository lacks sync capabilities. Board duplication cancelled.",
    );
    return abortBoardSystemClone();
  }

  const newParentId = currentFolderId;
  if (!newParentId) {
    console.warn("No currentFolderId found. Board duplication cancelled.");
    return abortBoardSystemClone();
  }

  try {
    // 5. Cargar Graph sincrónico
    const graph = boardRepo.loadSync();
    if (!graph) {
      throw new Error("Could not load BoardsGraph synchronously");
    }

    // 6. Ejecutar cloneSelection (pura)
    const res = cloneSelection(graph, {
      folderIds: Array.from(folderIdsToClone),
      pointerIds: Array.from(pointerIdsToClone),
      newParentId,
    });

    if (!res.ok) {
      throw new Error(`cloneSelection failed: ${res.reason}`);
    }

    // 7. Persistir TODOS los Boards físicos de forma síncrona
    boardRepo.clonePhysicalBoardsSync(res.boardIdMap);

    // 8. SOLO si la persistencia física termina exitosamente, guardar el Graph
    boardRepo.saveSync(res.graph);

    // 9. Remapear y retornar los elementos visuales
    return nextElements.map((el) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (el as any).customData?.folderBoard;
      if (!meta || prevIds.has(el.id)) {
        return el;
      }

      const newMeta = { ...meta };
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
  } catch (err) {
    // 10. Manejo de fallos: NO publicar, abortar limpiamente.
    console.error("Board System Duplicate failed:", err);
    return abortBoardSystemClone();
  }
}
