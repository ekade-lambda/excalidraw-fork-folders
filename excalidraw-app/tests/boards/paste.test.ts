import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { handleOnCopy } from "../../boards/host/copy";
import { handleOnPaste } from "../../boards/host/paste";
import {
  LocalStorageBoardRepository,
  createEmptyBoardData,
} from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph } from "../../boards/domain/graph";

import type { ClipboardData } from "../../../packages/excalidraw/clipboard";
import type { FolderId, BoardId } from "../../boards/types";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Paste flow", () => {
  beforeEach(() => {
    storage.clear();
  });

  const createFakeElement = (id: string, meta?: any): ExcalidrawElement =>
    ({
      id,
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      customData: meta ? { folderBoard: meta } : undefined,
    } as unknown as ExcalidrawElement);

  it("Copy -> Delete -> Paste", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();

    const fId = "f-1" as FolderId;
    const bId = "b-1" as BoardId;
    graph.folders[fId] = {
      id: fId,
      name: "Folder 1",
      parentId: graph.rootFolderId,
      boardId: bId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    graph.boards[bId] = {
      id: bId,
      name: "Board 1",
      rootFolderId: fId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport: null,
    };
    await repo.save(graph);
    await repo.saveBoard(createEmptyBoardData(bId, fId));
    await repo.saveBoard(createEmptyBoardData(bId, fId));

    const folderEl = createFakeElement("el1", {
      kind: "folder",
      folderId: fId,
      boardId: bId,
    });
    const normalEl = createFakeElement("el2");

    const clipboardData = handleOnCopy([folderEl, normalEl], graph);
    expect(clipboardData).not.toBeNull();
    expect(clipboardData!.rootFolderIds).toContain(fId);

    delete graph.folders[fId];
    delete graph.boards[bId];
    await repo.save(graph);
    await repo.saveBoard(createEmptyBoardData(bId, fId));

    const pasteData: ClipboardData = {
      elements: [
        { ...folderEl, id: "el1_copy" },
        { ...normalEl, id: "el2_copy" },
      ],
    };

    const pasteResult = await handleOnPaste(
      pasteData,
      clipboardData,
      repo,
      graph.rootFolderId,
    );
    expect(pasteResult).toBe(true);

    expect(pasteData.elements).toHaveLength(2);
    const pastedFolderEl = pasteData.elements!.find(
      (e: any) => e.customData?.folderBoard,
    ) as any;
    expect(pastedFolderEl).toBeDefined();
    expect(pastedFolderEl.customData.folderBoard.handledByPaste).toBe(true);
    const newFId = pastedFolderEl.customData.folderBoard.folderId;
    expect(newFId).not.toBe(fId);

    const newGraph = await repo.load();
    expect(newGraph!.folders[newFId]).toBeDefined();
    expect(newGraph!.folders[fId]).toBeUndefined();
    expect(newGraph!.folders[newFId].name).toBe("Folder 1");

    const newBId = newGraph!.folders[newFId].boardId;
    expect(newBId).not.toBe(bId);
    expect(newGraph!.boards[newBId]).toBeDefined();

    const boardData = await repo.loadBoard(newBId);
    expect(boardData).not.toBeNull();
  });

  it("Copy -> Modify -> Paste", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    const fId = "f-1" as FolderId;
    const bId = "b-1" as BoardId;
    graph.folders[fId] = {
      id: fId,
      name: "Folder A",
      parentId: graph.rootFolderId,
      boardId: bId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    graph.boards[bId] = {
      id: bId,
      name: "Board A",
      rootFolderId: fId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport: null,
    };
    await repo.save(graph);
    await repo.saveBoard(createEmptyBoardData(bId, fId));

    const folderEl = createFakeElement("el1", {
      kind: "folder",
      folderId: fId,
      boardId: bId,
    });
    const clipboardData = handleOnCopy([folderEl], graph);

    graph.folders[fId].name = "Folder A Modified";
    await repo.save(graph);
    await repo.saveBoard(createEmptyBoardData(bId, fId));

    const pasteData: ClipboardData = {
      elements: [{ ...folderEl, id: "el1_copy" }],
    };
    await handleOnPaste(pasteData, clipboardData, repo, graph.rootFolderId);

    const pastedFolderEl = pasteData.elements![0] as any;
    const newFId = pastedFolderEl.customData.folderBoard.folderId;

    const newGraph = await repo.load();
    expect(newGraph!.folders[newFId].name).toBe("Folder A");
  });

  it("Empty clipboard / no board elements", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    await repo.save(graph);

    const normalEl = createFakeElement("el2");
    const pasteData: ClipboardData = { elements: [normalEl] };

    const result = await handleOnPaste(
      pasteData,
      null,
      repo,
      graph.rootFolderId,
    );
    expect(result).toBe(true);
    expect(pasteData.elements).toHaveLength(1);
    expect(pasteData.elements![0].id).toBe("el2");
  });

  it("Persistence physical failure keeps normal elements", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    const fId = "f-1" as FolderId;
    const bId = "b-1" as BoardId;
    graph.folders[fId] = {
      id: fId,
      name: "A",
      parentId: graph.rootFolderId,
      boardId: bId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    graph.boards[bId] = {
      id: bId,
      name: "A",
      rootFolderId: fId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport: null,
    };
    await repo.save(graph);
    await repo.saveBoard(createEmptyBoardData(bId, fId));

    const folderEl = createFakeElement("el1", {
      kind: "folder",
      folderId: fId,
      boardId: bId,
    });
    const normalEl = createFakeElement("el2");
    const clipboardData = handleOnCopy([folderEl, normalEl], graph);

    repo.clonePhysicalBoards = vi
      .fn()
      .mockRejectedValue(new Error("I/O error"));

    const pasteData: ClipboardData = { elements: [folderEl, normalEl] };
    const result = await handleOnPaste(
      pasteData,
      clipboardData,
      repo,
      graph.rootFolderId,
    );

    expect(result).toBe(true);
    expect(pasteData.elements).toHaveLength(1);
    expect(pasteData.elements![0].id).toBe("el2");
  });
});
