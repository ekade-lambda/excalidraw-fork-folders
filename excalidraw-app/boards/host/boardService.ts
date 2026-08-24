/**
 * Board System — host / boardService (Fase 2).
 *
 * ORQUESTA el boot del Board System y expone stubs mínimos de integración con
 * el editor. Contiene SOLO lógica orquestadora del Board System (NO es el
 * composition root): App.tsx se limita a llamarlo.
 *
 * Reglas:
 *   - BoardRepository es la fuente de verdad multi-board.
 *   - LocalData NO se toca; el legacy localStorage["excalidraw"] SOLO se lee
 *     para migrar, nunca se modifica aquí.
 *   - No se construye UI ni navegación (Fases posteriores).
 */

import { CaptureUpdateAction, getCommonBounds } from "@excalidraw/excalidraw";

import { restoreElements } from "@excalidraw/excalidraw/data/restore";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { BinaryFiles } from "@excalidraw/excalidraw/types";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { createRootGraph } from "../domain/graph";
import { STORAGE_KEYS } from "../../app_constants";

import { BOARD_SYSTEM_SCHEMA_VERSION } from "../types";

import { boardsStoreActions } from "./boardState";

import type { BoardRepository } from "../repository/BoardRepository";
import type { BoardData, BoardId, BoardsGraph, FolderId } from "../types";

const LEGACY_ELEMENTS_KEY = STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS;

export interface BoardBootResult {
  graph: BoardsGraph;
  currentBoardId: BoardId;
  currentFolderId: FolderId;
  boardData: BoardData | null;
  migrated: boolean;
  createdRoot: boolean;
}

function hasLegacyState(): boolean {
  try {
    return window.localStorage.getItem(LEGACY_ELEMENTS_KEY) != null;
  } catch {
    return false;
  }
}

function readLegacyElements(): ExcalidrawElement[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_ELEMENTS_KEY);
    if (raw == null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExcalidrawElement[]) : [];
  } catch {
    return [];
  }
}

function buildBoardData(
  boardId: BoardId,
  name: string,
  elements: ExcalidrawElement[],
): BoardData {
  return {
    schemaVersion: BOARD_SYSTEM_SCHEMA_VERSION,
    boardId,
    elements,
    files: {} as BinaryFiles,
    viewport: null,
    name,
    updatedAt: Date.now(),
  };
}

/** Crea la raíz (graph + board) y la persiste. Devuelve ids. */
async function createRoot(repo: BoardRepository) {
  const graph = createRootGraph();
  const rootFolderId = graph.rootFolderId;
  const rootBoardId = graph.folders[rootFolderId].boardId;
  graph.lastOpenBoardId = rootBoardId;
  await repo.save(graph);
  return { graph, rootFolderId, rootBoardId };
}

/** Aplica el estado del boot al store jotai de la app. */
function commitState(
  currentBoardId: BoardId,
  currentFolderId: FolderId,
  boardData: BoardData | null,
) {
  boardsStoreActions.setCurrentBoardId(currentBoardId);
  boardsStoreActions.setCurrentFolderId(currentFolderId);
  boardsStoreActions.setBoardData(boardData);
  boardsStoreActions.setReady(true);
}
/**
 * BOOT del Board System.
 *  A) graph válido          → restaurar lastOpenBoardId (+ folder), cargar board.
 *  B) sin graph + legacy    → migrar legacy a board raíz, persistir.
 *  C) sin graph + sin legacy→ crear raíz vacía, persistir.
 */
export async function initializeBoardSystem(
  repo: BoardRepository,
): Promise<BoardBootResult> {
  const existing = await repo.load();

  if (!existing) {
    // Casos B/C
    const legacy = hasLegacyState();
    const elements = readLegacyElements();
    const { graph, rootFolderId, rootBoardId } = await createRoot(repo);
    const boardData = buildBoardData(rootBoardId, "root", elements);
    await repo.saveBoard(boardData);
    commitState(rootBoardId, rootFolderId, boardData);
    return {
      graph,
      currentBoardId: rootBoardId,
      currentFolderId: rootFolderId,
      boardData,
      migrated: legacy,
      createdRoot: true,
    };
  }

  // Caso A: graph ya existe → el legacy (si existe) NO tiene prioridad.
  const rootBoardId = existing.folders[existing.rootFolderId].boardId;
  let boardId =
    existing.lastOpenBoardId &&
    existing.boards[existing.lastOpenBoardId] !== undefined
      ? existing.lastOpenBoardId
      : rootBoardId;
  if (existing.boards[boardId] === undefined) {
    boardId = rootBoardId;
  }

  // Board inexistente/ausente → comportamiento seguro (no corromper graph).
  let boardData = await repo.loadBoard(boardId);
  if (!boardData) {
    boardData = buildBoardData(
      boardId,
      existing.boards[boardId]?.name ?? "root",
      [],
    );
  }
  const folderId = existing.boards[boardId].rootFolderId;
  commitState(boardId, folderId, boardData);
  return {
    graph: existing,
    currentBoardId: boardId,
    currentFolderId: folderId,
    boardData,
    migrated: false,
    createdRoot: false,
  };
}

