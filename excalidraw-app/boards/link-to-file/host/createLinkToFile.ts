import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { newTextElement } from "@excalidraw/element";
import { pickFile } from "../bridgeClient";
import type { LinkToFileData } from "../types";

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

  // 3. Representación provisional de Fase 5:
  // Elegimos un TextElement simple. Esto garantiza que el elemento
  // sobrevive a Undo/Redo, Copy/Paste y persistencia sin requerir
  // ninguna modificación a los repositorios ni core de Excalidraw.
  // En Fase 6 podrá ser reemplazado visualmente sin perder la identidad.
  const textElement = newTextElement({
    text: `🔗 ${pickResult.metadata.name}`,
    x: sceneX,
    y: sceneY,
    fontSize: 20,
    strokeColor: "#228be6", // un color distintivo
    customData,
  });

  // 4. Inyectamos el elemento en el Canvas actual.
  // getSceneElements() devuelve todos los elementos activos de la escena.
  const currentElements = excalidrawAPI.getSceneElements();
  
  excalidrawAPI.updateScene({
    elements: [...currentElements, textElement],
  });
}
