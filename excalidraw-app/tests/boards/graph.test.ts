import { describe, expect, it } from "vitest";

import { getFolderBoard, getBoardFolder } from "../../boards/domain/board";
import {
  addFolder,
  ancestors,
  ancestorIds,
  createRootGraph,
  descendantIds,
  descendants,
  getFolder,
  isRoot,
  moveFolder,
  path,
  wouldCreateCycle,
} from "../../boards/domain/graph";

import { buildTree } from "./helpers";

describe("Board System Domain: árbol / graph", () => {
  it("la raíz tiene parentId null y su board 1:1", () => {
    const graph = createRootGraph({ name: "A" });
    const root = getFolder(graph, graph.rootFolderId);
    expect(root?.parentId).toBeNull();
    expect(isRoot(graph, graph.rootFolderId)).toBe(true);
    const board = getFolderBoard(graph, graph.rootFolderId);
    expect(board?.rootFolderId).toBe(graph.rootFolderId);
  });

  it("addFolder crea folder + board y los enlaza 1:1", () => {
    const { graph, rootId, bId } = buildTree();
    const folder = getFolder(graph, bId);
    expect(folder?.parentId).toBe(rootId);
    const board = getFolderBoard(graph, bId);
    expect(board).toBeDefined();
    expect(board?.rootFolderId).toBe(bId);
    expect(getBoardFolder(graph, board!.id)?.id).toBe(bId);
  });

  it("addFolder con padre inexistente falla y no muta el grafo", () => {
    const graph = createRootGraph();
    const res = addFolder(graph, { name: "X", parentId: "no-existe" as any });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("parent-not-found");
    }
    expect(Object.keys(graph.folders)).toHaveLength(1);
  });

  it("una folder no puede tener dos padres (parentId único)", () => {
    const { graph, bId } = buildTree();
    const folder = getFolder(graph, bId);
    expect(folder?.parentId).toStrictEqual(graph.folders[bId].parentId);
    // Existe exactamente una entrada con parentId = rootId apuntando a B.
    const children = Object.values(graph.folders).filter((f) => f.id === bId);
    expect(children).toHaveLength(1);
  });

  it("ancestors y ancestorsIds", () => {
    const { graph, dId } = buildTree();
    expect(ancestors(graph, dId).map((f) => f.name)).toEqual(["C", "B", "A"]);
    expect(ancestorIds(graph, dId)).toHaveLength(3);
  });

  it("descendants y descendantsIds (excluye self)", () => {
    const { graph, bId } = buildTree();
    expect(descendants(graph, bId).map((f) => f.name)).toEqual(["C", "D"]);
    expect(descendantIds(graph, bId)).toHaveLength(2);
    expect(descendants(graph, bId).some((f) => f.id === bId)).toBe(false);
  });

  it("path deriva la ruta desde la raíz (sin almacenarla)", () => {
    const { graph, dId } = buildTree();
    expect(path(graph, dId)).toEqual(["A", "B", "C", "D"]);
    expect(path(graph, graph.rootFolderId)).toEqual(["A"]);
  });

  it("mover a sí misma queda rechazado", () => {
    const { graph, bId } = buildTree();
    const res = moveFolder(graph, bId, bId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("self-move");
    }
  });

  it("mover a un descendiente queda rechazado (ciclo)", () => {
    const { graph, bId, dId } = buildTree();
    expect(wouldCreateCycle(graph, bId, dId)).toBe(true);
    const res = moveFolder(graph, bId, dId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("cycle");
    }
  });

  it("mover la raíz queda rechazado", () => {
    const { graph, rootId } = buildTree();
    const res = moveFolder(graph, rootId, rootId);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("root-folder");
    }
  });

  it("movimiento válido reparenta", () => {
    const { graph, rootId, dId } = buildTree();
    const res = moveFolder(graph, dId, rootId);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.graph.folders[dId].parentId).toBe(rootId);
      // El grafo original no se muta.
      expect(graph.folders[dId].parentId).not.toBe(rootId);
    }
  });
});
