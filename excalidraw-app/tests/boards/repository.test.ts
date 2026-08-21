import { beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_KEYS } from "../../app_constants";
import { addFolder, createRootGraph } from "../../boards/domain/graph";
import { BOARD_SYSTEM_SCHEMA_VERSION } from "../../boards/types";
import {
  LocalStorageBoardRepository,
  createEmptyBoardData,
} from "../../boards/repository/LocalStorageBoardRepository";

import type { BoardData, BoardId, BoardsGraph } from "../../boards/types";

const graphKey = STORAGE_KEYS.BOARDS_GRAPH;
const brokenKey = STORAGE_KEYS.BOARDS_GRAPH_BROKEN;
const boardPrefix = STORAGE_KEYS.BOARDS_BOARD_PREFIX;

const clearStorage = () => window.localStorage.clear();

/** Grafo con root "A" + una folder B (con su board). */
function buildGraph(): { graph: BoardsGraph; rootId: string; bId: string } {
  const root = createRootGraph({ name: "A" });
  const rootId = root.rootFolderId;
  const res = addFolder(root, { name: "B", parentId: rootId });
  if (!res.ok) {
    throw new Error("no se pudo crear B");
  }
  return { graph: res.graph, rootId, bId: res.folderId };
}

function buildBoardData(boardId: BoardId, name: string): BoardData {
  return {
    schemaVersion: BOARD_SYSTEM_SCHEMA_VERSION,
    boardId,
    elements: [],
    files: {},
    viewport: { scrollX: 123, scrollY: 456, zoom: 1.25 },
    name,
    updatedAt: Date.now(),
  };
}

const makeRepo = () => new LocalStorageBoardRepository();

