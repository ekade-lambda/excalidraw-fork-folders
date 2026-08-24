import { describe, expect, it } from "vitest";

import {
  prepareDeleteFolderPatch,
  prepareDeletePointerPatch,
  applyDeletePatch,
} from "../../boards/domain/delete";
import { getFolderBoard } from "../../boards/domain/board";
import { createPointer } from "../../boards/domain/pointers";

import { buildTree } from "./helpers";

describe("Board System :: Delete Domain (Phase 7.1)", () => {
  it("eliminar B borra B, C, D y sus Boards, pero no A", () => {
    const { graph, rootId, bId, cId, dId } = buildTree();
    const bBoard = getFolderBoard(graph, bId)!.id;
    const cBoard = getFolderBoard(graph, cId)!.id;
    const dBoard = getFolderBoard(graph, dId)!.id;
    const rootBoard = getFolderBoard(graph, rootId)!.id;

    const res = prepareDeleteFolderPatch(graph, bId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.deletedFolderIds).toEqual(
        expect.arrayContaining([bId, cId, dId]),
      );
      expect(res.patch.deletedFolderIds).not.toContain(rootId);
      expect(res.patch.deletedBoardIds).toEqual(
        expect.arrayContaining([bBoard, cBoard, dBoard]),
      );
      expect(res.patch.deletedBoardIds).not.toContain(rootBoard);

      const nextGraph = applyDeletePatch(graph, res.patch);

      expect(nextGraph.folders[bId]).toBeUndefined();
      expect(nextGraph.folders[cId]).toBeUndefined();
      expect(nextGraph.folders[dId]).toBeUndefined();
      expect(nextGraph.folders[rootId]).toBeDefined();
      expect(nextGraph.boards[bBoard]).toBeUndefined();
      expect(nextGraph.boards[rootBoard]).toBeDefined();
      expect(getFolderBoard(nextGraph, rootId)?.id).toBe(rootBoard);
    }
  });

  it("elimina los pointers que apuntan a B/C/D, conserva los que apuntan a A", () => {
    const tree = buildTree();
    const pb = createPointer(tree.graph, { targetFolderId: tree.bId });
    if (!pb.ok) {
      throw new Error("pb");
    }
    const pd = createPointer(pb.graph, { targetFolderId: tree.dId });
    if (!pd.ok) {
      throw new Error("pd");
    }
    const pa = createPointer(pd.graph, { targetFolderId: tree.rootId });
    if (!pa.ok) {
      throw new Error("pa");
    }

    const res = prepareDeleteFolderPatch(pa.graph, tree.bId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.deletedPointerIds).toEqual(
        expect.arrayContaining([pb.pointer.id, pd.pointer.id]),
      );
      expect(res.patch.deletedPointerIds).not.toContain(pa.pointer.id);

      const nextGraph = applyDeletePatch(pa.graph, res.patch);

      // Sin referencias colgantes.
      expect(nextGraph.pointers[pb.pointer.id]).toBeUndefined();
      expect(nextGraph.pointers[pd.pointer.id]).toBeUndefined();
      // El pointer a la raíz (no eliminada) permanece.
      expect(nextGraph.pointers[pa.pointer.id]).toBeDefined();
      expect(nextGraph.pointers[pa.pointer.id].targetFolderId).toBe(
        tree.rootId,
      );
    }
  });

  it("la raíz no puede eliminarse", () => {
    const { graph, rootId } = buildTree();
    const res = prepareDeleteFolderPatch(graph, rootId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("root-folder");
    }
  });

  it("folder inexistente → not-found sin cambios", () => {
    const { graph } = buildTree();
    const res = prepareDeleteFolderPatch(graph, "__missing__");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("not-found");
    }
  });

  it("no muta el grafo original (inmutabilidad)", () => {
    const { graph, bId } = buildTree();
    const snapshot = Object.keys(graph.folders).length;
    prepareDeleteFolderPatch(graph, bId);
    expect(Object.keys(graph.folders)).toHaveLength(snapshot);
  });

  it("deletePointer aislado elimina el pointer sin afectar el folder de destino", () => {
    const tree = buildTree();
    const p = createPointer(tree.graph, { targetFolderId: tree.bId });
    if (!p.ok) {
      throw new Error("p");
    }

    const res = prepareDeletePointerPatch(p.graph, p.pointer.id);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.patch.deletedPointerIds).toEqual([p.pointer.id]);

      const nextGraph = applyDeletePatch(p.graph, res.patch);
      expect(nextGraph.pointers[p.pointer.id]).toBeUndefined();
      expect(nextGraph.folders[tree.bId]).toBeDefined(); // folder sobrevive
    }
  });
});
