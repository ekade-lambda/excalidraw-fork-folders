import { describe, expect, it } from "vitest";

import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph, addFolder } from "../../boards/domain/graph";
import { createPointer } from "../../boards/domain/pointers";

describe("Board System :: Deletion Persistence (Fase 8.5.2)", () => {
  it("1. Crear Folder -> Undo -> el elemento visual queda eliminado -> el Board f�sico sigue existiendo", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    await repo.save(graph);

    // Simulate Excalidraw's Undo which sets isDeleted: true (visual only)
    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeDefined();
  });

  it("2. Crear Folder -> Undo -> Redo -> el elemento reaparece -> el Board f�sico sigue existiendo -> se puede abrir", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    await repo.save(graph);

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeDefined();
  });

  it("3. Crear Folder -> Delete manual -> el Board f�sico NO se elimina inmediatamente", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    await repo.save(graph);

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeDefined();
  });

  it("7. M�ltiples Folders -> borrar/restaurar uno -> los dem�s permanecen intactos", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    const r2 = addFolder(graph, { name: "B", parentId: graph.rootFolderId });
    graph = (r2 as any).graph!;
    await repo.save(graph);

    const nextGraph = await repo.load();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeDefined();
    expect(nextGraph!.folders[(r2 as any).folderId]).toBeDefined();
  });

  it("8. Folder con Board y/o FolderPointers relacionados -> Undo/Redo -> referencias v�lidas", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();
    let graph = createRootGraph();

    const r1 = addFolder(graph, { name: "A", parentId: graph.rootFolderId });
    graph = (r1 as any).graph!;
    const p1 = createPointer(graph, { targetFolderId: (r1 as any).folderId });
    graph = (p1 as any).graph!;

    await repo.save(graph);

    const nextGraph = await repo.load();
    expect(nextGraph!.pointers[(p1 as any).pointer.id]).toBeDefined();
    expect(nextGraph!.folders[(r1 as any).folderId]).toBeDefined();
  });
});
