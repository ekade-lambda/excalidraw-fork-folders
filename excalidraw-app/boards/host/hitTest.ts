/**
 * Board System — host / hitTest (Fase 4).
 *
 * Hit-testing para apertura interactiva por doble clic. Dado un punto de
 * escena y la lista de elementos, determina si el elemento con mayor z-index
 * bajo el punto es una REPRESENTACIÓN de Folder (customData.folderBoard con
 * kind:"folder") y devuelve su identidad. Es PURA y testeable; la orquestación
 * del listener nativo dblclick está en App.tsx (composition root).
 */

import { hitElementItself } from "@excalidraw/element";
import { arrayToMap } from "@excalidraw/common";
import { pointFrom, type GlobalPoint } from "@excalidraw/math";

import type { ElementsMap } from "@excalidraw/element/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { FolderBoardVisualMeta } from "./materialize";
import type { BoardId, FolderId } from "../types";

export type HitResult =
  | { kind: "folder"; folderId: FolderId; boardId: BoardId }
  | { kind: "none" };

/** Tamaño del área de sensibilidad del doble clic (escena units). */
const HIT_THRESHOLD = 6;

/**
 * Devuelve la metadata de folder si el punto cae sobre el elemento de Folder
 * con mayor z-index (último en el array), o `{ kind:"none" }` en caso contrario.
 */
export function hitTestFolderAtPoint(
  elements: readonly ExcalidrawElement[],
  scenePoint: { x: number; y: number },
): HitResult {
  const nonDeleted = elements.filter((el) => !el.isDeleted);
  const elementsMap = arrayToMap(nonDeleted);
  const point: GlobalPoint = pointFrom(scenePoint.x, scenePoint.y);

  let topHit: FolderBoardVisualMeta | undefined;

  for (const el of nonDeleted) {
    const meta = el.customData?.folderBoard as
      | FolderBoardVisualMeta
      | undefined;
    if (meta?.kind !== "folder") {
      continue;
    }
    if (
      hitElementItself({
        point,
        element: el as ExcalidrawElement,
        threshold: HIT_THRESHOLD,
        elementsMap: elementsMap as ElementsMap,
      })
    ) {
      // Último golpe = elemento con mayor z-index → el de encima.
      topHit = meta;
    }
  }

  if (!topHit) {
    return { kind: "none" };
  }
  return { kind: "folder", folderId: topHit.folderId, boardId: topHit.boardId };
}
