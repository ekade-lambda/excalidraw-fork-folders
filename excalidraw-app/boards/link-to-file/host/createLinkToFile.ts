import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { pickFile } from "../bridgeClient";
import type { LinkToFileData } from "../types";
import { createFileCardElements } from "../ui/fileCard";

export interface CreateLinkToFileOpts {
  excalidrawAPI: ExcalidrawImperativeAPI;
  sceneX: number;
  sceneY: number;
}

/**
 * Orquesta la creación de un elemento Link to File en el canvas.
 * - Llama al picker nativo a través del bridgeClient.
 * - Si el usuario selecciona un archivo, crea un elemento Text con el
 *   identificador persistido en customData.
 * - Actualiza la escena activa de Excalidraw, delegando la persistencia
 *   a los mecanismos existentes.
 */
export async function createLinkToFile({
  excalidrawAPI,
  sceneX,
  sceneY,
}: CreateLinkToFileOpts): Promise<void> {
  // 1. Invocamos el File Picker nativo a través del cliente HTTP (Fase 4).
  const pickResult = await pickFile(); // lanza excepción si cancela o falla

  // 2. Construimos el dominio del vínculo.
  const customData: LinkToFileData = {
    type: "link-to-file",
    fileIdentity: pickResult.fileIdentity,
    lastKnownPath: pickResult.lastKnownPath,
    metadata: pickResult.metadata,
  };

  // 3. Representación visual como un "File Card" (Fase 7)
  const fileCardElements = createFileCardElements({
    sceneX,
    sceneY,
    customData,
  });

  // 4. Inyectamos los elementos en el Canvas actual.
  const currentElements = excalidrawAPI.getSceneElements();
  
  excalidrawAPI.updateScene({
    elements: [...currentElements, ...fileCardElements],
  });
}
