import { describe, expect, it, beforeEach } from "vitest";

import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph, addFolder } from "../../boards/domain/graph";
import { deleteFolder } from "../../boards/host/folderService";
import { STORAGE_KEYS } from "../../app_constants";

describe("Board System :: Phase 11 GC Activation", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("1. GC no borra payload referenciado", async () => {
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    await repo.save((r1 as any).graph);
    const boardId = (r1 as any).boardId;
    await repo.saveBoard({
      schemaVersion: 1,
      boardId,
      elements: [],
      files: {},
      name: "A",
      viewport: null,
      updatedAt: 1,
    });

    const saved = await repo.loadBoard(boardId);
    expect(saved).not.toBeNull();

    await repo.runGarbageCollector((r1 as any).graph);

    const savedAfter = await repo.loadBoard(boardId);
    expect(savedAfter).not.toBeNull();
  });

  it("2. Payload huérfano protegido por WAR NO es recolectado", async () => {
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    await repo.save((r1 as any).graph);
    const boardId = (r1 as any).boardId;
    await repo.saveBoard({
      schemaVersion: 1,
      boardId,
      elements: [],
      files: {},
      name: "A",
      viewport: null,
      updatedAt: 1,
    });

    // Hacemos delete (ahora es huerfano)
    const mockAPI = () =>
      ({
        getSceneElementsIncludingDeleted: () => [],
        updateScene: () => {},
      } as any);
    await deleteFolder({
      repo,
      excalidrawAPI: mockAPI(),
      folderId: (r1 as any).folderId,
    });

    // Inyectamos WAR activo
    window.localStorage.setItem(
      `${STORAGE_KEYS.BOARDS_WAR_PREFIX}${boardId}`,
      Date.now().toString(),
    );

    const nextGraph = await repo.load();
    await repo.runGarbageCollector(nextGraph!);

    // A pesar de ser huerfano, el WAR lo protege
    const savedAfter = await repo.loadBoard(boardId);
    expect(savedAfter).not.toBeNull();
  });

  it("3. Payload huérfano sin WAR es recolectado", async () => {
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();
    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    await repo.save((r1 as any).graph);
    const boardId = (r1 as any).boardId;
    await repo.saveBoard({
      schemaVersion: 1,
      boardId,
      elements: [],
      files: {},
      name: "A",
      viewport: null,
      updatedAt: 1,
    });

    const mockAPI = () =>
      ({
        getSceneElementsIncludingDeleted: () => [],
        updateScene: () => {},
      } as any);
    await deleteFolder({
      repo,
      excalidrawAPI: mockAPI(),
      folderId: (r1 as any).folderId,
    });

    // WAR caducado o ausente (simulamos expirado poniendolo hace 2 horas)
    window.localStorage.setItem(
      `${STORAGE_KEYS.BOARDS_WAR_PREFIX}${boardId}`,
      (Date.now() - 2 * 60 * 60 * 1000).toString(),
    );

    const nextGraph = await repo.load();
    await repo.runGarbageCollector(nextGraph!);

    const savedAfter = window.localStorage.getItem(
      `${STORAGE_KEYS.BOARDS_BOARD_PREFIX}${boardId}`,
    );
    expect(savedAfter).toBeNull();
  });
});
