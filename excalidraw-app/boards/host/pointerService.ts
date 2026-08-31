/**
 * Board System — host / pointerService (Fase 6).
 *
 * Orquesta la creación de pointers (domain -> persistence -> UI/Excalidraw).
 */

import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { createPointer } from "../domain/pointers";

import { buildPointerVisual } from "./materialize";

import { boardsStoreActions } from "./boardState";

import type { BoardRepository } from "../repository/BoardRepository";
import type { FolderId } from "../types";

export async function createPointerInCanvas(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  targetFolderId: FolderId;
  name: string;
  sceneX: number;
  sceneY: number;
}): Promise<void> {
  const currentBoardId = boardsStoreActions.getCurrentBoardId();
  if (!currentBoardId) {
    throw new Error("Cannot create pointer: no board is open.");
  }

  // 1. Obtener y actualizar graph
  const graph = await opts.repo.load();
  if (!graph) {
    throw new Error("No graph available");
  }

  const targetFolder = graph.folders[opts.targetFolderId];
  if (!targetFolder) {
    throw new Error("Target folder not found in graph");
  }

  const result = createPointer(graph, {
    targetFolderId: opts.targetFolderId,
    name: targetFolder.name, // ENFORCE SINGLE SOURCE OF TRUTH
  });

  if (!result.ok) {
    throw new Error(`Failed to create pointer: ${result.reason}`);
  }

  // 2. Persistir grafo actualizado
  await opts.repo.save(result.graph);

  // 3. Crear materialización visual
  const visual = buildPointerVisual({
    pointerId: result.pointer.id,
    targetFolderId: opts.targetFolderId,
    boardId: currentBoardId,
    name: targetFolder.name, // ENFORCE SINGLE SOURCE OF TRUTH
    sceneX: opts.sceneX,
    sceneY: opts.sceneY,
  });

  // Añadir archivo (imagen)
  opts.excalidrawAPI.addFiles([visual.imageFile]);

  // Añadir elementos a la escena
  const elements = opts.excalidrawAPI.getSceneElementsIncludingDeleted();

  opts.excalidrawAPI.updateScene({
    elements: [...elements, visual.primary, visual.text],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
