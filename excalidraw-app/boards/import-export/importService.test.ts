import { describe, it, expect } from "vitest";
import { validateProjectExport, importProject } from "./importService";
import type { BoardsGraph, BoardData } from "../types";
import { vi } from "vitest";
import type { BoardRepository } from "../repository/BoardRepository";

// Define the expected export format type
interface ProjectExport {
  format: string;
  version: number;
  graph: BoardsGraph;
  boardsData: Record<string, BoardData>;
}

describe("importService validation", () => {
  const createValidMock = (): ProjectExport => ({
    format: "ekade-project",
    version: 1,
    graph: {
      schemaVersion: 1,
      rootFolderId: "f-root",
      folders: {
        "f-root": {
          id: "f-root",
          name: "Root",
          parentId: null,
          boardId: "b-root",
          createdAt: 0,
          updatedAt: 0,
        },
      },
      boards: {
        "b-root": {
          id: "b-root",
          name: "Root Board",
          rootFolderId: "f-root",
          createdAt: 0,
          updatedAt: 0,
        },
      },
      pointers: {},
      lastOpenBoardId: null,
    },
    boardsData: {
      "b-root": {
        schemaVersion: 1,
        boardId: "b-root",
        elements: [],
        files: {},
        name: "Root Board",
        updatedAt: 0,
      },
    },
  });

  it("1. Proyecto válido básico", () => {
    const data = createValidMock();
    expect(validateProjectExport(data)).toEqual({ isValid: true });
  });

  it("1b. Proyecto válido con imagen simulada", () => {
    const data = createValidMock();
    (data.boardsData["b-root"].files as any) = {
      "file-1": {
        mimeType: "image/png",
        dataURL: "data:image/png;base64,mock",
        created: 0,
      },
    } as any;
    expect(validateProjectExport(data)).toEqual({ isValid: true });
  });

  it("2. format incorrecto", () => {
    const data = createValidMock();
    data.format = "other-format";
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "El formato no es ekade-project.",
    });
  });

  it("3. version incompatible", () => {
    const data = createValidMock();
    data.version = 2;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "La versión del formato es incompatible.",
    });
  });

  it("4. graph ausente", () => {
    const data = createValidMock();
    (data as any).graph = undefined;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "Falta el graph principal del proyecto.",
    });
  });

  it("5. rootFolderId inválido o ausente", () => {
    const data = createValidMock();
    data.graph.rootFolderId = "f-missing";
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "El rootFolderId 'f-missing' no existe en folders.",
    });
  });

  it("6. board referido por graph pero ausente en boardsData", () => {
    const data = createValidMock();
    delete (data.boardsData as any)["b-root"];
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "Falta el contenido (boardsData) para el board b-root.",
    });
  });

  it("7. boardsData con estructura inválida (no elements)", () => {
    const data = createValidMock();
    delete (data.boardsData["b-root"] as any).elements;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "El board b-root tiene elements inválidos o ausentes.",
    });
  });

  it("8. folder con referencia inválida a padre", () => {
    const data = createValidMock();
    data.graph.folders["f-root"].parentId = "f-missing" as any;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "Folder f-root apunta a un parentId inexistente.",
    });
  });

  it("9. pointer con targetFolderId inexistente", () => {
    const data = createValidMock();
    data.graph.pointers["p-1"] = {
      id: "p-1",
      targetFolderId: "f-missing",
      createdAt: 0,
    } as any;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "Pointer p-1 apunta a un targetFolderId inexistente.",
    });
  });

  it("10. file con dataURL inválido", () => {
    const data = createValidMock();
    data.boardsData["b-root"].files = {
      "file-1": {
        mimeType: "image/png",
        dataURL: "invalid-url",
        created: 0,
      },
    } as any;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error: "Board b-root: El file file-1 no tiene un dataURL válido.",
    });
  });

  it("11. boardsData con board huérfano", () => {
    const data = createValidMock();
    data.boardsData["b-extra"] = {
      schemaVersion: 1,
      boardId: "b-extra",
      elements: [],
      files: {},
      name: "Extra Board",
      updatedAt: 0,
    } as any;
    expect(validateProjectExport(data)).toEqual({
      isValid: false,
      error:
        "Existe un board (b-extra) en boardsData que no está indexado en el graph.",
    });
  });
});

