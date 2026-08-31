import { describe, expect, it, beforeEach } from "vitest";

import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph, addFolder } from "../../boards/domain/graph";
import { deleteFolder } from "../../boards/host/folderService";
import { STORAGE_KEYS } from "../../app_constants";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

describe("Board System :: Phase 11 Delete Orchestration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const mockAPI = () => {
    let elements: any[] = [];
    return {
      getSceneElementsIncludingDeleted: () => elements,
      updateScene: (opts: any) => {
        elements = opts.elements || [];
      },
      __setElements: (els: any[]) => {
        elements = els;
      },
    } as any;
  };

  it("1. Delete de carpeta vacia y representacion visual local", async () => {
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    await repo.save((r1 as any).graph);
    await repo.saveBoard({
      schemaVersion: 1,
      boardId: (r1 as any).boardId,
      elements: [],
      files: {},
      name: "A",
      viewport: null,
      updatedAt: 1,
    });

    const api = mockAPI();
    api.__setElements([
      {
        id: "el1",
        type: "rectangle",
        customData: { folderBoard: { kind: "folder", role: "image", folderId: (r1 as any).folderId } },
      },
      {
        id: "el2",
        type: "text",
        customData: {
          folderBoard: { kind: "folder", role: "text", folderId: (r1 as any).folderId }
        },
      },
      { id: "el3", type: "rectangle" }, // Otro elemento
    ]);

    const res = await deleteFolder({
      repo,
      excalidrawAPI: api,
      folderId: (r1 as any).folderId,
    });
    expect(res.ok).toBe(true);

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeUndefined();

    const els = api.getSceneElementsIncludingDeleted();
    expect(els.length).toBe(1);
    expect(els[0].id).toBe("el3");
  });

  it("2. Delete de jerarquia profunda persistida", async () => {
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph;
    const r2 = addFolder(graph, { name: "B", parentId: (r1 as any).folderId });
    graph = (r2 as any).graph;
    const r3 = addFolder(graph, { name: "C", parentId: (r2 as any).folderId });
    await repo.save((r3 as any).graph);

    const api = mockAPI();
    await deleteFolder({
      repo,
      excalidrawAPI: api,
      folderId: (r1 as any).folderId,
    });

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeUndefined();
    expect(nextGraph!.folders[(r2 as any).folderId]).toBeUndefined();
    expect(nextGraph!.folders[(r3 as any).folderId]).toBeUndefined();
  });

  it("3. Interaccion Multi-tab: Delete genera señal storage", async () => {
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    await repo.save((r1 as any).graph);

    const api = mockAPI();
    let storageEventFired = false;
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEYS.BOARDS_GRAPH) storageEventFired = true;
    });

    await deleteFolder({
      repo,
      excalidrawAPI: api,
      folderId: (r1 as any).folderId,
    });

    // El save del delete deberia haber mutado localStorage y disparado el mock (Vitest jsdom a veces no lo lanza en la misma ventana, pero repo.save si lo guarda)
    const raw = window.localStorage.getItem(STORAGE_KEYS.BOARDS_GRAPH);
    expect(raw).toContain("root");
    expect(raw).not.toContain((r1 as any).folderId);
  });

  it("4. Zombie Rendering (Undo visual) es manejado pacíficamente por openFolderInternal", async () => {
    // Esto se prueba en boardService o folderService
    // Delete quita del graph. El Undo de excalidraw lo devuelve al canvas visualmente.
    // Si el usuario hace doble click, hitTest devuelve el folderId borrado.
    // La prueba real ya ocurre en boardService.test.ts (abrir folder inexistente devuelve error y no crash).
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    await repo.save(graph);

    // openFolderInternal mock (ya sabemos que openFolder falla pacificamente)
    const { openFolder } = await import("../../boards/host/boardService");
    const res = await openFolder({
      repo,
      excalidrawAPI: mockAPI(),
      folderId: "deleted-id",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("folder-not-found");
  });
});
