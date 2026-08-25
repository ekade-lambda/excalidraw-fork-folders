import { describe, expect, it, beforeEach } from "vitest";

import type { FileId } from "@excalidraw/element/types";

import {
  LocalStorageBoardRepository,
  createEmptyBoardData,
} from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph } from "../../boards/domain/graph";
import {
  exportWorkspace,
  importWorkspace,
  validateWorkspaceBundle,
} from "../../boards/host/workspace";

import { LocalData } from "../../data/LocalData";

import type { BoardId } from "../../boards/types";

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Workspace Bundle (Export/Import)", () => {
  beforeEach(() => {
    storage.clear();
    // mock LocalData
    LocalData.fileStorage.getFiles = async (ids) => {
      return {
        loadedFiles: ids.map(
          (id) => ({ id, dataURL: "data:image/png;base64,mock" } as any),
        ),
        erroredFiles: new Map(),
      };
    };
    LocalData.fileStorage.saveFiles = async () => {
      return { savedFiles: new Map(), erroredFiles: new Map() } as any;
    };
  });

  it("Export of minimal workspace works", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    graph.boards = {};
    await repo.save(graph);

    const bundleStr = await exportWorkspace(repo);
    const bundle = JSON.parse(bundleStr);

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.graph).toEqual(graph);
    expect(bundle.boards).toEqual({});
    expect(bundle.files).toEqual({});
  });

  it("Export fails if graph is empty/missing", async () => {
    const repo = new LocalStorageBoardRepository();
    await expect(exportWorkspace(repo)).rejects.toThrow(
      "Cannot export empty workspace",
    );
  });

  it("Export fails if physical board is missing", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    graph.boards = {};
    graph.boards["b-1" as BoardId] = {
      id: "b-1" as BoardId,
      name: "b1",
      rootFolderId: graph.rootFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport: null,
    };
    await repo.save(graph);

    await expect(exportWorkspace(repo)).rejects.toThrow(
      "Missing physical board data for boardId: b-1",
    );
  });

  it("Export multiple boards with files", async () => {
    const repo = new LocalStorageBoardRepository();
    const graph = createRootGraph();
    graph.boards = {};
    const bId = "b-1" as BoardId;
    graph.boards[bId] = {
      id: bId,
      name: "Board 1",
      rootFolderId: graph.rootFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport: null,
    };
    await repo.save(graph);

    const boardData = createEmptyBoardData(bId, graph.rootFolderId);
    boardData.elements.push({
      type: "image",
      status: "saved",
      fileId: "file-1" as FileId,
    } as any);
    await repo.saveBoard(boardData);

    const bundleStr = await exportWorkspace(repo);
    const bundle = JSON.parse(bundleStr);

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.boards[bId]).toBeDefined();
    expect(bundle.files["file-1"]).toBeDefined();
    expect(bundle.files["file-1"].dataURL).toBe("data:image/png;base64,mock");
  });

  it("Validation rejects corrupted bundles", () => {
    expect(validateWorkspaceBundle(null)).toBe(false);
    expect(validateWorkspaceBundle({})).toBe(false);
    expect(validateWorkspaceBundle({ schemaVersion: 2 })).toBe(false);

    const valid = {
      schemaVersion: 1,
      graph: { boards: {}, folders: {}, rootFolderId: "f" } as any,
      boards: {},
      files: {},
    };
    expect(validateWorkspaceBundle(valid)).toBe(true);

    // Missing board physical data
    const invalid1 = {
      ...valid,
      graph: { ...valid.graph, boards: { b1: {} } },
    };
    expect(validateWorkspaceBundle(invalid1)).toBe(false);

    // Missing file data
    const invalid2 = {
      ...valid,
      graph: { ...valid.graph, boards: { b1: {} } },
      boards: {
        b1: {
          elements: [{ type: "image", fileId: "file1" }],
        },
      },
    };
    expect(validateWorkspaceBundle(invalid2)).toBe(false);
  });

  it("Import valid workspace replaces current", async () => {
    const repo = new LocalStorageBoardRepository();

    // Setup initial workspace
    const oldGraph = createRootGraph();
    oldGraph.boards = {};
    const oldB = "b-old" as BoardId;
    oldGraph.boards[oldB] = {
      id: oldB,
      name: "Old",
      rootFolderId: oldGraph.rootFolderId,
      createdAt: 0,
      updatedAt: 0,
      viewport: null,
    };
    await repo.save(oldGraph);
    await repo.saveBoard(createEmptyBoardData(oldB, oldGraph.rootFolderId));

    // Setup bundle
    const bundleGraph = createRootGraph();
    bundleGraph.boards = {};
    const newB = "b-new" as BoardId;
    bundleGraph.boards[newB] = {
      id: newB,
      name: "New",
      rootFolderId: bundleGraph.rootFolderId,
      createdAt: 0,
      updatedAt: 0,
      viewport: null,
    };

    const bundle = {
      schemaVersion: 1,
      graph: bundleGraph,
      boards: { [newB]: createEmptyBoardData(newB, bundleGraph.rootFolderId) },
      files: {},
    };

    await importWorkspace(JSON.stringify(bundle), repo);

    const resultGraph = await repo.load();
    expect(resultGraph?.boards[newB]).toBeDefined();
    expect(resultGraph?.boards[oldB]).toBeUndefined();

    // Check physical boards
    expect(await repo.loadBoard(newB)).toBeDefined();
    expect(await repo.loadBoard(oldB)).toBeNull(); // Orphan deleted!
  });
});
