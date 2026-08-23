/**
 * Board System — host / folderService (Fase 3).
 *
 * Orquesta la creación de una folder visual:
 *   - usa el DOMINIO (addFolder) para crear folder+board respetando invariantes;
 *   - persiste el graph y el board de la carpeta vía BoardRepository;
 *   - construye la representación visual (materialize) y la persiste en el
 *     board padre (elementos + imagen);
 *   - aplica la representación al editor (updateScene/addFiles).
 *
 * NO contiene lógica de dominio duplicada y NO accede a localStorage directo.
 */

import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { addFolder } from "../domain/graph";

import { buildFolderVisual } from "./materialize";

import type { BoardId, FolderId } from "../types";
import type { BoardRepository } from "../repository/BoardRepository";

export type CreateFolderResult =
  | { ok: true; folderId: FolderId; boardId: BoardId }
  | { ok: false; reason: "no-graph" | "parent-not-found" };

/**
 * Crea una folder real + su board (dominio) bajo `parentFolderId`, persiste el
 * graph y el board de la carpeta, y aplica la representación visual al board
 * padre (que debe ser el activo).
 */
export async function createFolder(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  parentFolderId: FolderId;
  name: string;
  sceneX: number;
  sceneY: number;
}): Promise<CreateFolderResult> {
  const { repo, excalidrawAPI, parentFolderId, name, sceneX, sceneY } = opts;

  const graph = await repo.load();
  if (!graph) {
    return { ok: false, reason: "no-graph" };
  }

  // Dominio: crea folder + board (respeta invariantes del grafo).
  const addResult = addFolder(graph, { name, parentId: parentFolderId });
  if (!addResult.ok) {
    return { ok: false, reason: "parent-not-found" };
  }

  const folderId = addResult.folderId;
  const boardId = addResult.boardId;

  // Persistir graph (ya con la carpeta + board nuevos).
  await repo.save(addResult.graph);

  // Persistir el board vacío de la carpeta.
  await repo.saveBoard({
    schemaVersion: 1,
    boardId,
    elements: [],
    files: {},
    viewport: null,
    name,
    updatedAt: Date.now(),
  });

  // Representación visual en el board PARENT (el activo).
  const parentBoardId = addResult.graph.folders[parentFolderId].boardId;
  const parentData = await repo.loadBoard(parentBoardId);
  if (!parentData) {
    return { ok: true, folderId, boardId };
  }

  const { primary, text, fileId, imageFile } = buildFolderVisual({
    folderId,
    boardId,
    name,
    sceneX,
    sceneY,
  });
  const nextElements = [...parentData.elements, primary, text];
  const nextFiles = { ...parentData.files, [fileId]: imageFile };

  await repo.saveBoard({
    ...parentData,
    elements: nextElements,
    files: nextFiles,
    updatedAt: Date.now(),
  });

  // Aplicar al editor (board padre es el activo).
  excalidrawAPI.updateScene({
    elements: nextElements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  excalidrawAPI.addFiles([imageFile]);

  return { ok: true, folderId, boardId };
}
