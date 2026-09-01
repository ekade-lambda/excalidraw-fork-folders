import { describe, it, expect, vi } from "vitest";
import { saveCurrentBoard } from "../../boards/host/boardService";
import { PostgresBoardRepository } from "../../boards/repository/PostgresBoardRepository";
import { boardsStoreActions } from "../../boards/host/boardState";
import { createRootGraph, addFolder } from "../../boards/domain/graph";

describe("Phase 7 - Board Name Synchronization", () => {
  it("should sync the canvas name to the corresponding Folder when saved", async () => {
    const repo = new PostgresBoardRepository();
    
    // Setup initial graph
    let graph = createRootGraph();
    const res = addFolder(graph, { parentId: graph.rootFolderId, name: "Old Name" });
    if (!res.ok) throw new Error();
    await repo.save(res.graph);
    
    // Set the current folder in Jotai mock
    boardsStoreActions.getCurrentFolderId = vi.fn().mockReturnValue(res.folderId);
    
    // Mock Excalidraw API
    const excalidrawAPI = {
      getName: () => "New Renamed Board",
      getSceneElementsIncludingDeleted: () => [],
      getFiles: () => ({})
    } as any;
    
    // Call save
    await saveCurrentBoard(excalidrawAPI, repo, res.boardId);
    
    // Verify graph was updated in backend
    const loadedGraph = await repo.load();
    expect(loadedGraph?.folders[res.folderId].name).toBe("New Renamed Board");
  });
});
