import { describe, expect, it, vi } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { handleOnDuplicate } from "../../boards/host/duplicate";
import {
  LocalStorageBoardRepository,
  createEmptyBoardData,
} from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph } from "../../boards/domain/graph";

// Setup polyfill for safeGet/safeSet which uses window.localStorage
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("onDuplicate flow", () => {
  beforeEach(() => {
    storage.clear();
  });

  const createElement = (id: string, meta?: any): ExcalidrawElement =>
    ({
      id,
      type: "rectangle",
      customData: meta ? { folderBoard: meta } : undefined,
    } as any);

  it("should ignore normal elements without Board System metadata", () => {
    const repo = new LocalStorageBoardRepository();
    const prevElements = [createElement("el1")];
    const nextElements = [createElement("el1"), createElement("el2")]; // el2 is duplicated

    const result = handleOnDuplicate(nextElements, prevElements, repo, "root");
    expect(result).toBeUndefined(); // Lets Excalidraw handle it normally
  });

  it("should successfully clone Folder and its physical boards, updating logical graph", () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    graph.folders.f1 = {
      id: "f1",
      name: "Folder1",
      parentId: graph.rootFolderId,
      boardId: "b1",
      createdAt: 0,
      updatedAt: 0,
    };
    graph.boards.b1 = {
      id: "b1",
      name: "b1",
      rootFolderId: "f1",
      createdAt: 0,
      updatedAt: 0,
      viewport: null,
    };
    repo.saveSync(graph);
    repo.saveBoardSync(createEmptyBoardData("b1"));

    const elFolder = createElement("el_f1", { kind: "folder", folderId: "f1" });
    const prevElements = [elFolder];

    // Ctrl+D duplicates it to el_f1_dup
    const elFolderDup = createElement("el_f1_dup", {
      kind: "folder",
      folderId: "f1",
    });
    const nextElements = [elFolder, elFolderDup];

    const result = handleOnDuplicate(
      nextElements,
      prevElements,
      repo,
      graph.rootFolderId,
    );
    expect(result).toBeDefined();

    // Verify it remapped the ID
    const newFolderEl = result!.find((el) => el.id === "el_f1_dup");
    expect(newFolderEl).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newFolderId = (newFolderEl as any).customData!.folderBoard!.folderId;
    expect(newFolderId).not.toBe("f1");

    // Verify logical graph updated
    const newGraph = repo.loadSync();
    expect(newGraph!.folders[newFolderId]).toBeDefined();
    expect(newGraph!.folders[newFolderId].name).toBe("Folder1");

    // Verify physical board created
    const newBoardId = newGraph!.folders[newFolderId].boardId;
    const newBoard = repo.loadBoardSync(newBoardId);
    expect(newBoard).toBeDefined();
    expect(newBoard!.boardId).toBe(newBoardId);
  });

  it("should abort if capability is missing", () => {
    const repo = new LocalStorageBoardRepository();
    // Simulate missing capability
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (repo as any).clonePhysicalBoardsSync = undefined;

    const elFolder = createElement("el_f1", { kind: "folder", folderId: "f1" });
    const elFolderDup = createElement("el_f1_dup", {
      kind: "folder",
      folderId: "f1",
    });
    const prevElements = [elFolder];
    const nextElements = [elFolder, elFolderDup];

    const result = handleOnDuplicate(nextElements, prevElements, repo, "root");

    // Should filter out the board system clone
    expect(result).toEqual([elFolder]);
  });

  it("should abort if loadSync fails to load the graph", () => {
    const repo = new LocalStorageBoardRepository();
    // Force loadSync to return null
    vi.spyOn(repo, "loadSync").mockReturnValue(null);

    const elFolder = createElement("el_f1", { kind: "folder", folderId: "f1" });
    const elFolderDup = createElement("el_f1_dup", {
      kind: "folder",
      folderId: "f1",
    });
    const prevElements = [elFolder];
    const nextElements = [elFolder, elFolderDup];

    const result = handleOnDuplicate(nextElements, prevElements, repo, "root");

    // Should filter out the board system clone
    expect(result).toEqual([elFolder]);
  });

  it("should abort and rollback if physical clone fails (e.g. QuotaExceededError)", () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    graph.folders.f1 = {
      id: "f1",
      name: "Folder1",
      parentId: graph.rootFolderId,
      boardId: "b1",
      createdAt: 0,
      updatedAt: 0,
    };
    graph.boards.b1 = {
      id: "b1",
      name: "b1",
      rootFolderId: "f1",
      createdAt: 0,
      updatedAt: 0,
      viewport: null,
    };
    repo.saveSync(graph);
    repo.saveBoardSync(createEmptyBoardData("b1"));

    // Mock an error during physical cloning

    vi.spyOn(repo, "clonePhysicalBoardsSync").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    const saveSyncSpy = vi.spyOn(repo, "saveSync");

    const elFolder = createElement("el_f1", { kind: "folder", folderId: "f1" });
    const elFolderDup = createElement("el_f1_dup", {
      kind: "folder",
      folderId: "f1",
    });
    const prevElements = [elFolder];
    const nextElements = [elFolder, elFolderDup];

    const result = handleOnDuplicate(
      nextElements,
      prevElements,
      repo,
      graph.rootFolderId,
    );

    // Should filter out the board system clone
    expect(result).toEqual([elFolder]);

    // Should NOT have saved the graph
    expect(saveSyncSpy).not.toHaveBeenCalled();

    // Graph remains untouched
    const newGraph = repo.loadSync();
    expect(Object.keys(newGraph!.folders).length).toBe(2); // root + f1
  });

  it("should duplicate image + text maintaining the same folderId for both", () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    graph.folders.f1 = {
      id: "f1",
      name: "Folder1",
      parentId: graph.rootFolderId,
      boardId: "b1",
      createdAt: 0,
      updatedAt: 0,
    };
    graph.boards.b1 = {
      id: "b1",
      name: "b1",
      rootFolderId: "f1",
      createdAt: 0,
      updatedAt: 0,
      viewport: null,
    };
    repo.saveSync(graph);
    repo.saveBoardSync(createEmptyBoardData("b1"));

    const elImg = createElement("img1", { kind: "folder", folderId: "f1" });
    const elText = createElement("txt1", { kind: "folder", folderId: "f1" });
    const prevElements = [elImg, elText];

    // Ctrl+D duplicates both
    const elImgDup = createElement("img1_dup", {
      kind: "folder",
      folderId: "f1",
    });
    const elTextDup = createElement("txt1_dup", {
      kind: "folder",
      folderId: "f1",
    });
    const nextElements = [elImg, elText, elImgDup, elTextDup];

    const result = handleOnDuplicate(
      nextElements,
      prevElements,
      repo,
      graph.rootFolderId,
    );

    const newImg = result!.find((el) => el.id === "img1_dup");
    const newText = result!.find((el) => el.id === "txt1_dup");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((newImg as any).customData!.folderBoard!.folderId).toBe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (newText as any).customData!.folderBoard!.folderId,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((newImg as any).customData!.folderBoard!.folderId).not.toBe("f1");
  });
});
