import { describe, it, expect, beforeEach } from "vitest";
import { createPointerInCanvas } from "../../boards/host/pointerService";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { boardsStoreActions } from "../../boards/host/boardState";
import { createFolder } from "../../boards/host/folderService";

describe("pointerService", () => {
  let repo: LocalStorageBoardRepository;
  let excalidrawAPI: any;
  let elements: any[];

  beforeEach(async () => {
    localStorage.clear();
    repo = new LocalStorageBoardRepository();
    elements = [];
    excalidrawAPI = {
      addFiles: () => {},
      getSceneElementsIncludingDeleted: () => elements,
      updateScene: (opts: any) => {
        if (opts.elements) {
          elements = opts.elements;
        }
      },
      getAppState: () => ({ width: 1000, height: 800 }),
    };

    boardsStoreActions.setCurrentBoardId("b_root");
    boardsStoreActions.setCurrentFolderId("f_root");
    await repo.save({
      schemaVersion: 1,
      rootFolderId: "f_root",
      folders: {
        f_root: { id: "f_root", name: "Root", parentId: null, boardId: "b_root", createdAt: 0, updatedAt: 0 },
      },
      pointers: {},
      boards: {
        b_root: { id: "b_root", name: "Root", rootFolderId: "f_root", createdAt: 0, updatedAt: 0 },
      },
      lastOpenBoardId: "b_root",
    });
  });

  it("creates a pointer and visual representation", async () => {
    await createFolder({
      repo,
      excalidrawAPI,
      parentFolderId: "f_root",
      name: "TargetFolder",
      sceneX: 0,
      sceneY: 0,
    });

    const graph = await repo.load();
    const newFolder = Object.values(graph!.folders).find((f) => f.id !== "f_root");

    await createPointerInCanvas({
      repo,
      excalidrawAPI,
      targetFolderId: newFolder!.id,
      name: "MyPointer",
      sceneX: 100,
      sceneY: 100,
    });

    const newGraph = await repo.load();
    const pointer = Object.values(newGraph!.pointers)[0];
    
    expect(pointer).toBeDefined();
    expect(pointer.targetFolderId).toBe(newFolder!.id);
    expect(pointer.name).toBe("MyPointer");

    // Check elements
    const primary = elements.find(
      (el) => el.customData?.folderBoard?.kind === "pointer" && el.customData.folderBoard.role === "image"
    );
    const text = elements.find(
      (el) => el.customData?.folderBoard?.kind === "pointer" && el.customData.folderBoard.role === "text"
    );

    expect(primary).toBeDefined();
    expect(text).toBeDefined();
    expect(text.text).toBe("↗ MyPointer");
  });
});
