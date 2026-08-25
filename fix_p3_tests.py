import os
path = 'excalidraw-app/tests/boards/folderService.test.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

tests_addition = """
  it("Problema 1: createFolder syncs current board to repo if parent is current board", async () => {
    const repo = new LocalStorageBoardRepository();
    const { graph, rootFolderId, rootBoardId } = await initSystem(repo);
    boardsStoreActions.setCurrentBoardId(rootBoardId);
    
    // Simulate current board having a deleted folder element in excalidrawAPI (not in repo)
    const excalidrawAPI = createMockExcalidrawAPI();
    excalidrawAPI.getSceneElementsIncludingDeleted.mockReturnValue([
      { id: "el1", isDeleted: true } as any
    ]);
    
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
    const { graph, rootFolderId } = await initSystem(repo);
    const excalidrawAPI = createMockExcalidrawAPI();
    
    const r1 = await createFolder({ repo, excalidrawAPI, parentFolderId: rootFolderId, sceneX: 0, sceneY: 0 });
    const r2 = await createFolder({ repo, excalidrawAPI, parentFolderId: rootFolderId, sceneX: 0, sceneY: 0 });
    
    const updatedGraph = await repo.load();
    // Assuming root graph counter started at undefined, folderCounter should be 2
    expect(updatedGraph!.folderCounter).toBe(2);
    expect(updatedGraph!.folders[(r1 as any).folderId].name).toBe("Carpeta 1");
    expect(updatedGraph!.folders[(r2 as any).folderId].name).toBe("Carpeta 2");
    
    // Delete Carpeta 2 logically (simulate)
    // Create a new folder
    const r3 = await createFolder({ repo, excalidrawAPI, parentFolderId: rootFolderId, sceneX: 0, sceneY: 0 });
    const finalGraph = await repo.load();
    expect(finalGraph!.folders[(r3 as any).folderId].name).toBe("Carpeta 3"); // Monotonic!
  });

  it("Problema 3: renameFolder updates graph and scene without triggering undo divergence", async () => {
    const repo = new LocalStorageBoardRepository();
    const { graph, rootFolderId } = await initSystem(repo);
    const excalidrawAPI = createMockExcalidrawAPI();
    
    // Insert a folder visually so renameFolder finds it
    const fId = "f-target";
    const bId = "b-target";
    graph.folders[fId] = { id: fId, name: "Carpeta 1", parentId: rootFolderId, boardId: bId, createdAt: 1, updatedAt: 1 };
    graph.boards[bId] = { id: bId, name: "Carpeta 1", rootFolderId: fId, createdAt: 1, updatedAt: 1 };
    await repo.save(graph);
    
    const textElement = {
      id: "text-1",
      customData: { folderBoard: { kind: "folder", role: "text", folderId: fId } },
      text: "Carpeta 1",
      originalText: "Carpeta 1"
    };
    excalidrawAPI.getSceneElementsIncludingDeleted.mockReturnValue([textElement as any]);
    
    // Import dynamically since renameFolder might not be imported at top level
    const { renameFolder } = await import("../../boards/host/folderService");
    
    const res = await renameFolder({
      repo,
      excalidrawAPI,
      folderId: fId,
      newName: "Biology"
    });
    
    expect(res.ok).toBe(true);
    
    const updatedGraph = await repo.load();
    expect(updatedGraph!.folders[fId].name).toBe("Biology");
    expect(updatedGraph!.boards[bId].name).toBe("Biology");
    
    // Check updateScene call
    expect(excalidrawAPI.updateScene).toHaveBeenCalled();
    const updateCall = excalidrawAPI.updateScene.mock.calls[0][0];
    expect(updateCall.captureUpdate).toBe(0); // NEVER
    expect(updateCall.elements[0].text).toBe("Biology");
  });
"""

# Insert before last '});'
index = content.rfind('});')
content = content[:index] + tests_addition + content[index:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Tests added to folderService.test.ts")