describe("Board System :: LocalStorageBoardRepository (Fase 1)", () => {
  beforeEach(() => {
    clearStorage();
    vi.restoreAllMocks();
  });

  it("1. guardar/cargar BoardsGraph (roundtrip)", async () => {
    const repo = makeRepo();
    const { graph } = buildGraph();
    await repo.save(graph);

    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.rootFolderId).toBe(graph.rootFolderId);
    expect(loaded!.folders[graph.rootFolderId]).toEqual(
      graph.folders[graph.rootFolderId],
    );
    expect(loaded!.schemaVersion).toBe(BOARD_SYSTEM_SCHEMA_VERSION);
  });

  it("2. guardar/cargar BoardData en su clave", async () => {
    const repo = makeRepo();
    const data = buildBoardData("b-1", "B");
    await repo.saveBoard(data);

    const loaded = await repo.loadBoard("b-1");
    expect(loaded).toEqual(data);
    // Clave correcta por BoardId (4).
    expect(window.localStorage.getItem(`${boardPrefix}b-1`)).toBeTruthy();
  });

  it("3. roundtrip completo graph + BoardData aislados", async () => {
    const repo = makeRepo();
    const { graph, bId } = buildGraph();
    await repo.save(graph);
    const rootBoard = createEmptyBoardData(
      graph.folders[graph.rootFolderId].boardId,
      "A",
    );
    const bBoard = buildBoardData(graph.folders[bId].boardId, "B");
    await repo.saveBoard(rootBoard);
    await repo.saveBoard(bBoard);

    const repo2 = makeRepo();
    const loadedGraph = await repo2.load();
    expect(loadedGraph!.rootFolderId).toBe(graph.rootFolderId);
    expect(await repo2.loadBoard(rootBoard.boardId)).toEqual(rootBoard);
    expect(await repo2.loadBoard(bBoard.boardId)).toEqual(bBoard);
  });

  it("4. claves correctas por BoardId (dos boards no comparten clave)", async () => {
    const repo = makeRepo();
    await repo.saveBoard(buildBoardData("b-A", "A"));
    await repo.saveBoard(buildBoardData("b-B", "B"));
    expect(window.localStorage.getItem(`${boardPrefix}b-A`)).toBeTruthy();
    expect(window.localStorage.getItem(`${boardPrefix}b-B`)).toBeTruthy();
    expect(window.localStorage.getItem(`${boardPrefix}b-A`)).not.toBe(
      window.localStorage.getItem(`${boardPrefix}b-B`),
    );
  });

  it("5. board inexistente → null", async () => {
    const repo = makeRepo();
    expect(await repo.loadBoard("b-no-existe")).toBeNull();
    expect(await repo.load()).toBeNull();
  });

  it("6. gráfica JSON corrupto → backup en *_BROKEN y raíz nueva", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.localStorage.setItem(graphKey, "{not-json!!");
    const repo = makeRepo();
    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.rootFolderId).toBeTruthy();
    expect(loaded!.folders[loaded!.rootFolderId]).toBeDefined();
    expect(window.localStorage.getItem(brokenKey)).toBe("{not-json!!");
    expect(window.localStorage.getItem(graphKey)).toBeNull();
    warnSpy.mockRestore();
  });

  it("7. schemaVersion válida (graph y board)", async () => {
    const repo = makeRepo();
    const { graph } = buildGraph();
    await repo.save(graph);
    expect(
      JSON.parse(window.localStorage.getItem(graphKey)!).schemaVersion,
    ).toBe(BOARD_SYSTEM_SCHEMA_VERSION);

    await repo.saveBoard(buildBoardData("b-1", "B"));
    expect(
      JSON.parse(window.localStorage.getItem(`${boardPrefix}b-1`)!)
        .schemaVersion,
    ).toBe(BOARD_SYSTEM_SCHEMA_VERSION);
  });

  it("8. gráfica con shape inválida → corrupto → backup + raíz nueva", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.localStorage.setItem(graphKey, JSON.stringify({ folders: "nope" }));
    const repo = makeRepo();
    const loaded = await repo.load();
    expect(loaded!.rootFolderId).toBeTruthy();
    expect(window.localStorage.getItem(brokenKey)).toBeTruthy();
    warnSpy.mockRestore();
  });

  it("10. migraciones encadenadas (inyectadas) se aplican hasta la versión actual", async () => {
    const repo = new LocalStorageBoardRepository({
      graphMigrations: {
        // versión "0" (pre-v1 hipotética) → v1
        0: (g) => ({ ...g, lastOpenBoardId: "v0-mig" }),
      },
    });
    const { graph } = buildGraph();
    graph.schemaVersion = 0; // versión antigua hipotética
    window.localStorage.setItem(graphKey, JSON.stringify(graph));

    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    // Se aplicó la migración de v0→v1.
    expect(loaded!.lastOpenBoardId).toBe("v0-mig");
    // Y la gráfica queda en la versión actual.
    expect(loaded!.schemaVersion).toBe(BOARD_SYSTEM_SCHEMA_VERSION);
  });

  it("11. BoardData migrado via boardMigrations (inyectadas)", async () => {
    const repo = new LocalStorageBoardRepository({
      boardMigrations: {
        0: (b) => ({ ...b, name: `${b.name} (migrado)` }),
      },
    });
    const data = buildBoardData("b-mig", "B");
    data.schemaVersion = 0;
    window.localStorage.setItem(`${boardPrefix}b-mig`, JSON.stringify(data));

    const loaded = await repo.loadBoard("b-mig");
    expect(loaded?.name).toBe("B (migrado)");
    expect(loaded?.schemaVersion).toBe(BOARD_SYSTEM_SCHEMA_VERSION);
  });

  it("12. aislamiento: guardar A nunca sobrescribe a B y viceversa", async () => {
    const repo = makeRepo();
    await repo.saveBoard(buildBoardData("b-A", "Contenido A"));
    await repo.saveBoard(buildBoardData("b-B", "Contenido B"));

    // Reescribir A no afecta a B.
    await repo.saveBoard(buildBoardData("b-A", "Contenido A2"));
    const bB = await repo.loadBoard("b-B");
    expect(bB?.name).toBe("Contenido B");
    // B no afecta a A.
    const bA = await repo.loadBoard("b-A");
    expect(bA?.name).toBe("Contenido A2");
    // Claves independientes.
    expect(window.localStorage.getItem(`${boardPrefix}b-A`)).not.toBe(
      window.localStorage.getItem(`${boardPrefix}b-B`),
    );
  });
});
