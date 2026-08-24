import { beforeEach, describe, expect, it } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import {
  LocalStorageBoardRepository,
  createEmptyBoardData,
} from "../../boards/repository/LocalStorageBoardRepository";
import { prepareDeleteFolderPatch } from "../../boards/domain/delete";
import { createPointer } from "../../boards/domain/pointers";
import { getFolderBoard } from "../../boards/domain/board";

import { STORAGE_KEYS } from "../../app_constants";

import { buildTree } from "./helpers";

const boardPrefix = STORAGE_KEYS.BOARDS_BOARD_PREFIX;
const clearStorage = () => window.localStorage.clear();
const makeRepo = () => new LocalStorageBoardRepository();

function createPointerElement(pointerId: string): ExcalidrawElement {
  return {
    id: `el-${pointerId}`,
    type: "image",
    customData: {
      folderBoard: {
        kind: "pointer",
        pointerId,
      },
    },
  } as unknown as ExcalidrawElement;
}

describe("Board System :: Repository Transaction (Fase 7.2)", () => {
  beforeEach(() => {
    clearStorage();
  });

  it("A. Delete Folder vacío: elimina Folder del Graph y su Board físico", async () => {
    const repo = makeRepo();
    const tree = buildTree();

    await repo.save(tree.graph);
    await repo.saveBoard(
      createEmptyBoardData(getFolderBoard(tree.graph, tree.bId)!.id, "B"),
    );

    const patchRes = prepareDeleteFolderPatch(tree.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("A");
    }

    const nextGraph = await repo.applyTransaction(tree.graph, patchRes.patch);

    expect(nextGraph.folders[tree.bId]).toBeUndefined();

    // Board físico eliminado
    const boardKey = `${boardPrefix}${
      getFolderBoard(tree.graph, tree.bId)!.id
    }`;
    expect(window.localStorage.getItem(boardKey)).toBeNull();
  });

  it("B. Delete Folder con descendientes: elimina todos, conserva hermanos", async () => {
    const repo = makeRepo();
    const tree = buildTree(); // B has children C, D. A is root.

    await repo.save(tree.graph);
    const bBoardId = getFolderBoard(tree.graph, tree.bId)!.id;
    const cBoardId = getFolderBoard(tree.graph, tree.cId)!.id;
    await repo.saveBoard(createEmptyBoardData(bBoardId, "B"));
    await repo.saveBoard(createEmptyBoardData(cBoardId, "C"));

    const patchRes = prepareDeleteFolderPatch(tree.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("B");
    }

    const nextGraph = await repo.applyTransaction(tree.graph, patchRes.patch);

    expect(nextGraph.folders[tree.bId]).toBeUndefined();
    expect(nextGraph.folders[tree.cId]).toBeUndefined();
    expect(nextGraph.folders[tree.rootId]).toBeDefined(); // padre sobrevive

    expect(window.localStorage.getItem(`${boardPrefix}${bBoardId}`)).toBeNull();
    expect(window.localStorage.getItem(`${boardPrefix}${cBoardId}`)).toBeNull();
  });

  it("C. Delete Folder con Pointers entrantes", async () => {
    const repo = makeRepo();
    const tree = buildTree();
    const p1 = createPointer(tree.graph, { targetFolderId: tree.bId });
    if (!p1.ok) {
      throw new Error("C1");
    }

    await repo.save(p1.graph);

    const patchRes = prepareDeleteFolderPatch(p1.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("C2");
    }

    const nextGraph = await repo.applyTransaction(p1.graph, patchRes.patch);

    // Pointer debe desaparecer porque apuntaba al subárbol destruido
    expect(nextGraph.pointers[p1.pointer.id]).toBeUndefined();
  });

  it("D. Pointer contenido físicamente en un Board eliminado: se elimina del grafo", async () => {
    const repo = makeRepo();
    const tree = buildTree();
    // pointer apuntando a raíz, pero su cuerpo visual vive en B
    const p1 = createPointer(tree.graph, { targetFolderId: tree.rootId });
    if (!p1.ok) {
      throw new Error("D1");
    }

    const bBoardId = getFolderBoard(p1.graph, tree.bId)!.id;
    const boardData = createEmptyBoardData(bBoardId, "B");
    boardData.elements.push(createPointerElement(p1.pointer.id));

    await repo.save(p1.graph);
    await repo.saveBoard(boardData);

    const patchRes = prepareDeleteFolderPatch(p1.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("D2");
    }

    const nextGraph = await repo.applyTransaction(p1.graph, patchRes.patch);

    // El pointer físico fue descubierto en el payload de B y eliminado
    expect(nextGraph.pointers[p1.pointer.id]).toBeUndefined();
  });

  it("E. Pointer contenido en Board eliminado pero apuntando a Folder superviviente", async () => {
    const repo = makeRepo();
    const tree = buildTree();
    // pointer a Root
    const p1 = createPointer(tree.graph, { targetFolderId: tree.rootId });
    if (!p1.ok) {
      throw new Error("E1");
    }

    // vive en B
    const bBoardId = getFolderBoard(p1.graph, tree.bId)!.id;
    const boardData = createEmptyBoardData(bBoardId, "B");
    boardData.elements.push(createPointerElement(p1.pointer.id));

    await repo.save(p1.graph);
    await repo.saveBoard(boardData);

    // Borramos B
    const patchRes = prepareDeleteFolderPatch(p1.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("E2");
    }

    const nextGraph = await repo.applyTransaction(p1.graph, patchRes.patch);

    // Target sobrevive
    expect(nextGraph.folders[tree.rootId]).toBeDefined();
    // Pointer desaparece
    expect(nextGraph.pointers[p1.pointer.id]).toBeUndefined();
  });

  it("F. Pointer externo apuntando a Folder superviviente", async () => {
    const repo = makeRepo();
    const tree = buildTree();
    const p1 = createPointer(tree.graph, { targetFolderId: tree.rootId });
    if (!p1.ok) {
      throw new Error("F1");
    }

    await repo.save(p1.graph);

    // Borramos B. El pointer no está en B ni apunta a B.
    const patchRes = prepareDeleteFolderPatch(p1.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("F2");
    }

    const nextGraph = await repo.applyTransaction(p1.graph, patchRes.patch);

    expect(nextGraph.pointers[p1.pointer.id]).toBeDefined(); // sobrevive
  });

  it("G. Intento de borrar Root: es rechazado por el dominio", async () => {
    const repo = makeRepo();
    const tree = buildTree();

    await repo.save(tree.graph);
    const rootBoardId = getFolderBoard(tree.graph, tree.rootId)!.id;
    await repo.saveBoard(createEmptyBoardData(rootBoardId, "A"));

    const patchRes = prepareDeleteFolderPatch(tree.graph, tree.rootId);
    expect(patchRes.ok).toBe(false);

    // No se alteró persistencia porque ni siquiera se generó patch
    expect(
      window.localStorage.getItem(`${boardPrefix}${rootBoardId}`),
    ).toBeDefined();
  });

  it("H. Ausencia de Board físico: comportamiento idempotente", async () => {
    const repo = makeRepo();
    const tree = buildTree();

    await repo.save(tree.graph);
    // IMPORTANTE: NO guardamos el BoardData de B. Simula ausencia física.

    const patchRes = prepareDeleteFolderPatch(tree.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("H1");
    }

    const nextGraph = await repo.applyTransaction(tree.graph, patchRes.patch);

    expect(nextGraph.folders[tree.bId]).toBeUndefined();
    // La transacción no crashea, simplemente lo remueve lógicamente
  });

  it("I. Persistencia: recargar graph post-transacción representa el estado correcto", async () => {
    const repo = makeRepo();
    const tree = buildTree();
    await repo.save(tree.graph);

    const patchRes = prepareDeleteFolderPatch(tree.graph, tree.bId);
    if (!patchRes.ok) {
      throw new Error("I1");
    }

    await repo.applyTransaction(tree.graph, patchRes.patch);

    const loaded = await repo.load();
    expect(loaded!.folders[tree.bId]).toBeUndefined();
    expect(loaded!.folders[tree.rootId]).toBeDefined();
  });
});
