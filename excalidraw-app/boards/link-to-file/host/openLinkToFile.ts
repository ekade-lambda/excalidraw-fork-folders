import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { resolveFile, openFile } from "../bridgeClient";
import type { LinkToFileData } from "../types";

export interface OpenLinkToFileOpts {
  excalidrawAPI: ExcalidrawImperativeAPI;
  element: ExcalidrawElement;
  linkData: LinkToFileData;
}

/**
 * Resuelve y abre un archivo a través del Bridge local.
 * Actualiza el lastKnownPath si el archivo ha sido movido/renombrado.
 */
export async function openLinkToFile({
  excalidrawAPI,
  element,
  linkData,
}: OpenLinkToFileOpts): Promise<void> {
  const { fileIdentity, lastKnownPath } = linkData;

  try {
    // 1. Resolver el archivo para obtener la ruta actualizada
    const resolveResult = await resolveFile(fileIdentity, lastKnownPath);

    // 2. Si la ruta cambió, actualizar silenciosamente el elemento
    if (resolveResult.currentPath && resolveResult.currentPath !== lastKnownPath) {
      const currentElements = excalidrawAPI.getSceneElements();
      
      // Actualizamos usando el mismo mecanismo que Excalidraw para mutar elementos
      // No modificamos la identidad
      const updatedElements = currentElements.map((el) => {
        if (el.id === element.id) {
          return {
            ...el,
            customData: {
              ...el.customData,
              lastKnownPath: resolveResult.currentPath,
            },
          };
        }
        return el;
      });

      excalidrawAPI.updateScene({ elements: updatedElements });
    }

    // 3. Abrir el archivo
    // Pasamos la ruta posiblemente actualizada (o el resultado de resolveResult.currentPath)
    await openFile(fileIdentity, resolveResult.currentPath || lastKnownPath);
  } catch (error: any) {
    // Phase 6: Solo capturar el error para no crashear
    if (error.name === "BridgeError") {
      console.warn(`Link to File: Fallo al abrir el archivo - ${error.message} (${error.code})`);
    } else {
      console.error("Link to File: Error inesperado", error);
    }
  }
}
