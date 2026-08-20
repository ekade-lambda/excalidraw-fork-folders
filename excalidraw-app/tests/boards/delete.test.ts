import { describe, expect, it } from "vitest";

import { deleteFolder } from "../../boards/domain/delete";
import { getFolderBoard } from "../../boards/domain/board";
import { createPointer } from "../../boards/domain/pointers";

import { buildTree } from "./helpers";

describe("Board System :: Delete", () => {
  it("eliminar B borra B, C, D y sus Boards, pero no A", () => {
    const { graph, rootId, bId, cId, dId } = buildTree();
    const bBoard = getFolderBoard(graph, bId)!.id;
    const cBoard = getFolderBoard(graph, cId)!.id;
    const dBoard = getFolderBoard(graph, dId)!.id;
    const rootBoard = getFolderBoard(graph, rootId)!.id;

    const res = deleteFolder(graph, bId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.deletedFolderIds).toEqual(
        expect.arrayContaining([bId, cId, dId]),
      );
      expect(res.deletedFolderIds).not.toContain(rootId);
      expect(res.deletedBoardIds).toEqual(
        expect.arrayContaining([bBoard, cBoard, dBoard]),
      );
      expect(res.deletedBoardIds).not.toContain(rootBoard);

      expect(res.graph.folders[bId]).toBeUndefined();
      expect(res.graph.folders[cId]).toBeUndefined();
      expect(res.graph.folders[dId]).toBeUndefined();
      expect(res.graph.folders[rootId]).toBeDefined();
      expect(res.graph.boards[bBoard]).toBeUndefined();
      expect(res.graph.boards[rootBoard]).toBeDefined();
      expect(getFolderBoard(res.graph, rootId)?.id).toBe(rootBoard);
    }
  });

  it("elimina los pointers que apuntan a B/C/D, conserva los que apuntan a A", () => {
    const tree = buildTree();
    const pb = createPointer(tree.graph, { targetFolderId: tree.bId });
    if (!pb.ok) {
      throw new Error("pointer a B");
    }
    const pd = createPointer(pb.graph, { targetFolderId: tree.dId });
    if (!pd.ok) {
      throw new Error("pointer a D");
    }
    const pa = createPointer(pd.graph, { targetFolderId: tree.rootId });
    if (!pa.ok) {
      throw new Error("pointer a A");
    }

    const res = deleteFolder(pa.graph, tree.bId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.deletedPointerIds).toEqual(
        expect.arrayContaining([pb.pointer.id, pd.pointer.id]),
      );
      expect(res.deletedPointerIds).not.toContain(pa.pointer.id);

      // Sin referencias colgantes.
      expect(res.graph.pointers[pb.pointer.id]).toBeUndefined();
      expect(res.graph.pointers[pd.pointer.id]).toBeUndefined();
      // El pointer a la raíz (no eliminada) permanece.
      expect(res.graph.pointers[pa.pointer.id]).toBeDefined();
      expect(res.graph.pointers[pa.pointer.id].targetFolderId).toBe(
        tree.rootId,
      );
    }
  });

  it("la raíz no puede eliminarse", () => {
    const { graph, rootId } = buildTree();
    const res = deleteFolder(graph, rootId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("root-folder");
    }
  });

  it("folder inexistente → not-found sin cambios", () => {
    const { graph } = buildTree();
    const res = deleteFolder(graph, "__missing__");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("not-found");
    }
  });

  it("no muta el grafo original (inmutabilidad)", () => {
    const { graph, bId } = buildTree();
    const snapshot = Object.keys(graph.folders).length;
    deleteFolder(graph, bId);
    expect(Object.keys(graph.folders)).toHaveLength(snapshot);
  });
});
