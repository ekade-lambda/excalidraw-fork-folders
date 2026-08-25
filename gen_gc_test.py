import os
path = "excalidraw-app/tests/boards/repository.gc.test.ts"
content = """import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LocalStorageBoardRepository, createEmptyBoardData } from "../../boards/repository/LocalStorageBoardRepository";
import { createRootGraph } from "../../boards/domain/graph";
import * as idbKeyval from "idb-keyval";
import type { BoardId } from "../../boards/types";

vi.mock("idb-keyval", () => {
  let store: Record<string, any> = {};
  return {
    createStore: vi.fn(),
    get: vi.fn(async (k) => store[k]),
    set: vi.fn(async (k, v) => { store[k] = v; }),
    del: vi.fn(async (k) => { delete store[k]; }),
    keys: vi.fn(async () => Object.keys(store)),
    __resetStore: () => { store = {}; },
    __getStore: () => store,
  };
});

const now = Date.now();

describe("LocalStorageBoardRepository :: Garbage Collector (10B)", () => {
  let repo: LocalStorageBoardRepository;
  
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // @ts-ignore
    idbKeyval.__resetStore();
    repo = new LocalStorageBoardRepository();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const bId = "board-test" as BoardId;

  it("1. WAR reciente protege un board huérfano", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    localStorage.setItem(`excalidraw-war-${bId}`, Date.now().toString());

    const graph = createRootGraph(); 
    await repo.runGarbageCollector(graph);

    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeTruthy();
    expect(localStorage.getItem(`excalidraw-war-${bId}`)).toBeTruthy();
  });

  it("2. WAR caducado (>1h) y huérfano -> elimina WAR y elimina payload", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    localStorage.setItem(`excalidraw-war-${bId}`, (Date.now() - 2 * 60 * 60 * 1000).toString());

    const graph = createRootGraph();
    await repo.runGarbageCollector(graph);

    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeNull();
    expect(localStorage.getItem(`excalidraw-war-${bId}`)).toBeNull();
  });

  it("3. WAR caducado pero board presente en Grafo -> elimina WAR, CONSERVA board", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    localStorage.setItem(`excalidraw-war-${bId}`, (Date.now() - 2 * 60 * 60 * 1000).toString());

    const graph = createRootGraph();
    graph.boards[bId] = { id: bId, elements: [], files: {} } as any;

    await repo.runGarbageCollector(graph);

    expect(localStorage.getItem(`excalidraw-war-${bId}`)).toBeNull();
    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeTruthy();
  });

  it("4. Board presente en Grafo se conserva aunque tenga inconsistencias L1/L2", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify({ __idb_pointer: true }));
    
    const graph = createRootGraph();
    graph.boards[bId] = { id: bId, elements: [], files: {} } as any;

    await repo.runGarbageCollector(graph);

    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeTruthy();
  });

  it("5. Board huérfano LS se elimina", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    
    const graph = createRootGraph();
    await repo.runGarbageCollector(graph);

    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeNull();
  });

  it("6. Board huérfano IDB se elimina", async () => {
    await idbKeyval.set(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    
    const graph = createRootGraph();
    await repo.runGarbageCollector(graph);

    // @ts-ignore
    const idbKeys = Object.keys(idbKeyval.__getStore());
    expect(idbKeys).not.toContain(`excalidraw-board-${bId}`);
  });

  it("7. Puntero LS huérfano + payload IDB se eliminan ambos", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify({ __idb_pointer: true }));
    await idbKeyval.set(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    
    const graph = createRootGraph();
    await repo.runGarbageCollector(graph);

    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeNull();
    // @ts-ignore
    const idbKeys = Object.keys(idbKeyval.__getStore());
    expect(idbKeys).not.toContain(`excalidraw-board-${bId}`);
  });

  it("8. WAR independientes para dos boards -> concurrencia simulada", async () => {
    const b2 = "board-test-2" as BoardId;
    
    const pA = repo.runWithActiveWrites([bId], async () => {
      const repo2 = new LocalStorageBoardRepository();
      const pB = repo2.runWithActiveWrites([b2], async () => {
        expect(localStorage.getItem(`excalidraw-war-${bId}`)).toBeTruthy();
        expect(localStorage.getItem(`excalidraw-war-${b2}`)).toBeTruthy();
        return "B";
      });
      await pB;
      expect(localStorage.getItem(`excalidraw-war-${bId}`)).toBeTruthy();
      expect(localStorage.getItem(`excalidraw-war-${b2}`)).toBeNull();
      return "A";
    });
    
    await pA;
    expect(localStorage.getItem(`excalidraw-war-${bId}`)).toBeNull();
  });

  it("9. Idempotencia del GC", async () => {
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify(createEmptyBoardData(bId)));
    const graph = createRootGraph();
    
    await repo.runGarbageCollector(graph);
    expect(localStorage.getItem(`excalidraw-board-${bId}`)).toBeNull();

    await expect(repo.runGarbageCollector(graph)).resolves.not.toThrow();
  });
});
"""

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Created repository.gc.test.ts")
