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

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import { addFolder } from "../domain/graph";
import { prepareDeleteFolderPatch, applyDeletePatch } from "../domain/delete";

import { boardsStoreActions } from "./boardState";
import { saveCurrentBoard } from "./boardService";
import { buildFolderVisual, findFolderVisual } from "./materialize";

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
  name?: string;
  sceneX: number;
  sceneY: number;
}): Promise<CreateFolderResult> {
  const { repo, excalidrawAPI, parentFolderId, sceneX, sceneY } = opts;

  const graph = await repo.load();
  if (!graph) {
    return { ok: false, reason: "no-graph" };
  }

  // Problema 2: Numeración monotónica
  let finalName = opts.name;
  if (!finalName) {
    graph.folderCounter = (graph.folderCounter || 0) + 1;
    finalName = `Carpeta ${graph.folderCounter}`;
  }

  // Dominio: crea folder + board (respeta invariantes del grafo).
  const addResult = addFolder(graph, {
    name: finalName,
    parentId: parentFolderId,
  });

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
    name: finalName,
    updatedAt: Date.now(),
  });

  // Representación visual en el board PARENT (el activo).
  const parentBoardId = addResult.graph.folders[parentFolderId].boardId;
  // Problema 1: Sincronizar la memoria activa del editor con el repositorio ANTES de leer
  // parentData, para garantizar que los elementos recién borrados tengan isDeleted: true.
  const currentBoardId = boardsStoreActions.getCurrentBoardId();
  if (parentBoardId === currentBoardId) {
    await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
  }

  const parentData = await repo.loadBoard(parentBoardId);
  if (!parentData) {
    return { ok: true, folderId, boardId };
  }

  const { primary, text, fileId, imageFile } = buildFolderVisual({
    folderId,
    boardId,
    name: finalName,
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

export async function renameFolder(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  folderId: FolderId;
  newName: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { repo, excalidrawAPI, folderId, newName } = opts;

  // 1. Update domain graph
  const graph = await repo.load();
  if (!graph) {
    return { ok: false, reason: "no-graph" };
  }
  const folder = graph.folders[folderId];
  if (!folder) {
    return { ok: false, reason: "folder-not-found" };
  }

  folder.name = newName;
  folder.updatedAt = Date.now();

  const boardId = folder.boardId;
  const board = graph.boards[boardId];
  if (board) {
    board.name = newName;
    board.updatedAt = Date.now();
  }

  await repo.save(graph);

  // 2. Locate text element in currently active scene and update it visually
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  let changed = false;

  const nextElements = elements.map((e) => {
    const meta = e.customData?.folderBoard as any;
    if (meta && meta.role === "text") {
      if (meta.kind === "folder" && meta.folderId === folderId) {
        changed = true;
        return {
          ...e,
          text: newName,
          originalText: newName,
          width: Math.max(120, newName.length * 10),
        } as unknown as ExcalidrawTextElement;
      }
      if (meta.kind === "pointer" && meta.targetFolderId === folderId) {
        changed = true;
        const pName = newName.startsWith("↗") ? newName : `↗ ${newName}`;
        return {
          ...e,
          text: pName,
          originalText: pName,
          width: Math.max(120, pName.length * 10),
        } as unknown as ExcalidrawTextElement;
      }
    }
    return e;
  });

  if (changed) {
    // Use CaptureUpdateAction.NEVER so it avoids diverging if user calls Undo
    excalidrawAPI.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  return { ok: true };
}

export async function deleteFolder(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  folderId: FolderId;
}): Promise<{ ok: boolean; reason?: string }> {
  const { repo, excalidrawAPI, folderId } = opts;

  // 1. Cargar el graph actual
  const graph = await repo.load();
  if (!graph) {
    return { ok: false, reason: "no-graph" };
  }

  // 2. Calcular parche de borrado
  const patchRes = prepareDeleteFolderPatch(graph, folderId);
  if (!patchRes.ok) {
    return { ok: false, reason: patchRes.reason };
  }

  // 3. Aplicar parche estructural atómico
  const nextGraph = applyDeletePatch(graph, patchRes.patch);

  // 4. Persistir el graph (dispara evento storage para otras pestañas)
  await repo.save(nextGraph);

  // 5. Limpieza visual síncrona en la pestaña actual
  const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
  const folderVisual = findFolderVisual(elements, folderId);

  if (folderVisual && folderVisual.primary) {
    // Filtrar los elementos primarios y de texto para eliminarlos visualmente
    const idsToRemove = new Set(
      [folderVisual.primary.id, folderVisual.text?.id].filter(Boolean),
    );

    const nextElements = elements.filter((e) => !idsToRemove.has(e.id));

    // Forzar actualización inmediata para que quede registrado visualmente.
    // Esto crea un paso en el Undo Stack nativo de Excalidraw.
    excalidrawAPI.updateScene({
      elements: nextElements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }

  return { ok: true };
}

