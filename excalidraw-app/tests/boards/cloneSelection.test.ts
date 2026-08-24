import { describe, expect, it } from "vitest";

import { cloneSelection } from "../../boards/domain/cloneSelection";
import { createPointer } from "../../boards/domain/pointers";

import { buildTree, buildTreeWithPointers } from "./helpers";

describe("Board System :: cloneSelection", () => {
  it("A. Clonado de una carpeta simple sin dependencias", () => {
    const { graph, rootId } = buildTree();
    // B -> C -> D.
    // wait, we just want to clone D.
    const dId = Object.keys(graph.folders).find(
      (id) => graph.folders[id].name === "D",
    )!;

    const res = cloneSelection(graph, {
      folderIds: [dId],
      pointerIds: [],
      newParentId: rootId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    expect(res.clonedFolderIds.size).toBe(1);
    const newDId = res.folderIdMap.get(dId)!;
    expect(newDId).toBeDefined();
    expect(res.graph.folders[newDId].name).toBe("D");
    expect(res.graph.folders[newDId].parentId).toBe(rootId);
  });

  it("B, C. Clonado de carpeta con hijos (múltiples niveles)", () => {
    const { graph, rootId, bId, cId, dId } = buildTree();
    const res = cloneSelection(graph, {
      folderIds: [bId],
      pointerIds: [],
      newParentId: rootId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    // B, C, D should be cloned
    expect(res.clonedFolderIds.size).toBe(3);
    const newB = res.folderIdMap.get(bId)!;
    const newC = res.folderIdMap.get(cId)!;
    const newD = res.folderIdMap.get(dId)!;

    expect(res.graph.folders[newB].parentId).toBe(rootId);
    expect(res.graph.folders[newC].parentId).toBe(newB);
    expect(res.graph.folders[newD].parentId).toBe(newC);
  });

  it("D, E, F. IDs nuevos para todo, inmutabilidad y no aliasing", () => {
    const { graph, rootId, bId } = buildTreeWithPointers();

    // Create pointer explicitly
    const pRes = createPointer(graph, { targetFolderId: bId });
    const p1Id = pRes.ok ? pRes.pointer.id : "";
    const g2 = pRes.ok ? pRes.graph : graph;

    const res = cloneSelection(g2, {
      folderIds: [bId],
      pointerIds: [p1Id],
      newParentId: rootId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    for (const [oldId, newId] of res.folderIdMap) {
      expect(oldId).not.toBe(newId);
    }
    for (const [oldId, newId] of res.boardIdMap) {
      expect(oldId).not.toBe(newId);
    }
    for (const [oldId, newId] of res.pointerIdMap) {
      expect(oldId).not.toBe(newId);
    }

    // Original graph is untouched
    expect(Object.keys(g2.folders).length).toBe(4); // A, B, C, D
    expect(Object.keys(res.graph.folders).length).toBe(7);

    // No aliasing
    const oldB = g2.folders[bId];
    const newBId = res.folderIdMap.get(bId)!;
    const newB = res.graph.folders[newBId];
    expect(oldB).not.toBe(newB);
  });

  it("I. Copiar A + P1 -> P1' apunta a A'", () => {
    const { graph, rootId, bId } = buildTree();
    const pRes = createPointer(graph, { targetFolderId: bId });
    if (!pRes.ok) {
      throw new Error("setup");
    }

    const pId = pRes.pointer.id;
    const res = cloneSelection(pRes.graph, {
      folderIds: [bId], // we copy B
      pointerIds: [pId], // and P1 which points to B
      newParentId: rootId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    const newBId = res.folderIdMap.get(bId)!;
    const newPId = res.pointerIdMap.get(pId)!;

    const newPointer = res.graph.pointers[newPId];
    expect(newPointer.targetFolderId).toBe(newBId);
  });

  it("J. Copiar A + P1 donde P1 apunta a un descendiente -> remapeo correcto", () => {
    const { graph, rootId, bId, cId } = buildTree();
    const pRes = createPointer(graph, { targetFolderId: cId });
    if (!pRes.ok) {
      throw new Error("setup");
    }

    const pId = pRes.pointer.id;
    const res = cloneSelection(pRes.graph, {
      folderIds: [bId], // B contains C
      pointerIds: [pId], // P1 points to C
      newParentId: rootId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    const newCId = res.folderIdMap.get(cId)!;
    const newPId = res.pointerIdMap.get(pId)!;
    expect(res.graph.pointers[newPId].targetFolderId).toBe(newCId);
  });

  it("K. Copiar sólo P1 -> target original", () => {
    const { graph, rootId, bId } = buildTree();
    const pRes = createPointer(graph, { targetFolderId: bId });
    if (!pRes.ok) {
      throw new Error("setup");
    }

    const pId = pRes.pointer.id;
    const res = cloneSelection(pRes.graph, {
      folderIds: [], // only P1
      pointerIds: [pId],
      newParentId: rootId,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    const newPId = res.pointerIdMap.get(pId)!;
    expect(res.graph.pointers[newPId].targetFolderId).toBe(bId); // Original target
  });

  it("L. Copiar A sin P1 -> P1 original NO se clona", () => {
    const { graph, rootId, bId } = buildTree();
    const pRes = createPointer(graph, { targetFolderId: bId });
    if (!pRes.ok) {
      throw new Error("setup");
    }

    const pId = pRes.pointer.id;
    const res = cloneSelection(pRes.graph, {
      folderIds: [bId],
      pointerIds: [], // P1 omitted
      newParentId: rootId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    // original P1 remains untouched
    expect(res.graph.pointers[pId]).toBeDefined();
    // No new pointer generated
    expect(res.clonedPointerIds.size).toBe(0);
  });

  it("M. Dos pointers seleccionados al mismo target -> ambos independientes", () => {
    const { graph, rootId, bId } = buildTree();
    const p1Res = createPointer(graph, { targetFolderId: bId });
    const p2Res = createPointer(p1Res.ok ? p1Res.graph : graph, {
      targetFolderId: bId,
    });
    if (!p1Res.ok || !p2Res.ok) {
      throw new Error("setup");
    }

    const res = cloneSelection(p2Res.graph, {
      folderIds: [bId],
      pointerIds: [p1Res.pointer.id, p2Res.pointer.id],
      newParentId: rootId,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    expect(res.clonedPointerIds.size).toBe(2);
    const newP1 = res.pointerIdMap.get(p1Res.pointer.id)!;
    const newP2 = res.pointerIdMap.get(p2Res.pointer.id)!;
    const newB = res.folderIdMap.get(bId)!;

    expect(res.graph.pointers[newP1].targetFolderId).toBe(newB);
    expect(res.graph.pointers[newP2].targetFolderId).toBe(newB);
  });

  it("N, O, P. Múltiples folders, descendiente simultáneo y duplicados accidentales -> una sola copia", () => {
    const { graph, rootId, bId, cId, dId } = buildTree();
    // B contains C, C contains D.
    // We select B, C (descendant), B (duplicate).
    const res = cloneSelection(graph, {
      folderIds: [bId, cId, bId],
      pointerIds: [],
      newParentId: rootId,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error("setup");
    }

    // Only B, C, D should be created (1 copy of each)
    expect(res.clonedFolderIds.size).toBe(3);
    const newB = res.folderIdMap.get(bId)!;
    const newC = res.folderIdMap.get(cId)!;
    const newD = res.folderIdMap.get(dId)!;

    // Parent mapping correctly preserved
    expect(res.graph.folders[newB].parentId).toBe(rootId); // Only B connects to newParentId
    expect(res.graph.folders[newC].parentId).toBe(newB);
    expect(res.graph.folders[newD].parentId).toBe(newC);
  });

  it("T, U. Selección vacía y clonado de Root", () => {
    const { graph, bId } = buildTree();

    const emptyRes = cloneSelection(graph, {
      folderIds: [],
      pointerIds: [],
      newParentId: bId,
    });
    expect(emptyRes.ok).toBe(true);
    if (emptyRes.ok) {
      expect(emptyRes.clonedFolderIds.size).toBe(0);
    }

    const rootRes = cloneSelection(graph, {
      folderIds: [graph.rootFolderId],
      pointerIds: [],
      newParentId: bId,
    });
    expect(rootRes.ok).toBe(false);
    if (!rootRes.ok) {
      expect(rootRes.reason).toBe("root-folder");
    }
  });

  it("Ciclos no permitidos", () => {
    const { graph, bId, cId } = buildTree();

    // Intenta pegar B dentro de C (C es hijo de B).
    const res = cloneSelection(graph, {
      folderIds: [bId],
      pointerIds: [],
      newParentId: cId,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("cycle");
    }
  });
});
