import { hitElementItself } from "@excalidraw/element";
import { arrayToMap } from "@excalidraw/common";
import { pointFrom, type GlobalPoint } from "@excalidraw/math";
import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";
import type { LinkToFileData } from "../types";

const HIT_THRESHOLD = 6;

export function hitTestLinkToFileAtPoint(
  elements: readonly ExcalidrawElement[],
  scenePoint: { x: number; y: number },
): { hit: boolean; element?: ExcalidrawElement; linkData?: LinkToFileData } {
  const nonDeleted = elements.filter((el) => !el.isDeleted);
  const elementsMap = arrayToMap(nonDeleted);
  const point: GlobalPoint = pointFrom(scenePoint.x, scenePoint.y);

  let topHit: ExcalidrawElement | undefined;
  let topHitData: LinkToFileData | undefined;

  for (const el of nonDeleted) {
    const customData = el.customData as LinkToFileData | undefined;
    if (customData?.type !== "link-to-file") {
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
      topHit = el;
      topHitData = customData;
    }
  }

  if (topHit && topHitData) {
    return { hit: true, element: topHit, linkData: topHitData };
  }

  return { hit: false };
}
