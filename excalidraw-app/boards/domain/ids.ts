/**
 * Generación de IDs del Board System.
 *
 * Namespaces independientes por prefijo: una carpeta real, un pointer y un
 * board jamás pueden reutilizar un id de otro namespace por construcción.
 */

import { randomId } from "@excalidraw/common";

import type { BoardId, FolderId, FolderPointerId } from "../types";

export function newFolderId(): FolderId {
  return `f-${randomId()}`;
}

export function newBoardId(): BoardId {
  return `b-${randomId()}`;
}

export function newFolderPointerId(): FolderPointerId {
  return `p-${randomId()}`;
}

/**
 * Genera un id garantizando unicidad respecto a un conjunto de ids ya en uso.
 * Funcion pura (sin efectos), util para creación/clonado.
 */
export function generateUniqueId<T extends string>(
  generator: () => T,
  existing: ReadonlySet<string>,
): T {
  let id: T;
  do {
    id = generator();
  } while (existing.has(id));
  return id;
}