/** Carga un board en el editor: actualiza escena, files y viewport (Fase 4). */
export function loadBoardIntoEditor(
  excalidrawAPI: ExcalidrawImperativeAPI,
  boardData: BoardData,
): void {
  const restored = restoreElements(boardData.elements, null, {
    repairBindings: true,
  });
  excalidrawAPI.updateScene({
    elements: restored,
    appState: { isLoading: false },
    captureUpdate: CaptureUpdateAction.NEVER,
  });

  const files = Object.values(boardData.files);
  if (files.length) {
    excalidrawAPI.addFiles(files);
  }

  // Restaura el viewport encuadrando el contenido del board. `setViewport` del
  // API NO acepta coords sueltas (scrollX/Y/zoom), por lo que usamos el
  // mecanismo público: encuadrar al contenido (getCommonBounds → target).
  const visible = restored.filter((el) => !el.isDeleted);
  if (visible.length) {
    const bounds = getCommonBounds(visible) as [number, number, number, number];
    excalidrawAPI.setViewport({ target: bounds, fit: "contain" });
  }
}

/** Stub de guardado del board actual (snapshot mínimo del editor). */
export async function saveCurrentBoard(
  excalidrawAPI: ExcalidrawImperativeAPI,
  repo: BoardRepository,
  boardId: BoardId,
): Promise<void> {
  const data: BoardData = {
    schemaVersion: BOARD_SYSTEM_SCHEMA_VERSION,
    boardId,
    elements:
      excalidrawAPI.getSceneElementsIncludingDeleted() as unknown as ExcalidrawElement[],
    files: excalidrawAPI.getFiles(),
    viewport: null,
    name: excalidrawAPI.getName(),
    updatedAt: Date.now(),
  };
  await repo.saveBoard(data);
}

/**
 * Abre una Folder (dobl-click en su representación): guarda el board actual,
 * valida que la folder siga existiendo en el grafo, resuelve su boardId 1:1,
 * carga el contenido al editor, restaura viewport y actualiza el estado.
 * NO crea folder/board nuevos y NO corrompe el grafo.
 */
export async function openFolder(opts: {
  repo: BoardRepository;
  excalidrawAPI: ExcalidrawImperativeAPI;
  folderId: FolderId;
}): Promise<{ ok: boolean; reason?: string }> {
  const { repo, excalidrawAPI, folderId } = opts;

  // 1. Persistir el board actual (la escena que está en el editor).
  const currentBoardId = boardsStoreActions.getCurrentBoardId();
  if (currentBoardId) {
    await saveCurrentBoard(excalidrawAPI, repo, currentBoardId);
  }

  // 2. Validar que la Folder siga existiendo y no sea la raíz "hija" (la raíz
  //    no puede abrirse como si fuera una carpeta a través de esta vía).
  const graph = await repo.load();
  if (!graph) {
    return { ok: false, reason: "no-graph" };
  }
  const folder = graph.folders[folderId];
  if (!folder) {
    return { ok: false, reason: "folder-not-found" };
  }

  // 3. Resolver Folder → Board (1:1).
  const boardId = folder.boardId;
  const board = graph.boards[boardId];
  if (!board || board.rootFolderId !== folder.id) {
    return { ok: false, reason: "board-not-found" };
  }

  // 4. Cargar BoardData (si falta, no romper: vacío).
  let boardData = await repo.loadBoard(boardId);
  if (!boardData) {
    boardData = buildBoardData(boardId, folder.name, []);
  }

  // 5. Vuelcar al editor (escena + files + viewport).
  loadBoardIntoEditor(excalidrawAPI, boardData);

  // 6. Actualizar estado del Board System.
  boardsStoreActions.setCurrentBoardId(boardId);
  boardsStoreActions.setCurrentFolderId(folderId);
  boardsStoreActions.setBoardData(boardData);
  boardsStoreActions.setReady(true);

  // 7. Persistir lastOpenBoardId para restaurar en el próximo boot.
  graph.lastOpenBoardId = boardId;
  await repo.save(graph);

  return { ok: true };
}