describe("importProject persistence", () => {
  const createMockRepo = (): BoardRepository => {
    return {
      loadSync: vi.fn(),
      saveSync: vi.fn(),
      loadBoardSync: vi.fn(),
      saveBoardSync: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      loadBoard: vi.fn(),
      saveBoard: vi.fn().mockResolvedValue(undefined),
      runWithActiveWrites: vi.fn().mockImplementation(async (ids, op) => op()),
      runGarbageCollector: vi.fn().mockResolvedValue(undefined),
    } as unknown as BoardRepository;
  };

  const projectMock = {
    graph: {
      rootFolderId: "f-1",
      folders: {},
      boards: {},
      pointers: {},
      lastOpenBoardId: null,
    },
    boardsData: {
      "b-1": { boardId: "b-1", elements: [], files: {} },
      "b-2": { boardId: "b-2", elements: [], files: {} },
    },
  };

  it("should write boards, save graph and run GC in correct order", async () => {
    const repo = createMockRepo();
    await importProject(repo, projectMock);

    expect(repo.runWithActiveWrites).toHaveBeenCalledTimes(1);
    expect(repo.runWithActiveWrites).toHaveBeenCalledWith(
      ["b-1", "b-2"],
      expect.any(Function),
    );

    expect(repo.saveBoard).toHaveBeenCalledTimes(2);
    expect(repo.saveBoard).toHaveBeenNthCalledWith(
      1,
      projectMock.boardsData["b-1"],
    );
    expect(repo.saveBoard).toHaveBeenNthCalledWith(
      2,
      projectMock.boardsData["b-2"],
    );

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(projectMock.graph);

    expect(repo.runGarbageCollector).toHaveBeenCalledTimes(1);
    expect(repo.runGarbageCollector).toHaveBeenCalledWith(projectMock.graph);

    // Verify order using invocation counts
    const saveBoardOrder = (repo.saveBoard as any).mock.invocationCallOrder;
    const saveGraphOrder = (repo.save as any).mock.invocationCallOrder;
    const gcOrder = (repo.runGarbageCollector as any).mock.invocationCallOrder;

    expect(saveBoardOrder[0]).toBeLessThan(saveGraphOrder[0]);
    expect(saveBoardOrder[1]).toBeLessThan(saveGraphOrder[0]);
    expect(saveGraphOrder[0]).toBeLessThan(gcOrder[0]);
  });

  it("should stop if saveBoard fails and NOT save graph or run GC", async () => {
    const repo = createMockRepo();
    (repo.saveBoard as any).mockRejectedValueOnce(new Error("QuotaExceeded"));

    await expect(importProject(repo, projectMock)).rejects.toThrow(
      "QuotaExceeded",
    );

    expect(repo.saveBoard).toHaveBeenCalledTimes(1); // Failed on first board
    expect(repo.save).not.toHaveBeenCalled(); // Graph is not updated
    expect(repo.runGarbageCollector).not.toHaveBeenCalled(); // GC is not run
  });

  it("should propagate error if save(graph) fails, and NOT run GC", async () => {
    const repo = createMockRepo();
    (repo.save as any).mockRejectedValueOnce(new Error("SaveGraphFailed"));

    await expect(importProject(repo, projectMock)).rejects.toThrow(
      "SaveGraphFailed",
    );

    expect(repo.saveBoard).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.runGarbageCollector).not.toHaveBeenCalled();
  });

  it("should not fail the whole import if GC fails", async () => {
    const repo = createMockRepo();
    (repo.runGarbageCollector as any).mockRejectedValueOnce(
      new Error("GCFailed"),
    );

    // Debería completar sin tirar error
    await importProject(repo, projectMock);

    expect(repo.saveBoard).toHaveBeenCalledTimes(2);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.runGarbageCollector).toHaveBeenCalledTimes(1);
  });
});
