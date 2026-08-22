import { beforeEach, describe, expect, it } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { STORAGE_KEYS } from "../../app_constants";
import { addFolder, createRootGraph } from "../../boards/domain/graph";
import { initializeBoardSystem } from "../../boards/host/boardService";
import { boardsStoreActions } from "../../boards/host/boardState";
import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { BOARD_SYSTEM_SCHEMA_VERSION } from "../../boards/types";

import type {
  BoardData,
  BoardId,
  BoardsGraph,
  FolderId,
} from "../../boards/types";

const LEGACY_KEY = STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS;
const makeRepo = () => new LocalStorageBoardRepository();

function buildBoardData(
  boardId: BoardId,
  name: string,
  elements: ExcalidrawElement[] = [],
): BoardData {
  return {
    schemaVersion: BOARD_SYSTEM_SCHEMA_VERSION,
    boardId,
    elements,
    files: {},
    viewport: null,
    name,
    updatedAt: Date.now(),
  };
}

const el: ExcalidrawElement = {
  id: "el-1",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  angle: 0,
  strokeColor: "#000",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1,
  version: 1,
  versionNonce: 0,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
  meta: null,
} as unknown as ExcalidrawElement;

function resetBoardsStore() {
  boardsStoreActions.setCurrentBoardId(null);
  boardsStoreActions.setCurrentFolderId(null);
  boardsStoreActions.setBoardData(null);
  boardsStoreActions.setReady(false);
}

interface Seed {
  graph: BoardsGraph;
  rootBoardId: BoardId;
  bBoardId: BoardId;
  bFolderId: FolderId;
}

/** Crea root + carpeta B `en memoria` (sin persistir) y setea lastOpen=B. */
function graphWithB(): Seed {
  const graph = createRootGraph({ name: "root" });
  const rootBoardId = graph.folders[graph.rootFolderId].boardId;
  const add = addFolder(graph, { name: "B", parentId: graph.rootFolderId });
  if (!add.ok) {
    throw new Error("no se pudo crear B");
  }
  const resultGraph = add.graph;
  resultGraph.lastOpenBoardId = add.boardId;
  return {
    graph: resultGraph,
    rootBoardId,
    bBoardId: add.boardId,
    bFolderId: add.folderId,
  };
}

/** Persiste un graph + (opcional) el BoardData de un board. */
async function persistGraph(
  repo: LocalStorageBoardRepository,
  seed: { graph: BoardsGraph; bBoardId?: BoardId },
) {
  await repo.save(seed.graph);
  if (seed.bBoardId) {
    await repo.saveBoard(buildBoardData(seed.bBoardId, "B"));
  }
}

describe("Board System :: boot (Fase 2)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetBoardsStore();
  });

  it("1. boot sin datos → crea graph, folder raíz y board raíz; setea current ids", async () => {
    const repo = makeRepo();
    const result = await initializeBoardSystem(repo);

    expect(result.createdRoot).toBe(true);
    expect(result.migrated).toBe(false);
    expect(result.currentBoardId).toBeTruthy();
    expect(result.currentFolderId).toBe(result.graph.rootFolderId);

    // IDs de raíz correctamente relacionados (test 7)
    const root = result.graph.folders[result.graph.rootFolderId];
    expect(root.parentId).toBeNull();
    expect(root.boardId).toBe(result.currentBoardId);
    expect(result.graph.boards[result.currentBoardId].rootFolderId).toBe(
      result.graph.rootFolderId,
    );

    // Estado jotai (test 8)
    expect(boardsStoreActions.getCurrentBoardId()).toBe(result.currentBoardId);
    expect(boardsStoreActions.getCurrentFolderId()).toBe(
      result.graph.rootFolderId,
    );
    expect(boardsStoreActions.getReady()).toBe(true);
  });

  it("2. boot con graph existente restaura lastOpenBoardId y su Folder", async () => {
    const repo = makeRepo();
    const seed = graphWithB();
    await persistGraph(repo, seed);

    const result = await initializeBoardSystem(repo);
    expect(result.createdRoot).toBe(false);
    expect(result.migrated).toBe(false);
    expect(result.currentBoardId).toBe(seed.bBoardId);
    expect(result.currentFolderId).toBe(seed.bFolderId);
  });

  it("3. graph con lastOpenBoardId inexistente → fallback raíz sin corromper", async () => {
    const repo = makeRepo();
    const graph = createRootGraph({ name: "root" });
    const rootBoardId = graph.folders[graph.rootFolderId].boardId;
    graph.lastOpenBoardId = "b-missing" as BoardId;
    await repo.save(graph);

    const result = await initializeBoardSystem(repo);
    expect(result.currentBoardId).toBe(rootBoardId);
    expect(result.currentFolderId).toBe(graph.rootFolderId);
    // Graph íntegro tras el boot.
    const reloaded = await repo.load();
    expect(reloaded).not.toBeNull();
    expect(reloaded!.rootFolderId).toBe(graph.rootFolderId);
  });

  it("4. migración legacy → graph + board raíz conservando elementos", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify([el]));
    const repo = makeRepo();
    const result = await initializeBoardSystem(repo);

    expect(result.createdRoot).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.currentFolderId).toBe(result.graph.rootFolderId);
    expect(result.boardData?.elements).toHaveLength(1);
    expect(result.boardData?.elements[0].id).toBe("el-1");
  });

  it("5. graph + legacy simultáneo → el graph tiene prioridad y NO crea segunda raíz", async () => {
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify([el]));
    const repo = makeRepo();
    const graph = createRootGraph({ name: "root" });
    graph.lastOpenBoardId = graph.folders[graph.rootFolderId].boardId;
    await repo.save(graph);

    const result = await initializeBoardSystem(repo);
    expect(result.migrated).toBe(false);
    expect(result.createdRoot).toBe(false);
    // Sigue existiendo SOLO la raíz del graph previo.
    expect(Object.keys(result.graph.folders)).toHaveLength(1);
    expect(result.graph.rootFolderId).toBe(graph.rootFolderId);
  });

  it("6. boot repetido no duplica raíz ni boards", async () => {
    const repo = makeRepo();
    const first = await initializeBoardSystem(repo);
    const second = await initializeBoardSystem(repo);

    expect(first.createdRoot).toBe(true);
    expect(second.createdRoot).toBe(false);
    expect(second.graph.rootFolderId).toBe(first.graph.rootFolderId);
    expect(Object.keys(second.graph.folders)).toHaveLength(1);
    expect(Object.keys(second.graph.boards)).toHaveLength(1);
  });
});
