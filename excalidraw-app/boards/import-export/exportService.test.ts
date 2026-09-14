import { describe, it, expect, vi } from "vitest";
import { buildProjectExport } from "./exportService";
import type { BoardRepository } from "../repository/BoardRepository";
import type { BoardsGraph, BoardData } from "../types";
import type { FileId } from "@excalidraw/element/types";
import type { DataURL } from "@excalidraw/excalidraw/types";

describe("exportService", () => {
  it("should build export object correctly", async () => {
    const mockGraph: BoardsGraph = {
      schemaVersion: 1,
      rootFolderId: "root",
      folders: {},
      pointers: {},
      boards: {
        "b-1": {
          id: "b-1",
          name: "Test Board",
          rootFolderId: "root",
          createdAt: 0,
          updatedAt: 0,
        },
      },
      lastOpenBoardId: null,
    };

    const mockBoardData: BoardData = {
      schemaVersion: 1,
      boardId: "b-1",
      elements: [],
      files: {
        "file-1": {
          id: "file-1" as FileId,
          mimeType: "image/png",
          dataURL: "data:image/png;base64,mock" as DataURL,
          created: 0,
        },
      },
      name: "Test Board",
      updatedAt: 0,
    };

    const mockRepo: BoardRepository = {
      schemaVersion: 1,
      load: vi.fn().mockResolvedValue(mockGraph),
      save: vi.fn(),
      loadBoard: vi.fn().mockResolvedValue(mockBoardData),
      saveBoard: vi.fn(),
      deleteBoard: vi.fn(),
      applyTransaction: vi.fn(),
      clonePhysicalBoards: vi.fn(),
      runWithActiveWrites: vi.fn(),
      runGarbageCollector: vi.fn(),
    };

    const result = await buildProjectExport(mockRepo);

    expect(result).not.toBeNull();
    expect(result?.format).toBe("ekade-project");
    expect(result?.version).toBe(1);
    expect(result?.graph).toEqual(mockGraph);
    expect(result?.boardsData["b-1"]).toEqual(mockBoardData);

    // Check that files are preserved
    expect(result?.boardsData["b-1"].files["file-1"]).toBeDefined();
    expect(result?.boardsData["b-1"].files["file-1"].dataURL).toBe(
      "data:image/png;base64,mock",
    );
  });

  it("should return null if graph is missing", async () => {
    const mockRepo: BoardRepository = {
      schemaVersion: 1,
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      loadBoard: vi.fn(),
      saveBoard: vi.fn(),
      deleteBoard: vi.fn(),
      applyTransaction: vi.fn(),
      clonePhysicalBoards: vi.fn(),
      runWithActiveWrites: vi.fn(),
      runGarbageCollector: vi.fn(),
    };

    const result = await buildProjectExport(mockRepo);
    expect(result).toBeNull();
  });
});
