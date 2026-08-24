import { describe, expect, it } from "vitest";

import {
  createPointer,
  deletePointer,
  findInvalidPointers,
  isPointerValid,
  pointerReusesTargetId,
  resolvePointer,
} from "../../boards/domain/pointers";
import {
  prepareDeleteFolderPatch,
  applyDeletePatch,
} from "../../boards/domain/delete";
import { newFolderPointerId } from "../../boards/domain/ids";
import { createRootGraph } from "../../boards/domain/graph";

import { buildTree } from "./helpers";

import type { FolderPointer } from "../../boards/types";

describe("Board System :: FolderPointer", () => {
  it("crea un pointer y resuelve su target válido", () => {
    const { graph, bId } = buildTree();
    const res = createPointer(graph, { targetFolderId: bId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.graph.pointers[res.pointer.id].targetFolderId).toBe(bId);
      expect(resolvePointer(res.graph, res.pointer.id)?.id).toBe(bId);
      expect(isPointerValid(res.graph, res.pointer)).toBe(true);
    }
  });

  it("target inexistente → error y no muta", () => {
    const { graph } = buildTree();
    const res = createPointer(graph, { targetFolderId: "__no__" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("target-not-found");
    }
    expect(Object.keys(graph.pointers)).toHaveLength(0);
  });

  it("el pointer no ejecuta ni parentId ni boardId (entidad distinta)", () => {
    const { graph, bId } = buildTree();
    const res = createPointer(graph, { targetFolderId: bId });
    if (!res.ok) {
      throw new Error("no creado");
    }
    const pointer = res.pointer;
    expect("parentId" in pointer).toBe(false);
    expect("boardId" in pointer).toBe(false);
    expect(pointerReusesTargetId(pointer)).toBe(false);
  });

  it("un pointer NUNCA se inserta en folders", () => {
    const { graph, bId } = buildTree();
    const res = createPointer(graph, { targetFolderId: bId });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.graph.folders[res.pointer.id]).toBeUndefined();
      expect(res.graph.pointers[res.pointer.id]).toBeDefined();
    }
  });

  it("resolver un pointer cuyo target desaparece devuelve undefined", () => {
    const { graph, bId } = buildTree();
    const created = createPointer(graph, { targetFolderId: bId });
    if (!created.ok) {
      throw new Error("no creado");
    }
    const pointerId = created.pointer.id;
    const patchRes = prepareDeleteFolderPatch(created.graph, bId);
    expect(patchRes.ok).toBe(true);
    if (patchRes.ok) {
      const afterDeleteGraph = applyDeletePatch(created.graph, patchRes.patch);
      // El delete automático también elimina el pointer (sin colgantes).
      expect(afterDeleteGraph.pointers[pointerId]).toBeUndefined();
      expect(resolvePointer(afterDeleteGraph, pointerId)).toBeUndefined();
    }
  });

  it("detecta pointers inválidos (target ausente) en un grafo inconsistente", () => {
    const graph = createRootGraph();
    const dangling: FolderPointer = {
      id: newFolderPointerId(),
      targetFolderId: "__missing__",
      name: null,
      icon: null,
      createdAt: Date.now(),
    };
    const bad = { ...graph, pointers: { [dangling.id]: dangling } };
    expect(isPointerValid(bad, dangling)).toBe(false);
    expect(findInvalidPointers(bad).map((p) => p.id)).toContain(dangling.id);
  });

  it("deletePointer elimina y es no-op si no existe", () => {
    const { graph, bId } = buildTree();
    const created = createPointer(graph, { targetFolderId: bId });
    if (!created.ok) {
      throw new Error("no creado");
    }
    const pid = created.pointer.id;
    const reduced = deletePointer(created.graph, pid);
    expect(reduced.pointers[pid]).toBeUndefined();
    // no-op
    expect(deletePointer(reduced, "__none__")).toBe(reduced);
  });
});
