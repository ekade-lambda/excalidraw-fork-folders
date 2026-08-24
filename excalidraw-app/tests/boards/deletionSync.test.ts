import { describe, expect, it, vi } from "vitest";

import { syncDeletionsFromEditor } from "../../boards/host/deletionSync";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph, addFolder } from "../../boards/domain/graph";
import { boardsStoreActions } from "../../boards/host/boardState";

import { createPointer } from "../../boards/domain/pointers";

function createMockAPI(elements: any[]) {
  return {
    getSceneElementsIncludingDeleted: () => elements,
    updateScene: vi.fn(),
    getAppState: () => ({ width: 800, height: 600 }),
    addFiles: vi.fn(),
  } as any;
}

function createDeletedFolderVisual(folderId: string) {
  return {
    id: "f1",
    isDeleted: true,
    customData: { folderBoard: { kind: "folder", folderId } },
  } as any;
}

function createDeletedPointerVisual(pointerId: string) {
  return {
    id: "p1",
    isDeleted: true,
    customData: { folderBoard: { kind: "pointer", pointerId } },
  } as any;
}

function createNormalVisual(id: string, isDeleted: boolean = false) {
  return {
    id,
    type: "rectangle",
    isDeleted,
  } as any;
}

describe("Board System :: Deletion Sync Integration (Fase 7.4)", () => {
  it("1. Delete de Folder mediante onChange y 4. Folder con hijos", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    const r2 = addFolder(graph, { name: "B", parentId: (r1 as any).folderId });
    graph = (r2 as any).graph!;

    await repo.save(graph);
    boardsStoreActions.setCurrentBoardId(
      graph.folders[graph.rootFolderId].boardId,
    );

    const fA = createDeletedFolderVisual((r1 as any).folderId);
    const mockAPI = createMockAPI([fA]);

    await syncDeletionsFromEditor([fA], repo, mockAPI);

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeUndefined();
    expect(nextGraph!.folders[(r2 as any).folderId]).toBeUndefined(); // subárbol eliminado
  });

  it("3. Delete de Folder raíz rechazado", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    await repo.save(graph);

    const fRoot = createDeletedFolderVisual(graph.rootFolderId);
    const mockAPI = createMockAPI([fRoot]);

    await syncDeletionsFromEditor([fRoot], repo, mockAPI);

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[graph.rootFolderId]).toBeDefined(); // Sobrevive!
    expect(mockAPI.updateScene).toHaveBeenCalled(); // Se restaura isDeleted a false
  });

  it("2. Delete de Pointer mediante onChange y 5. No elimina target y 6. Otros pointers intactos", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;

    const p1 = createPointer(graph, { targetFolderId: (r1 as any).folderId });
    graph = (p1 as any).graph!;
    const p2 = createPointer(graph, { targetFolderId: (r1 as any).folderId });
    graph = (p2 as any).graph!;

    await repo.save(graph);

    const visP1 = createDeletedPointerVisual((p1 as any).pointer.id);
    const mockAPI = createMockAPI([visP1]);

    await syncDeletionsFromEditor([visP1], repo, mockAPI);

    const nextGraph = await repo.load();
    expect(nextGraph!.pointers[(p1 as any).pointer.id]).toBeUndefined();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeDefined(); // Target sobrevive
    expect(nextGraph!.pointers[(p2 as any).pointer.id]).toBeDefined(); // Otro pointer sobrevive
  });

  it("7. Elementos normales eliminados no disparan Board System", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    await repo.save(graph);

    const normal = createNormalVisual("n1", true);
    const mockAPI = createMockAPI([normal]);

    await syncDeletionsFromEditor([normal], repo, mockAPI);

    const nextGraph = await repo.load();
    expect(nextGraph).toEqual(graph); // Sin cambios lógicos
    // Ningún patch aplicado
  });

  it("8. Imagen + texto de un Pointer no generan doble eliminación (Idempotencia / Anti-loop)", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    const p1 = createPointer(graph, { targetFolderId: (r1 as any).folderId });
    graph = (p1 as any).graph!;

    await repo.save(graph);

    const visImage = createDeletedPointerVisual((p1 as any).pointer.id);
    const visText = createDeletedPointerVisual((p1 as any).pointer.id); // mismo ID
    const mockAPI = createMockAPI([visImage, visText]);

    // La función hace un Set internamente
    await syncDeletionsFromEditor([visImage, visText], repo, mockAPI);

    const nextGraph = await repo.load();
    expect(nextGraph!.pointers[(p1 as any).pointer.id]).toBeUndefined();
  });

  it("10. Eliminar el Board actual provoca navegación segura al ancestro (fallback)", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    const aBoardId = graph.folders[(r1 as any).folderId].boardId;

    await repo.save(graph);

    // Save empty board payload for root to enable fallback
    await repo.saveBoard({
      boardId: graph.folders[graph.rootFolderId].boardId,
      elements: [],
      files: {},
      schemaVersion: 2,
      updatedAt: 0,
      viewport: null,
      name: "Root",
    });

    // Simulamos que estamos EN la carpeta A
    boardsStoreActions.setCurrentBoardId(aBoardId);
    boardsStoreActions.setCurrentFolderId((r1 as any).folderId);

    // Borramos A desde otro lado, o el usuario borra la carpeta A (raro si está dentro, pero válido)
    const fA = createDeletedFolderVisual((r1 as any).folderId);
    const mockAPI = createMockAPI([fA]);

    await syncDeletionsFromEditor([fA], repo, mockAPI);

    // Verificamos navegación
    expect(boardsStoreActions.getCurrentBoardId()).toBe(
      graph.folders[graph.rootFolderId].boardId,
    );
  });
});
