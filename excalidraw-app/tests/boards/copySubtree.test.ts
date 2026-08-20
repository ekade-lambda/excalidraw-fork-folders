import { describe, expect, it } from "vitest";

import {
  cloneSubtree,
  copyPointer,
  remapPointerTarget,
} from "../../boards/domain/copySubtree";

import { buildTree, buildTreeWithPointers } from "./helpers";

import type { FolderId, FolderPointer } from "../../boards/types";

describe("Board System :: Copy / cloneSubtree", () => {
  it("copiar una Folder genera IDs y Boards nuevos (sin reutilizar)", () => {
    const { graph, rootId, bId } = buildTree();
    const originalFolderIds = Object.keys(graph.folders);
    const originalBoardIds = Object.keys(graph.boards);

    const res = cloneSubtree(graph, bId, { newParentId: rootId });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error(res.reason);
    }

    const nb = res.newRootFolderId;
    expect(nb).not.toBe(bId);
    expect(res.graph.folders[nb].parentId).toBe(rootId);

    // Jerarquía interna remapeada: B' tiene su C' y su D'.
    const cloneB = res.graph.folders[nb];
    const cloneC = Object.values(res.graph.folders).find(
      (f) => f.name === "C" && f.parentId === nb,
    );
    expect(cloneC).toBeDefined();
    const cloneD = Object.values(res.graph.folders).find(
      (f) => f.name === "D" && f.parentId === cloneC?.id,
    );
    expect(cloneD).toBeDefined();

    expect(cloneB.boardId).not.toBeUndefined();
    expect(originalBoardIds).not.toContain(cloneB.boardId);

    // · boards nuevos: 3 nuevos clonados.
    const newBoards = Object.keys(res.graph.boards).filter(
      (id) => !originalBoardIds.includes(id),
    );
    expect(newBoards).toHaveLength(3);

    // · folders nuevas: 3.
    const newFolders = Object.keys(res.graph.folders).filter(
      (id) => !originalFolderIds.includes(id),
    );
    expect(newFolders).toHaveLength(3);

    // No colisiones: cada id clonado no coincide con el mapa de origen.
    const mappingOk = [...res.folderIdMap.values()].every(
      (id) => !originalFolderIds.includes(id),
    );
    expect(mappingOk).toBe(true);

    // El grafo original no se muta.
    expect(graph.folders[bId]).toBeDefined();
  });

  it("remejo de referencias internas: el pointer a B apunta al clon; externo conservado", () => {
    const s = buildTreeWithPointers();
    const res = cloneSubtree(s.graph, s.bId, { newParentId: s.rootId });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error(res.reason);
    }

    // El pointer original a B (interno) se clonó, con target → clon.
    expect(res.newPointerIds).toHaveLength(1);
    for (const pid of res.newPointerIds) {
      expect(res.graph.pointers[pid].targetFolderId).toBe(res.newRootFolderId);
    }
    // El pointer original a B sigue apuntando a B (referencia externa conservada).
    expect(res.graph.pointers[s.pointerToB.id].targetFolderId).toBe(s.bId);

    // El pointer a la raíz (externo) NO se clona.
    expect(res.graph.pointers[s.pointerToRoot.id]).toBeDefined();
    expect(res.newPointerIds).toHaveLength(1);
  });

  it("copiar un FolderPointer: sigue siendo pointer y conserva target", () => {
    const s = buildTreeWithPointers();
    const res = copyPointer(s.graph, s.pointerToBId);
    expect(res.ok).toBe(true);
    if (!res.ok) {
      throw new Error(res.reason);
    }
    expect(res.pointer.id).not.toBe(s.pointerToB.id);
    expect(res.pointer.targetFolderId).toBe(s.bId);
    // Sigue siendo pointer: entra en graph.pointers y NO en graph.folders.
    expect(res.graph.pointers[res.pointer.id]).toBeDefined();
    expect(res.graph.folders[res.pointer.id]).toBeUndefined();
    expect("parentId" in res.pointer).toBe(false);
  });

  it("remapPointerTarget remapea targets internos y conserva los externos", () => {
    const map = new Map<FolderId, FolderId>([
      ["f-origen" as FolderId, "f-clon" as FolderId],
    ]);
    const internal: FolderPointer = {
      id: "p-internal",
      targetFolderId: "f-origen" as FolderId,
      createdAt: 0,
    };
    const external: FolderPointer = {
      id: "p-external",
      targetFolderId: "f-fuera" as FolderId,
      createdAt: 0,
    };
    expect(remapPointerTarget(internal, map).targetFolderId).toBe("f-clon");
    expect(remapPointerTarget(external, map).targetFolderId).toBe("f-fuera");
  });

  it("clonar la raíz queda rechazado", () => {
    const { graph, rootId, bId } = buildTree();
    const res = cloneSubtree(graph, rootId, { newParentId: bId });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("root-folder");
    }
  });

  it("clonar con destino dentro del subconjunto queda rechazado (ciclo)", () => {
    const { graph, bId, dId } = buildTree();
    const res = cloneSubtree(graph, bId, { newParentId: dId });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("cycle");
    }
  });
});
