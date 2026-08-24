import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { createRootGraph, addFolder } from "../../boards/domain/graph";
import {
  openFolder,
  navigateBack,
  navigateForward,
  navigateToBreadcrumb,
  initializeBoardSystem,
} from "../../boards/host/boardService";
import { boardsStoreActions } from "../../boards/host/boardState";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";

const makeRepo = () => new LocalStorageBoardRepository();

function mockApi() {
  const api = {
    updateScene: vi.fn(),
    addFiles: vi.fn(),
    getAppState: vi.fn(() => ({ width: 800, height: 600 })),
    getSceneElementsIncludingDeleted: vi.fn(() => []),
    getFiles: vi.fn(() => ({})),
    getName: vi.fn(() => "root"),
    setViewport: vi.fn(),
  };
  return api as unknown as ExcalidrawImperativeAPI;
}

function resetStore() {
  boardsStoreActions.setCurrentBoardId(null);
  boardsStoreActions.setCurrentFolderId(null);
  boardsStoreActions.setBoardData(null);
  boardsStoreActions.setReady(false);
  boardsStoreActions.setNavigationHistory({ back: [], forward: [] });
}

/** Crea graph + folder B + folder C (hija de B) persistidos. */
async function seedGraphWithBC(repo: LocalStorageBoardRepository) {
  const graph = createRootGraph({ name: "root" });
  const rootFolderId = graph.rootFolderId;
  const rootBoardId = graph.folders[rootFolderId].boardId;
  const addB = addFolder(graph, { name: "B", parentId: rootFolderId });
  if (!addB.ok) {
    throw new Error("no B");
  }
  const addC = addFolder(addB.graph, { name: "C", parentId: addB.folderId });
  if (!addC.ok) {
    throw new Error("no C");
  }
  await repo.save(addC.graph);
  await repo.saveBoard({
    schemaVersion: 1,
    boardId: rootBoardId,
    elements: [],
    files: {},
    viewport: null,
    name: "root",
    updatedAt: Date.now(),
  });
  await repo.saveBoard({
    schemaVersion: 1,
    boardId: addB.boardId,
    elements: [],
    files: {},
    viewport: null,
    name: "B",
    updatedAt: Date.now(),
  });
  await repo.saveBoard({
    schemaVersion: 1,
    boardId: addC.boardId,
    elements: [],
    files: {},
    viewport: null,
    name: "C",
    updatedAt: Date.now(),
  });
  return {
    graph: addC.graph,
    rootFolderId,
    rootBoardId,
    bFolderId: addB.folderId,
    bBoardId: addB.boardId,
    cFolderId: addC.folderId,
    cBoardId: addC.boardId,
  };
}

describe("Board System :: navigation integration (Fase 5)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStore();
    vi.restoreAllMocks();
  });

  it("abrir una folder registra la navegación en el historial", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });

    const history = boardsStoreActions.getNavigationHistory();
    expect(history.back.length).toBe(2); // root + B
    expect(history.back[history.back.length - 1].id).toBe(bFolderId);
  });

  it("Back navega al folder anterior y no crea nueva entrada", async () => {
    const repo = makeRepo();
    const { rootFolderId, bFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });
    const historyBefore = boardsStoreActions.getNavigationHistory();
    const backLengthBefore = historyBefore.back.length;

    const result = await navigateBack({ repo, excalidrawAPI: api });
    expect(result.ok).toBe(true);
    expect(boardsStoreActions.getCurrentFolderId()).toBe(rootFolderId);

    const historyAfter = boardsStoreActions.getNavigationHistory();
    expect(historyAfter.back.length).toBe(backLengthBefore - 1);
    expect(historyAfter.forward.length).toBe(1);
  });

  it("Forward navega al folder siguiente y no crea nueva entrada", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });
    await navigateBack({ repo, excalidrawAPI: api });

    const result = await navigateForward({ repo, excalidrawAPI: api });
    expect(result.ok).toBe(true);
    expect(boardsStoreActions.getCurrentFolderId()).toBe(bFolderId);

    const history = boardsStoreActions.getNavigationHistory();
    expect(history.forward.length).toBe(0);
  });

  it("Back → nueva navegación → Forward invalidado", async () => {
    const repo = makeRepo();
    const { bFolderId, cFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });
    await openFolder({ repo, excalidrawAPI: api, folderId: cFolderId });
    await navigateBack({ repo, excalidrawAPI: api }); // back a B

    // Nueva navegación a C (invalida el forward)
    await openFolder({ repo, excalidrawAPI: api, folderId: cFolderId });

    const history = boardsStoreActions.getNavigationHistory();
    expect(history.forward.length).toBe(0); // forward invalidado
  });

  it("Back en el primer elemento no hace nada", async () => {
    const repo = makeRepo();
    await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    const result = await navigateBack({ repo, excalidrawAPI: api });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-back");
  });

  it("Forward en el último elemento no hace nada", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });
    const result = await navigateForward({ repo, excalidrawAPI: api });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-forward");
  });

  it("breadcrumb: navigateToBreadcrumb salta a un ancestro válido", async () => {
    const repo = makeRepo();
    const { cFolderId, rootFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: cFolderId });
    const result = await navigateToBreadcrumb({
      repo,
      excalidrawAPI: api,
      folderId: rootFolderId,
    });
    expect(result.ok).toBe(true);
    expect(boardsStoreActions.getCurrentFolderId()).toBe(rootFolderId);
  });

  it("navegación a folder inexistente falla de forma segura", async () => {
    const repo = makeRepo();
    await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    const result = await navigateToBreadcrumb({
      repo,
      excalidrawAPI: api,
      folderId: "f-ghost",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("folder-not-found");
  });

  it("cambios en el grafo que invaliden una entrada histórica → navegación segura", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });
    await navigateBack({ repo, excalidrawAPI: api });

    // Simular que el grafo cambió y B ya no existe.
    const graph = (await repo.load())!;
    delete graph.folders[bFolderId];
    await repo.save(graph);

    // Forward a B debería fallar de forma segura.
    const result = await navigateForward({ repo, excalidrawAPI: api });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("folder-not-found");
  });

  it("el estado Jotai y el Board mostrado coinciden después de navegar", async () => {
    const repo = makeRepo();
    const { bFolderId, bBoardId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });
    expect(boardsStoreActions.getCurrentFolderId()).toBe(bFolderId);
    expect(boardsStoreActions.getCurrentBoardId()).toBe(bBoardId);
    expect(boardsStoreActions.getBoardData()?.boardId).toBe(bBoardId);

    await navigateBack({ repo, excalidrawAPI: api });
    const graph = (await repo.load())!;
    expect(boardsStoreActions.getCurrentFolderId()).toBe(graph.rootFolderId);
    expect(boardsStoreActions.getCurrentBoardId()).toBe(
      graph.folders[graph.rootFolderId].boardId,
    );
  });

  it("al abrir un Board el viewport se resetea a 100% y centro en (0,0)", async () => {
    const repo = makeRepo();
    const { bFolderId } = await seedGraphWithBC(repo);
    const api = mockApi();

    await initializeBoardSystem(repo);

    // clear any calls from initializeBoardSystem (if it calls updateScene)
    vi.mocked(api.updateScene).mockClear();

    await openFolder({ repo, excalidrawAPI: api, folderId: bFolderId });

    expect(api.updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          zoom: { value: 1 },
          scrollX: 400, // 800 / 2
          scrollY: 300, // 600 / 2
        }),
      }),
    );
  });
});
