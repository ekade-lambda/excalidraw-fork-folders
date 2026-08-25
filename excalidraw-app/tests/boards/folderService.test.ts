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
    getSceneElementsIncludingDeleted: vi.fn(() => []),
    getFiles: vi.fn(() => ({})),
    getName: vi.fn(() => "test"),
    _calls: calls,
  };
  return api as unknown as ExcalidrawImperativeAPI & {
    _calls: typeof calls;
    getSceneElementsIncludingDeleted: any;
    getFiles: any;
    getName: any;
    updateScene: any;
  };
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

  it("Problema 1: createFolder syncs current board to repo if parent is current board", async () => {
    const repo = new LocalStorageBoardRepository();
    const { rootFolderId, rootBoardId } = await seedRoot(repo);
    boardsStoreActions.setCurrentBoardId(rootBoardId);

    // Simulate current board having a deleted folder element in excalidrawAPI (not in repo)
    const excalidrawAPI = mockApi();
    excalidrawAPI.getSceneElementsIncludingDeleted = vi
      .fn()
      .mockReturnValue([{ id: "el1", isDeleted: true } as any]);

    // Ensure repo has OLD elements
    const oldBoard = await repo.loadBoard(rootBoardId);
    oldBoard!.elements = [{ id: "el1", isDeleted: false } as any];
    await repo.saveBoard(oldBoard!);

    // Create new folder
    await createFolder({
      repo,
      excalidrawAPI,
      parentFolderId: rootFolderId,
      sceneX: 0,
      sceneY: 0,
    });

    // Validate that repo was synced BEFORE parentData was read
    // meaning the new elements should contain the isDeleted: true element, not the false one
    const updatedBoard = await repo.loadBoard(rootBoardId);
    expect(updatedBoard!.elements[0].isDeleted).toBe(true);
  });

  it("Problema 2: createFolder assigns monotonic folder numbering automatically", async () => {
    const repo = new LocalStorageBoardRepository();
    const { rootFolderId } = await seedRoot(repo);
    const excalidrawAPI = mockApi();

    const r1 = await createFolder({
      repo,
      excalidrawAPI,
      parentFolderId: rootFolderId,
      sceneX: 0,
      sceneY: 0,
    });
    const r2 = await createFolder({
      repo,
      excalidrawAPI,
      parentFolderId: rootFolderId,
      sceneX: 0,
      sceneY: 0,
    });

    const updatedGraph = await repo.load();
    // Assuming root graph counter started at undefined, folderCounter should be 2
    expect(updatedGraph!.folderCounter).toBe(2);
    expect(updatedGraph!.folders[(r1 as any).folderId].name).toBe("Carpeta 1");
    expect(updatedGraph!.folders[(r2 as any).folderId].name).toBe("Carpeta 2");

    // Delete Carpeta 2 logically (simulate)
    // Create a new folder
    const r3 = await createFolder({
      repo,
      excalidrawAPI,
      parentFolderId: rootFolderId,
      sceneX: 0,
      sceneY: 0,
    });
    const finalGraph = await repo.load();
    expect(finalGraph!.folders[(r3 as any).folderId].name).toBe("Carpeta 3"); // Monotonic!
  });

  it("Problema 3: renameFolder updates graph and scene without triggering undo divergence", async () => {
    const repo = new LocalStorageBoardRepository();
    const { graph, rootFolderId } = await seedRoot(repo);
    const excalidrawAPI = mockApi();

    // Insert a folder visually so renameFolder finds it
    const fId = "f-target";
    const bId = "b-target";
    graph.folders[fId] = {
      id: fId,
      name: "Carpeta 1",
      parentId: rootFolderId,
      boardId: bId,
      createdAt: 1,
      updatedAt: 1,
    };
    graph.boards[bId] = {
      id: bId,
      name: "Carpeta 1",
      rootFolderId: fId,
      createdAt: 1,
      updatedAt: 1,
    };
    await repo.save(graph);

    const textElement = {
      id: "text-1",
      customData: {
        folderBoard: { kind: "folder", role: "text", folderId: fId },
      },
      text: "Carpeta 1",
      originalText: "Carpeta 1",
    };
    excalidrawAPI.getSceneElementsIncludingDeleted = vi
      .fn()
      .mockReturnValue([textElement as any]);

    // Import dynamically since renameFolder might not be imported at top level
    const { renameFolder } = await import("../../boards/host/folderService");

    const res = await renameFolder({
      repo,
      excalidrawAPI,
      folderId: fId,
      newName: "Biology",
    });

    expect(res.ok).toBe(true);

    const updatedGraph = await repo.load();
    expect(updatedGraph!.folders[fId].name).toBe("Biology");
    expect(updatedGraph!.boards[bId].name).toBe("Biology");

    // Check updateScene call
    expect(excalidrawAPI.updateScene).toHaveBeenCalled();
    const updateCall = (excalidrawAPI.updateScene as any).mock.calls[0][0];
    expect(updateCall.captureUpdate).toBe("NEVER"); // NEVER as string enum
    expect(updateCall.elements[0].text).toBe("Biology");
  });
});
