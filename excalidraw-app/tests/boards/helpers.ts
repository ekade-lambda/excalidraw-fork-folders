/**
 * Helper de tests del dominio (no es un archivo de test).
 * Construye un árbol A → B → C → D reutilizable.
 */

import { addFolder, createRootGraph } from "../../boards/domain/graph";
import { createPointer } from "../../boards/domain/pointers";

import type {
  BoardsGraph,
  FolderId,
  FolderPointer,
  FolderPointerId,
} from "../../boards/types";

export interface SampleTree {
  graph: BoardsGraph;
  rootId: FolderId;
  bId: FolderId;
  cId: FolderId;
  dId: FolderId;
}

export function buildTree(): SampleTree {
  const root = createRootGraph({ name: "A" });
  const rootId = root.rootFolderId;
  const r1 = addFolder(root, { name: "B", parentId: rootId });
  if (!r1.ok) {
    throw new Error("B no creada");
  }
  const bId = r1.folderId;
  const r2 = addFolder(r1.graph, { name: "C", parentId: bId });
  if (!r2.ok) {
    throw new Error("C no creada");
  }
  const cId = r2.folderId;
  const r3 = addFolder(r2.graph, { name: "D", parentId: cId });
  if (!r3.ok) {
    throw new Error("D no creada");
  }
  return { graph: r3.graph, rootId, bId, cId, dId: r3.folderId };
}

export interface SampleTreeWithPointers extends SampleTree {
  pointerToB: FolderPointer;
  pointerToBId: FolderPointerId;
  pointerToRoot: FolderPointer;
  pointerToRootId: FolderPointerId;
}

/** buildTree + pointers: uno a B (referencia interna) y otro a la raíz (externa). */
export function buildTreeWithPointers(): SampleTreeWithPointers {
  const tree = buildTree();
  const pb = createPointer(tree.graph, { targetFolderId: tree.bId });
  if (!pb.ok) {
    throw new Error("pointer a B");
  }
  const pa = createPointer(pb.graph, { targetFolderId: tree.rootId });
  if (!pa.ok) {
    throw new Error("pointer a la raíz");
  }
  return {
    ...tree,
    graph: pa.graph,
    pointerToB: pb.pointer,
    pointerToBId: pb.pointer.id,
    pointerToRoot: pa.pointer,
    pointerToRootId: pa.pointer.id,
  };
}
