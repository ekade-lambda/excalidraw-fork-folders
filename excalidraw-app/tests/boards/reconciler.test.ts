import { describe, expect, it } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { reconcileElements } from "../../boards/host/reconciler";

import {
  LocalStorageBoardRepository,
  createEmptyBoardData,
} from "../../boards/repository/LocalStorageBoardRepository";
import { reconcileSurvivingBoards } from "../../boards/host/reconciler";
import { createRootGraph, addFolder } from "../../boards/domain/graph";

import type {
  DeleteFolderPatch,
  DeletePointerPatch,
} from "../../boards/domain/delete";

function createFolderVisuals(folderId: string): ExcalidrawElement[] {
  return [
    {
      id: `f-img-${folderId}`,
      type: "image",
      isDeleted: false,
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      customData: {
        folderBoard: { kind: "folder", folderId, role: "image" },
      },
    } as unknown as ExcalidrawElement,
    {
      id: `f-txt-${folderId}`,
      type: "text",
      isDeleted: false,
      x: 10,
      y: 120,
      width: 100,
      height: 20,
      customData: {
        folderBoard: { kind: "folder", folderId, role: "text" },
      },
    } as unknown as ExcalidrawElement,
  ];
}

function createPointerVisuals(
  pointerId: string,
  targetFolderId: string,
): ExcalidrawElement[] {
  return [
    {
      id: `p-img-${pointerId}`,
      type: "image",
      isDeleted: false,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      customData: {
        folderBoard: {
          kind: "pointer",
          pointerId,
          targetFolderId,
          role: "image",
        },
      },
    } as unknown as ExcalidrawElement,
    {
      id: `p-txt-${pointerId}`,
      type: "text",
      isDeleted: false,
      x: 50,
      y: 160,
      width: 100,
      height: 20,
      customData: {
        folderBoard: {
          kind: "pointer",
          pointerId,
          targetFolderId,
          role: "text",
        },
      },
    } as unknown as ExcalidrawElement,
  ];
}

function createNormalElement(): ExcalidrawElement {
  return {
    id: "normal-1",
    type: "rectangle",
    isDeleted: false,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    // Sin customData de folderBoard
  } as unknown as ExcalidrawElement;
}

