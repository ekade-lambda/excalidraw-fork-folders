import { describe, expect, it, vi, beforeEach } from "vitest";

import * as idbKeyval from "idb-keyval";

import { LocalStorageBoardRepository } from "../../boards/repository/LocalStorageBoardRepository";
import { createEmptyBoardData } from "../../boards/repository/LocalStorageBoardRepository";

import type { BoardId } from "../../boards/types";

// Mock idb-keyval
vi.mock("idb-keyval", () => {
  return {
    createStore: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn().mockResolvedValue(undefined),
  };
});

describe("LocalStorageBoardRepository :: Fallback a IndexedDB (10A)", () => {
  let repo: LocalStorageBoardRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    repo = new LocalStorageBoardRepository();
  });

  const bId = "board-test" as BoardId;

  it("1. LS normal: save y load devuelve el mismo BoardData", async () => {
    const data = createEmptyBoardData(bId);
    await repo.saveBoard(data);

    // Debe estar físicamente en LS
    const raw = localStorage.getItem(`excalidraw-board-${bId}`);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("__idb_pointer");

    // Load debe recuperarlo sin llamar a IDB
    const loaded = await repo.loadBoard(bId);
    expect(loaded?.boardId).toBe(bId);
    expect(idbKeyval.get).not.toHaveBeenCalled();
  });

  it("2. QuotaExceededError: falla LS -> IDB -> puntero LS -> load de IDB", async () => {
    const data = createEmptyBoardData(bId);

    // Forzamos QuotaExceededError al primer setItem
    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    setItemSpy.mockImplementationOnce(() => {
      const err = new DOMException("Quota exceeded", "QuotaExceededError");
      throw err;
    });

    vi.mocked(idbKeyval.set).mockResolvedValue(undefined);
    vi.mocked(idbKeyval.get).mockResolvedValue(JSON.stringify(data));

    await repo.saveBoard(data);

    // Debe haber intentado escribir en IDB
    expect(idbKeyval.set).toHaveBeenCalledTimes(1);

    // El segundo setItem (el puntero) no lo mockeamos, así que sí se escribió
    const raw = localStorage.getItem(`excalidraw-board-${bId}`);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.__idb_pointer).toBe(true);

    // Cargar el board debe leer el puntero e invocar IDB
    const loaded = await repo.loadBoard(bId);
    expect(idbKeyval.get).toHaveBeenCalledTimes(1);
    expect(loaded?.boardId).toBe(bId);
  });

  it("3. Error de IDB: propaga y save NO reporta éxito", async () => {
    const data = createEmptyBoardData(bId);

    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    setItemSpy.mockImplementationOnce(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    // Simulamos fallo en IDB
    vi.mocked(idbKeyval.set).mockRejectedValue(new Error("IDB Corrupt"));

    await expect(repo.saveBoard(data)).rejects.toThrow("IDB Corrupt");

    // El puntero NO debió escribirse porque IDB falló antes
    const raw = localStorage.getItem(`excalidraw-board-${bId}`);
    expect(raw).toBeNull();
  });

  it("4. Error al escribir el puntero: estado real", async () => {
    const data = createEmptyBoardData(bId);

    const setItemSpy = vi.spyOn(window.localStorage, "setItem");
    setItemSpy.mockImplementation(() => {
      // Siempre lanza quota exceeded (incluso para el puntero)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    vi.mocked(idbKeyval.set).mockResolvedValue(undefined);

    await expect(repo.saveBoard(data)).rejects.toThrow("Quota exceeded");

    // IDB escribió, pero LS falló. Queda el payload huérfano en IDB, LS nulo.
    expect(idbKeyval.set).toHaveBeenCalledTimes(1);

    // Al cargar, devolverá null porque no hay puntero.
    setItemSpy.mockRestore();
    const loaded = await repo.loadBoard(bId);
    expect(loaded).toBeNull();
  });

  it("5. Puntero sin payload: load lo maneja de forma explícita y devuelve null", async () => {
    // Escribimos un puntero manualmente
    localStorage.setItem(
      `excalidraw-board-${bId}`,
      JSON.stringify({ __idb_pointer: true }),
    );

    // IDB devuelve undefined
    vi.mocked(idbKeyval.get).mockResolvedValue(undefined);

    const loaded = await repo.loadBoard(bId);
    expect(idbKeyval.get).toHaveBeenCalledTimes(1);
    expect(loaded).toBeNull();
  });

  it("6. Board legacy: almacenado normalmente carga sin problema", async () => {
    const legacy = {
      schemaVersion: 1,
      boardId: bId,
      elements: [],
      files: {},
    };
    localStorage.setItem(`excalidraw-board-${bId}`, JSON.stringify(legacy));

    const loaded = await repo.loadBoard(bId);
    expect(loaded?.boardId).toBe(bId);
    expect(idbKeyval.get).not.toHaveBeenCalled();
  });
});
