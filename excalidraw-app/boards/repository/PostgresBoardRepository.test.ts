import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgresBoardRepository } from "./PostgresBoardRepository";
import type { BoardsGraph, BoardData } from "../types";

const REPO = new PostgresBoardRepository();

describe("PostgresBoardRepository Integration", () => {
  const rootId = `f-root-${Date.now()}`;
  const f1 = `f-1-${Date.now()}`;
  const p1 = `p-1-${Date.now()}`;
  const b1 = `b-1-${Date.now()}`;
  
  const mockGraph: BoardsGraph = {
    schemaVersion: 1,
    rootFolderId: rootId,
    folders: {
      [rootId]: { id: rootId, name: "Root", parentId: null, boardId: "b-root", createdAt: Date.now(), updatedAt: Date.now() },
      [f1]: { id: f1, name: "Folder 1", parentId: rootId, boardId: b1, createdAt: Date.now(), updatedAt: Date.now() }
    },
    pointers: {
      [p1]: { id: p1, targetFolderId: rootId, createdAt: Date.now() }
    },
    boards: {
      "b-root": { id: "b-root", name: "Root", rootFolderId: rootId, createdAt: Date.now(), updatedAt: Date.now() },
      [b1]: { id: b1, name: "Board 1", rootFolderId: f1, createdAt: Date.now(), updatedAt: Date.now() }
    },
    lastOpenBoardId: b1,
    folderCounter: 5
  };

  const mockBoard: BoardData = {
    schemaVersion: 1,
    boardId: b1,
    elements: [{ id: "e1", type: "rectangle", version: 1 } as any],
    files: { "file1": { mimeType: "image/png", id: "file1" as any, dataURL: "data:image/png;base64,A" as any, created: Date.now() } },
    viewport: { scrollX: 10, scrollY: 20, zoom: { value: 1 } as any }
  } as any;

  it("1. Save graph and 2. load exactly the same graph", async () => {
    await REPO.save(mockGraph);
    const loaded = await REPO.load();
    expect(loaded).toBeDefined();
    expect(loaded?.rootFolderId).toBe(rootId);
    expect(loaded?.folders[f1].name).toBe("Folder 1");
    expect(loaded?.pointers[p1].targetFolderId).toBe(rootId);
    expect(loaded?.lastOpenBoardId).toBe(b1);
  });

  it("3. Update a folder", async () => {
    mockGraph.folders[f1].name = "Updated Folder 1";
    await REPO.save(mockGraph);
    const loaded = await REPO.load();
    expect(loaded?.folders[f1].name).toBe("Updated Folder 1");
  });

  it("4. Create board (6, 7, 8, 9, 10. elements, files, viewport)", async () => {
    await REPO.saveBoard(mockBoard);
    const loaded = await REPO.loadBoard(b1);
    expect(loaded).toBeDefined();
    expect(loaded?.boardId).toBe(b1);
    expect(loaded?.elements[0].id).toBe("e1");
    expect(loaded?.files["file1"].id).toBe("file1");
    expect(loaded?.viewport?.scrollX).toBe(10);
  });

  it("11. Execute applyTransaction atomicaly (delete)", async () => {
    const patch = {
      deletedFolderIds: [f1],
      deletedBoardIds: [b1],
      deletedPointerIds: [p1]
    };
    
    await REPO.applyTransaction(mockGraph, patch);
    
    const loadedGraph = await REPO.load();
    expect(loadedGraph?.folders[f1]).toBeUndefined();
    expect(loadedGraph?.pointers[p1]).toBeUndefined();
    expect(loadedGraph?.boards[b1]).toBeUndefined();
  });

  it("clonePhysicalBoards", async () => {
    const b3 = `b-3-${Date.now()}`;
    const b4 = `b-4-${Date.now()}`;
    await REPO.saveBoard({ ...mockBoard, boardId: b3 });
    const map = new Map<string, string>();
    map.set(b3, b4);
    await REPO.clonePhysicalBoards(map);
    const cloned = await REPO.loadBoard(b4);
    expect(cloned).toBeDefined();
    expect(cloned?.elements[0].id).toBe("e1");
  });
});