describe("Board System :: Reconciler (Fase 7.3)", () => {
  it("A/B/H. Folder eliminado representado (múltiples mitades): quedan isDeleted=true, normales intactos", () => {
    const patch: DeleteFolderPatch = {
      deletedFolderIds: ["f-deleted"],
      deletedBoardIds: [],
      deletedPointerIds: [],
    };

    const visuals = createFolderVisuals("f-deleted");
    const normal = createNormalElement();
    const elements = [...visuals, normal];

    const res = reconcileElements(elements, patch);

    expect(res.changed).toBe(true);
    expect(res.elements[0].isDeleted).toBe(true); // imagen
    expect(res.elements[1].isDeleted).toBe(true); // texto
    expect(res.elements[2].isDeleted).toBe(false); // normal intacto

    // G. Elementos normales no son mutados en sus referencias si no cambian
    expect(res.elements[2]).toBe(normal);
  });

  it("C/I. Pointer cuyo target fue eliminado desaparece, y si hay múltiples todos mueren", () => {
    const patch: DeleteFolderPatch = {
      deletedFolderIds: ["f-deleted"],
      deletedBoardIds: [],
      deletedPointerIds: ["p-id-1", "p-id-2"], // el domain ya los incluye
    };

    const p1 = createPointerVisuals("p-id-1", "f-deleted");
    const p2 = createPointerVisuals("p-id-2", "f-deleted");
    const normal = createNormalElement();

    const elements = [...p1, ...p2, normal];
    const res = reconcileElements(elements, patch);

    expect(res.changed).toBe(true);
    // Todos desaparecen
    expect(res.elements[0].isDeleted).toBe(true);
    expect(res.elements[1].isDeleted).toBe(true);
    expect(res.elements[2].isDeleted).toBe(true);
    expect(res.elements[3].isDeleted).toBe(true);
    // Normal sobrevive
    expect(res.elements[4].isDeleted).toBe(false);
  });

  it("D/I. Delete Pointer aislado: solo ese pointer desaparece (folder sobrevive, y otros pointers sobreviven)", () => {
    const patch: DeletePointerPatch = {
      deletedPointerIds: ["p-target"],
    };

    const pTarget = createPointerVisuals("p-target", "f-survive");
    const pOther = createPointerVisuals("p-other", "f-survive");
    const fSurvive = createFolderVisuals("f-survive");

    const elements = [...pTarget, ...pOther, ...fSurvive];
    const res = reconcileElements(elements, patch);

    expect(res.changed).toBe(true);
    // target pointer isDeleted
    expect(res.elements[0].isDeleted).toBe(true);
    expect(res.elements[1].isDeleted).toBe(true);
    // other pointer survives
    expect(res.elements[2].isDeleted).toBe(false);
    expect(res.elements[3].isDeleted).toBe(false);
    // folder survives
    expect(res.elements[4].isDeleted).toBe(false);
    expect(res.elements[5].isDeleted).toBe(false);
  });

  it("E. Board superviviente sin elementos afectados: payload no cambia", () => {
    const patch: DeleteFolderPatch = {
      deletedFolderIds: ["f-deleted"],
      deletedBoardIds: [],
      deletedPointerIds: [],
    };

    const normal = createNormalElement();
    const fSurvive = createFolderVisuals("f-survive");

    const elements = [normal, ...fSurvive];
    const res = reconcileElements(elements, patch);

    expect(res.changed).toBe(false);
    // referentially equal elements array? We map it, but we return original objects.
    expect(res.elements[0]).toBe(normal);
    expect(res.elements[1]).toBe(fSurvive[0]);
    expect(res.elements[2]).toBe(fSurvive[1]);
  });

  it("J. Idempotencia: aplicar dos veces no produce cambios extra", () => {
    const patch: DeleteFolderPatch = {
      deletedFolderIds: ["f-deleted"],
      deletedBoardIds: [],
      deletedPointerIds: [],
    };

    const visuals = createFolderVisuals("f-deleted");
    const res1 = reconcileElements(visuals, patch);
    expect(res1.changed).toBe(true);

    const res2 = reconcileElements(res1.elements, patch);
    expect(res2.changed).toBe(false);
    expect(res2.elements[0]).toBe(res1.elements[0]);
  });

  it("TEST DE REGRESIÓN ESPECÍFICO CONTRA BLANK SCREEN: solo cambia isDeleted, propiedades estructurales se preservan", () => {
    const patch: DeleteFolderPatch = {
      deletedFolderIds: ["f-deleted"],
      deletedBoardIds: [],
      deletedPointerIds: [],
    };

    const original = createFolderVisuals("f-deleted")[0];
    const res = reconcileElements([original], patch);
    const modified = res.elements[0];

    // isDeleted cambia
    expect(original.isDeleted).toBe(false);
    expect(modified.isDeleted).toBe(true);

    // TODO LO DEMÁS se preserva
    expect(modified.id).toBe(original.id);
    expect(modified.type).toBe(original.type);
    expect(modified.x).toBe(original.x);
    expect(modified.y).toBe(original.y);
    expect(modified.width).toBe(original.width);
    expect(modified.height).toBe(original.height);
    expect(modified.customData).toEqual(original.customData);

    // No se introducen propiedades espurias
    expect(Object.keys(modified).sort()).toEqual(Object.keys(original).sort());
  });
});

describe("Board System :: Reconciler Persistence (Fase 7.3)", () => {
  it("F/11. Reconcilia boards offline, guarda payload, sobrevive reload", async () => {
    window.localStorage.clear();
    const repo = new LocalStorageBoardRepository();

    // Setup graph con Root y B
    let graph = createRootGraph();
    const addRes = addFolder(graph, {
      name: "B",
      parentId: graph.rootFolderId,
    });
    if (!addRes.ok) {
      throw new Error("setup");
    }
    graph = addRes.graph;

    const bId = addRes.folderId;
    const rootBoardId = graph.folders[graph.rootFolderId].boardId;

    // Root board tiene visual de B
    const rootBoardData = createEmptyBoardData(rootBoardId, "Root");
    rootBoardData.elements = createFolderVisuals(bId);
    await repo.saveBoard(rootBoardData);

    // B es borrado
    const patch: DeleteFolderPatch = {
      deletedFolderIds: [bId],
      deletedBoardIds: [graph.folders[bId].boardId],
      deletedPointerIds: [],
    };

    // graph actualizado donde B ya no existe
    const bBoardId = graph.folders[bId].boardId;
    const nextGraph = {
      ...graph,
      folders: { ...graph.folders },
      boards: { ...graph.boards },
    };
    delete nextGraph.folders[bId];
    delete nextGraph.boards[bBoardId];

    // Ejecutamos reconciliación
    await reconcileSurvivingBoards(nextGraph, patch, repo);

    // Verificamos payload de Root board
    const reloadedRoot = await repo.loadBoard(rootBoardId);
    expect(reloadedRoot).not.toBeNull();
    expect(reloadedRoot!.elements[0].isDeleted).toBe(true);
    expect(reloadedRoot!.elements[1].isDeleted).toBe(true);
  });
});
