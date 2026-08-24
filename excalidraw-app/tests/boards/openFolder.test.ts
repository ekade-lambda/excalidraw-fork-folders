import { beforeEach, describe, expect, it, vi } from "vitest";

import { newTextElement } from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { createRootGraph, addFolder } from "../../boards/domain/graph";
import { openFolder } from "../../boards/host/boardService";
import { boardsStoreActions } from "../../boards/host/boardState";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { getFolderBoard } from "../../boards/domain/board";

const makeRepo = () => new LocalStorageBoardRepository();

function mockApi() {
  const api = {
    updateScene: vi.fn(),
    addFiles: vi.fn(),
    getAppState: vi.fn(() => ({})),
    getSceneElementsIncludingDeleted: vi.fn(() => []),
    getFiles: vi.fn(() => ({})),
    getName: vi.fn(() => "root"),
    setViewport: vi.fn(),
  };
  return api as unknown as ExcalidrawImperativeAPI & {
    updateScene: ReturnType<typeof vi.fn>;
    setViewport: ReturnType<typeof vi.fn>;
  };
}

function resetStore() {
  boardsStoreActions.setCurrentBoardId(null);
  boardsStoreActions.setCurrentFolderId(null);
  boardsStoreActions.setBoardData(null);
  boardsStoreActions.setReady(false);
}

/** Crea graph + folder B (con board) persistidos. Devuelve ids. */
async function seedGraphWithB(repo: LocalStorageBoardRepository) {
  const graph = createRootGraph({ name: "root" });
  const rootFolderId = graph.rootFolderId;
  const rootBoardId = graph.folders[rootFolderId].boardId;
  const add = addFolder(graph, { name: "B", parentId: rootFolderId });
  if (!add.ok) {
    throw new Error("no B");
  }
  const bFolderId = add.folderId;
  const bBoardId = add.boardId;
  await repo.save(add.graph);
  await repo.saveBoard({
    schemaVersion: 1,
    boardId: rootBoardId,
    elements: [],
    files: {},
    viewport: null,
    name: "root",
    updatedAt: Date.now(),
  });
  // Board B con contenido (un texto) para que la restauración de viewport sea observable.
  const bElement = newTextElement({
    text: "contenido B",
    x: 0,
    y: 0,
    fontSize: 20,
  });
  await repo.saveBoard({
    schemaVersion: 1,
    boardId: bBoardId,
    elements: [bElement as unknown as ExcalidrawElement],
    files: {},
    viewport: null,
    name: "B",
    updatedAt: Date.now(),
  });
  return { graph: add.graph, rootFolderId, rootBoardId, bFolderId, bBoardId };
}

describe("Board System :: openFolder (Fase 4)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStore();
    vi.restoreAllMocks();
  });

  it("abre una folder válida y resuelve Folder → Board correctamente", async () => {
    const repo = makeRepo();
    const { bFolderId, bBoardId } = await seedGraphWithB(repo);
    const api = mockApi();

    const res = await openFolder({
      repo,
      excalidrawAPI: api,
      folderId: bFolderId,
    });
    expect(res.ok).toBe(true);

    // Estado actualizado (currentFolderId/currentBoardId/boardData).
    expect(boardsStoreActions.getCurrentFolderId()).toBe(bFolderId);
    expect(boardsStoreActions.getCurrentBoardId()).toBe(bBoardId);
    expect(boardsStoreActions.getBoardData()?.boardId).toBe(bBoardId);
    expect(boardsStoreActions.getReady()).toBe(true);

    // Se cargó la escena.
    expect(api.updateScene).toHaveBeenCalled();
    // Se restauró el viewport (o al menos se llamó setViewport si hay contenido).
    expect(api.setViewport).toHaveBeenCalled();

    // El grafo NO se corrompe ni crea folder/board nuevos.
    const graph = await repo.load();
    expect(Object.keys(graph!.folders)).toHaveLength(2);
    expect(graph!.lastOpenBoardId).toBe(bBoardId);
  });

  it("no abre una folder inexistente (inválida) y no modifica el grafo", async () => {
    const repo = makeRepo();
    await seedGraphWithB(repo);
    const api = mockApi();
    const graphBefore = await repo.load();

    const res = await openFolder({
      repo,
      excalidrawAPI: api,
      folderId: "f-ghost",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("folder-not-found");

    // Grafo intacto.
    const graphAfter = await repo.load();
    expect(graphAfter).toEqual(graphBefore);
    // No se llamó a la carga de escena.
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("comportamiento seguro si el BoardData está ausente (crea vacío, no rompe)", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithB(repo);
    const api = mockApi();

    // Forzar: borrar el board de B del repo.
    const graph = (await repo.load())!;
    const bBoardId = graph.folders[bFolderId].boardId;
    await repo.deleteBoard(bBoardId);

    const res = await openFolder({
      repo,
      excalidrawAPI: api,
      folderId: bFolderId,
    });
    expect(res.ok).toBe(true);
    expect(boardsStoreActions.getCurrentBoardId()).toBe(bBoardId);
  });

  it("guardar el board actual ocurre antes de cargar el destino", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithB(repo);
    // Board actual = raíz.
    boardsStoreActions.setCurrentBoardId(
      (await repo.load())!.boards[Object.keys((await repo.load())!.boards)[0]]
        .id,
    );
    boardsStoreActions.setCurrentFolderId((await repo.load())!.rootFolderId);
    const api = mockApi();

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });

    // El board actual (raíz) se persistió: su saveBoard se llamó (vía getScene.../getName).
    expect(api.getSceneElementsIncludingDeleted).toHaveBeenCalled();
    expect(api.getName).toHaveBeenCalled();
  });

  it("no crea una segunda carpeta/board al abrir (1:1 preservado)", async () => {
    const repo = makeRepo();
    const { bFolderId, bBoardId } = await seedGraphWithB(repo);
    const api = mockApi();

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });

    const graph = (await repo.load())!;
    const folder = graph.folders[bFolderId];
    expect(folder.boardId).toBe(bBoardId);
    expect(getFolderBoard(graph, bFolderId)?.rootFolderId).toBe(bFolderId);
    expect(Object.keys(graph.boards)).toHaveLength(2); // raíz + B
  });
});
