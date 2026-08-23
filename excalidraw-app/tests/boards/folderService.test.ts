import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { createRootGraph } from "../../boards/domain/graph";
import { createFolder } from "../../boards/host/folderService";
import { getFolderBoard } from "../../boards/domain/board";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { boardsStoreActions } from "../../boards/host/boardState";

const makeRepo = () => new LocalStorageBoardRepository();

/** Mock mínimo del ExcalidrawImperativeAPI usado por folderService. */
function mockApi() {
  const calls: { sceneElements?: ExcalidrawElement[]; addFiles?: unknown[] }[] =
    [];
  const api = {
    updateScene: vi.fn((opts: { elements?: ExcalidrawElement[] }) => {
      calls.push({ sceneElements: opts.elements });
    }),
    addFiles: vi.fn((files: unknown[]) => {
      calls[calls.length - 1].addFiles = files;
    }),
    getAppState: vi.fn(() => ({})),
    _calls: calls,
  };
  return api as unknown as ExcalidrawImperativeAPI & { _calls: typeof calls };
}

function resetBoardsStore() {
  boardsStoreActions.setCurrentBoardId(null);
  boardsStoreActions.setCurrentFolderId(null);
  boardsStoreActions.setBoardData(null);
  boardsStoreActions.setReady(false);
}

async function seedRoot(repo: LocalStorageBoardRepository) {
  const graph = createRootGraph({ name: "root" });
  const rootFolderId = graph.rootFolderId;
  const rootBoardId = graph.folders[rootFolderId].boardId;
  await repo.save(graph);
  await repo.saveBoard({
    schemaVersion: 1,
    boardId: rootBoardId,
    elements: [],
    files: {},
    viewport: null,
    name: "root",
    updatedAt: Date.now(),
  });
  return { graph, rootFolderId, rootBoardId };
}

describe("Board System :: folderService (Fase 3)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetBoardsStore();
    vi.restoreAllMocks();
  });

  it("crea folder + board bajo el padre sin duplicar el grafo", async () => {
    const repo = makeRepo();
    const { rootFolderId } = await seedRoot(repo);
    const api = mockApi();

    const result = await createFolder({
      repo,
      excalidrawAPI: api,
      parentFolderId: rootFolderId,
      name: "Investigaciones",
      sceneX: 10,
      sceneY: 20,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Invariantes: folder existe, parentId correcto, board 1:1 existe.
    const graph = await repo.load();
    const folder = graph!.folders[result.folderId];
    expect(folder.parentId).toBe(rootFolderId);
    expect(folder.boardId).toBe(result.boardId);
    // Board de la carpeta creado (vacío).
    expect(getFolderBoard(graph!, result.folderId)).toBeDefined();
    // El grafo NO se corrompe: la raíz sigue siendo la misma.
    expect(graph!.rootFolderId).toBe(rootFolderId);
  });

  it("añade la representación visual (imagen+texto) al board padre", async () => {
    const repo = makeRepo();
    const { rootFolderId, rootBoardId } = await seedRoot(repo);
    const api = mockApi();

    const result = await createFolder({
      repo,
      excalidrawAPI: api,
      parentFolderId: rootFolderId,
      name: "Carpeta",
      sceneX: 0,
      sceneY: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const parentData = await repo.loadBoard(rootBoardId);
    expect(parentData!.elements.length).toBe(2);
    const metas = parentData!.elements.map(
      (el) => el.customData?.folderBoard as any,
    );
    expect(
      metas.every(
        (m) => m?.kind === "folder" && m.folderId === result.folderId,
      ),
    ).toBe(true);
    // El archivo de imagen está en los files del board padre.
    const imageFileId = Object.keys(parentData!.files)[0];
    expect(imageFileId).toBeTruthy();
  });

  it("aplica updateScene + addFiles al editor (board activo)", async () => {
    const repo = makeRepo();
    const { rootFolderId } = await seedRoot(repo);
    const api = mockApi();

    await createFolder({
      repo,
      excalidrawAPI: api,
      parentFolderId: rootFolderId,
      name: "X",
      sceneX: 0,
      sceneY: 0,
    });

    const updateCalls = (api as any)._calls;
    expect(updateCalls.length).toBeGreaterThan(0);
    expect(updateCalls[updateCalls.length - 1].sceneElements).toHaveLength(2);
    expect(updateCalls[updateCalls.length - 1].addFiles).toHaveLength(1);
  });

  it("respetivamente no rompe invariantes al crear varias folders", async () => {
    const repo = makeRepo();
    const { rootFolderId, rootBoardId } = await seedRoot(repo);
    const api = mockApi();

    const r1 = await createFolder({
      repo,
      excalidrawAPI: api,
      parentFolderId: rootFolderId,
      name: "A",
      sceneX: 0,
      sceneY: 0,
    });
    const r2 = await createFolder({
      repo,
      excalidrawAPI: api,
      parentFolderId: rootFolderId,
      name: "B",
      sceneX: 0,
      sceneY: 0,
    });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) {
      return;
    }
    expect(r1.folderId).not.toBe(r2.folderId);

    const graph = await repo.load();
    // Solo la raíz + A + B tienen boards.
    expect(Object.keys(graph!.boards)).toHaveLength(3);
    // El board padre acumula 4 elementos (2 por folder).
    const parentData = await repo.loadBoard(rootBoardId);
    expect(parentData!.elements.length).toBe(4);
  });
});
